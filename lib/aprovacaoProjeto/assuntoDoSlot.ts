// ============================================================
// Slot 5 — Aprovação de Projeto: `assuntos.id` do próprio slot, resolvido pelo slug no SERVIDOR.
// As rotas do Slot 5 usam isto em vez de confiar no `assunto_id` que vem da tela — assim nenhuma
// rota do Slot 5 lê prompt ou estrutura de outro slot por engano.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SLUG_APROVACAO_PROJETO } from "@/lib/aprovacaoProjeto/identidade";

export async function assuntoIdDoSlot5(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assuntos").select("id").eq("slug", SLUG_APROVACAO_PROJETO).maybeSingle();
  return (data as any)?.id ?? null;
}
