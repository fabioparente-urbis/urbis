// ============================================================
// Identidade do Slot 1 — Regularização SEI, para a ficha do LIP e as rotas PRÓPRIAS do slot
// (/lip-regularizacao-sei/<id>, /api/regularizacao-sei/*). Separação do Slot 1, 16/10/2026 —
// mesmo molde da Etapa 2 (docs/URBIS_PLANO_SLOTS_3_4_PED.md, "5 programas independentes").
//
// Comparação EXATA do slug, nunca por prefixo: `ehRegularizacaoSei` de lib/compatibilidadeArea.ts
// aceita qualquer "regularizacao*". Medido em 16/10/2026: os 84 processos do Slot 1 no banco têm
// tipo_processo exatamente "regularizacao".
// ============================================================

/** Slug do Slot 1 em `assuntos.slug` / `processos.tipo_processo`. */
export const SLUG_REGULARIZACAO_SEI = "regularizacao";

/** Nome do Slot 1 nas mensagens. */
export const ROTULO_REGULARIZACAO_SEI = "Regularização SEI";

/** true só para processo do Slot 1. Comparação exata, sem prefixo. */
export function ehRegularizacaoSeiExato(tipoProcesso: string | null | undefined): boolean {
  return String(tipoProcesso ?? "").toLowerCase().trim() === SLUG_REGULARIZACAO_SEI;
}
