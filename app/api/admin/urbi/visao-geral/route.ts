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
    { data: errosRecentes, error: erroErros },
    { data: chamadasCoAnalista, error: erroCoAnalista },
    { count: processosAtivos, error: erroProcessos },
  ] = await Promise.all([
    supabaseAdmin.from("urbi_config").select("valor").eq("chave", "chat_gemini_ativo").maybeSingle(),
    supabaseAdmin.from("urbis_api_calls").select("operacao, status, custo_estimado_usd, tokens_entrada, tokens_saida").eq("modulo", "URBI").gte("criado_em", seteDiasAtras),
    supabaseAdmin.from("urbi_sugestoes").select("*", { count: "exact", head: true }).eq("estado", "nova"),
    supabaseAdmin.from("urbis_api_calls").select("operacao, motivo_erro, criado_em").eq("modulo", "URBI").eq("status", "erro").order("criado_em", { ascending: false }).limit(10),
    // "Cobertura do Co-Analista": processos distintos que já tiveram pelo menos 1 chamada
    // chat_coanalista/chat_coanalista_bip, contra o total de processos vivos (excluido_em nulo).
    // É a única leitura de "cobertura" que existe fonte real pra sustentar hoje — não há log
    // agregado de "fontes_indisponiveis" por dossiê nenhum lugar.
    supabaseAdmin.from("urbis_api_calls").select("processo_codigo").eq("modulo", "URBI").in("operacao", ["chat_coanalista", "chat_coanalista_bip"]).not("processo_codigo", "is", null),
    supabaseAdmin.from("processos").select("*", { count: "exact", head: true }).is("excluido_em", null),
  ]);

  const fontesIndisponiveis = [erroConfig, erroChamadas, erroSugestoes, erroErros, erroCoAnalista, erroProcessos]
    .map((e) => e?.message)
    .filter((m): m is string => Boolean(m));

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
      cobertura_coanalista: { processos_com_coanalista: processosComCoAnalista, processos_ativos_total: processosAtivos ?? 0 },
      cobertura_coanalista_fonte: "urbis_api_calls (processos distintos com chat_coanalista/chat_coanalista_bip) sobre processos.excluido_em is null",
      fontes_indisponiveis: fontesIndisponiveis,
    },
  });
}
