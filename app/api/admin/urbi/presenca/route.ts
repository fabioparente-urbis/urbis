import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { obterPresencaUrbi } from "@/lib/urbi/presenca";

/**
 * GET /api/admin/urbi/presenca — painel "Presença no URBIS", exclusivo Administrador/Diretora
 * (mesmo guard `!ctx.irrestrito` de app/api/admin/urbi/radar/route.ts). Só leitura da telemetria
 * neutra (lib/urbi/presenca.ts) — nunca cruza com Radar, LIP, MAC, MDP ou qualquer dado de
 * processo. Nunca soma tempo, nunca rankeia, nunca exporta.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  try {
    const dados = await obterPresencaUrbi(50);
    return NextResponse.json({ ok: true, ...dados });
  } catch (e: any) {
    console.error("[admin/urbi/presenca]", e?.message ?? e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao carregar presença." }, { status: 500 });
  }
}
