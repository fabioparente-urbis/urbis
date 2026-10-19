// lib/macLimiteAnalises.ts
//
// Limite de análises do MAC por slot (pedido do Fábio, 19/10/2026). Configuração COMUM do admin,
// como a numeração: um número por slot, guardado em `urbis_config.mac_limite_analises`.
// Regras e constantes puras em lib/macLimiteAnalisesSlots.ts. Fail-safe: qualquer falha de leitura
// devolve o padrão (5), o comportamento de antes desta configuração.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { LIMITE_ANALISES_PADRAO, SLOTS_LIMITE_ANALISES, normalizarLimite } from "@/lib/macLimiteAnalisesSlots";

export * from "@/lib/macLimiteAnalisesSlots";

export async function lerLimitesAnalises(): Promise<Record<string, number>> {
  const base: Record<string, number> = Object.fromEntries(SLOTS_LIMITE_ANALISES.map((s) => [s.slug, LIMITE_ANALISES_PADRAO]));
  const { data, error } = await supabaseAdmin
    .from("urbis_config")
    .select("mac_limite_analises")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return base;
  const guardado = ((data as any).mac_limite_analises ?? {}) as Record<string, unknown>;
  for (const s of SLOTS_LIMITE_ANALISES) {
    if (guardado[s.slug] !== undefined) base[s.slug] = normalizarLimite(guardado[s.slug]);
  }
  return base;
}

export async function limiteAnalisesDoSlot(slug: string): Promise<number> {
  const todos = await lerLimitesAnalises();
  return todos[slug] ?? LIMITE_ANALISES_PADRAO;
}
