import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * DELETE /api/admin/mhd/evento?id=<uuid> — apaga UM evento de `mhd_eventos`.
 *
 * EXCEÇÃO DELIBERADA ao princípio do MHD ("nunca apaga", ver lib/mhd.ts): existe só pra limpeza
 * administrativa (registro de teste, evento duplicado por engano) — pedido explícito do Fábio
 * (06/09/2026). Não é um padrão pra reaproveitar em outra rota: o resto do módulo continua
 * append-only. Só irrestrito, e apaga um registro de cada vez (nunca em lote), pra dificultar
 * apagar histórico de verdade sem querer.
 */
export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id é obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin.from("mhd_eventos").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
