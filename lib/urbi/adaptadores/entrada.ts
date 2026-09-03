import type { EventoMacHistorico } from "../dossieProcesso";
import type { EventoCatalogo } from "./tipos";

/**
 * Forma comum de entrada dos 3 adaptadores — tudo que eles recebem já foi consultado pelo
 * dossiê (nenhum adaptador faz sua própria query; mantém uma leitura só por processo, evita
 * duplicar consulta e evita cada slot decidir sozinho como buscar o mesmo dado).
 */
export type EntradaAdaptador = {
  itensAtivosNoModelo: number;
  historicoMac: EventoMacHistorico[];
  itemAtualPorId: Map<string, { texto: string; ativo: boolean }>;
  resultadosDocumento: { chave: string; valor: string | null; fonte: string | null }[];
  erroResultadosDocumento: string | null;
  itensComVinculoBipAprovado: number;
  erroCoberturaBip: string | null;
  mdpRegistros: unknown[];
  mrpRegistros: unknown[];
  /** mac_checklist_itens_historico do modelo deste slot — Fase D, trilha real (não inferida). */
  eventosCatalogo: EventoCatalogo[];
};
