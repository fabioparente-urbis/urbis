// ============================================================
// Identidade do Slot 4 — Aceite PED.
//
// Todo arquivo do Slot 4 decide "este processo é meu?" por AQUI, e por
// igualdade EXATA do slug. Nunca por prefixo.
//
// Por quê: os arquivos do Slot 1 e do Slot 2 decidem por começo do nome
// (`startsWith("regularizacao")`, `startsWith("aceite")`). Um slug que
// começasse do mesmo jeito herdaria em silêncio as regras do outro slot,
// e um ajuste no Slot 2 mudaria o Slot 4 sem ninguém ver. Por isso o
// slug do Slot 4 é `slot_04` (docs/URBIS_PLANO_SLOTS_3_4_PED.md, seção 2)
// e a comparação aqui é exata.
//
// ISOLAMENTO (CLAUDE.md): nada em `lib/aceitePed/` importa do Slot 1, 2
// ou 5, e nada desses slots importa daqui.
// ============================================================

/** Slug do Slot 4 em `assuntos.slug` / `processos.tipo_processo`. */
export const SLUG_ACEITE_PED = "slot_04";

/** Nome do Slot 4 nas mensagens e nos blocos de prompt. */
export const ROTULO_ACEITE_PED = "Aceite PED";

/** true só para processo do Slot 4. Comparação exata, sem prefixo. */
export function ehAceitePed(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim() === SLUG_ACEITE_PED;
}
