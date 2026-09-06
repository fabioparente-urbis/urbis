import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * DELETE /api/admin/mhd/processo?codigo=<processo_codigo> — apaga TODO o histórico do MHD de
 * um processo (documentos+versões, que cascade sozinho via FK, e eventos).
 *
 * EXCEÇÃO DELIBERADA ao "nunca apaga" do MHD (ver lib/mhd.ts e
 * app/api/admin/mhd/evento/route.ts, que já abre a mesma exceção pra 1 evento). Pedido do Fábio
 * (06/09/2026): a pilha de processos tinha entrada de teste ("TESTE-HIST-44353-AN3") sem jeito
 * de tirar de lá — isto cobre apagar o processo inteiro da pilha, não só um evento avulso.
 * Só irrestrito, confirmação obrigatória no cliente, um processo de cada vez.
 */
export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  const codigo = req.nextUrl.searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo é obrigatório" }, { status: 400 });

  // mhd_versoes tem ON DELETE CASCADE em documento_id — apagar mhd_documentos já leva as versões
  const [docs, eventos] = await Promise.all([
    supabaseAdmin.from("mhd_documentos").delete().eq("processo_codigo", codigo),
    supabaseAdmin.from("mhd_eventos").delete().eq("processo_codigo", codigo),
  ]);
  if (docs.error) return NextResponse.json({ ok: false, erro: docs.error.message }, { status: 500 });
  if (eventos.error) return NextResponse.json({ ok: false, erro: eventos.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
