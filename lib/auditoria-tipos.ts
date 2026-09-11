export type ModuloAuditoria = 'LIP' | 'MAC' | 'DESPACHO' | 'LOGRADOURO' | 'SISTEMA' | 'URBI' | 'ADMIN';
export type OrigemAuditoria = 'MANUAL' | 'IA' | 'SISTEMA';

export type AcaoLIP =
  | 'LIP_CAMPO_ALTERADO' | 'LIP_SALVO' | 'LIP_LIMPO'
  | 'LIP_PDF_LIDO' | 'LIP_ANALISE_IA_INICIADA' | 'LIP_ANALISE_IA_CONCLUIDA' | 'LIP_ANALISE_IA_REAPROVEITADA'
  | 'LIP_EXCEL_IMPORTADO' | 'LIP_EXCEL_EXPORTADO'
  | 'LIP_MARCO_TEMPORAL_REPROVADO'
  | 'LIP_LEITURA_PASTA' | 'LIP_DOC_LOCALIZADO_FORA'
  | 'LIP_COORDENADAS_MAPA_FACIL';

export type AcaoMAC =
  | 'MAC_ITEM_MARCADO' | 'MAC_IA_ACEITA' | 'MAC_IA_RECUSADA'
  | 'MAC_CHECKLIST_TROCADO' | 'MAC_ANALISE_SALVA' | 'MAC_ANALISE_CRIADA'
  | 'MAC_EXCEL_IMPORTADO' | 'MAC_ANALISE_IA_CONCLUIDA' | 'MAC_ANALISE_COPIADA'
  | 'MAC_VINCULO_PROPOSTO' | 'MAC_VINCULO_APROVADO' | 'MAC_VINCULO_REJEITADO'
  /** Exclusão de análise pela lixeira do MAC (08/09/2026) — some da tela, fica no rastro. */
  | 'MAC_ANALISE_EXCLUIDA'
  /** Fase 9B (leitura única LIP+MAC, 11/09/2026): analista aplicou a sugestão de checklist que
   * a leitura combinada do LIP deixou pendente. */
  | 'MAC_LEITURA_UNICA_APLICADA';

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
  | 'URBI_CONDICAO_BLOQUEANTE_DETECTADA' | 'URBI_CONDICAO_BLOQUEANTE_DISPENSADA'
  /**
   * Veredito do analista sobre uma intervenção do URBI (08/09/2026, pedido do Fábio: toda
   * intervenção tem que aceitar concordar/discordar). É o que permite medir se o URBI está
   * ajudando ou incomodando — sem isso, "o URBI é útil?" seria opinião.
   */
  | 'URBI_INTERVENCAO_ACEITA' | 'URBI_INTERVENCAO_RECUSADA'
  /**
   * Indeferimento automático por imóvel duplicado (COND_IMOVEL_DUPLICADO, pedido do Fábio em
   * 10/09/2026) — o clique do analista no botão "Indeferir" do card grande É a autorização;
   * fica registrado tanto quando dá certo quanto quando falha, pra nunca sumir em silêncio.
   */
  | 'URBI_INDEFERIMENTO_IMOVEL_DUPLICADO_EXECUTADO' | 'URBI_INDEFERIMENTO_IMOVEL_DUPLICADO_FALHOU';

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
