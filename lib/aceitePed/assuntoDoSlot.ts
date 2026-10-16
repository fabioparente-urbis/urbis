// ============================================================
// Slot 4 — Aceite PED: `assuntos.id` do próprio slot, resolvido pelo slug no SERVIDOR.
// As rotas do Slot 4 usam isto em vez de confiar no `assunto_id` que vem da tela — assim nenhuma
// rota do Slot 4 lê prompt, checklist ou estrutura de outro slot por engano.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SLUG_ACEITE_PED } from "@/lib/aceitePed/identidade";

export async function assuntoIdDoSlot4(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assuntos").select("id").eq("slug", SLUG_ACEITE_PED).maybeSingle();
  return (data as any)?.id ?? null;
}
