import { montarCobertura, detectarMudancasEstruturais } from "./catalogo";
import type { DossieTecnicoSlot } from "./tipos";
import type { EntradaAdaptador } from "./entrada";

/**
 * Adaptador de leitura — Regularização SEI (Slot 1). SOMENTE LEITURA: não toca LIP, MAC,
 * despacho, checklist, numeração nem regra de negócio do slot (ver CLAUDE.md — Slot 1
 * congelado). Auditoria real de 03/09/2026 usada só pra calibrar a observação do slot, nunca
 * pra decidir nada por ele.
 */
export function montarDossieTecnicoRegularizacao(entrada: EntradaAdaptador): DossieTecnicoSlot {
  const mudancasEstruturais = detectarMudancasEstruturais(entrada.historicoMac, entrada.itemAtualPorId);

  return {
    slot: "regularizacao",
    nome_slot: "Regularização SEI",
    catalogo: {
      quantidade_itens_ativos_agora: entrada.itensAtivosNoModelo,
      fonte: "mac_checklist_itens",
      observacao: "Lido ao vivo do banco a cada dossiê — nunca uma lista fixa. Mudança no checklist aparece aqui na próxima leitura, sem precisar mexer no URBI.",
    },
    coberturas: [
      montarCobertura("mac_historico (evolução entre passadas)", entrada.historicoMac, null),
      montarCobertura("mhd_resultados_campo (leitura de documento)", entrada.resultadosDocumento, entrada.erroResultadosDocumento),
      { fonte: "mac_bip_vinculos (vínculo aprovado)", disponivel: entrada.itensComVinculoBipAprovado > 0, quantidade: entrada.itensComVinculoBipAprovado, motivo_ausencia: entrada.erroCoberturaBip ?? (entrada.itensComVinculoBipAprovado === 0 ? "auditoria de 03/09/2026: 0% de cobertura BIP histórica neste assunto — fila de vínculos em /admin/vinculos-lip-bip existe pra isso, ainda em andamento" : null) },
      montarCobertura("mdp_registros", entrada.mdpRegistros, null),
      montarCobertura("mrp_registros", entrada.mrpRegistros, null),
    ],
    mudancas_estruturais: mudancasEstruturais,
    observacoes_do_slot: [
      "Regularização SEI não tem leitura de documento estruturada (mhd_resultados_campo) — não é falha do processo, esse mecanismo hoje só existe pro Slot 5.",
      "Ausência de vínculo BIP aqui é o normal histórico (0% de cobertura confirmada em auditoria), não uma anomalia deste processo específico.",
      "Observação do MAC deste slot fica em observacoes_por_aba (por grupo/aba), não por item — ver mac.marcacoes_ultima_analise[].observacao no dossiê.",
    ],
  };
}
