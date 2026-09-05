import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { registrarEventoPresenca } from "@/lib/urbi/presenca";

/**
 * POST /api/urbi/presenca — telemetria neutra de presença no URBIS (rodada isolada, 05/09/2026).
 * Autenticação IDÊNTICA a qualquer outra rota (`autenticar`, valida o token de sessão real) —
 * esta rota não afrouxa nem contorna logout/expiração de nenhum jeito; se a sessão expirou, o
 * cliente já não consegue nem chamar isto (401 igual a qualquer rota).
 *
 * Corpo: { tipo: "sem_interacao_urbis" | "interacao_retomada", sessao_efemera?: string }.
 * Nunca aceita nem lê teclas, conteúdo de campo, texto de conversa ou dado de processo — só o
 * tipo da transição. Dedupe contra o último evento do mesmo usuário mora em
 * lib/urbi/presenca.ts, nunca aqui.
 */
export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const tipo = typeof body?.tipo === "string" ? body.tipo : "";
  const sessaoEfemera = typeof body?.sessao_efemera === "string" ? body.sessao_efemera : null;

  const resultado = await registrarEventoPresenca(ctx.userId, tipo, sessaoEfemera);
  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 400 });
  return NextResponse.json({ ok: true, inserido: resultado.inserido });
}
