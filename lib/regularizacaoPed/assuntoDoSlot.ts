// ============================================================
// Slot 3 — Regularização PED: `assuntos.id` do próprio slot, resolvido pelo slug no SERVIDOR.
// As rotas do Slot 3 usam isto em vez de confiar no `assunto_id` que vem da tela — assim nenhuma
// rota do Slot 3 lê prompt, checklist ou estrutura de outro slot por engano.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SLUG_REGULARIZACAO_PED } from "@/lib/regularizacaoPed/identidade";

export async function assuntoIdDoSlot3(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assuntos").select("id").eq("slug", SLUG_REGULARIZACAO_PED).maybeSingle();
  return (data as any)?.id ?? null;
}
