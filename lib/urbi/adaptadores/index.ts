import { montarDossieTecnicoRegularizacao } from "./regularizacao";
import { montarDossieTecnicoAceiteSei } from "./aceiteSei";
import { montarDossieTecnicoSlot5 } from "./slot5";
import type { DossieTecnicoSlot } from "./tipos";
import type { EntradaAdaptador } from "./entrada";

export type { DossieTecnicoSlot, CoberturaFonte, MudancaEstrutural } from "./tipos";
export type { EntradaAdaptador } from "./entrada";

/**
 * Ponto único de entrada dos adaptadores — o dossiê chama só isto, nunca importa um slot
 * específico direto. Um slot futuro (3, 4...) entra aqui com seu próprio arquivo, sem tocar
 * nos outros dois — mesmo princípio de isolamento entre slots do CLAUDE.md, aplicado à leitura.
 */
export function montarDossieTecnico(tipoProcesso: string | null | undefined, entrada: EntradaAdaptador): DossieTecnicoSlot | null {
  switch (tipoProcesso) {
    case "regularizacao": return montarDossieTecnicoRegularizacao(entrada);
    case "aceite_sei": return montarDossieTecnicoAceiteSei(entrada);
    case "slot_05": return montarDossieTecnicoSlot5(entrada);
    default: return null; // slot desconhecido/futuro sem adaptador ainda — dossiê declara base insuficiente, não inventa
  }
}
