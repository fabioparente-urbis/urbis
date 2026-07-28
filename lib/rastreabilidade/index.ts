/**
 * lib/rastreabilidade/index.ts — o registro das matrizes.
 *
 * Uma matriz é (módulo, slot). Acrescentar Regularização, Habite-se ou qualquer assunto futuro é
 * adicionar uma entrada aqui: os testes de integridade, a tela e os filtros valem para todas sem
 * uma linha de mudança. É o que impede a rastreabilidade de virar um caso especial do slot 5.
 */

import type { Matriz } from "./tipos";
import { CAMPOS_LIP_SLOT5, CHAVES_FANTASMA_LIP_SLOT5 } from "./lipSlot5";
import { ITENS_MAC_SLOT5 } from "./macSlot5";

/** id do assunto slot_05 em `assuntos` — é por ele que a tela casa com lip_campos/lip_abas */
export const ASSUNTO_SLOT5 = "78e2f7bb-7d9e-4b66-a6b8-1fd8418361f3";

export const MATRIZES: Matriz[] = [
  {
    modulo: "LIP",
    slot: "slot_05",
    nome: "Aprovação de Projeto",
    assuntoId: ASSUNTO_SLOT5,
    campos: CAMPOS_LIP_SLOT5,
  },
  {
    modulo: "MAC",
    slot: "slot_05",
    nome: "Aprovação de Projeto",
    assuntoId: ASSUNTO_SLOT5,
    itens: ITENS_MAC_SLOT5, // vazio de propósito — ver macSlot5.ts
  },
];

/** Chaves que o leitor grava e que não existem no LIP do assunto, por matriz. */
export const CHAVES_FANTASMA: Record<string, string[]> = {
  "LIP:slot_05": CHAVES_FANTASMA_LIP_SLOT5,
};

export const matriz = (modulo: "LIP" | "MAC", slot: string) =>
  MATRIZES.find((m) => m.modulo === modulo && m.slot === slot);

export const registros = (m: Matriz) => m.campos ?? m.itens ?? [];
export const idDoRegistro = (r: { chave?: string; codigo?: string }) => r.chave ?? r.codigo ?? "";

// `export *` não reexporta valores de um módulo que só tem tipos + funções quando o consumidor
// usa `import type` na origem: nomear explicitamente evita o erro em tempo de execução.
export { assinaturaFuncional, hashFuncional } from "./tipos";
export type {
  Metodo, Regra, Fonte, Status, AplicacaoRegra, CampoRastreado, ItemRastreado, Matriz,
} from "./tipos";
export { CAMPOS_LIP_SLOT5, CHAVES_FANTASMA_LIP_SLOT5 } from "./lipSlot5";
export { ITENS_MAC_SLOT5, GRUPOS_MAC_SLOT5 } from "./macSlot5";
