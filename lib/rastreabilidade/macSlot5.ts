/**
 * lib/rastreabilidade/macSlot5.ts — matriz de rastreabilidade do MAC do slot 5.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ ESTRUTURA PRONTA, CONTEÚDO VAZIO — POR DECISÃO, NÃO POR ESQUECIMENTO.        │
 * │                                                                              │
 * │ Os 561 itens NÃO são cadastrados agora. Quando o MAC entrar, é ALIMENTAR     │
 * │ isto — tipos, testes, tela e filtros já existem e são os mesmos do LIP.      │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Por que criar a estrutura antes do conteúdo: se o MAC nascesse com desenho próprio, teríamos
 * duas rastreabilidades diferentes para explicar a mesma coisa — como o URBIS decide. O item do
 * MAC é o campo do LIP mais três atributos (grupo, item que o responde, se gera indeferimento).
 *
 * ── O QUE JÁ ESTÁ DECIDIDO SOBRE O MAC ──────────────────────────────────────────
 * · O código do item é ESTÁVEL, nunca a posição no array. Hoje a tela renderiza `idx + 1`, e
 *   inserir ou reordenar um grupo desloca todos os números seguintes — o ITEM 48 viraria 49 em
 *   silêncio, justamente o item cujo escopo é congelado.
 * · O ITEM 48 (acessibilidade, NBR 9050) tem escopo CONGELADO: 56 subitens são o teto, e o URBIS
 *   nunca pode derivar verificação nova a partir da norma. É risco institucional, não ruído.
 * · Metade dos itens não deveria chegar à IA: 148 caem por filtro, 86 são fórmula sobre campos do
 *   LIP, 27 estão fora do escopo do analista e 25 são conferência contra o carimbo.
 * · A condição de aplicabilidade precisa descer ao SUBITEM: dentro do item 48 convivem subitens de
 *   piscina, hotel e sauna com subitens que valem sempre.
 *
 * ── COMO ALIMENTAR, QUANDO FOR A HORA ───────────────────────────────────────────
 * Um item por linha de `mac_checklist_itens`, com `codigo` estável, `grupo`, e — quando um campo
 * do LIP já responde o item sozinho — `chaveLip`. O item que tem `chaveLip` não precisa de método
 * próprio: herda o do campo, e é assim que o MAC vira consumidor do LIP em vez de duplicá-lo.
 */

import type { ItemRastreado } from "./tipos";

/**
 * VAZIO DE PROPÓSITO. Ver o cabeçalho.
 *
 * O teste de integridade aceita esta lista vazia e passa a exigir tudo assim que o primeiro item
 * for cadastrado — ninguém precisa lembrar de "ligar" a validação depois.
 */
export const ITENS_MAC_SLOT5: ItemRastreado[] = [];

/**
 * Grupos do MAC do slot 5, na ordem do modelo "PADRÃO — APROVAÇÃO DE PROJETO".
 *
 * Declarados agora porque a ORDEM é informação: o número do item na planilha corresponde à posição
 * do grupo, e foi conferido — 29 de 29 grupos com cabeçalho numerado batem, zero divergência.
 * Guardar a ordem aqui é o primeiro passo para o código do item deixar de ser calculado.
 */
export const GRUPOS_MAC_SLOT5: { posicao: number; nome: string; escopoCongelado?: boolean }[] = [
  // preenchido quando o MAC entrar; a posição 48 já vem marcada porque a regra é anterior ao dado
  { posicao: 48, nome: "ACESSIBILIDADE - NBR9050", escopoCongelado: true },
];
