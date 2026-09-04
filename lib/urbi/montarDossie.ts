/**
 * lib/urbi/montarDossie.ts — dossiê factual do URBI, extraído de app/api/urbi/dossie/route.ts
 * (Fase piloto humano controlado, 05/09/2026).
 *
 * ACHADO REAL que motivou esta extração: `app/api/urbi/chat/route.ts` chamava esta lógica por
 * AUTOCHAMADA HTTP (`fetch(new URL("/api/urbi/dossie?codigo=...", req.url))`) — o único lugar em
 * todo o código que faz um servidor buscar sua própria API pela rede. Em produção (Railway), essa
 * autochamada falhava sempre (confirmado: a mesma rota, chamada direto pelo navegador com a
 * mesma sessão, devolve o dossiê completo sem erro nenhum — só a chamada servidor→servidor
 * quebrava). Nunca tinha sido exercitada de verdade antes deste piloto porque, até aqui, nenhuma
 * conversa real com o URBI tinha processo em contexto (achado da Fase P). Esta função elimina a
 * autochamada: quem precisa do dossiê chama a função diretamente, no mesmo processo — a rota
 * `/api/urbi/dossie` e o chat passam a compartilhar o mesmo código, nunca uma chamada de rede
 * entre os dois.
 *
 * Somente leitura. Não chama IA, não escreve no processo, não altera LIP/MAC, não emite
 * documento e não consome numeração. Cada bloco informa a fonte real; falha de fonte OPCIONAL
 * vira cobertura indisponível (registrada em `cobertura.fontes_indisponiveis`), nunca derruba o
 * dossiê inteiro nem vira conclusão positiva por ausência de dado.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { podeAcessarProcesso, type UsuarioReq } from "@/lib/autorizacao";
import { situacaoGeral, situacaoLip, situacaoMac } from "@/lib/bdi/situacao";
import {
  fatosDoLip, ordenarAnalises, resumoChecklist,
  evolucaoChecklist, anexarObservacoes, historicoAlteracoesLip, selecionarEmLotes,
} from "@/lib/urbi/dossieProcesso";
import { cruzarLipComDocumento, cruzarItensMacComBip, cruzarEvolucaoChecklist } from "@/lib/urbi/cruzamento";
import { montarDossieTecnico } from "@/lib/urbi/adaptadores";

export type ResultadoMontagemDossie =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; erro: string };

export async function montarDossieFactual(
  codigoBruto: string,
  usuario: UsuarioReq | null,
): Promise<ResultadoMontagemDossie> {
  const codigo = (codigoBruto ?? "").trim();
  if (!codigo) return { ok: false, status: 400, erro: "codigo é obrigatório." };
  if (!usuario) return { ok: false, status: 401, erro: "SESSAO_EXPIRADA" };

  const { data: processo, error: erroProcesso } = await supabaseAdmin
    .from("processos")
    .select("id, codigo, tipo_processo, assunto_id, porte, area_construida, dados, tags, analista_id, gerencia, criado_em, atualizado_em, analise_iniciada_em, analise_concluida_em, lip_incompleto, mac_incompleto")
    .eq("codigo", codigo)
    .is("excluido_em", null)
    .maybeSingle();

  if (erroProcesso) {
    console.error("[montarDossieFactual] processo:", erroProcesso.message);
    return { ok: false, status: 500, erro: "Falha ao carregar o processo." };
  }
  if (!processo) return { ok: false, status: 404, erro: "Processo não encontrado." };

  const acesso = await podeAcessarProcesso(usuario, codigo);
  if (!acesso.ok) return { ok: false, status: acesso.status, erro: acesso.erro };

  const consultas = await Promise.all([
    supabaseAdmin.from("assuntos").select("nome, slug").eq("id", processo.assunto_id).maybeSingle(),
    supabaseAdmin.from("vw_bdi_campos_criticos").select("campos_vazios, campos_em_x, campos_totais").eq("codigo", codigo).maybeSingle(),
    supabaseAdmin.from("analises_mac").select("id, numero_analise, status, itens, criado_em, atualizado_em, numero_despacho, numero_parecer, numero_despacho_interno, modelo_id, observacoes_por_item, observacoes_por_aba").eq("processo_codigo", codigo).is("excluido_em", null),
    // Colunas corrigidas em 05/09/2026 (piloto humano controlado): a view real expõe
    // status_na_passada_anterior/status_antes_da_volta/status_depois_da_volta — a consulta
    // pedia status_anterior/status_novo, que nunca existiram nela (achado: essa fonte estava
    // 100% indisponível pra todo processo desde a criação da view em 02/09, sempre engolido
    // como "fonte indisponível", nunca travava o dossiê, mas nunca trazia dado nenhum também).
    supabaseAdmin.from("vw_bdi_retrabalho_por_passada").select("exigencia, aba, referencia_legal, passada_anterior, status_na_passada_anterior, passada_atual, status_antes_da_volta, status_depois_da_volta, voltou_em").eq("processo_codigo", codigo).order("voltou_em", { ascending: false }).limit(100),
    supabaseAdmin.from("mdp_registros").select("tipo, numero, data_despacho, criado_em").eq("processo_codigo", codigo).order("criado_em", { ascending: true }),
    supabaseAdmin.from("mrp_registros").select("tipo_despacho, numero_despacho, numero_analise, data_despacho, pontos").eq("processo_codigo", codigo).order("data_despacho", { ascending: true }),
    supabaseAdmin.from("mhd_documentos").select("id, papel, rotulo, status, escopo, atualizado_em").eq("processo_codigo", codigo).order("atualizado_em", { ascending: false }),
    supabaseAdmin.from("vw_bdi_aguardando_retorno").select("analise_que_gerou_despacho, despacho_emitido_em, proxima_analise, proxima_analise_iniciada_em, dias_aguardando_retorno, situacao").eq("processo_codigo", codigo),
    supabaseAdmin.from("mac_historico").select("analise_id, checklist_item_id, item_texto, status_novo, analista_nome, criado_em").eq("processo_codigo", codigo).order("criado_em", { ascending: true }),
    supabaseAdmin.from("processo_historico").select("criado_em, detalhe").eq("processo_id", processo.id).order("criado_em", { ascending: false }).limit(15),
    supabaseAdmin.from("mhd_resultados_campo").select("chave, valor, fonte").eq("processo_codigo", codigo).eq("vigente", true),
  ]);

  const nomesFontes = ["assunto", "campos_criticos", "analises_mac", "retrabalho", "mdp", "mrp", "mhd", "aguardando_retorno", "mac_historico", "processo_historico", "mhd_resultados_campo"];
  const fontesIndisponiveis = consultas
    .map((resultado, i) => resultado.error ? `${nomesFontes[i]}: ${resultado.error.message}` : null)
    .filter(Boolean) as string[];

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
  const resultadosDocumento = (consultas[10].data ?? []) as any[];
  const ultima = analises.length ? analises[analises.length - 1] : null;

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
  const { data: itensAtivosDoModelo, error: erroModeloItens } = ultima?.modelo_id
    ? await supabaseAdmin.from("mac_checklist_itens").select("id").eq("modelo_id", ultima.modelo_id).eq("ativo", true)
    : { data: [] as any[], error: null };
  if (erroModeloItens) fontesIndisponiveis.push(`itens_ativos_modelo: ${erroModeloItens.message}`);
  const idsItens = [...new Set([
    ...Object.keys(itensUltima),
    ...(itensAtivosDoModelo ?? []).map((item: any) => String(item.id)),
  ])];
  const { data: itensChecklist, erro: erroItens } = idsItens.length
    ? await selecionarEmLotes(idsItens, 150, (lote) =>
        supabaseAdmin.from("mac_checklist_itens").select("id, grupo, texto, ref, fundamento_legal, chave_lip, ativo, atualizado_em").in("id", lote)
      )
    : { data: [] as any[], erro: null };
  if (erroItens) fontesIndisponiveis.push(`checklist: ${erroItens}`);

  const idsAtivosDoModelo = (itensAtivosDoModelo ?? []).map((i: any) => String(i.id));
  const { data: vinculosDoModelo, erro: erroCoberturaBip } = idsAtivosDoModelo.length
    ? await selecionarEmLotes(idsAtivosDoModelo, 150, (lote) =>
        supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id").in("mac_item_id", lote)
      )
    : { data: [] as any[], erro: null };
  const itensComVinculoBipAprovado = new Set((vinculosDoModelo ?? []).map((v: any) => v.mac_item_id)).size;
  if (erroCoberturaBip) fontesIndisponiveis.push(`cobertura_bip: ${erroCoberturaBip}`);

  const { data: eventosCatalogoBrutos, error: erroEventosCatalogo } = ultima?.modelo_id
    ? await supabaseAdmin
        .from("mac_checklist_itens_historico")
        .select("item_id, acao, campos_alterados, criado_em")
        .eq("modelo_id", ultima.modelo_id)
        .order("criado_em", { ascending: false })
        .limit(30)
    : { data: [] as any[], error: null };
  if (erroEventosCatalogo) fontesIndisponiveis.push(`eventos_catalogo: ${erroEventosCatalogo.message}`);

  const idsNaoConformes = idsItens.filter((id) => itensUltima[id] === "nao_conforme");
  const { data: vinculos, erro: erroVinculos } = idsNaoConformes.length
    ? await selecionarEmLotes(idsNaoConformes, 150, (lote) =>
        supabaseAdmin
          .from("mac_bip_vinculos")
          .select("mac_item_id, confianca, bdi_lei_fragmentos(referencia, texto)")
          .in("mac_item_id", lote)
      )
    : { data: [] as any[], erro: null };
  if (erroVinculos) fontesIndisponiveis.push(`bip: ${erroVinculos}`);

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

  const statusAtualPorItem = new Map(marcacoesMac.map((m) => [m.item_id, m.status]));
  const evolucao = evolucaoChecklist(historicoMac, statusAtualPorItem, ultima?.id ?? null);

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

  const cruzamentosLipDocumento = cruzarLipComDocumento(
    Object.fromEntries(Object.entries(lip.campos_tecnicos).map(([chave, c]: [string, any]) => [chave, { chave, valor: c.valor, fonte: c.fonte }])),
    resultadosDocumento,
  );
  const cruzamentosMacBip = cruzarItensMacComBip(
    pendenciasMac.map((p) => ({ item_id: p.item_id, texto: p.texto })),
    new Map(pendenciasMac.map((p) => [p.item_id, (p.vinculos_bip ?? []).map((v: any) => ({ referencia: v.referencia, confianca: v.confianca_vinculo }))])),
  );
  const cruzamentosEvolucao = cruzarEvolucaoChecklist(evolucao);
  const cruzamentos = [...cruzamentosLipDocumento, ...cruzamentosMacBip, ...cruzamentosEvolucao];

  const itemAtualPorId = new Map(
    (itensChecklist ?? []).map((item: any) => [item.id as string, { texto: item.texto as string, ativo: item.ativo !== false }]),
  );
  const tecnico = montarDossieTecnico(processo.tipo_processo, {
    itensAtivosNoModelo: (itensAtivosDoModelo ?? []).length,
    historicoMac,
    itemAtualPorId,
    resultadosDocumento,
    erroResultadosDocumento: consultas[10].error?.message ?? null,
    itensComVinculoBipAprovado,
    erroCoberturaBip: erroCoberturaBip,
    mdpRegistros: mdp as any[],
    mrpRegistros: mrp as any[],
    eventosCatalogo: eventosCatalogoBrutos ?? [],
  });

  const situacoes = {
    geral: situacaoGeral(resumoCampos, ultimaPassada, tags as any),
    lip: situacaoLip(resumoCampos),
    mac: situacaoMac(ultimaPassada, tags as any),
  };

  return {
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
        historico_alteracoes: historicoLip,
        fonte: "processos.dados + vw_bdi_campos_criticos + processo_historico",
      },
      mac: {
        numero_analises: analises.length,
        ultima_analise: ultima ? { numero_analise: ultima.numero_analise, status: ultima.status, criado_em: ultima.criado_em, atualizado_em: ultima.atualizado_em } : null,
        resumo_ultima_analise: resumoChecklist(Object.fromEntries(marcacoesMac.map((item) => [item.item_id, item.status]))),
        marcacoes_ultima_analise: marcacoesMac,
        pendencias_ultima_analise: pendenciasMac,
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
          situacao: r.situacao,
        })),
      },
      cruzamentos,
      tecnico,
      cobertura: {
        fontes_indisponiveis: fontesIndisponiveis,
        completo: fontesIndisponiveis.length === 0,
        observacoes: [
          "O dossiê não contém nomes, contatos nem responsáveis técnicos.",
          "Lei só aparece quando existe vínculo real entre o item do MAC e um fragmento do BIP.",
          "Ausência de vínculo BIP não significa conformidade nem ausência de fundamento legal.",
          "Este dossiê não prevê prazo, não julga e não altera o processo.",
          "Documento emitido sem registro em MDP/MRP (fluxo.documentos_emitidos) é ausência de FONTE satélite, não indício de erro do analista ou do interessado — pode ser lançamento pendente, registro em outro formato ou lacuna de integração ainda não coberta.",
          "lip.historico_alteracoes só lista o RÓTULO do campo que mudou e quando — nunca o valor anterior/novo, mesmo quando a fonte tem esse dado, por privacidade. A fonte (processo_historico) hoje não recebe linha nova de nenhum caminho de código conhecido — ausência de item aqui não prova ausência de alteração real no processo.",
        ],
      },
    },
  };
}
