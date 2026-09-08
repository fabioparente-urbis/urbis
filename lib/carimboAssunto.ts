// ============================================================
// Carimbo do projeto x assunto cadastrado — condição bloqueante #6 do
// pedido do Fábio (08/09/2026, ver ~/.claude/plans/floating-humming-orbit.md):
// o processo pode ter sido cadastrado como Regularização/Aceite mas o
// próprio projeto (carimbo/título da prancha) dizer que é de outra
// finalidade. O sistema já lê o carimbo do projeto para outros campos
// (ex.: IPTU, lib/compatibilidadeArea.ts) — aqui só se pede mais uma
// leitura literal, sem inferir nada.
//
// Aplica-se a Regularização SEI e Aceite SEI (Slot 1 e 2, pedido do
// Fábio); Aprovação de Projeto (Slot 5) não usa este pipeline de leitura.
// ============================================================

export function ehCandidatoCarimboAssunto(tipoProcesso: string | null | undefined): boolean {
  const t = String(tipoProcesso ?? "").toLowerCase().trim();
  return t.startsWith("regularizacao") || t.startsWith("aceite");
}

/**
 * Bloco anexado ao prompt do S3 (leitura do processo SEI inteiro). Vai depois do prompt do
 * slot, então não altera o que já é extraído — só acrescenta um campo dentro de "campos".
 */
export function blocoPromptCarimboAssunto(tipoProcesso: string | null | undefined): string {
  if (!ehCandidatoCarimboAssunto(tipoProcesso)) return "";

  return `

---
VERIFICAÇÃO ADICIONAL — FINALIDADE DO PROJETO NO CARIMBO

No carimbo/título da PRANCHA DO LEVANTAMENTO ARQUITETÔNICO (ou do projeto principal do
processo), procure a palavra que indica a FINALIDADE do projeto — geralmente perto do título
do desenho ou do carimbo, algo como "REGULARIZAÇÃO", "ACEITE", "APROVAÇÃO" ou similar.

Copie literalmente a palavra/expressão encontrada (ex.: "REGULARIZAÇÃO", "ACEITE DE OBRA",
"APROVAÇÃO DE PROJETO"). Não traduza, não deduza, não complete — se o carimbo não disser nada
sobre a finalidade, retorne null.

Acrescente essa chave DENTRO do objeto "campos" já existente (mesmo nível de "areaTotal"),
sem remover nem alterar nenhum campo já definido:

"carimboTipoProjeto": { "valor": "..." ou null, "fonte": "Carimbo do projeto, SEI ..." }
---`;
}
