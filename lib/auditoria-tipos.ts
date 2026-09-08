export type ModuloAuditoria = 'LIP' | 'MAC' | 'DESPACHO' | 'LOGRADOURO' | 'SISTEMA' | 'URBI' | 'ADMIN';
export type OrigemAuditoria = 'MANUAL' | 'IA' | 'SISTEMA';

export type AcaoLIP =
  | 'LIP_CAMPO_ALTERADO' | 'LIP_SALVO' | 'LIP_LIMPO'
  | 'LIP_PDF_LIDO' | 'LIP_ANALISE_IA_INICIADA' | 'LIP_ANALISE_IA_CONCLUIDA'
  | 'LIP_EXCEL_IMPORTADO' | 'LIP_EXCEL_EXPORTADO'
  | 'LIP_MARCO_TEMPORAL_REPROVADO'
  | 'LIP_LEITURA_PASTA' | 'LIP_DOC_LOCALIZADO_FORA'
  | 'LIP_COORDENADAS_MAPA_FACIL';

export type AcaoMAC =
  | 'MAC_ITEM_MARCADO' | 'MAC_IA_ACEITA' | 'MAC_IA_RECUSADA'
  | 'MAC_CHECKLIST_TROCADO' | 'MAC_ANALISE_SALVA' | 'MAC_ANALISE_CRIADA'
  | 'MAC_EXCEL_IMPORTADO' | 'MAC_ANALISE_IA_CONCLUIDA' | 'MAC_ANALISE_COPIADA'
  | 'MAC_VINCULO_PROPOSTO' | 'MAC_VINCULO_APROVADO' | 'MAC_VINCULO_REJEITADO';

export type AcaoDESPACHO =
  | 'DESPACHO_GERADO' | 'DESPACHO_INTERNO_GERADO' | 'LAUDO_EXCEL_GERADO'
  | 'PADRAO_DESPACHO_CRIADO' | 'PADRAO_DESPACHO_EDITADO' | 'PADRAO_DESPACHO_EXCLUIDO';

export type AcaoLOGRADOURO = 'LOGRADOURO_SALVO' | 'LOGRADOURO_ALTERADO';

export type AcaoSISTEMA =
  | 'SESSAO_INICIADA' | 'SESSAO_ENCERRADA' | 'SESSAO_IDLE' | 'PROCESSO_ABERTO';

/**
 * Condições que impedem a análise de um processo (Slot 1 e Slot 2) — pedido do Fábio em
 * 08/09/2026, ver ~/.claude/plans/floating-humming-orbit.md. "Tudo com histórico salvo": toda
 * vez que o card grande aparece OU é dispensado sem ter sido chamado, fica um evento aqui.
 */
export type AcaoURBI =
  | 'URBI_CONDICAO_BLOQUEANTE_DETECTADA' | 'URBI_CONDICAO_BLOQUEANTE_DISPENSADA';

/**
 * Ações administrativas fora do fluxo normal de análise — hoje só o estorno
 * de numeração (`/admin/numeracao`), pedido do Fábio em 08/09/2026 depois de
 * reverter manualmente o Despacho Interno nº 1663 do processo
 * 24.5.000024350-0.
 */
export type AcaoADMIN = 'NUMERACAO_ESTORNADA';

export type AcaoAuditoria =
  | AcaoLIP | AcaoMAC | AcaoDESPACHO | AcaoLOGRADOURO | AcaoSISTEMA | AcaoURBI | AcaoADMIN;

export interface RegistrarParams {
  modulo: ModuloAuditoria;
  acao: AcaoAuditoria;
  processo_codigo?: string;
  assunto_id?: string;
  detalhe?: Record<string, unknown>;
  origem?: OrigemAuditoria;
}

export interface AuditoriaEvento {
  id: string;
  analista_id: string;
  analista_nome: string;
  sessao_id: string;
  modulo: ModuloAuditoria;
  acao: AcaoAuditoria;
  processo_codigo: string | null;
  assunto_id: string | null;
  detalhe: Record<string, unknown> | null;
  origem: OrigemAuditoria;
  criado_em: string;
}
