// ============================================================
// Aprovação da CHEADV — Regularização PED (Slot 3).
//
// CÓPIA POR LEITURA de `lib/cheadvAprovado.ts` (que serve Slot 1 e Slot 2
// por prefixo), feita em 16/10/2026 a pedido do Fábio ("o Slot 3 começa
// copiando 100% o Slot 1"). Bloco de prompt idêntico na data da cópia.
// Diferença de código: só reconhece o Slot 3 (slug exato `slot_03`).
//
// Texto original, mantido como referência:
// ------------------------------------------------------------
// Aprovação da CHEADV na análise documental — condição bloqueante #7 do
// pedido do Fábio (08/09/2026, ver ~/.claude/plans/floating-humming-orbit.md).
//
// O sistema já abre o documento do Despacho CHEADV para extrair "despacho"
// (número do ato) e "seiCheadv" (SEI do documento) — isso confirma que o
// documento EXISTE, não que ele APROVOU a documentação. Aqui se pede a
// mesma leitura, só que da CONCLUSÃO/DECISÃO do despacho, não do
// cabeçalho/rodapé.
// ============================================================

import { ehRegularizacaoPed } from "@/lib/regularizacaoPed/identidade";

export function ehCandidatoCheadvAprovado(tipoProcesso: string | null | undefined): boolean {
  return ehRegularizacaoPed(tipoProcesso);
}

/**
 * Bloco anexado ao prompt do S3, mesma técnica de lib/marcoTemporal.ts: vai depois do prompt
 * do slot, acrescenta 1 chave nova dentro de "campos" já existente.
 */
export function blocoPromptCheadvAprovado(tipoProcesso: string | null | undefined): string {
  if (!ehCandidatoCheadvAprovado(tipoProcesso)) return "";

  return `

---
VERIFICAÇÃO ADICIONAL — CHEADV APROVOU A DOCUMENTAÇÃO?

Você já localiza o DESPACHO CHEADV para extrair "despacho" e "seiCheadv" (ver instrução
principal). Volte a esse MESMO documento (o mais recente, se houver mais de um) e leia agora a
CONCLUSÃO/DECISÃO dele — não o cabeçalho, o número do ato ou o uso do solo em si.

Responda estritamente com o que o despacho CONCLUI sobre a documentação apresentada:
- "Sim" — o despacho aprova/defere/considera a documentação conforme/apta para prosseguir.
- "Não" — o despacho indefere, aponta pendência, exige complementação ou considera a
  documentação não conforme.
- "Não informado" — o despacho não existe no processo, ou existe mas não traz uma conclusão
  clara sobre a documentação.

Nunca deduza pela existência do documento: "documento existe" não é "aprovado". Só responda
"Sim" se o TEXTO do despacho disser isso explicitamente.

Acrescente essa chave DENTRO do objeto "campos" já existente (mesmo nível de "seiCheadv"), sem
remover nem alterar nenhum campo já definido:

"cheadvAprovado": { "valor": "Sim" | "Não" | "Não informado", "fonte": "Despacho CHEADV, SEI ..." }
---`;
}
