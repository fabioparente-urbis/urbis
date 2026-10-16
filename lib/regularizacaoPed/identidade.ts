// ============================================================
// Identidade do Slot 3 — Regularização PED.
//
// Todo arquivo do Slot 3 decide "este processo é meu?" por AQUI, e por
// igualdade EXATA do slug. Nunca por prefixo.
//
// Por quê: os arquivos do Slot 1 e do Slot 2 decidem por começo do nome
// (`startsWith("regularizacao")`, `startsWith("aceite")`). Um slug que
// começasse do mesmo jeito herdaria em silêncio as regras do outro slot,
// e um ajuste no Slot 1 mudaria o Slot 3 sem ninguém ver. Por isso o
// slug do Slot 3 é `slot_03` (docs/URBIS_PLANO_SLOTS_3_4_PED.md, seção 2)
// e a comparação aqui é exata.
//
// ISOLAMENTO (CLAUDE.md): nada em `lib/regularizacaoPed/` importa do Slot
// 1, 2 ou 5, e nada desses slots importa daqui.
// ============================================================

/** Slug do Slot 3 em `assuntos.slug` / `processos.tipo_processo`. */
export const SLUG_REGULARIZACAO_PED = "slot_03";

/** Nome do Slot 3 nas mensagens e nos blocos de prompt. */
export const ROTULO_REGULARIZACAO_PED = "Regularização PED";

/** true só para processo do Slot 3. Comparação exata, sem prefixo. */
export function ehRegularizacaoPed(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim() === SLUG_REGULARIZACAO_PED;
}
