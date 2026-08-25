/**
 * app/api/manuais/slot5/route.ts — devolve o manual do LIP ou do MAC do Slot 5 já renderizado em
 * HTML. Nunca expõe o arquivo .md cru nem um link de download — a tela em app/manuais/slot5/[doc]
 * é a única forma de ler.
 */

import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { ehChaveManualSlot5, lerManualSlot5 } from "@/lib/manuaisSlot5";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const doc = req.nextUrl.searchParams.get("doc") ?? "";
  if (!ehChaveManualSlot5(doc)) {
    return NextResponse.json({ ok: false, erro: "Manual não encontrado" }, { status: 404 });
  }

  try {
    const { titulo, html } = await lerManualSlot5(doc);
    return NextResponse.json({ ok: true, titulo, html });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "erro ao ler o manual" }, { status: 500 });
  }
}
