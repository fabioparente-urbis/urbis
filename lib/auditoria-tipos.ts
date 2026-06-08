export type ModuloAuditoria = 'LIP' | 'MAC' | 'DESPACHO' | 'LOGRADOURO' | 'SISTEMA';
export type OrigemAuditoria = 'MANUAL' | 'IA' | 'SISTEMA';

export type AcaoLIP =
  | 'LIP_CAMPO_ALTERADO' | 'LIP_SALVO' | 'LIP_LIMPO'
  | 'LIP_PDF_LIDO' | 'LIP_ANALISE_IA_INICIADA' | 'LIP_ANALISE_IA_CONCLUIDA'
  | 'LIP_EXCEL_IMPORTADO' | 'LIP_EXCEL_EXPORTADO';

export type AcaoMAC =
  | 'MAC_ITEM_MARCADO' | 'MAC_IA_ACEITA' | 'MAC_IA_RECUSADA'
  | 'MAC_CHECKLIST_TROCADO' | 'MAC_ANALISE_SALVA' | 'MAC_ANALISE_CRIADA'
  | 'MAC_EXCEL_IMPORTADO' | 'MAC_ANALISE_IA_CONCLUIDA';

export type AcaoDESPACHO =
  | 'DESPACHO_GERADO' | 'DESPACHO_INTERNO_GERADO' | 'LAUDO_EXCEL_GERADO';

export type AcaoLOGRADOURO = 'LOGRADOURO_SALVO' | 'LOGRADOURO_ALTERADO';

export type AcaoSISTEMA =
  | 'SESSAO_INICIADA' | 'SESSAO_ENCERRADA' | 'SESSAO_IDLE' | 'PROCESSO_ABERTO';

export type AcaoAuditoria =
  | AcaoLIP | AcaoMAC | AcaoDESPACHO | AcaoLOGRADOURO | AcaoSISTEMA;

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
