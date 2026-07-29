/**
 * lib/visao/receitas.ts — as receitas de percepção, versionadas em código.
 *
 * Ficam AQUI, e não em `lip_prompts`, por decisão de governança: num processo administrativo a
 * regra que decidiu precisa ser reconstituível na data da decisão. Prompt em tabela editável sem
 * histórico imutável não atende isso — e o pipeline antigo (S1–S4), que guarda prompt no banco,
 * não deve ser estendido para cá.
 *
 * O que muda sem deploy é só o INTERRUPTOR, que apenas desliga (ver `lib/visao/index.ts`).
 * Desligar não altera regra nenhuma: o campo cai para um estado já previsto e já testado.
 */

import { GEMINI_MODEL } from "@/lib/constants";
import type { Receita } from "./tipos";

/**
 * Geometria conferida em 29/07/2026 contra a prancha da amostra: a tabela "CÁLCULO DE VAGAS" ocupa
 * ~[0.735–0.841] x [0.470–0.616] da página. A margem existe porque a diagramação varia entre
 * projetistas — e quando ela variar demais, o modelo se abstém em vez de ler a tabela errada.
 */
const VAGAS_PCD: Receita = {
  id: "prancha.calculo_de_vagas",
  versao: 1,
  chaves: ["vagasPcdExigido"],
  estrategia: "FRACAO_DA_PAGINA",
  papel: "projeto",
  regiao: { pagina: 0, x0: 0.72, y0: 0.45, x1: 0.86, y1: 0.64, alvoPx: 1600 },
  modelo: GEMINI_MODEL,
  prompt: [
    "Você está lendo um RECORTE de uma prancha de projeto arquitetônico brasileira.",
    "",
    "Procure a tabela intitulada \"CÁLCULO DE VAGAS\".",
    "Dentro dela, encontre a seção \"VAGAS ESPECÍFICAS\" e a linha que começa com \"VAGA P.C.D\".",
    "Devolva o número inteiro da coluna \"Nº DE VAGAS\" dessa linha.",
    "",
    "ATENÇÃO — a coluna \"CÁLCULO\" traz um número decimal longo (ex.: 0,08129556). NÃO é esse.",
    "O valor pedido é o INTEIRO da coluna \"Nº DE VAGAS\", à direita.",
    "",
    "Se a tabela não estiver visível neste recorte, ou estiver ilegível, ou você não tiver certeza:",
    "ABSTENHA-SE. Responder um número plausível que você não leu com clareza é PIOR do que se abster,",
    "porque este valor entra num laudo que fundamenta alvará municipal.",
    "",
    "Responda SOMENTE com JSON, sem cercas de código:",
    '{"abstencao": false, "vagasPcdExigido": "1", "confianca": 0.95}',
    "ou",
    '{"abstencao": true, "motivo": "a tabela de vagas não está neste recorte"}',
  ].join("\n"),
  validar: (v) => {
    const bruto = (v.vagasPcdExigido ?? "").trim();
    if (!bruto) return { ok: false, motivo: "resposta sem o campo vagasPcdExigido" };
    if (!/^\d{1,3}$/.test(bruto)) return { ok: false, motivo: `"${bruto}" não é um inteiro de vagas` };
    // 0,08129556 chegando como "0" seria a coluna errada lida como inteiro; e nenhuma prancha
    // deste porte exige mais de 99 vagas de PCD. Fora da faixa, é leitura errada, não valor raro.
    const n = Number(bruto);
    if (n < 1 || n > 99) return { ok: false, motivo: `${n} vagas de PCD está fora da faixa plausível` };
    return { ok: true };
  },
};

export const RECEITAS: Receita[] = [VAGAS_PCD];

export const receitaDaChave = (chave: string) => RECEITAS.find((r) => r.chaves.includes(chave));

/**
 * Hash funcional da receita INTEIRA. É a chave de reuso e o registro de governança.
 *
 * `validar` não entra (função não serializa de forma estável), e por isso `versao` DEVE subir
 * quando o validador mudar de comportamento — mesma regra da matriz, onde prosa fica fora do hash
 * e mudança funcional obriga incremento.
 */
export function hashReceita(r: Receita): string {
  const funcional = {
    id: r.id, versao: r.versao, chaves: [...r.chaves].sort(),
    estrategia: r.estrategia, papel: r.papel, regiao: r.regiao,
    prompt: r.prompt, modelo: r.modelo,
  };
  const s = JSON.stringify(funcional);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Identidade estável da região, para caber no índice único do banco. */
export function hashRegiao(r: Receita): string {
  const g = r.regiao;
  return `p${g.pagina}:${g.x0}:${g.y0}:${g.x1}:${g.y1}:${g.alvoPx}`;
}
