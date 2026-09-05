import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { processarProximoPendente } from "@/lib/urbi/radar";

/**
 * POST /api/urbi/radar/processar — Radar silencioso (Camada 1), passo de PROCESSAMENTO.
 *
 * Processa UM item pendente por chamada (o mais antigo, entre os visíveis a este usuário) —
 * reaproveita montarDossieFactual + montarRelatorioMotor (lib/urbi/montarDossie.ts,
 * lib/urbi/motorProducao.ts), nunca recalcula nada por conta própria. Nunca chama Gemini, nunca
 * escreve em LIP/MAC/MDP/documento/despacho/numeração — só grava o retrato factual.
 *
 * Chamado por components/urbi/UrbiGlobal.tsx a cada ~45s enquanto o URBI não está dentro de um
 * processo. Pausa quando o URBI está aberto DENTRO de um processo (a lógica de pausa fica no
 * componente, que simplesmente para de chamar esta rota — nada aqui decide isso sozinho).
 */
export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const resultado = await processarProximoPendente({ userId: ctx.userId, irrestrito: ctx.irrestrito, gerencia: ctx.gerencia, perfis: ctx.perfis });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    console.error("[radar/processar]", e?.message ?? e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao processar fila." }, { status: 500 });
  }
}
