// ============================================================
// SLOT 1 — REGULARIZAÇÃO SEI · itens do checklist do MAC, rota PRÓPRIA do slot.
// CÓPIA POR LEITURA do GET de app/api/mac/checklists/itens/route.ts, 16/10/2026 (Etapa 2 do
// plano docs/URBIS_PLANO_SLOTS_3_4_PED.md). Diferenças:
//   · só devolve itens de modelo do Slot 1 — pedido com modelo de outro slot é recusado;
//   · só leitura: editar item continua na tela de admin (Gerenciar Checklist), que tem a
//     checagem de autorização por modelo.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";
import { assuntoIdDoSlot1 } from "@/lib/regularizacaoSei/assuntoDoSlot";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const modelo_id = searchParams.get("modelo_id");
  if (!modelo_id || !/^[0-9a-f-]{36}$/i.test(modelo_id)) {
    return NextResponse.json({ ok: false, erro: "modelo_id inválido." }, { status: 400 });
  }

  const assuntoId = await assuntoIdDoSlot1();
  const { data: modelo } = await supabase
    .from("mac_checklist_modelos").select("id, assunto_id").eq("id", modelo_id).maybeSingle();
  if (!modelo || !assuntoId || (modelo as any).assunto_id !== assuntoId) {
    return NextResponse.json({ ok: false, erro: "Este checklist não é do Slot 1 (Regularização SEI)." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mac_checklist_itens")
    .select("*")
    .eq("modelo_id", modelo_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
