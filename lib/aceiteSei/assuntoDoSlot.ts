// ============================================================
// Slot 2 — Aceite SEI: `assuntos.id` do próprio slot, resolvido pelo slug no SERVIDOR.
// As rotas do Slot 2 usam isto em vez de confiar no `assunto_id` que vem da tela — assim nenhuma
// rota do Slot 2 lê prompt, checklist ou estrutura de outro slot por engano.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SLUG_ACEITE_SEI } from "@/lib/aceiteSei/identidade";

export async function assuntoIdDoSlot2(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assuntos").select("id").eq("slug", SLUG_ACEITE_SEI).maybeSingle();
  return (data as any)?.id ?? null;
}
