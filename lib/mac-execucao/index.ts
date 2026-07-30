/**
 * lib/mac-execucao/index.ts — ponto único de entrada da camada de execução do MAC.
 */

export {
  iniciarExecucao, registrarResultado, concluirExecucao, marcarErro,
  obterExecucao, execucoesDoProcesso, resultadosDaExecucao,
  revisarResultado, resultadoEfetivo, revisoesDoResultado,
} from "./executor";
export type { IniciarExecucaoParams, RevisarResultadoParams } from "./executor";
export { versaoLip, versaoMac, versaoBip } from "./versao";
export {
  APLICABILIDADES, RESULTADOS, STATUS_EXECUCAO,
} from "./tipos";
export type {
  Aplicabilidade, Resultado, StatusExecucao, Confianca,
  Execucao, ResultadoItem, RevisaoResultado, NovoResultadoItem,
  EvidenciaLip, VinculoBipUsado,
} from "./tipos";
