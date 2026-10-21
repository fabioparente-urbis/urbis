// ============================================================
// SLOT 4 — ACEITE PED · modelos de checklist do MAC, rota PRÓPRIA do slot.
// CÓPIA POR LEITURA do GET de app/api/mac/checklists/route.ts, 16/10/2026 (Etapa 2 do plano
// docs/URBIS_PLANO_SLOTS_3_4_PED.md — "5 programas independentes"). Diferenças:
//   · só modelos do Slot 4 — os modelos "globais" (assunto_id nulo), que o original mostra em
//     TODO slot, ficam de fora;
//   · o assunto é resolvido no servidor pelo slug, nunca pelo que vem da tela;
//   · só leitura: criar/apagar modelo continua na tela de admin (Gerenciar Checklist).
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assuntoIdDoSlot4 } from "@/lib/aceitePed/assuntoDoSlot";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analista_id = searchParams.get("analista_id");

  const assuntoId = await assuntoIdDoSlot4();
  if (!assuntoId) return NextResponse.json({ ok: false, erro: "Assunto do Slot 4 não encontrado." }, { status: 500 });

  const { data, error } = await supabase
    .from("mac_checklist_modelos")
    .select("*, mac_checklist_itens(*)")
    .or(`dono_id.is.null${analista_id && /^[0-9a-f-]{36}$/i.test(analista_id) ? `,dono_id.eq.${analista_id}` : ""}`)
    .eq("assunto_id", assuntoId)
    .order("criado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
