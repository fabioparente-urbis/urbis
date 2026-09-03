import type { GrauDeCerteza } from "../dossieProcesso";

/**
 * Contrato comum dos adaptadores de leitura por slot (Fase C do plano de Inteligência URBIS).
 * Cada slot (Regularização SEI, Aceite SEI, Aprovação de Projeto/Slot 5, e qualquer slot
 * futuro) tem seu próprio arquivo em lib/urbi/adaptadores/ implementando
 * `montarDossieTecnico`, mas todos devolvem exatamente esta forma — o dossiê e o chat não
 * precisam saber qual slot é, só consomem o contrato.
 *
 * Regra que vale pros 3 adaptadores: nenhum lê LIP/MAC "fixo" — tudo aqui é montado a partir
 * do que a consulta ao banco trouxe NA HORA (catálogo vigente), nunca de uma lista hardcoded
 * de campo ou item. Ver ADENDO de 03/09/2026 (regras supremas do URBI).
 */

export type CoberturaFonte = {
  fonte: string;
  disponivel: boolean;
  quantidade: number;
  /** Só preenchido quando disponivel=false — explica por que falta, nunca vira "erro do interessado/analista". */
  motivo_ausencia: string | null;
};

export type MudancaEstrutural = {
  item_id: string;
  texto_historico: string;
  /** null = o item nem existe mais no catálogo ativo hoje (foi removido/substituído), não só reescrito. */
  texto_atual: string | null;
  /** Quando o texto histórico foi registrado (mac_historico.criado_em) — não é "quando mudou", é "até quando esta versão valia". */
  ultimo_registro_com_texto_antigo: string;
};

export type DossieTecnicoSlot = {
  slot: string;
  nome_slot: string;
  catalogo: {
    quantidade_itens_ativos_agora: number;
    fonte: "mac_checklist_itens";
    observacao: string;
  };
  coberturas: CoberturaFonte[];
  mudancas_estruturais: MudancaEstrutural[];
  /** Nota de calibração — o que é normal esperar deste slot hoje, baseado em auditoria real, não em regra inventada. */
  observacoes_do_slot: string[];
};

export type { GrauDeCerteza };
