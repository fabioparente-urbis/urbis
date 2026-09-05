import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { obterStatusRadar, obterRetratoAtual } from "@/lib/urbi/radar";

/**
 * GET /api/urbi/radar/status — só LEITURA dos retratos já calculados. Nunca dispara detecção
 * nem processamento (isso são as outras 2 rotas) — é o que alimenta o cartão de cobertura na
 * Home/Pilha e a aba "Pré-análise da Pilha" em /admin/urbi. Nunca escolhe nem analisa um
 * processo específico por conta própria (regra do Fábio).
 *
 * `?codigo=X` devolve também o retrato atual DAQUELE processo (usado quando o URBI abre dentro
 * dele, pra mostrar o que o Radar já sabia antes de qualquer pergunta ao Gemini).
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { searchParams } = new URL(req.url);
    const codigo = searchParams.get("codigo");
    const status = await obterStatusRadar({ userId: ctx.userId, irrestrito: ctx.irrestrito, gerencia: ctx.gerencia });
    const retrato = codigo ? await obterRetratoAtual(codigo) : null;
    return NextResponse.json({ ok: true, status, retrato });
  } catch (e: any) {
    console.error("[radar/status]", e?.message ?? e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao consultar status do Radar." }, { status: 500 });
  }
}
