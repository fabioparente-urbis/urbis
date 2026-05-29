import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  const { tema } = await req.json();
  if (!["institucional", "moderno", "minimalista"].includes(tema))
    return NextResponse.json({ ok: false, erro: "tema invalido" });
  await supabaseAdmin.from("usuarios").update({ tema }).eq("id", ctx.userId);
  return NextResponse.json({ ok: true });
}
