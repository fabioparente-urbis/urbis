import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { podeAcessarProcesso, usuarioDaRequisicao } from "@/lib/autorizacao";
import { situacaoGeral, situacaoLip, situacaoMac } from "@/lib/bdi/situacao";
import {
  fatosDoLip, ordenarAnalises, resumoChecklist,
  evolucaoChecklist, anexarObservacoes, historicoAlteracoesLip,
} from "@/lib/urbi/dossieProcesso";

/**
 * Dossiê factual do URBI — somente leitura.
 *
 * Esta rota será a base do Co-Analista. Ela não chama IA, não escreve no
 * processo, não altera LIP/MAC, não emite documento e não consome numeração.
 * Cada bloco informa a fonte real; falha de fonte vira cobertura indisponível,
 * nunca conclusão positiva por ausência de dado.
 */
export async function GET(req: NextRequest) {
  const codigo = (new URL(req.url).searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo é obrigatório." }, { status: 400 });

  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "SESSAO_EXPIRADA" }, { status: 401 });

  const { data: processo, error: erroProcesso } = await supabaseAdmin
    .from("processos")
    .select("id, codigo, tipo_processo, assunto_id, porte, area_construida, dados, tags, analista_id, gerencia, criado_em, atualizado_em, analise_iniciada_em, analise_concluida_em, lip_incompleto, mac_incompleto")
    .eq("codigo", codigo)
    .is("excluido_em", null)
    .maybeSingle();

  if (erroProcesso) {
    console.error("[urbi/dossie] processo:", erroProcesso.message);
    return NextResponse.json({ ok: false, erro: "Falha ao carregar o processo." }, { status: 500 });
  }
  if (!processo) return NextResponse.json({ ok: false, erro: "Processo não encontrado." }, { status: 404 });

  const acesso = await podeAcessarProcesso(usuario, codigo);
  if (!acesso.ok) return NextResponse.json({ ok: false, erro: acesso.erro }, { status: acesso.status });

  const consultas = await Promise.all([
    supabaseAdmin.from("assuntos").select("nome, slug").eq("id", processo.assunto_id).maybeSingle(),
    supabaseAdmin.from("vw_bdi_campos_criticos").select("campos_vazios, campos_em_x, campos_totais").eq("codigo", codigo).maybeSingle(),
    supabaseAdmin.from("analises_mac").select("id, numero_analise, status, itens, criado_em, atualizado_em, numero_despacho, numero_parecer, numero_despacho_interno, modelo_id, observacoes_por_item, observacoes_por_aba").eq("processo_codigo", codigo).is("excluido_em", null),
    supabaseAdmin.from("vw_bdi_retrabalho_por_passada").select("exigencia, aba, referencia_legal, passada_anterior, passada_atual, status_anterior, status_novo, voltou_em").eq("processo_codigo", codigo).order("voltou_em", { ascending: false }).limit(100),
    supabaseAdmin.from("mdp_registros").select("tipo, numero, data_despacho, criado_em").eq("processo_codigo", codigo).order("criado_em", { ascending: true }),
    supabaseAdmin.from("mrp_registros").select("tipo_despacho, numero_despacho, numero_analise, data_despacho, pontos").eq("processo_codigo", codigo).order("data_despacho", { ascending: true }),
    supabaseAdmin.from("mhd_documentos").select("id, papel, rotulo, status, escopo, atualizado_em").eq("processo_codigo", codigo).order("atualizado_em", { ascending: false }),
    // vw_bdi_aguardando_retorno (supabase/migrations/2026_09_03_bdi_aguardando_retorno.sql,
    // já aplicada) — pedido explícito do dossiê original ("tempo aguardando retorno quando
    // houver base"), faltava nesta rota. security_invoker=true, mesma sessão do usuário.
    supabaseAdmin.from("vw_bdi_aguardando_retorno").select("analise_que_gerou_despacho, despacho_emitido_em, proxima_analise, proxima_analise_iniciada_em, dias_aguardando_retorno, situacao").eq("processo_codigo", codigo),
    // mac_historico — log de mudança de status por item, gravado por Regularização SEI e Aceite SEI
    // (app/api/analise-regularizacao|analise-aceite-sei/route.ts) e também pelo Slot 5
    // (app/api/mac/slot-05/analise/route.ts): já é transversal aos 3 slots, sem adapter nenhum.
    // Base de evolucaoChecklist() (lib/urbi/dossieProcesso.ts).
    supabaseAdmin.from("mac_historico").select("analise_id, checklist_item_id, item_texto, status_novo, analista_nome, criado_em").eq("processo_codigo", codigo).order("criado_em", { ascending: true }),
    // processo_historico — achado real (03/09/2026): não é mais alimentado por nenhum caminho de
    // código atual (0 linhas novas desde 08/2026; ProcessoClient.tsx não manda mais
    // `camposAlterados`) e as poucas linhas antigas guardam valor real por campo (`{campo,de,para}`),
    // não só o nome da chave — historicoAlteracoesLip() nunca expõe de/para por isso (ver função).
    supabaseAdmin.from("processo_historico").select("criado_em, detalhe").eq("processo_id", processo.id).order("criado_em", { ascending: false }).limit(15),
  ]);

  const nomesFontes = ["assunto", "campos_criticos", "analises_mac", "retrabalho", "mdp", "mrp", "mhd", "aguardando_retorno", "mac_historico", "processo_historico"];
  const fontesIndisponiveis = consultas
    .map((resultado, i) => resultado.error ? `${nomesFontes[i]}: ${resultado.error.message}` : null)
    .filter(Boolean);

  const assunto = consultas[0].data as any;
  const camposCriticos = consultas[1].data as any;
  const analises = ordenarAnalises((consultas[2].data ?? []) as any[]);
  const retrabalho = consultas[3].data ?? [];
  const mdp = consultas[4].data ?? [];
  const mrp = consultas[5].data ?? [];
  const mhdDocumentos = (consultas[6].data ?? []) as any[];
  const aguardandoRetorno = (consultas[7].data ?? []) as any[];
  const historicoMac = (consultas[8].data ?? []) as any[];
  const historicoLipBruto = (consultas[9].data ?? []) as any[];
  const ultima = analises.length ? analises[analises.length - 1] : null;

  // versão/hash vigente de cada documento — pedido explícito da Fase 3 original ("versão/hash dos
  // documentos no MHD, quando disponível"), faltava no primeiro corte desta rota. Só metadado
  // técnico (nunca nome_arquivo/texto/dados, que podem carregar conteúdo extraído do documento).
  const idsMhdDocs = mhdDocumentos.map((d) => d.id);
  const { data: mhdVersoesRaw, error: erroMhdVersoes } = idsMhdDocs.length
    ? await supabaseAdmin.from("mhd_versoes").select("documento_id, versao, hash, vigente, lido_em").in("documento_id", idsMhdDocs).eq("vigente", true)
    : { data: [] as any[], error: null };
  if (erroMhdVersoes) fontesIndisponiveis.push(`mhd_versoes: ${erroMhdVersoes.message}`);
  const versaoVigentePorDoc = new Map((mhdVersoesRaw ?? []).map((v: any) => [v.documento_id, v]));
  const mhd = mhdDocumentos.map((d) => {
    const v = versaoVigentePorDoc.get(d.id);
    return {
      papel: d.papel, rotulo: d.rotulo, status: d.status, escopo: d.escopo, atualizado_em: d.atualizado_em,
      versao: v?.versao ?? null, hash: v?.hash ?? null, lido_em: v?.lido_em ?? null,
    };
  });

  const tags = Array.isArray(processo.tags) ? processo.tags : [];
  const resumoCampos = camposCriticos ? {
    campos_vazios: Number(camposCriticos.campos_vazios) || 0,
    campos_em_x: Number(camposCriticos.campos_em_x) || 0,
    campos_totais: Number(camposCriticos.campos_totais) || 0,
  } : null;
  const ultimaPassada = ultima ? {
    numero_analise: Number(ultima.numero_analise) || 0,
    status: ultima.status,
    numero_despacho: ultima.numero_despacho,
    numero_parecer: ultima.numero_parecer,
  } : null;

  const itensUltima = (ultima?.itens && typeof ultima.itens === "object" && !Array.isArray(ultima.itens))
    ? ultima.itens as Record<string, unknown>
    : {};
  // Inventário COMPLETO da análise atual: não só pendências. O mapa `itens`
  // guarda apenas o que foi marcado; os itens ativos do modelo que não estão
  // nele aparecem como `em_branco`. É assim que o URBI pode responder sobre
  // tudo que está marcado ou ainda falta marcar, sem tratar ausência como OK.
  const { data: itensAtivosDoModelo, error: erroModeloItens } = ultima?.modelo_id
    ? await supabaseAdmin.from("mac_checklist_itens").select("id").eq("modelo_id", ultima.modelo_id).eq("ativo", true)
    : { data: [] as any[], error: null };
  if (erroModeloItens) fontesIndisponiveis.push(`itens_ativos_modelo: ${erroModeloItens.message}`);
  const idsItens = [...new Set([
    ...Object.keys(itensUltima),
    ...(itensAtivosDoModelo ?? []).map((item: any) => String(item.id)),
  ])];
  const { data: itensChecklist, error: erroItens } = idsItens.length
    ? await supabaseAdmin.from("mac_checklist_itens").select("id, grupo, texto, ref, fundamento_legal, chave_lip").in("id", idsItens)
    : { data: [], error: null };
  if (erroItens) fontesIndisponiveis.push(`checklist: ${erroItens.message}`);

  const idsNaoConformes = idsItens.filter((id) => itensUltima[id] === "nao_conforme");
  const { data: vinculos, error: erroVinculos } = idsNaoConformes.length
    ? await supabaseAdmin
        .from("mac_bip_vinculos")
        .select("mac_item_id, confianca, bdi_lei_fragmentos(referencia, texto)")
        .in("mac_item_id", idsNaoConformes)
    : { data: [], error: null };
  if (erroVinculos) fontesIndisponiveis.push(`bip: ${erroVinculos.message}`);

  const leisPorItem = new Map<string, any[]>();
  for (const vinculo of vinculos ?? []) {
    const v = vinculo as any;
    const fragmento = v.bdi_lei_fragmentos;
    if (!fragmento?.referencia) continue;
    const lista = leisPorItem.get(v.mac_item_id) ?? [];
    lista.push({
      referencia: String(fragmento.referencia),
      trecho: String(fragmento.texto ?? "").slice(0, 900),
      confianca_vinculo: String(v.confianca),
    });
    leisPorItem.set(v.mac_item_id, lista);
  }

  const itemPorId = new Map((itensChecklist ?? []).map((item: any) => [item.id, item]));
  const marcacoesMacBase = idsItens.map((id) => {
    const item: any = itemPorId.get(id);
    return {
      item_id: id,
      grupo: item?.grupo ?? null,
      texto: item?.texto ?? "Item sem cadastro localizado.",
      status: typeof itensUltima[id] === "string" ? itensUltima[id] : "em_branco",
      referencia_do_checklist: item?.ref ?? null,
      fundamento_legal_cadastrado: item?.fundamento_legal ?? null,
      campo_lip_relacionado: item?.chave_lip ?? null,
      vinculos_bip: leisPorItem.get(id) ?? [],
    };
  });
  // Observação por item (Slot 5) ou por aba/grupo (Regularização/Aceite SEI) — desvio por
  // tipo_processo dentro da leitura, colunas continuam isoladas por slot (ver anexarObservacoes).
  const observacaoPorItemId = anexarObservacoes(
    marcacoesMacBase.map((m) => ({ item_id: m.item_id, grupo: m.grupo })),
    processo.tipo_processo,
    (ultima as any)?.observacoes_por_item ?? null,
    (ultima as any)?.observacoes_por_aba ?? null,
  );
  const marcacoesMac = marcacoesMacBase.map((m) => {
    const observacao = observacaoPorItemId.get(m.item_id);
    return observacao ? { ...m, observacao } : m;
  });
  const pendenciasMac = idsNaoConformes.map((id) => {
    return marcacoesMac.find((item) => item.item_id === id)!;
  });

  // Evolução: compara o estado atual de cada item com o que mac_historico já sabia dele ANTES
  // desta passada (ver evolucaoChecklist em lib/urbi/dossieProcesso.ts para a regra completa).
  const statusAtualPorItem = new Map(marcacoesMac.map((m) => [m.item_id, m.status]));
  const evolucao = evolucaoChecklist(historicoMac, statusAtualPorItem, ultima?.id ?? null);

  // Histórico raso de alteração do LIP — só quais campos mudaram, nunca o valor (a tabela não
  // guarda isso, ver historicoAlteracoesLip).
  const historicoLip = historicoAlteracoesLip(historicoLipBruto as any);

  const numerosMdp = new Set((mdp as any[]).map((linha) => String(linha.numero ?? "")).filter(Boolean));
  const numerosMrp = new Set((mrp as any[]).map((linha) => String(linha.numero_despacho ?? "")).filter(Boolean));
  const documentosEmitidos = analises.flatMap((a: any) => [
    a.numero_despacho ? { numero_analise: a.numero_analise, tipo: "despacho", numero: String(a.numero_despacho) } : null,
    a.numero_parecer ? { numero_analise: a.numero_analise, tipo: "parecer", numero: String(a.numero_parecer) } : null,
    a.numero_despacho_interno ? { numero_analise: a.numero_analise, tipo: "despacho_interno", numero: String(a.numero_despacho_interno) } : null,
  ]).filter(Boolean).map((doc: any) => ({
    ...doc,
    mdp_registrado: numerosMdp.has(doc.numero),
    mrp_registrado: numerosMrp.has(doc.numero),
  }));

  const lip = fatosDoLip(processo as any);
  const situacoes = {
    geral: situacaoGeral(resumoCampos, ultimaPassada, tags as any),
    lip: situacaoLip(resumoCampos),
    mac: situacaoMac(ultimaPassada, tags as any),
  };

  return NextResponse.json({
    ok: true,
    data: {
      processo: {
        codigo: processo.codigo,
        assunto: assunto?.nome ?? null,
        tipo_processo: processo.tipo_processo,
        porte: processo.porte,
        area_construida: processo.area_construida,
        criado_em: processo.criado_em,
        atualizado_em: processo.atualizado_em,
        analise_iniciada_em: processo.analise_iniciada_em,
        analise_concluida_em: processo.analise_concluida_em,
      },
      situacoes,
      lip: {
        ...lip,
        marcado_incompleto_pelo_analista: processo.lip_incompleto,
        // Só quais campos mudaram e quando/quem — processo_historico não guarda valor
        // anterior/novo (ver historicoAlteracoesLip). Interno: "quem" fica aqui pro dossiê próprio
        // do processo; o recorte que o chat manda ao Gemini remove essa identificação.
        historico_alteracoes: historicoLip,
        fonte: "processos.dados + vw_bdi_campos_criticos + processo_historico",
      },
      mac: {
        numero_analises: analises.length,
        ultima_analise: ultima ? { numero_analise: ultima.numero_analise, status: ultima.status, criado_em: ultima.criado_em, atualizado_em: ultima.atualizado_em } : null,
        resumo_ultima_analise: resumoChecklist(Object.fromEntries(marcacoesMac.map((item) => [item.item_id, item.status]))),
        // Inventário completo, usado pelo recorte seguro do chat. A interface
        // não despeja essa lista: o URBI seleciona por pergunta, status e
        // campo LIP relacionado para caber no contexto do modelo.
        marcacoes_ultima_analise: marcacoesMac,
        pendencias_ultima_analise: pendenciasMac,
        // Comparação com o que mac_historico já sabia do item antes desta passada (corrigido /
        // voltou a não conforme / continua pendente). Transversal aos 3 slots — mac_historico é
        // gravado por Regularização, Aceite SEI e Slot 5 igual.
        evolucao,
        marcado_incompleto_pelo_analista: processo.mac_incompleto,
        fonte: "analises_mac + mac_checklist_itens + mac_bip_vinculos + bdi_lei_fragmentos + mac_historico",
      },
      fluxo: {
        analises: analises.map((a: any) => ({
          numero_analise: a.numero_analise,
          status: a.status,
          criado_em: a.criado_em,
          atualizado_em: a.atualizado_em,
          numero_despacho: a.numero_despacho,
          numero_parecer: a.numero_parecer,
          numero_despacho_interno: a.numero_despacho_interno,
        })),
        retrabalho_entre_passadas: retrabalho,
        documentos_emitidos: documentosEmitidos,
        documentos_mhd: mhd,
        aguardando_retorno: aguardandoRetorno.map((r: any) => ({
          analise: r.analise_que_gerou_despacho,
          despacho_emitido_em: r.despacho_emitido_em,
          proxima_analise: r.proxima_analise,
          dias: r.dias_aguardando_retorno,
          situacao: r.situacao, // "retornou" | "ainda aguardando" | "base insuficiente"
        })),
      },
      cobertura: {
        fontes_indisponiveis: fontesIndisponiveis,
        completo: fontesIndisponiveis.length === 0,
        observacoes: [
          "O dossiê não contém nomes, contatos nem responsáveis técnicos.",
          "Lei só aparece quando existe vínculo real entre o item do MAC e um fragmento do BIP.",
          "Ausência de vínculo BIP não significa conformidade nem ausência de fundamento legal.",
          "Este dossiê não prevê prazo, não julga e não altera o processo.",
          "lip.historico_alteracoes só lista o RÓTULO do campo que mudou e quando — nunca o valor anterior/novo, mesmo quando a fonte tem esse dado, por privacidade. A fonte (processo_historico) hoje não recebe linha nova de nenhum caminho de código conhecido — ausência de item aqui não prova ausência de alteração real no processo.",
        ],
      },
    },
  });
}
