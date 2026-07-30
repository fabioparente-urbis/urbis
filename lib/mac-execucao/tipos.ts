/**
 * lib/mac-execucao/tipos.ts — vocabulário da camada de EXECUÇÃO do MAC.
 *
 * Não confundir com lib/rastreabilidade/tipos.ts: lá é a REGRA GERAL (como um item
 * do MAC deve ser avaliado, igual em todo processo). Aqui é o que aconteceu quando
 * essa regra rodou sobre UM processo — o par (Aplicabilidade, Resultado) de cada
 * item, numa execução específica.
 *
 * Espelha exatamente as tabelas de supabase/migrations/2026_07_30_mac_execucoes.sql
 * — os CHECK constraints do banco e estes union types precisam ficar em sincronia.
 */

/** Se o item se aplica a este processo. Decidido ANTES de avaliar conformidade. */
export type Aplicabilidade =
  | "APLICAVEL"
  | "NAO_APLICAVEL"
  | "INDETERMINADO"    // faltou fato para decidir se aplica
  | "ERRO_DADOS";       // dado de entrada inconsistente impediu a decisão

/** O resultado da avaliação de conformidade, quando o item é APLICAVEL. */
export type Resultado =
  | "CONFORME"
  | "NAO_CONFORME"
  | "PENDENTE"          // falta fato para concluir, mas o item se aplica
  | "NAO_AVALIADO"       // regra ainda não rodou sobre este item
  | "REVISAO_MANUAL";    // motor abstém-se; exige julgamento humano

export type StatusExecucao = "EM_EXECUCAO" | "CONCLUIDA" | "ERRO" | "CANCELADA";

export type Confianca = "ALTA" | "MEDIA" | "BAIXA";

export const APLICABILIDADES: readonly Aplicabilidade[] = [
  "APLICAVEL", "NAO_APLICAVEL", "INDETERMINADO", "ERRO_DADOS",
];
export const RESULTADOS: readonly Resultado[] = [
  "CONFORME", "NAO_CONFORME", "PENDENTE", "NAO_AVALIADO", "REVISAO_MANUAL",
];
export const STATUS_EXECUCAO: readonly StatusExecucao[] = [
  "EM_EXECUCAO", "CONCLUIDA", "ERRO", "CANCELADA",
];

/** Uma execução do motor do MAC sobre um processo — mac_execucoes. */
export type Execucao = {
  id: string;
  processoId: string;
  versaoLip: string;
  versaoMac: string;
  versaoBip: string;
  status: StatusExecucao;
  iniciadoEm: string;
  concluidoEm: string | null;
  duracaoMs: number | null;
  criadoPor: string | null;
  metadata: Record<string, unknown>;
};

/** O que o motor leu para decidir um item — congelado para reproduzir o resultado. */
export type EvidenciaLip = {
  lipChave: string;
  valor: unknown;
  papel: string;
};

export type VinculoBipUsado = {
  fragmentoId: string;
  referencia: string;
  confianca: Confianca;
};

/** O resultado de um item dentro de uma execução — mac_resultados_item. */
export type ResultadoItem = {
  id: string;
  execucaoId: string;
  macItemId: string;
  aplicabilidade: Aplicabilidade;
  resultado: Resultado;
  confianca: Confianca | null;
  justificativa: string;
  evidencias: EvidenciaLip[];
  camposLip: Record<string, unknown>;
  vinculosBip: VinculoBipUsado[];
  regraId: string;
  regraVersao: number;
  requerRevisao: boolean;
  criadoEm: string;
};

/** Uma correção humana sobre um ResultadoItem — mac_resultados_revisoes. Auditável, nunca destrutiva. */
export type RevisaoResultado = {
  id: string;
  resultadoItemId: string;
  usuarioId: string;
  resultadoAnterior: Resultado;
  resultadoNovo: Resultado;
  justificativa: string;
  criadoEm: string;
};

/**
 * Entrada mínima para registrar um resultado — o que o motor (FASE 4, futuro) precisa
 * produzir por item. `execucaoId` e `macItemId` vêm de fora; o resto é decisão da regra.
 */
export type NovoResultadoItem = {
  macItemId: string;
  aplicabilidade: Aplicabilidade;
  resultado: Resultado;
  confianca?: Confianca | null;
  justificativa: string;
  evidencias?: EvidenciaLip[];
  camposLip?: Record<string, unknown>;
  vinculosBip?: VinculoBipUsado[];
  regraId: string;
  regraVersao?: number;
  requerRevisao?: boolean;
};
