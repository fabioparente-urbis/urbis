// ============================================================
// Slot 1 — Regularização SEI: `assuntos.id` do próprio slot, resolvido pelo slug no SERVIDOR.
// As rotas do Slot 1 usam isto em vez de confiar no `assunto_id` que vem da tela — assim nenhuma
// rota do Slot 1 lê prompt, checklist ou estrutura de outro slot por engano.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SLUG_REGULARIZACAO_SEI } from "@/lib/regularizacaoSei/identidade";

export async function assuntoIdDoSlot1(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assuntos").select("id").eq("slug", SLUG_REGULARIZACAO_SEI).maybeSingle();
  return (data as any)?.id ?? null;
}
