/**
 * lib/mac-execucao/versao.ts — snapshot reproduzível de LIP, MAC e BIP para uma execução.
 *
 * `mac_execucoes.versao_lip/mac/bip` precisam identificar EXATAMENTE o estado das
 * matrizes no momento em que o motor rodou — um hash calculado, não um número que
 * alguém esquece de incrementar. Mudou um campo, muda o hash; ninguém precisa lembrar.
 *
 * Não importa de lib/rastreabilidade nada além do que já é público (hashFuncional):
 * esta migration não altera LIP, MAC ou BIP, só lê o que eles já expõem.
 */

import { ITENS_MAC_SLOT5 } from "@/lib/rastreabilidade/macSlot5";
import { CAMPOS_LIP_SLOT5 } from "@/lib/rastreabilidade/lipSlot5";
import { hashFuncional } from "@/lib/rastreabilidade";

/**
 * Mesmo FNV-1a duplo de lib/rastreabilidade/tipos.ts (`hashFuncional`), que não expõe
 * a função de hash de string isoladamente. Duplicar este bloco pequeno é mais simples
 * e mais seguro do que exportar uma função interna só para isto.
 */
function hashString(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Hash agregado da matriz MAC inteira (768 itens) — muda se qualquer item mudar de comportamento. */
export function versaoMac(): string {
  const partes = ITENS_MAC_SLOT5
    .map((item) => `${item.codigo}:${hashFuncional(item)}`)
    .sort();
  return hashString(partes.join("|"));
}

/** Hash agregado da matriz LIP inteira (136 campos). */
export function versaoLip(): string {
  const partes = CAMPOS_LIP_SLOT5
    .map((campo) => `${campo.chave}:${hashFuncional(campo)}`)
    .sort();
  return hashString(partes.join("|"));
}

/**
 * Hash do snapshot de vínculos BIP efetivamente usados numa execução. Ao contrário de
 * LIP/MAC, o BIP não é matriz estática em código — vem de `mac_bip_vinculos` no banco —
 * então a versão só existe depois que a execução sabe quais fragmentos consumiu.
 */
export function versaoBip(vinculosUsados: { fragmentoId: string; confianca: string }[]): string {
  const partes = vinculosUsados
    .map((v) => `${v.fragmentoId}:${v.confianca}`)
    .sort();
  return hashString(partes.join("|"));
}
