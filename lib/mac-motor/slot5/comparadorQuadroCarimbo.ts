/**
 * lib/mac-motor/slot5/comparadorQuadroCarimbo.ts — arquétipo 3, EXPERIMENTAL.
 *
 * LACUNA DE CADASTRO confirmada em 2026-07-30: pesquisado nos 768 itens do modelo PADRÃO —
 * APROVAÇÃO DE PROJETO (assunto_id 78e2f7bb-7d9e-4b66-a6b8-1fd8418361f3) por "quadro de área"
 * (12 ocorrências), "carimbo" (19), "confere/conferência/compatibiliza" (20) e "soma de área" (1)
 * — NENHUM item pede compatibilização numérica entre um quadro de áreas (por pavimento/uso) e os
 * totais do carimbo. Os itens que mencionam "quadro de áreas" são procedimentais (MANUAL_SEM_DADO_LIP,
 * "informar no quadro de áreas: X, Y, Z"); os que mencionam "carimbo" são de formatação/texto do
 * carimbo. Os únicos itens sobre comparação numérica de área do terreno duplicam o arquétipo 1
 * (dimensoesTerreno.ts) — não são este arquétipo.
 *
 * Por instrução explícita do usuário: este componente NÃO grava em mac_resultados_item e NÃO tem
 * mac_item_id — é só o comparador, para uso futuro quando/se um item for cadastrado para ele.
 * Não é chamado por lib/mac-motor/slot5/index.ts (não faz parte da execução do piloto).
 */

import type { FatoExtraido } from "./tipos";
import { buscarFato, parseNumeroBR } from "./util";

/** Tolerância de engenharia — mesmo raciocínio de arredondamento das outras regras deste motor. */
export const TOLERANCIA_QUADRO_CARIMBO_M2 = 1.0;

export type LinhaQuadroDeAreas = { rotulo: string; areaM2: number };

export type ResultadoComparadorQuadroCarimbo = {
  status: "OK" | "DIVERGENTE" | "DADOS_INSUFICIENTES";
  quadro: LinhaQuadroDeAreas[];
  somaQuadro: number | null;
  carimbo: { areaTotalConstruida: number | null; areaTotalPrivativa: number | null };
  divergencias: { campo: string; quadro: number; carimbo: number; diferencaM2: number }[];
  observacao: string;
};

/**
 * Pura — sem rede, sem banco, sem gravação. Soma as linhas do quadro (fatos "quadroArea:<rótulo>")
 * e compara com os totais do carimbo, quando ambos existem.
 */
export function compararQuadroDeAreasComCarimbo(fatos: FatoExtraido[]): ResultadoComparadorQuadroCarimbo {
  const quadro: LinhaQuadroDeAreas[] = [];
  for (const f of fatos) {
    if (!f.nome.startsWith("quadroArea:") || "abstencao" in f) continue;
    const valor = parseNumeroBR(f.valor);
    if (valor === null) continue;
    quadro.push({ rotulo: f.nome.slice("quadroArea:".length), areaM2: valor });
  }
  const somaQuadro = quadro.length > 0 ? quadro.reduce((s, l) => s + l.areaM2, 0) : null;

  const fatoTotalConstruida = buscarFato(fatos, "carimboAreaTotalConstruida");
  const areaTotalConstruida = fatoTotalConstruida && !("abstencao" in fatoTotalConstruida) ? parseNumeroBR(fatoTotalConstruida.valor) : null;
  const fatoTotalPrivativa = buscarFato(fatos, "carimboAreaTotalPrivativa");
  const areaTotalPrivativa = fatoTotalPrivativa && !("abstencao" in fatoTotalPrivativa) ? parseNumeroBR(fatoTotalPrivativa.valor) : null;

  if (somaQuadro === null || (areaTotalConstruida === null && areaTotalPrivativa === null)) {
    return {
      status: "DADOS_INSUFICIENTES",
      quadro, somaQuadro,
      carimbo: { areaTotalConstruida, areaTotalPrivativa },
      divergencias: [],
      observacao: "faltou o quadro de áreas ou os totais do carimbo — sem base para comparar.",
    };
  }

  const divergencias: ResultadoComparadorQuadroCarimbo["divergencias"] = [];
  if (areaTotalConstruida !== null) {
    const diferenca = Math.abs(somaQuadro - areaTotalConstruida);
    if (diferenca > TOLERANCIA_QUADRO_CARIMBO_M2) {
      divergencias.push({ campo: "areaTotalConstruida", quadro: somaQuadro, carimbo: areaTotalConstruida, diferencaM2: diferenca });
    }
  }

  return {
    status: divergencias.length > 0 ? "DIVERGENTE" : "OK",
    quadro, somaQuadro,
    carimbo: { areaTotalConstruida, areaTotalPrivativa },
    divergencias,
    observacao: "componente experimental, sem item MAC vinculado — resultado não é gravado em mac_resultados_item.",
  };
}
