/**
 * lib/mac-motor/slot5/camposLip.ts — congela um campo de `processos.dados` para o motor.
 *
 * `processos.dados[chave]` é `{ valor, origem, fonte? }` (mesmo formato usado por
 * app/processo/ProcessoClient.tsx). Correção de revisão independente: a rota convertia
 * direto para número e perdia o valor bruto e a origem — agora os três (valor bruto, valor
 * normalizado, origem) viajam juntos até `mac_resultados_item.campos_lip_json`, reproduzíveis.
 *
 * Não decide vocabulário novo de origem — preserva exatamente a string que já está no processo.
 */

import type { CampoLipCongelado } from "./tipos";
import { parseNumeroBR } from "./util";

export type DadosProcesso = Record<string, { valor?: unknown; origem?: unknown } | undefined> | null | undefined;

export function lerCampoLip(dados: DadosProcesso, chave: string): CampoLipCongelado {
  const bruto = dados?.[chave];
  const valor = typeof bruto?.valor === "string" ? bruto.valor : null;
  const origem = typeof bruto?.origem === "string" ? bruto.origem : null;
  return {
    valor,
    valorNormalizado: valor !== null ? parseNumeroBR(valor) : null,
    origem,
  };
}
