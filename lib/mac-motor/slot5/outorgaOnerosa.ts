/**
 * lib/mac-motor/slot5/outorgaOnerosa.ts — cálculo do campo `outorgaOnerosa` do LIP do Slot 5.
 *
 * Regra do Fábio (2026-08-18), as DUAS condições juntas ("E", nunca uma sozinha):
 *   1. Altura do térreo até a COBERTURA (se não tiver cobertura, até o FORRO; se não tiver
 *      nenhum dos dois, até a parte de baixo do TELHADO) — não é a altura total da edificação.
 *   2. Área construída maior que a área do lote/terreno.
 *
 * Estava declarado BLOQUEADO/não implementado em lib/rastreabilidade/lipSlot5.ts (chave
 * "outorgaOnerosa") — a fórmula já estava escrita lá, só nunca foi codificada. `alturaDaEdificacao`
 * é PENDENTE_VISAO (cotada no corte, não extraível por texto) — só existe quando o analista digita
 * manualmente. Por isso este cálculo não mora em `lerPastaSlot5.ts` (que só vê o que a LEITURA
 * atual trouxe): ele recalcula toda vez que o LIP é salvo, usando o que já está gravado — puxa do
 * LIP de verdade, não só na hora de ler a pasta.
 */

import { parseNumeroBR } from "./util";

const ALTURA_MINIMA = 7.5;

/**
 * Recalcula `outorgaOnerosa` a partir de `alturaDaEdificacao`/`areaTotal`/`areaTerreno` já
 * salvos em `dados`. Sem os três, não mexe (deixa o valor como estava — nunca inventa "NP" por
 * falta de dado, mesma regra do resto do Slot 5: sem dado suficiente, pendência explícita).
 */
export function recalcularOutorgaOnerosa(dados: Record<string, any>): Record<string, any> {
  const altura = parseNumeroBR(String(dados?.alturaDaEdificacao?.valor ?? ""));
  const areaTotal = parseNumeroBR(String(dados?.areaTotal?.valor ?? ""));
  const areaTerreno = parseNumeroBR(String(dados?.areaTerreno?.valor ?? ""));

  if (altura === null || areaTotal === null || areaTerreno === null) return dados;

  const br = (n: number) => n.toString().replace(".", ",");
  const incide = altura >= ALTURA_MINIMA && areaTotal > areaTerreno;
  const fonte = `altura ${br(altura)}m (${altura >= ALTURA_MINIMA ? "≥" : "<"} ${br(ALTURA_MINIMA)}m) `
    + `E área construída ${br(areaTotal)}m² ${areaTotal > areaTerreno ? ">" : "≤"} área terreno ${br(areaTerreno)}m²`;

  return {
    ...dados,
    outorgaOnerosa: { valor: incide ? "SIM" : "NP", origem: "urbis", fonte },
  };
}
