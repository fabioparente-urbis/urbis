// ============================================================
// Carimbo do projeto x assunto cadastrado — Aceite PED (Slot 4).
//
// CÓPIA POR LEITURA de `lib/carimboAssunto.ts` (que serve Slot 1 e Slot 2
// por prefixo), feita em 16/10/2026 a pedido do Fábio ("o Slot 4 começa
// copiando 100% o Slot 2"). Bloco de prompt idêntico na data da cópia.
// Diferença de código: só reconhece o Slot 4 (slug exato `slot_04`).
//
// Texto original, mantido como referência:
// ------------------------------------------------------------
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

import { ehAceitePed } from "@/lib/aceitePed/identidade";

export function ehCandidatoCarimboAssunto(tipoProcesso: string | null | undefined): boolean {
  return ehAceitePed(tipoProcesso);
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
