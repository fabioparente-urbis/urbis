import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { montarAvisos, triar, resumirCampos, type EntradaVigia, type LinhaRetrabalho } from "@/lib/bdi/vigia";
import { situacaoGeral, situacaoLip, situacaoMac, type ResumoCamposLip, type TagProcesso, type UltimaPassadaMac } from "@/lib/bdi/situacao";

// ============================================================
// BDI — Co-Analista por evidência (02/09/2026)
//
// Responde, POR PROCESSO, onde olhar primeiro — nunca decide, nunca prevê.
// Cada fato vem de tabela/view real; nenhum campo aqui é calculado por IA.
//
// REAPROVEITAMENTO (auditoria feita antes de codar — nenhuma view nova foi
// necessária, tudo já existia):
//   · situação geral/LIP/MAC        → lib/bdi/situacao.ts (mesmo de /api/processos)
//   · campos vazios/em X            → resumirCampos() de lib/bdi/vigia.ts, direto
//                                      de processos.dados (mesma fonte do Vigia)
//   · retrabalho comprovado         → vw_bdi_retrabalho_por_passada (aplicada)
//   · avisos / triagem              → montarAvisos()/triar() de lib/bdi/vigia.ts,
//                                      IDÊNTICO ao que /api/bdi/vigia já faz por
//                                      processo — só rodado pra lista inteira
//   · exigências recorrentes        → vw_bdi_exigencias_por_contexto (aplicada),
//                                      1 consulta por tipo_processo distinto na
//                                      lista, não por processo
//   · referência legal (BIP)        → mac_bip_vinculos × bdi_lei_fragmentos,
//                                      só quando há vínculo real — mesma regra
//                                      do Vigia, nunca inventa artigo
//   · quantas análises               → analises_mac.numero_analise da passada
//                                      mais recente (mesma fonte de situacaoMac)
//
// NÃO REAPROVEITADO / NOVO NESTA ROTA:
//   · documento emitido sem MDP/MRP → vw_bdi_cobertura_satelite existe mas é
//     AGREGADA (por tipo_processo+tipo_documento, não por processo). Em vez de
//     criar uma view nova só pra isto, a mesma lógica dela (COALESCE de
//     numero_despacho/numero_parecer/numero_despacho_interno, cruzado com
//     mdp_registros/mrp_registros pelo número) roda aqui direto, por processo.
//     Nenhuma migration foi necessária.
//
// DADO NOMINAL: `processos.dados` é buscado (resumirCampos/vinculosLegais
// precisam do conteúdo pra achar o que está vazio), mas NUNCA sai desta rota
// — a resposta só devolve NOMES de campo (ex.: "proprietario" como chave
// vazia), nunca o valor. Nenhum `interessado`/`proprietario` no JSON.
//
// SEM PREVISÃO: nada aqui calcula % de chance, prazo estimado ou nota de
// analista. A ordenação da lista é por CONTAGEM de fatos objetivos (quantos
// alertas, quantas trocas de retrabalho) — nunca exposta como probabilidade,
// só usada pra decidir a ordem das linhas.
// ============================================================
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao Administrador." }, { status: 403 });
  }

  const assuntoSlug = (new URL(req.url).searchParams.get("assunto") || "").trim();

  let query = supabaseAdmin
    .from("processos")
    .select("codigo, tipo_processo, assunto_id, area_construida, dados, tags")
    .is("excluido_em", null)
    .order("atualizado_em", { ascending: false })
    .limit(200);
  if (assuntoSlug) query = query.eq("tipo_processo", assuntoSlug);

  const { data: processos, error: erroProcessos } = await query;
  if (erroProcessos) {
    return NextResponse.json({ ok: false, erro: `Falha ao carregar processos: ${erroProcessos.message}` }, { status: 500 });
  }
  const lista = processos ?? [];
  const codigos = lista.map((p) => p.codigo).filter(Boolean);
  const tiposDistintos = [...new Set(lista.map((p) => (p.tipo_processo || "").toLowerCase()).filter(Boolean))];

  if (codigos.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const [
    { data: linhasRetrabalhoAgregado },
    { data: linhasRetrabalhoPorPassada },
    { data: linhasCampos },
    { data: linhasAnalises },
    { data: linhasMdp },
    { data: linhasMrp },
    { data: linhasHistorico },
  ] = await Promise.all([
    supabaseAdmin.from("vw_bdi_retrabalho").select("processo_codigo, trocas_totais, virou_nao_conforme, foi_resolvido").in("processo_codigo", codigos),
    supabaseAdmin.from("vw_bdi_retrabalho_por_passada").select("*").in("processo_codigo", codigos),
    supabaseAdmin.from("vw_bdi_campos_criticos").select("codigo, campos_vazios, campos_em_x, campos_totais").in("codigo", codigos),
    supabaseAdmin.from("analises_mac").select("processo_codigo, numero_analise, status, numero_despacho, numero_parecer, numero_despacho_interno").in("processo_codigo", codigos).is("excluido_em", null),
    supabaseAdmin.from("mdp_registros").select("processo_codigo, numero").in("processo_codigo", codigos),
    supabaseAdmin.from("mrp_registros").select("processo_codigo, numero_despacho").in("processo_codigo", codigos),
    supabaseAdmin.from("mac_historico").select("processo_codigo, checklist_item_id").in("processo_codigo", codigos).not("checklist_item_id", "is", null).limit(4000),
  ]);

  // Exigências recorrentes — 1 consulta por tipo_processo distinto, não por processo.
  const exigenciasPorTipo = new Map<string, { exigencia: string; vezes: number; processos: number }[]>();
  await Promise.all(
    tiposDistintos.map(async (tipo) => {
      const { data } = await supabaseAdmin
        .from("vw_bdi_exigencias_por_contexto")
        .select("exigencia, vezes, processos")
        .eq("tipo_processo", tipo)
        .order("processos", { ascending: false })
        .limit(5);
      exigenciasPorTipo.set(tipo, (data ?? []) as any);
    }),
  );

  // Vínculo legal (BIP) — mesma regra do Vigia: só entra quando há FK real.
  // Batch: junta os checklist_item_id de TODOS os processos, uma consulta só
  // a mac_bip_vinculos, depois separa de volta por processo.
  const itensPorProcesso = new Map<string, Set<string>>();
  for (const linha of linhasHistorico ?? []) {
    const l = linha as any;
    if (!l.checklist_item_id) continue;
    const set = itensPorProcesso.get(l.processo_codigo) ?? new Set<string>();
    set.add(l.checklist_item_id);
    itensPorProcesso.set(l.processo_codigo, set);
  }
  const todosItens = [...new Set([...itensPorProcesso.values()].flatMap((s) => [...s]))];
  const vinculosPorItem = new Map<string, { referencia: string; confianca: string }[]>();
  if (todosItens.length > 0) {
    const { data: vinculos } = await supabaseAdmin
      .from("mac_bip_vinculos")
      .select("mac_item_id, confianca, bdi_lei_fragmentos(referencia)")
      .in("mac_item_id", todosItens.slice(0, 500));
    for (const v of vinculos ?? []) {
      const vv = v as any;
      const ref = vv?.bdi_lei_fragmentos?.referencia;
      if (!ref) continue;
      const lista2 = vinculosPorItem.get(vv.mac_item_id) ?? [];
      lista2.push({ referencia: String(ref), confianca: String(vv.confianca) });
      vinculosPorItem.set(vv.mac_item_id, lista2);
    }
  }

  // Cobertura de satélite por processo — mesma lógica de vw_bdi_cobertura_satelite,
  // rodada por linha em vez de agregada. Chave de presença: (processo_codigo, numero).
  const chaveMdp = new Set((linhasMdp ?? []).map((l: any) => `${l.processo_codigo}::${l.numero}`));
  const chaveMrp = new Set((linhasMrp ?? []).map((l: any) => `${l.processo_codigo}::${l.numero_despacho}`));

  const camposPorCodigo = new Map<string, ResumoCamposLip>();
  for (const l of linhasCampos ?? []) {
    const ll = l as any;
    camposPorCodigo.set(ll.codigo, { campos_vazios: Number(ll.campos_vazios) || 0, campos_em_x: Number(ll.campos_em_x) || 0, campos_totais: Number(ll.campos_totais) || 0 });
  }
  const ultimaPassadaPorCodigo = new Map<string, UltimaPassadaMac & { numero_despacho_interno?: string | null }>();
  for (const l of linhasAnalises ?? []) {
    const ll = l as any;
    const atual = ultimaPassadaPorCodigo.get(ll.processo_codigo);
    if (!atual || Number(ll.numero_analise) > atual.numero_analise) {
      ultimaPassadaPorCodigo.set(ll.processo_codigo, {
        numero_analise: Number(ll.numero_analise) || 0, status: ll.status,
        numero_despacho: ll.numero_despacho ?? null, numero_parecer: ll.numero_parecer ?? null,
        numero_despacho_interno: ll.numero_despacho_interno ?? null,
      });
    }
  }
  const retrabalhoAgregadoPorCodigo = new Map<string, LinhaRetrabalho>();
  for (const l of linhasRetrabalhoAgregado ?? []) retrabalhoAgregadoPorCodigo.set((l as any).processo_codigo, l as any);
  const retrabalhoPorPassadaPorCodigo = new Map<string, any[]>();
  for (const l of linhasRetrabalhoPorPassada ?? []) {
    const ll = l as any;
    const lista3 = retrabalhoPorPassadaPorCodigo.get(ll.processo_codigo) ?? [];
    lista3.push({ exigencia: ll.exigencia, aba: ll.aba, referencia_legal: ll.referencia_legal, passada_anterior: ll.passada_anterior, passada_atual: ll.passada_atual, voltou_em: ll.voltou_em });
    retrabalhoPorPassadaPorCodigo.set(ll.processo_codigo, lista3);
  }

  const resultado = lista.map((p) => {
    const codigo = p.codigo as string;
    const tipo = (p.tipo_processo || "").toLowerCase();
    const dados = (p.dados ?? {}) as Record<string, any>;
    const tags: TagProcesso[] = Array.isArray(p.tags) ? (p.tags as any[]).filter((t) => t && typeof t === "object") : [];
    const campos = camposPorCodigo.get(codigo) ?? null;
    const ultimaPassada = ultimaPassadaPorCodigo.get(codigo) ?? null;

    // --- as 3 situações (lib/bdi/situacao.ts), idênticas às da Pilha
    const sitGeral = situacaoGeral(campos, ultimaPassada, tags);
    const sitLip = situacaoLip(campos);
    const sitMac = situacaoMac(ultimaPassada, tags);

    // --- o que falta preencher: nomes de campo, nunca o valor
    const resumoCampos = resumirCampos(dados);

    // --- retrabalho comprovado entre análises (vw_bdi_retrabalho_por_passada)
    const retrabalhoComprovado = retrabalhoPorPassadaPorCodigo.get(codigo) ?? [];

    // --- documento emitido sem MDP/MRP — mesma regra de vw_bdi_cobertura_satelite
    const numeroEmitido = ultimaPassada?.numero_despacho || ultimaPassada?.numero_parecer || ultimaPassada?.numero_despacho_interno || null;
    const satelite = numeroEmitido
      ? {
          numero: numeroEmitido,
          tem_mdp: chaveMdp.has(`${codigo}::${numeroEmitido}`),
          tem_mrp: chaveMrp.has(`${codigo}::${numeroEmitido}`),
        }
      : null;

    // --- vínculo legal (BIP), agregado dos itens deste processo
    const idsDoProcesso = [...(itensPorProcesso.get(codigo) ?? [])];
    const vinculosLegais = idsDoProcesso.flatMap((id) => vinculosPorItem.get(id) ?? []).slice(0, 5);

    // --- avisos e triagem (lib/bdi/vigia.ts) — IDÊNTICO ao Vigia de 1 processo
    const entrada: EntradaVigia = {
      processo: { codigo, tipo_processo: p.tipo_processo, area_construida: p.area_construida, dados, tags: p.tags },
      retrabalho: retrabalhoAgregadoPorCodigo.get(codigo) ?? { trocas_totais: 0, virou_nao_conforme: 0 },
      exigenciasRecorrentes: exigenciasPorTipo.get(tipo) ?? [],
      vinculosLegais,
    };
    const avisos = montarAvisos(entrada);
    const triagem = triar(entrada);

    // Peso só pra ORDENAR a lista — nunca exposto como número/percentual.
    // Fato objetivo, contado: quanto mais alerta e retrabalho comprovado,
    // mais cedo aparece. Não é chance de nada, é contagem de sinal real.
    const peso =
      (satelite && !satelite.tem_mdp ? 1 : 0) + (satelite && !satelite.tem_mrp ? 1 : 0) +
      retrabalhoComprovado.length +
      avisos.filter((a) => a.severidade === "alerta").length * 2 +
      avisos.filter((a) => a.severidade === "atencao").length +
      (triagem.classe === "maior risco de retrabalho" ? 3 : triagem.classe === "exige atenção" ? 1 : 0);

    return {
      codigo,
      tipo_processo: p.tipo_processo,
      situacao_geral: sitGeral.classe, situacao_geral_motivo: sitGeral.motivo,
      situacao_lip: sitLip.classe, situacao_lip_motivo: sitLip.motivo,
      situacao_mac: sitMac.classe, situacao_mac_motivo: sitMac.motivo,
      numero_analises: ultimaPassada?.numero_analise ?? 0,
      campos_vazios: resumoCampos.vazios,
      campos_em_x: resumoCampos.emX,
      campos_totais: resumoCampos.totais,
      retrabalho_comprovado: retrabalhoComprovado,
      satelite,
      exigencias_recorrentes: exigenciasPorTipo.get(tipo) ?? [],
      vinculos_legais: vinculosLegais,
      avisos,
      triagem: triagem.classe,
      triagem_motivos: triagem.motivos,
      _peso: peso,
    };
  });

  resultado.sort((a, b) => b._peso - a._peso);

  return NextResponse.json({ ok: true, data: resultado.map(({ _peso, ...resto }) => resto) });
}
