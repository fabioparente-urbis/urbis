/**
 * lib/visao/quadroAreasComparacao.ts — adaptador de comparação (Fase K, item 5): leitura visual
 * do quadro de áreas × LIP, × MAC, × memorial/documento.
 *
 * DESENHO, não execução: nada aqui chama IA nem grava sugestão. Reaproveita 100% do comparador
 * numérico já existente e já usado em produção (`compararValores`, lib/urbi/cruzamento.ts) —
 * mesma regra da Fase B do plano URBIS ("nunca tolerância silenciosa: diferença real, por menor
 * que seja, vira divergência, nunca 'consistente'"), a MESMA exigência que esta fase pediu
 * ("diferença numérica exata após normalização, sem tolerância implícita"). Não reinventa
 * vocabulário: usa `GrauCruzamento` e `ResultadoCruzamento`, os mesmos que já alimentam
 * `lib/urbi/sugestoes.ts` — um comparador novo que inventasse um vocabulário próprio obrigaria
 * o resto do URBI a aprender uma segunda língua pro mesmo tipo de fato.
 *
 * LIP × MAC × documento têm o mesmo FORMATO de valor de referência (um número/texto + de onde
 * veio) — por isso uma função central (`compararCampoDoQuadro`) atende as 3 direções; o que
 * muda entre elas é só QUAL função de leitura busca o valor de referência, fora deste arquivo.
 *
 * Nota sobre "leitura visual × MAC": diferente do LIP (que tem `processos.dados` com valor por
 * campo) e do documento (que tem `mhd_resultados_campo`), o MAC não guarda valor numérico de
 * área em lugar nenhum hoje — é checklist de conformidade, não campo de medida. Por isso esta
 * fase só PREPARA a função (`compararComMac`), sem uma fonte real pra alimentá-la ainda; ligar
 * isso a um item MAC específico é decisão de um humano que souber qual item deveria carregar
 * esse valor, não suposição deste arquivo.
 */

import { compararValores, type GrauCruzamento } from "@/lib/urbi/cruzamento";
import type { LeituraCampo } from "./tipos";
import type { ChaveQuadroAreas, QuadroAreasExtraido } from "./quadroAreas";

export type ValorDeReferencia = {
  valor: string | number | null;
  fonte: string;
};

/**
 * Mesmo formato de `ResultadoCruzamento` (lib/urbi/cruzamento.ts), com `tipo` PRÓPRIO desta
 * família de comparação — de propósito NÃO estende o union de `ResultadoCruzamento.tipo`
 * (que é lido pela sugestão automática já em produção, lib/urbi/sugestoes.ts): esta fase é só
 * desenho, então o tipo fica isolado até um humano decidir ligar isto ao pipeline real de
 * sugestão, evitando qualquer efeito colateral em código já ativo.
 */
export type TipoCruzamentoVisual = "leitura_visual_x_lip" | "leitura_visual_x_mac" | "leitura_visual_x_documento";
export type ResultadoCruzamentoVisual = {
  tipo: TipoCruzamentoVisual;
  chave: string;
  resultado: GrauCruzamento;
  motivo: string;
  campos_comparados: string[];
  fontes: string[];
  regra: string;
};

/**
 * Núcleo comum às 3 direções de comparação. `leitura` vem SEMPRE de `QuadroAreasExtraido` (a
 * leitura visual); `referencia` vem de fora (LIP, MAC ou documento) — `null` quando a fonte não
 * tem valor pra este campo, o que vira "dado_ausente", nunca "consistente por omissão".
 */
export function compararCampoDoQuadro(
  campo: ChaveQuadroAreas | `pavimento:${string}`,
  leitura: LeituraCampo,
  referencia: ValorDeReferencia | null,
  tipoCruzamento: TipoCruzamentoVisual,
): ResultadoCruzamentoVisual {
  const valorLeitura = leitura.ok ? leitura.valor : null;
  const fonteLeitura = "leitura visual (quadro de áreas)";

  if (!leitura.ok) {
    return {
      tipo: tipoCruzamento,
      chave: campo,
      resultado: "dado_ausente",
      motivo: `A leitura visual não tem valor para "${campo}" (${leitura.motivo}).`,
      campos_comparados: [campo],
      fontes: [fonteLeitura, referencia?.fonte ?? "(sem referência)"],
      regra: "presença de valor",
    };
  }
  if (!referencia || referencia.valor === null) {
    return {
      tipo: tipoCruzamento,
      chave: campo,
      resultado: "dado_ausente",
      motivo: `Não há valor de referência para "${campo}" na fonte comparada.`,
      campos_comparados: [campo],
      fontes: [fonteLeitura, referencia?.fonte ?? "(sem referência)"],
      regra: "presença de valor",
    };
  }

  const cmp = compararValores(valorLeitura, referencia.valor);
  return {
    tipo: tipoCruzamento,
    chave: campo,
    resultado: cmp.resultado,
    motivo: cmp.motivo,
    campos_comparados: [campo],
    fontes: [fonteLeitura, referencia.fonte],
    regra: cmp.regra,
  };
}

/**
 * Compara os campos escalares do quadro (não os de pavimento — esses exigiriam saber qual
 * campo do LIP corresponde a QUAL pavimento, que não existe hoje) contra um mapa de campos
 * técnicos do LIP já lido (mesmo formato de `camposTecnicosDoLip`, lib/urbi/dossieProcesso.ts).
 * Só compara quando a MESMA chave existe nos dois lados — nunca inventa correspondência.
 */
export function compararComLip(
  quadro: QuadroAreasExtraido,
  camposLip: Partial<Record<ChaveQuadroAreas, ValorDeReferencia>>,
): ResultadoCruzamentoVisual[] {
  const saida: ResultadoCruzamentoVisual[] = [];
  for (const chave of Object.keys(quadro.porCampo) as ChaveQuadroAreas[]) {
    const referencia = camposLip[chave];
    if (!referencia) continue; // sem correspondência declarada — fica de fora, não é suposição
    saida.push(compararCampoDoQuadro(chave, quadro.porCampo[chave], referencia, "leitura_visual_x_lip"));
  }
  return saida;
}

/**
 * Preparada, sem fonte real ainda (ver nota no topo do arquivo) — recebe o mapa de referência
 * exatamente como `compararComLip`, pra quando um item MAC específico vier a carregar valor
 * numérico comparável.
 */
export function compararComMac(
  quadro: QuadroAreasExtraido,
  valoresMac: Partial<Record<ChaveQuadroAreas, ValorDeReferencia>>,
): ResultadoCruzamentoVisual[] {
  const saida: ResultadoCruzamentoVisual[] = [];
  for (const chave of Object.keys(quadro.porCampo) as ChaveQuadroAreas[]) {
    const referencia = valoresMac[chave];
    if (!referencia) continue;
    saida.push(compararCampoDoQuadro(chave, quadro.porCampo[chave], referencia, "leitura_visual_x_mac"));
  }
  return saida;
}

/**
 * Compara contra outra leitura de documento (ex.: `mhd_resultados_campo`, ou uma segunda
 * leitura visual do memorial de cálculo) — mesma mecânica de `cruzarLipComDocumento`
 * (lib/urbi/cruzamento.ts), reaproveitada em vez de duplicada.
 */
export function compararComDocumento(
  quadro: QuadroAreasExtraido,
  camposDocumento: Partial<Record<ChaveQuadroAreas, ValorDeReferencia>>,
): ResultadoCruzamentoVisual[] {
  const saida: ResultadoCruzamentoVisual[] = [];
  for (const chave of Object.keys(quadro.porCampo) as ChaveQuadroAreas[]) {
    const referencia = camposDocumento[chave];
    if (!referencia) continue;
    saida.push(compararCampoDoQuadro(chave, quadro.porCampo[chave], referencia, "leitura_visual_x_documento"));
  }
  return saida;
}

export type { GrauCruzamento };
