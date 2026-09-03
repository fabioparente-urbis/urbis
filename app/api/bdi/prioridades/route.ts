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

  const url = new URL(req.url);
  const assuntoSlug = (url.searchParams.get("assunto") || "").trim();
  // Paginação real (revisão de 02/09/2026 — antes era um .limit(200) fixo,
  // sem contagem nem aviso). Cada processo dispara consultas em lote (não
  // por linha), mas o CUSTO daquelas consultas cresce com o tamanho da
  // página — por isso um teto bem menor que o antigo, com offset pra
  // navegar, e o total real devolvido pra tela avisar quando cortou.
  const LIMITE_PADRAO = 100, LIMITE_MAXIMO = 300;
  const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Number(url.searchParams.get("limit")) || LIMITE_PADRAO));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  let query = supabaseAdmin
    .from("processos")
    .select("codigo, tipo_processo, assunto_id, area_construida, dados, tags", { count: "exact" })
    .is("excluido_em", null)
    .order("atualizado_em", { ascending: false })
    .range(offset, offset + limite - 1);
  if (assuntoSlug) query = query.eq("tipo_processo", assuntoSlug);

  const { data: processos, error: erroProcessos, count: totalDisponivel } = await query;
  // "Requested range not satisfiable": offset além do total (achado ao
  // testar — o.range(100,199) contra 80 linhas reais devolve ERRO, não
  // lista vazia). Uma página fora do alcance é dado insuficiente, não
  // falha — não pode virar 500 só porque alguém pediu a página seguinte
  // depois que a lista encolheu (filtro de Assunto mudou, processo foi
  // excluído entretanto).
  const forRangeErr = erroProcessos && /range not satisfiable/i.test(erroProcessos.message);
  if (erroProcessos && !forRangeErr) {
    return NextResponse.json({ ok: false, erro: `Falha ao carregar processos: ${erroProcessos.message}` }, { status: 500 });
  }
  const lista = forRangeErr ? [] : (processos ?? []);
  const codigos = lista.map((p) => p.codigo).filter(Boolean);
  const tiposDistintos = [...new Set(lista.map((p) => (p.tipo_processo || "").toLowerCase()).filter(Boolean))];
  const paginacao = { limite, offset, total_disponivel: totalDisponivel ?? lista.length, mostrando: lista.length };

  if (codigos.length === 0) {
    return NextResponse.json({ ok: true, data: [], paginacao });
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

  // Cobertura de vínculo legal (BIP) POR ASSUNTO — 1 consulta por tipo_processo
  // distinto, não por processo. Achado da revisão de 02/09/2026: os 727
  // vínculos de mac_bip_vinculos são 100% do checklist do Slot 5 — Regularização
  // e Aceite SEI têm ZERO. Isso não é bug de chave (testado item por item, a
  // FK funciona certo); é ausência de dado — a vinculação nunca foi feita pra
  // esses dois assuntos. Calculado aqui pra dar um motivo real quando
  // `vinculos_legais` vier vazio, em vez de só mostrar "nada encontrado".
  const coberturaBipPorTipo = new Map<string, { itensAtivos: number; itensComVinculo: number }>();
  await Promise.all(
    tiposDistintos.map(async (tipo) => {
      const { data: modelo } = await supabaseAdmin.from("mac_checklist_modelos").select("id").eq("tipo_processo", tipo).maybeSingle();
      if (!modelo?.id) { coberturaBipPorTipo.set(tipo, { itensAtivos: 0, itensComVinculo: 0 }); return; }
      const { data: itensDoModelo } = await supabaseAdmin.from("mac_checklist_itens").select("id").eq("modelo_id", modelo.id).eq("ativo", true);
      const idsModelo = new Set((itensDoModelo ?? []).map((i: any) => i.id));
      const comVinculo = [...idsModelo].filter((id) => vinculosPorItem.has(id)).length;
      coberturaBipPorTipo.set(tipo, { itensAtivos: idsModelo.size, itensComVinculo: comVinculo });
    }),
  );

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
  // Todas as passadas do processo, não só a mais recente — a checagem de
  // MDP/MRP tem que olhar TODO documento já commitado (achado da revisão de
  // 02/09/2026: um processo pode ter despacho da análise 1 sem MDP e a
  // análise 2 já concluída; olhar só a última escondia isso).
  const todasPassadasPorCodigo = new Map<string, { numero_analise: number; numero_despacho: string | null; numero_parecer: string | null; numero_despacho_interno: string | null }[]>();
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
    const lista4 = todasPassadasPorCodigo.get(ll.processo_codigo) ?? [];
    lista4.push({
      numero_analise: Number(ll.numero_analise) || 0,
      numero_despacho: ll.numero_despacho ?? null, numero_parecer: ll.numero_parecer ?? null,
      numero_despacho_interno: ll.numero_despacho_interno ?? null,
    });
    todasPassadasPorCodigo.set(ll.processo_codigo, lista4);
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

    // --- documento emitido sem MDP/MRP — TODO documento de TODA passada do
    // processo (não só o mais recente, ver comentário acima), cada um
    // checado separadamente: uma análise pode ter despacho E despacho
    // interno ao mesmo tempo, e cada um tem que aparecer em MDP/MRP.
    const documentosDoProcesso: { numero_analise: number; tipo_documento: string; numero: string }[] = [];
    for (const passada of todasPassadasPorCodigo.get(codigo) ?? []) {
      if (passada.numero_despacho) documentosDoProcesso.push({ numero_analise: passada.numero_analise, tipo_documento: "despacho", numero: passada.numero_despacho });
      if (passada.numero_parecer) documentosDoProcesso.push({ numero_analise: passada.numero_analise, tipo_documento: "parecer", numero: passada.numero_parecer });
      if (passada.numero_despacho_interno) documentosDoProcesso.push({ numero_analise: passada.numero_analise, tipo_documento: "despacho_interno", numero: passada.numero_despacho_interno });
    }
    const satelite = documentosDoProcesso.map((d) => ({
      ...d,
      tem_mdp: chaveMdp.has(`${codigo}::${d.numero}`),
      tem_mrp: chaveMrp.has(`${codigo}::${d.numero}`),
    }));

    // --- vínculo legal (BIP), agregado dos itens deste processo
    const idsDoProcesso = [...(itensPorProcesso.get(codigo) ?? [])];
    const vinculosLegais = idsDoProcesso.flatMap((id) => vinculosPorItem.get(id) ?? []).slice(0, 5);
    const coberturaBip = coberturaBipPorTipo.get(tipo) ?? { itensAtivos: 0, itensComVinculo: 0 };
    // "Base insuficiente" tem um motivo real, não um vazio genérico —
    // distingue "este assunto não tem vínculo BIP nenhum" de "este processo
    // específico não usou item vinculado, mas o assunto tem cobertura".
    const vinculosLegaisInfo = vinculosLegais.length > 0
      ? { categoria: "fato" as const, motivo: `${vinculosLegais.length} vínculo(s) real(is) encontrado(s) (mac_bip_vinculos).` }
      : coberturaBip.itensComVinculo === 0
        ? { categoria: "base_insuficiente" as const, motivo: `O assunto "${tipo}" não tem nenhum item de checklist vinculado ao BIP ainda (0 de ${coberturaBip.itensAtivos}) — vinculação nunca foi feita para este assunto.` }
        : { categoria: "base_insuficiente" as const, motivo: `Este processo não usou item com vínculo BIP — o assunto tem ${coberturaBip.itensComVinculo} de ${coberturaBip.itensAtivos} itens vinculados, mas nenhum bateu aqui.` };

    const exigenciasDoTipo = exigenciasPorTipo.get(tipo) ?? [];
    const exigenciasInfo = exigenciasDoTipo.length > 0
      ? { categoria: "fato" as const, motivo: `${exigenciasDoTipo.length} exigência(s) recorrente(s) no histórico deste assunto (vw_bdi_exigencias_por_contexto).` }
      : { categoria: "base_insuficiente" as const, motivo: "Nenhuma exigência recorrente registrada ainda para este assunto." };

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
    const documentosFaltando = satelite.filter((d) => !d.tem_mdp || !d.tem_mrp).length;
    const peso =
      documentosFaltando +
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
      exigencias_recorrentes: exigenciasDoTipo,
      exigencias_recorrentes_info: exigenciasInfo,
      vinculos_legais: vinculosLegais,
      vinculos_legais_info: vinculosLegaisInfo,
      avisos,
      triagem: triagem.classe,
      triagem_motivos: triagem.motivos,
      _peso: peso,
    };
  });

  resultado.sort((a, b) => b._peso - a._peso);

  return NextResponse.json({ ok: true, data: resultado.map(({ _peso, ...resto }) => resto), paginacao });
}
