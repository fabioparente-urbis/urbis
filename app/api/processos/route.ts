import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar, verificarOwnership } from "@/lib/auth";
import { triar, type EntradaVigia, type LinhaRetrabalho } from "@/lib/bdi/vigia";
import { situacaoGeral, situacaoLip, situacaoMac, type ResumoCamposLip, type TagProcesso, type UltimaPassadaMac } from "@/lib/bdi/situacao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sentinela usada para forcar lista vazia quando a gerencia nao possui
// analistas cadastrados (evita 'in' com array vazio retornar resultados
// indesejados pelo driver). UUID nulo nao colidirá com nenhum id real.
const SENTINELA_ID_VAZIO = "00000000-0000-0000-0000-000000000000";

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    const { userId, irrestrito, perfis, gerencia } = auth;

    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca") || "";
    const tipo = searchParams.get("tipo") || "";
    const analista = searchParams.get("analista") || "";
    // "situacao" substitui o antigo filtro por processos.status (02/09/2026):
    // essa coluna tem um único valor no banco inteiro ('CADASTRADO'), então
    // filtrar por ela nunca separou nada — ver lib/bdi/situacao.ts.
    const situacaoFiltro = searchParams.get("situacao") || "";

    let query = supabase
      .from("processos")
      .select("id, codigo, numero_sei, tipo_processo, assunto_id, status, criado_em, atualizado_em, dados, analista_id, tags, lip_incompleto, lip_finalizado, porte, area_construida")
      // Lixeira: o que foi excluído some da lista, mas continua no banco
      // e aparece em /admin/lixeira, de onde pode voltar.
      .is("excluido_em", null)
      .order("atualizado_em", { ascending: false })
      .limit(200);

    // A busca por interessado e numero de despacho depende de campos dentro
    // de jsonb (dados.proprietario / tags[].numero_despacho), que o filtro
    // .ilike do PostgREST nao alcança de forma confiável em arrays. Como o
    // volume de processos é pequeno, filtramos em memória após a query.
    const buscaLimpa = busca.replace(/[,()*]/g, " ").trim().toLowerCase();
    if (tipo) query = query.eq("tipo_processo", tipo);

    // Visibilidade de processos (briefing Cowork — item 2):
    // - Admin / Diretora / Diretor       → todos (perfis irrestritos)
    // - Gerência GERECCO/MP/GP                → processos dos analistas da sua gerência
    // - Analista com gerencia != null    → apenas os próprios (atribuídos)
    // - Analista com gerencia = null     → apenas os próprios (atribuídos)
    //   (antes via todos os processos — bug fixado conforme briefing:
    //   "Analistas só devem ver processos atribuídos a eles.")
    const ehGerenteDeGerencia = perfis.some((p) => p && p.startsWith("Gerência "));

    if (irrestrito) {
      // Admin/Diretora podem usar o filtro opcional ?analista
      if (analista) query = query.eq("analista_id", analista);
    } else if (ehGerenteDeGerencia && gerencia) {
      // Coleta ids dos analistas da mesma gerencia
      const { data: ids } = await supabase
        .from("usuarios")
        .select("id")
        .eq("gerencia", gerencia);
      const idList = (ids ?? []).map((u) => u.id);
      if (analista) {
        // Intersecciona com o filtro vindo do cliente: so passa se o analista
        // pedido pertencer a essa gerencia.
        query = query.eq("analista_id", idList.includes(analista) ? analista : SENTINELA_ID_VAZIO);
      } else if (idList.length > 0) {
        query = query.in("analista_id", idList);
      } else {
        query = query.eq("analista_id", SENTINELA_ID_VAZIO);
      }
    } else {
      // Qualquer outro perfil (Analista com ou sem gerência, ou perfis
      // não-gerenciais): vê apenas os processos atribuídos a si. Qualquer
      // ?analista vindo do cliente é ignorado.
      query = query.eq("analista_id", userId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    let resultado = data ?? [];
    if (buscaLimpa) {
      resultado = resultado.filter((p: any) => {
        const codigo = (p.codigo || "").toLowerCase();
        const numeroSei = (p.numero_sei || "").toLowerCase();
        const interessado = (p.dados?.proprietario?.valor || "").toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags : [];
        const temDespachoBatendo = tags.some((t: any) =>
          (t.numero_despacho || "").toLowerCase().includes(buscaLimpa)
        );
        return (
          codigo.includes(buscaLimpa) ||
          numeroSei.includes(buscaLimpa) ||
          interessado.includes(buscaLimpa) ||
          temDespachoBatendo
        );
      });
    }

    // Classificação do vigia (lib/bdi/vigia.ts), a mesma usada em /api/bdi/vigia
    // (um processo por vez): aqui roda para a lista inteira já visível, numa
    // única consulta extra a vw_bdi_retrabalho — é contagem agregada, sem
    // recorte de perfil, então busca sem restrição de analista/gerência.
    const codigos = resultado.map((p: any) => p.codigo).filter(Boolean);
    const retrabalhoPorCodigo = new Map<string, LinhaRetrabalho>();
    if (codigos.length > 0) {
      const { data: linhasRetrabalho } = await supabase
        .from("vw_bdi_retrabalho")
        .select("processo_codigo, trocas_totais, virou_nao_conforme")
        .in("processo_codigo", codigos);
      for (const linha of linhasRetrabalho ?? []) {
        retrabalhoPorCodigo.set((linha as any).processo_codigo, linha as LinhaRetrabalho);
      }
    }

    // Situação geral (lib/bdi/situacao.ts) — substitui o antigo processos.status
    // morto. Duas consultas extras, mesma trave de "sem recorte de perfil"
    // do bloco de retrabalho acima: vw_bdi_campos_criticos (preenchimento
    // real do LIP) e analises_mac (passada mais recente + status), pelos
    // mesmos códigos já autorizados pela query principal.
    const camposPorCodigo = new Map<string, ResumoCamposLip>();
    const ultimaPassadaPorCodigo = new Map<string, UltimaPassadaMac>();
    if (codigos.length > 0) {
      const [{ data: linhasCampos }, { data: linhasAnalises }] = await Promise.all([
        supabase
          .from("vw_bdi_campos_criticos")
          .select("codigo, campos_vazios, campos_em_x, campos_totais")
          .in("codigo", codigos),
        supabase
          .from("analises_mac")
          .select("processo_codigo, numero_analise, status, numero_despacho, numero_parecer, mac_carregado")
          .in("processo_codigo", codigos)
          .is("excluido_em", null),
      ]);
      for (const linha of linhasCampos ?? []) {
        const l = linha as any;
        camposPorCodigo.set(l.codigo, {
          campos_vazios: Number(l.campos_vazios) || 0,
          campos_em_x: Number(l.campos_em_x) || 0,
          campos_totais: Number(l.campos_totais) || 0,
        });
      }
      // A view não agrega por processo — reduz aqui pra achar a passada de
      // maior numero_analise de cada um (a "atual").
      //
      // 08/09/2026, pedido do Fábio: "MAC só inicia importando PDF ou copiando a análise
      // anterior — sem isso, MAC não iniciado". Uma análise sem `mac_carregado` E sem
      // despacho/parecer é uma casca vazia (linha criada por autosave, nunca alimentada de
      // verdade) — não conta como "a passada atual" pra classificação. Se ela tiver número
      // maior que uma análise real anterior, a real anterior é que continua valendo.
      for (const linha of linhasAnalises ?? []) {
        const l = linha as any;
        const carregada = l.mac_carregado === true || !!l.numero_despacho || !!l.numero_parecer;
        if (!carregada) continue;
        const atual = ultimaPassadaPorCodigo.get(l.processo_codigo);
        if (!atual || Number(l.numero_analise) > atual.numero_analise) {
          ultimaPassadaPorCodigo.set(l.processo_codigo, {
            numero_analise: Number(l.numero_analise) || 0,
            status: l.status,
            numero_despacho: l.numero_despacho ?? null,
            numero_parecer: l.numero_parecer ?? null,
          });
        }
      }
    }

    // Dias aguardando retorno do interessado, pro badge da Pilha (Camada 6 da arquitetura
    // mestra do URBI, 05/09/2026). Só "ainda aguardando" é fato real de espera — mesma regra já
    // usada em lib/urbi/montarDossie.ts: "retornou" e "base insuficiente" nunca viram contagem
    // de dias. Se por algum motivo mais de um despacho da mesma passada aparecer aqui, fica o
    // de mais dias (o mais antigo em aberto, nunca o mais otimista).
    const diasAguardandoPorCodigo = new Map<string, number>();
    if (codigos.length > 0) {
      const { data: linhasRetorno } = await supabase
        .from("vw_bdi_aguardando_retorno")
        .select("processo_codigo, dias_aguardando_retorno, situacao")
        .in("processo_codigo", codigos)
        .eq("situacao", "ainda aguardando");
      for (const linha of linhasRetorno ?? []) {
        const l = linha as any;
        const dias = Number(l.dias_aguardando_retorno);
        if (!Number.isFinite(dias)) continue;
        const atual = diasAguardandoPorCodigo.get(l.processo_codigo);
        if (atual === undefined || dias > atual) diasAguardandoPorCodigo.set(l.processo_codigo, dias);
      }
    }

    /**
     * Quais documentos deste processo EXISTEM no MDP (08/09/2026, pedido do Fábio: "ao clicar nos
     * despachos e pareceres deve se abrir o MDP do documento CASO ELE EXISTA"). Guarda só o número
     * — é o que a tag da Pilha tem em mãos pra decidir se vira link ou não. Sem isso a tag levaria
     * o analista pra uma tela vazia, que é pior do que não levar a lugar nenhum.
     */
    const documentosMdpPorCodigo = new Map<string, string[]>();
    if (codigos.length > 0) {
      const { data: linhasMdp } = await supabase
        .from("mdp_registros")
        .select("processo_codigo, numero")
        .in("processo_codigo", codigos)
        .not("numero", "is", null);
      for (const linha of linhasMdp ?? []) {
        const l = linha as any;
        const numero = String(l.numero ?? "").trim();
        if (!numero) continue;
        const lista = documentosMdpPorCodigo.get(l.processo_codigo) ?? [];
        if (!lista.includes(numero)) lista.push(numero);
        documentosMdpPorCodigo.set(l.processo_codigo, lista);
      }
    }

    // Esforço/pendências do Radar (Fase 2 do plano Assessor Ativo, 07/09/2026): lê o retrato MAIS
    // RECENTE de cada processo em urbi_radar_retratos — nenhum cálculo novo, a mesma fonte que já
    // alimenta as perguntas da Pilha no chat (lib/urbi/perguntasPilha.ts) e o relatório do Motor
    // de Produção. O Radar roda de fundo a cada ~1 min; processo nunca visitado ainda não tem
    // retrato — mostra "ainda não avaliado", nunca um esforço inventado.
    const radarPorCodigo = new Map<string, {
      esforco: string | null; pendencias: number | null;
      temAcaoBloqueante: boolean; semPendenciasMotor: boolean;
      /** Texto e motivo da ação tier 1, quando houver — ver comentário em `acaoTexto` abaixo. */
      acaoTexto: string | null; acaoMotivo: string | null;
    }>();
    if (codigos.length > 0) {
      const { data: linhasRadar } = await supabase
        .from("urbi_radar_retratos")
        .select("processo_codigo, versao, alertas, pendencias_mac")
        .in("processo_codigo", codigos)
        .order("versao", { ascending: false });
      for (const linha of linhasRadar ?? []) {
        const l = linha as any;
        if (radarPorCodigo.has(l.processo_codigo)) continue; // já viu a versão mais recente (ordenado desc)
        const acoes = Array.isArray(l.alertas?.acoes) ? l.alertas.acoes : [];
        radarPorCodigo.set(l.processo_codigo, {
          esforco: l.alertas?.esforco ?? null,
          pendencias: typeof l.pendencias_mac === "number" ? l.pendencias_mac : null,
          // Fase 6 (Briefing do dia): tier 1 do Motor de Produção = pendência que impede
          // emissão/continuidade (item não conforme do MAC) — mesma prioridade fixa de
          // lib/urbi/motorProducao.ts, nunca recalculada aqui.
          temAcaoBloqueante: acoes[0]?.tier === 1,
          semPendenciasMotor: acoes.length === 0,
          /**
           * O QUE é a ação e POR QUÊ — 08/09/2026, pedido do Fábio: "o certo seria ele explicar
           * por que tem ação bloqueante, qual ação é essa e por que tá pronto pra despachar".
           * Número sozinho não ajuda a decidir nada. Os dois campos já existiam dentro do
           * retrato do Radar (`alertas.acoes[].texto/motivo`, escritos por
           * lib/urbi/motorProducao.ts) — só não eram devolvidos. Nada recalculado aqui.
           */
          acaoTexto: acoes[0]?.tier === 1 ? (acoes[0]?.texto ?? null) : null,
          acaoMotivo: acoes[0]?.tier === 1 ? (acoes[0]?.motivo ?? null) : null,
        });
      }
    }

    resultado = resultado.map((p: any) => {
      const entrada: EntradaVigia = {
        processo: {
          codigo: p.codigo,
          tipo_processo: p.tipo_processo,
          area_construida: p.area_construida,
          dados: p.dados,
          tags: p.tags,
        },
        retrabalho: retrabalhoPorCodigo.get(p.codigo) ?? { trocas_totais: 0, virou_nao_conforme: 0 },
      };
      const tags: TagProcesso[] = Array.isArray(p.tags) ? p.tags.filter((t: any) => t && typeof t === "object") : [];
      const campos = camposPorCodigo.get(p.codigo) ?? null;
      const ultimaPassada = ultimaPassadaPorCodigo.get(p.codigo) ?? null;
      // As 3 situações (lib/bdi/situacao.ts) — LIP e MAC separadas, mais a
      // geral (que já é composta das duas). Mesma lógica, sem recalcular
      // nada: situacaoGeral() por dentro já chama situacaoMac(), mas o card
      // da Pilha quer ver LIP e MAC lado a lado, não só o resumo.
      const sitGeral = situacaoGeral(campos, ultimaPassada, tags, p.lip_incompleto === true);
      const sitLip = situacaoLip(campos, p.lip_incompleto === true);
      const sitMac = situacaoMac(ultimaPassada, tags);
      return {
        ...p,
        triagem: triar(entrada).classe,
        situacao_geral: sitGeral.classe, situacao_motivo: sitGeral.motivo,
        situacao_lip: sitLip.classe, situacao_lip_motivo: sitLip.motivo,
        situacao_mac: sitMac.classe, situacao_mac_motivo: sitMac.motivo,
        // Só populado quando a própria classificação MAC já é "Aguardando retorno" — nunca
        // um número solto sem a situação que o justifica.
        dias_aguardando_retorno: sitMac.classe === "Aguardando retorno do interessado"
          ? diasAguardandoPorCodigo.get(p.codigo) ?? null
          : null,
        esforco_provavel: radarPorCodigo.get(p.codigo)?.esforco ?? null,
        pendencias_radar: radarPorCodigo.get(p.codigo)?.pendencias ?? null,
        tem_acao_bloqueante: radarPorCodigo.get(p.codigo)?.temAcaoBloqueante ?? false,
        sem_pendencias_motor: radarPorCodigo.get(p.codigo)?.semPendenciasMotor ?? false,
        acao_bloqueante_texto: radarPorCodigo.get(p.codigo)?.acaoTexto ?? null,
        acao_bloqueante_motivo: radarPorCodigo.get(p.codigo)?.acaoMotivo ?? null,
        /** Números de documento deste processo que existem no MDP — a tag da Pilha só vira link
         *  pro MDP quando o número dela está aqui. */
        documentos_mdp: documentosMdpPorCodigo.get(p.codigo) ?? [],
      };
    });

    if (situacaoFiltro) {
      resultado = resultado.filter((p: any) => p.situacao_geral === situacaoFiltro);
    }

    return NextResponse.json({ ok: true, data: resultado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, status, analista_id, lip_incompleto, lip_finalizado, laudo_campos_ocultos } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });

    const atualizacao: any = { atualizado_em: new Date().toISOString() };
    if (status !== undefined) atualizacao.status = status;
    if (analista_id !== undefined) atualizacao.analista_id = analista_id;
    if (lip_incompleto !== undefined) atualizacao.lip_incompleto = lip_incompleto;
    if (lip_finalizado !== undefined) {
      atualizacao.lip_finalizado = lip_finalizado;
      atualizacao.lip_finalizado_em = lip_finalizado ? new Date().toISOString() : null;
    }
    if (Array.isArray(laudo_campos_ocultos)) atualizacao.laudo_campos_ocultos = laudo_campos_ocultos;

    const { error } = await supabase.from("processos").update(atualizacao).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Duas mudanças aqui, ambas por causa do mesmo susto: esta rota
    // apagava a linha do banco DE VEZ e SEM autenticação nenhuma — um
    // clique errado levava junto o LIP, o histórico e o vínculo com as
    // análises, sem registro de quem fez.
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const { id, motivo } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });

    const { data: alvo } = await supabase
      .from("processos").select("id, analista_id, excluido_em").eq("id", id).maybeSingle();
    if (!alvo) return NextResponse.json({ ok: false, erro: "Processo não encontrado." }, { status: 404 });
    // Dono ou perfil irrestrito — mesma regra do salvar.
    const ownerErr = verificarOwnership(ctx, (alvo as any).analista_id);
    if (ownerErr) return ownerErr;

    const { error } = await supabase.from("processos").update({
      excluido_em: new Date().toISOString(),
      excluido_por: ctx.userId,
      excluido_motivo: typeof motivo === "string" ? motivo.slice(0, 300) : null,
    }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    await supabase.from("auditoria_log").insert({
      tabela: "processos", registro_id: id, operacao: "ENVIADO_PARA_LIXEIRA",
      dados_antes: null, dados_depois: { por: ctx.userId, motivo: motivo ?? null },
    });
    return NextResponse.json({ ok: true, lixeira: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
