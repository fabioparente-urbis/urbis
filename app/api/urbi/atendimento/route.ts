import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { iniciarOuRenovarAtendimento, finalizarAtendimento } from "@/lib/urbi/atendimento";

/**
 * POST /api/urbi/atendimento — inicia/renova o lease de "atendimento ativo" pro processo em
 * contexto (Fase 2, 05/09/2026). Autenticação normal (sessão humana, `autenticar()`) — é uma
 * ação real do analista abrindo o URBI num processo, não o job de servidor.
 * Corpo: { processo_codigo: string }.
 */
export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const codigo = typeof body?.processo_codigo === "string" ? body.processo_codigo.trim() : "";
  if (!codigo) return NextResponse.json({ ok: false, erro: "processo_codigo é obrigatório." }, { status: 400 });
  await iniciarOuRenovarAtendimento(ctx.userId, codigo);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/urbi/atendimento — libera o lease (dispensar/fechar/trocar de processo). */
export async function DELETE(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json().catch(() => ({}));
  const codigo = typeof body?.processo_codigo === "string" ? body.processo_codigo.trim() : "";
  if (!codigo) return NextResponse.json({ ok: false, erro: "processo_codigo é obrigatório." }, { status: 400 });
  await finalizarAtendimento(codigo);
  return NextResponse.json({ ok: true });
}
