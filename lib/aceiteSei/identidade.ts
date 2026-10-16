// ============================================================
// Identidade do Slot 2 — Aceite SEI, para a ficha do LIP e as rotas PRÓPRIAS do slot
// (/lip-aceite-sei/<id>, /api/aceite-sei/*). Separação do Slot 2, 16/10/2026 — mesmo molde da
// Etapa 2 dos Slots 3/4 (docs/URBIS_PLANO_SLOTS_3_4_PED.md).
//
// Comparação EXATA do slug, nunca por prefixo: `ehAceiteSei` de lib/aceiteSeiDispensas.ts aceita
// qualquer "aceite*", o que aqui deixaria entrar processo de outro slot. Medido em 16/10/2026:
// os 3 processos do Slot 2 no banco têm tipo_processo exatamente "aceite_sei".
// ============================================================

/** Slug do Slot 2 em `assuntos.slug` / `processos.tipo_processo`. */
export const SLUG_ACEITE_SEI = "aceite_sei";

/** Nome do Slot 2 nas mensagens. */
export const ROTULO_ACEITE_SEI = "Aceite SEI";

/** true só para processo do Slot 2. Comparação exata, sem prefixo. */
export function ehAceiteSeiExato(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim() === SLUG_ACEITE_SEI;
}
