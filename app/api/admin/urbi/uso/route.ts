import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

/**
 * Uso e custo do módulo URBI — reaproveita urbis_api_calls (mesma tabela e
 * mesmos campos que já alimentam o painel de IA em /admin/rastreabilidade),
 * só filtrado a modulo=URBI e agregado por operação/modelo/status.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const diasParam = parseInt(searchParams.get("dias") ?? "30", 10);
  const dias = Number.isFinite(diasParam) ? Math.min(Math.max(diasParam, 1), 365) : 30;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("urbis_api_calls")
    .select("id, operacao, modelo, status, criado_em, duracao_ms, tokens_entrada, tokens_saida, custo_estimado_usd, motivo_erro, processo_codigo")
    .eq("modulo", "URBI")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[admin/urbi/uso GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar uso." }, { status: 500 });
  }

  const linhas = data ?? [];
  const porOperacao = new Map<string, { chamadas: number; ok: number; erro: number; custo_usd: number }>();
  const porModelo = new Map<string, { chamadas: number; custo_usd: number }>();
  let custoTotal = 0;
  let duracaoTotalMs = 0;
  let comDuracao = 0;

  for (const l of linhas) {
    const op = l.operacao ?? "desconhecida";
    const entryOp = porOperacao.get(op) ?? { chamadas: 0, ok: 0, erro: 0, custo_usd: 0 };
    entryOp.chamadas += 1;
    if (l.status === "ok") entryOp.ok += 1;
    else if (l.status === "erro") entryOp.erro += 1;
    entryOp.custo_usd += Number(l.custo_estimado_usd) || 0;
    porOperacao.set(op, entryOp);

    const modelo = l.modelo ?? "desconhecido";
    const entryModelo = porModelo.get(modelo) ?? { chamadas: 0, custo_usd: 0 };
    entryModelo.chamadas += 1;
    entryModelo.custo_usd += Number(l.custo_estimado_usd) || 0;
    porModelo.set(modelo, entryModelo);

    custoTotal += Number(l.custo_estimado_usd) || 0;
    if (l.duracao_ms != null) { duracaoTotalMs += l.duracao_ms; comDuracao += 1; }
  }

  return NextResponse.json({
    ok: true,
    data: {
      periodo_dias: dias,
      total_chamadas: linhas.length,
      custo_total_usd: custoTotal,
      duracao_media_ms: comDuracao ? Math.round(duracaoTotalMs / comDuracao) : null,
      por_operacao: Object.fromEntries(porOperacao),
      por_modelo: Object.fromEntries(porModelo),
      recentes: linhas.slice(0, 50),
      fonte: "urbis_api_calls (modulo=URBI)",
    },
  });
}
