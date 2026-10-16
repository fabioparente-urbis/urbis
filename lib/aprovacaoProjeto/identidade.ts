// ============================================================
// Identidade do Slot 5 — Aprovação de Projeto, para a ficha do LIP e as rotas PRÓPRIAS do slot
// (/lip-aprovacao-projeto/<id>, /api/aprovacao-projeto/*). Separação do Slot 5, 16/10/2026 —
// mesmo molde da Etapa 2 (docs/URBIS_PLANO_SLOTS_3_4_PED.md, "5 programas independentes").
// Comparação EXATA do slug, nunca por prefixo. Medido em 16/10/2026: os 8 processos do Slot 5
// no banco têm tipo_processo exatamente "slot_05".
// ============================================================

/** Slug do Slot 5 em `assuntos.slug` / `processos.tipo_processo`. */
export const SLUG_APROVACAO_PROJETO = "slot_05";

/** Nome do Slot 5 nas mensagens. */
export const ROTULO_APROVACAO_PROJETO = "Aprovação de Projeto";

/** true só para processo do Slot 5. Comparação exata, sem prefixo. */
export function ehAprovacaoProjeto(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim() === SLUG_APROVACAO_PROJETO;
}
