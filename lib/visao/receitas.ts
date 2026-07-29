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
 *
 * ── UMA RECEITA É UM RECORTE, NÃO UM CAMPO ──────────────────────────────────────
 * A unidade de custo é a imagem enviada, não o dado extraído. A tabela "CÁLCULO DE VAGAS" responde
 * três campos; pedir um por vez pagaria três vezes pelo mesmo recorte e ainda permitiria que os
 * três viessem de leituras inconsistentes entre si.
 */

import { GEMINI_MODEL } from "@/lib/constants";
import type { Receita } from "./tipos";

/** Inteiro dentro de uma faixa plausível. Fora da faixa é leitura errada, não valor raro. */
const inteiroEntre = (min: number, max: number, oQueE: string) => (bruto: string) => {
  const v = (bruto ?? "").trim();
  if (!v) return { ok: false, motivo: "campo ausente na resposta" };
  if (!/^\d{1,4}$/.test(v)) return { ok: false, motivo: `"${v}" não é um inteiro` };
  const n = Number(v);
  if (n < min || n > max) return { ok: false, motivo: `${n} está fora da faixa plausível de ${oQueE}` };
  return { ok: true };
};

/**
 * A receita descreve o quadro; NÃO diz em que página nem em que canto ele está. Um processo pode
 * ter 1, 2, 5 ou 10 pranchas, e cada projetista diagrama onde quer — a amostra 44556 serve para
 * desenvolver, não para definir onde a informação mora.
 */
const CALCULO_DE_VAGAS: Receita = {
  id: "prancha.calculo_de_vagas",
  versao: 2, // v2 em 29/07/2026: passou de 1 campo para os 3 do mesmo quadro, com abstenção por campo
  chaves: ["vagasPcdExigido", "vagasIdosoExigido", "totalDeVagasExigidasParaEssas"],
  estrategia: "VARREDURA_VISUAL",
  papel: "projeto",
  localizacao: {
    alvo: "um quadro/tabela com o título \"CÁLCULO DE VAGAS\", contendo linhas de ambientes com "
      + "áreas em m², uma linha destacada com o total de vagas de estacionamento, e uma seção "
      + "\"VAGAS ESPECÍFICAS\" com as linhas VAGA P.C.D e VAGA IDOSO",
    varreduraPx: 1600, alvoPx: 1600, margem: 0.02,
  },
  modelo: GEMINI_MODEL,
  prompt: [
    "Você está lendo um RECORTE de uma prancha de projeto arquitetônico brasileira.",
    "Procure a tabela intitulada \"CÁLCULO DE VAGAS\" e extraia três valores dela.",
    "",
    "1. totalDeVagasExigidasParaEssas — o total de vagas de estacionamento exigidas.",
    "   Aparece numa linha destacada como \"TOTAL DE 05 VAGAS DE ESTACIONAMENTO.\" → devolva \"5\".",
    "",
    "2. vagasPcdExigido — na seção \"VAGAS ESPECÍFICAS\", a linha que começa com \"VAGA P.C.D\":",
    "   o inteiro da coluna \"Nº DE VAGAS\".",
    "",
    "3. vagasIdosoExigido — na mesma seção, a linha \"VAGA IDOSO\": o inteiro da coluna \"Nº DE VAGAS\".",
    "",
    "ATENÇÃO — a coluna \"CÁLCULO\" traz decimais longos (ex.: 0,08129556 e 0,20323889).",
    "NÃO são esses. Os valores pedidos são os INTEIROS da coluna \"Nº DE VAGAS\", mais à direita.",
    "",
    "Abstenha-se CAMPO A CAMPO. Se uma linha estiver ilegível mas as outras não, devolva as que leu",
    "e marque só a ilegível. Se a tabela inteira não estiver neste recorte, marque as três.",
    "Responder um número plausível que você não leu com clareza é PIOR do que se abster: este valor",
    "entra num laudo que fundamenta alvará municipal e decide deferimento pela LC 364/2023.",
    "",
    "Responda SOMENTE com JSON, sem cercas de código, no formato:",
    '{"campos": {',
    '  "totalDeVagasExigidasParaEssas": {"valor": "5", "confianca": 0.95},',
    '  "vagasPcdExigido": {"valor": "1", "confianca": 0.95},',
    '  "vagasIdosoExigido": {"abstencao": true, "motivo": "linha cortada no recorte"}',
    "}}",
  ].join("\n"),
  validadores: {
    // nenhuma prancha deste porte exige mais de 99 vagas reservadas; e 0 seria a coluna errada
    vagasPcdExigido: inteiroEntre(1, 99, "vagas de PCD"),
    vagasIdosoExigido: inteiroEntre(1, 99, "vagas de idoso"),
    totalDeVagasExigidasParaEssas: inteiroEntre(1, 999, "vagas de estacionamento"),
  },
  coerencia: (v) => {
    const total = Number(v.totalDeVagasExigidasParaEssas);
    const pcd = Number(v.vagasPcdExigido);
    const idoso = Number(v.vagasIdosoExigido);
    // só confere quando os três foram lidos: com um ausente não há o que cruzar
    if (![total, pcd, idoso].every(Number.isFinite)) return { ok: true };
    if (pcd + idoso > total) {
      return {
        ok: false,
        motivo: `leitura internamente incoerente: ${pcd} PCD + ${idoso} idoso somam mais que o total de ${total} vagas`,
      };
    }
    return { ok: true };
  },
};

/** Quadro do ICCAP. Recorte independente do de vagas — podem ser buscados em paralelo. */
const ICCAP: Receita = {
  id: "prancha.iccap",
  versao: 1,
  chaves: ["areaImpermeabilizada"],
  estrategia: "VARREDURA_VISUAL",
  papel: "projeto",
  localizacao: {
    alvo: "um quadro com o título \"Cálculo do Índice de Controle de Captação de Água Pluvial\", "
      + "contendo as linhas ÁREA DO TERRENO e ÁREA IMPERMEABILIZADA DO TERRENO",
    varreduraPx: 1600, alvoPx: 1400, margem: 0.02,
  },
  modelo: GEMINI_MODEL,
  prompt: [
    "Você está lendo um RECORTE de uma prancha de projeto arquitetônico brasileira.",
    "",
    "Procure o quadro \"Cálculo do Índice de Controle de Captação de Água Pluvial\"",
    "e devolva o valor da linha \"ÁREA IMPERMEABILIZADA DO TERRENO\", em m².",
    "",
    "ATENÇÃO — não confunda com a linha \"ÁREA DO TERRENO\", que vem logo acima e é MAIOR.",
    "A área impermeabilizada é sempre menor ou igual à área do terreno.",
    "Devolva o número como aparece no documento, com vírgula decimal (ex.: \"464,45\").",
    "",
    "Se o quadro não estiver visível neste recorte, ou a linha estiver ilegível, ABSTENHA-SE.",
    "Responder um número plausível que você não leu com clareza é PIOR do que se abster.",
    "",
    "Responda SOMENTE com JSON, sem cercas de código:",
    '{"campos": {"areaImpermeabilizada": {"valor": "464,45", "confianca": 0.95}}}',
    "ou",
    '{"campos": {"areaImpermeabilizada": {"abstencao": true, "motivo": "quadro não está no recorte"}}}',
  ].join("\n"),
  validadores: {
    areaImpermeabilizada: (bruto) => {
      const v = (bruto ?? "").trim();
      if (!v) return { ok: false, motivo: "campo ausente na resposta" };
      if (!/^\d{1,6}(,\d{1,2})?$/.test(v)) return { ok: false, motivo: `"${v}" não é uma área em m² com vírgula decimal` };
      const n = Number(v.replace(",", "."));
      // lote urbano: abaixo de 1m² é leitura errada, acima de 100.000m² não é lote, é gleba
      if (n < 1 || n > 100_000) return { ok: false, motivo: `${n} m² está fora da faixa plausível de área de lote` };
      return { ok: true };
    },
  },
};

export const RECEITAS: Receita[] = [CALCULO_DE_VAGAS, ICCAP];

export const receitaDaChave = (chave: string) => RECEITAS.find((r) => r.chaves.includes(chave));

/**
 * Hash funcional da receita INTEIRA. É a chave de reuso e o registro de governança.
 *
 * Validadores e coerência não entram (funções não serializam de forma estável), e por isso `versao`
 * DEVE subir quando eles mudarem de comportamento — mesma regra da matriz, onde prosa fica fora do
 * hash e mudança funcional obriga incremento.
 */
export function hashReceita(r: Receita): string {
  const funcional = {
    id: r.id, versao: r.versao, chaves: [...r.chaves].sort(),
    estrategia: r.estrategia, papel: r.papel, localizacao: r.localizacao,
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

/**
 * Identidade da região EFETIVAMENTE recortada, para o índice único do banco.
 *
 * Vem do que o localizador achou, não da receita — duas execuções sobre o mesmo documento podem
 * cair em caixas ligeiramente diferentes, e arredondar a 3 casas é o que faz o cache funcionar sem
 * fingir que uma diferença de meio pixel é outra região.
 */
export function hashRegiao(g: { pagina: number; x0: number; y0: number; x1: number; y1: number }): string {
  const r = (n: number) => n.toFixed(3);
  return `p${g.pagina}:${r(g.x0)}:${r(g.y0)}:${r(g.x1)}:${r(g.y1)}`;
}
