import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

/**
 * Visão geral do módulo /admin/urbi — só agregação de tabelas que já existem
 * (urbi_config, urbis_api_calls, urbi_sugestoes, processos). Nenhuma métrica
 * inventada: cada campo do retorno diz de onde veio.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: configChat, error: erroConfig },
    { data: chamadas7d, error: erroChamadas },
    { count: sugestoesNovas, error: erroSugestoes },
    { data: sugestoesNovasDetalhe, error: erroSugestoesDetalhe },
    { data: errosRecentes, error: erroErros },
    { data: chamadasCoAnalista, error: erroCoAnalista },
    { data: processosVivos, error: erroProcessos },
    { data: mudancasCatalogo7d, error: erroCatalogo },
  ] = await Promise.all([
    supabaseAdmin.from("urbi_config").select("valor").eq("chave", "chat_gemini_ativo").maybeSingle(),
    supabaseAdmin.from("urbis_api_calls").select("operacao, status, custo_estimado_usd, tokens_entrada, tokens_saida").eq("modulo", "URBI").gte("criado_em", seteDiasAtras),
    supabaseAdmin.from("urbi_sugestoes").select("*", { count: "exact", head: true }).eq("estado", "nova"),
    // Detalhe pra quebrar "sugestões novas" por slot e por grau de certeza — mesma tabela,
    // sem duplicar a consulta de contagem (head:true acima não devolve linha nenhuma). `slot`
    // vem gravado na própria linha (Fase M) — não precisa mais de JOIN com `processos` pra isso.
    supabaseAdmin.from("urbi_sugestoes").select("processo_codigo, tipo, grau_certeza, slot").eq("estado", "nova"),
    supabaseAdmin.from("urbis_api_calls").select("operacao, motivo_erro, criado_em").eq("modulo", "URBI").eq("status", "erro").order("criado_em", { ascending: false }).limit(10),
    // "Cobertura do Co-Analista": processos distintos que já tiveram pelo menos 1 chamada
    // chat_coanalista/chat_coanalista_bip, contra o total de processos vivos (excluido_em nulo).
    // É a única leitura de "cobertura" que existe fonte real pra sustentar hoje — não há log
    // agregado de "fontes_indisponiveis" por dossiê nenhum lugar.
    supabaseAdmin.from("urbis_api_calls").select("processo_codigo").eq("modulo", "URBI").in("operacao", ["chat_coanalista", "chat_coanalista_bip"]).not("processo_codigo", "is", null),
    // codigo+tipo_processo de todo processo vivo — base pra bucketizar cobertura e sugestões
    // por slot (Fase F). 80 processos ativos hoje (auditoria 03/09/2026) — sem custo de escala.
    supabaseAdmin.from("processos").select("codigo, tipo_processo").is("excluido_em", null),
    // Mudanças de catálogo dos últimos 7 dias, por slot — mesma fonte da aba "Mudanças de
    // catálogo" (mac_checklist_itens_historico.tipo_processo já vem gravado na linha).
    supabaseAdmin.from("mac_checklist_itens_historico").select("tipo_processo").gte("criado_em", seteDiasAtras),
  ]);

  const fontesIndisponiveis = [erroConfig, erroChamadas, erroSugestoes, erroSugestoesDetalhe, erroErros, erroCoAnalista, erroProcessos, erroCatalogo]
    .map((e) => e?.message)
    .filter((m): m is string => Boolean(m));

  const NOME_SLOT: Record<string, string> = { regularizacao: "Regularização SEI", aceite_sei: "Aceite SEI", slot_05: "Aprovação de Projeto" };
  const tipoPorCodigo = new Map((processosVivos ?? []).map((p: any) => [p.codigo, p.tipo_processo as string]));

  const totalPorSlot = new Map<string, number>();
  for (const p of processosVivos ?? []) {
    const slot = (p as any).tipo_processo ?? "desconhecido";
    totalPorSlot.set(slot, (totalPorSlot.get(slot) ?? 0) + 1);
  }
  const processosComCoAnalistaPorSlot = new Map<string, Set<string>>();
  for (const c of chamadasCoAnalista ?? []) {
    const codigo = (c as any).processo_codigo;
    const slot = tipoPorCodigo.get(codigo) ?? "desconhecido";
    if (!processosComCoAnalistaPorSlot.has(slot)) processosComCoAnalistaPorSlot.set(slot, new Set());
    processosComCoAnalistaPorSlot.get(slot)!.add(codigo);
  }
  const coberturaPorSlot = [...totalPorSlot.entries()].map(([slot, total]) => ({
    slot,
    nome_slot: NOME_SLOT[slot] ?? slot,
    processos_com_coanalista: processosComCoAnalistaPorSlot.get(slot)?.size ?? 0,
    processos_ativos_total: total,
  }));

  const sugestoesPorSlot = new Map<string, number>();
  const sugestoesPorGrau = new Map<string, number>();
  const falhasCoberturaMdpMrpPorSlot = new Map<string, number>();
  for (const s of sugestoesNovasDetalhe ?? []) {
    const linha = s as any;
    // Fallback pro JOIN só cobre a linha antiga sem `slot` gravado (nenhuma existe hoje).
    const slot = linha.slot ?? tipoPorCodigo.get(linha.processo_codigo) ?? "desconhecido";
    sugestoesPorSlot.set(slot, (sugestoesPorSlot.get(slot) ?? 0) + 1);
    sugestoesPorGrau.set(linha.grau_certeza, (sugestoesPorGrau.get(linha.grau_certeza) ?? 0) + 1);
    if (linha.tipo === "documento_sem_registro") {
      falhasCoberturaMdpMrpPorSlot.set(slot, (falhasCoberturaMdpMrpPorSlot.get(slot) ?? 0) + 1);
    }
  }

  const mudancasCatalogoPorSlot = new Map<string, number>();
  for (const m of mudancasCatalogo7d ?? []) {
    const slot = (m as any).tipo_processo ?? "desconhecido";
    mudancasCatalogoPorSlot.set(slot, (mudancasCatalogoPorSlot.get(slot) ?? 0) + 1);
  }

  const resumoChamadas = { total: 0, ok: 0, erro: 0, custo_total_usd: 0, tokens_entrada: 0, tokens_saida: 0, por_operacao: {} as Record<string, number> };
  for (const c of chamadas7d ?? []) {
    resumoChamadas.total += 1;
    if (c.status === "ok") resumoChamadas.ok += 1;
    else if (c.status === "erro") resumoChamadas.erro += 1;
    resumoChamadas.custo_total_usd += Number(c.custo_estimado_usd) || 0;
    resumoChamadas.tokens_entrada += Number(c.tokens_entrada) || 0;
    resumoChamadas.tokens_saida += Number(c.tokens_saida) || 0;
    const op = c.operacao ?? "desconhecida";
    resumoChamadas.por_operacao[op] = (resumoChamadas.por_operacao[op] ?? 0) + 1;
  }

  const processosComCoAnalista = new Set((chamadasCoAnalista ?? []).map((c: any) => c.processo_codigo)).size;

  return NextResponse.json({
    ok: true,
    data: {
      chat_ativo: configChat?.valor === "true",
      chat_ativo_fonte: "urbi_config.chat_gemini_ativo",
      uso_7dias: resumoChamadas,
      uso_7dias_fonte: "urbis_api_calls (modulo=URBI, últimos 7 dias)",
      sugestoes_novas: sugestoesNovas ?? 0,
      sugestoes_novas_fonte: "urbi_sugestoes (estado=nova)",
      erros_recentes: errosRecentes ?? [],
      erros_recentes_fonte: "urbis_api_calls (modulo=URBI, status=erro, últimas 10) — proxy de fonte indisponível: não há log agregado de \"fontes_indisponiveis\" por dossiê hoje.",
      cobertura_coanalista: { processos_com_coanalista: processosComCoAnalista, processos_ativos_total: processosVivos?.length ?? 0 },
      cobertura_coanalista_fonte: "urbis_api_calls (processos distintos com chat_coanalista/chat_coanalista_bip) sobre processos.excluido_em is null",
      // Fase F — quebras por slot, sem inventar nada além de reagrupar o que já foi lido acima.
      cobertura_coanalista_por_slot: coberturaPorSlot,
      sugestoes_novas_por_slot: [...sugestoesPorSlot.entries()].map(([slot, total]) => ({ slot, nome_slot: NOME_SLOT[slot] ?? slot, total })),
      sugestoes_novas_por_grau: [...sugestoesPorGrau.entries()].map(([grau_certeza, total]) => ({ grau_certeza, total })),
      falhas_cobertura_mdp_mrp_por_slot: [...falhasCoberturaMdpMrpPorSlot.entries()].map(([slot, total]) => ({ slot, nome_slot: NOME_SLOT[slot] ?? slot, total })),
      falhas_cobertura_mdp_mrp_fonte: "urbi_sugestoes (tipo=documento_sem_registro, estado=nova) — documento emitido sem registro em MDP e/ou MRP, agrupado por slot do processo.",
      mudancas_catalogo_7dias_por_slot: [...mudancasCatalogoPorSlot.entries()].map(([slot, total]) => ({ slot, nome_slot: NOME_SLOT[slot] ?? slot, total })),
      mudancas_catalogo_7dias_fonte: "mac_checklist_itens_historico (últimos 7 dias) — ver aba \"Mudanças de catálogo\" para o detalhe.",
      fontes_indisponiveis: fontesIndisponiveis,
    },
  });
}
