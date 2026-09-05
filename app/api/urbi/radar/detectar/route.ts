import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { detectarMudancas } from "@/lib/urbi/radar";

/**
 * POST /api/urbi/radar/detectar — Radar silencioso (Camada 1), passo de DETECÇÃO.
 *
 * Varre os processos VISÍVEIS a este usuário (mesma regra de /api/processos) e enfileira
 * (estado='pendente') qualquer um cujo watermark de timestamp mudou desde o último retrato —
 * nunca reanalisa a Pilha inteira, só marca quem precisa. Não roda o dossiê aqui (isso é
 * /api/urbi/radar/processar) — só esta detecção, mais barata, mais frequente. Nunca chama
 * Gemini, nunca escreve em LIP/MAC/MDP/documento/despacho/numeração.
 *
 * Chamado por components/urbi/UrbiGlobal.tsx a cada ~5min enquanto o URBI não está dentro de
 * um processo (ver regra de pausa em lib/urbi/radar.ts e no componente).
 */
export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const resultado = await detectarMudancas({ userId: ctx.userId, irrestrito: ctx.irrestrito, gerencia: ctx.gerencia });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    console.error("[radar/detectar]", e?.message ?? e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao detectar mudanças." }, { status: 500 });
  }
}
