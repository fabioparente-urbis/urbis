import { montarCobertura, detectarMudancasEstruturais } from "./catalogo";
import type { DossieTecnicoSlot } from "./tipos";
import type { EntradaAdaptador } from "./entrada";

/**
 * Adaptador de leitura — Aceite SEI (Slot 2). Não altera fluxo/tela do slot (só necessário se
 * pedido explícito, e este trabalho é de leitura pro dossiê do URBI, não de mudança no slot).
 * Auditoria real de 03/09/2026: só 39 linhas de mac_historico neste assunto no banco inteiro
 * (contra 5.186 de Regularização) — massa pequena, tratar qualquer estatística daqui com mais
 * cautela do que nos outros dois slots.
 */
export function montarDossieTecnicoAceiteSei(entrada: EntradaAdaptador): DossieTecnicoSlot {
  const mudancasEstruturais = detectarMudancasEstruturais(entrada.historicoMac, entrada.itemAtualPorId);

  return {
    slot: "aceite_sei",
    nome_slot: "Aceite SEI",
    catalogo: {
      quantidade_itens_ativos_agora: entrada.itensAtivosNoModelo,
      fonte: "mac_checklist_itens",
      observacao: "Lido ao vivo do banco a cada dossiê — nunca uma lista fixa. Mudança no checklist aparece aqui na próxima leitura, sem precisar mexer no URBI.",
    },
    coberturas: [
      montarCobertura("mac_historico (evolução entre passadas)", entrada.historicoMac, null),
      montarCobertura("mhd_resultados_campo (leitura de documento)", entrada.resultadosDocumento, entrada.erroResultadosDocumento),
      { fonte: "mac_bip_vinculos (vínculo aprovado)", disponivel: entrada.itensComVinculoBipAprovado > 0, quantidade: entrada.itensComVinculoBipAprovado, motivo_ausencia: entrada.erroCoberturaBip ?? (entrada.itensComVinculoBipAprovado === 0 ? "auditoria de 03/09/2026: 0% de cobertura BIP histórica neste assunto" : null) },
      montarCobertura("mdp_registros", entrada.mdpRegistros, null),
      montarCobertura("mrp_registros", entrada.mrpRegistros, null),
    ],
    mudancas_estruturais: mudancasEstruturais,
    observacoes_do_slot: [
      "Aceite SEI tem pouca massa histórica no sistema (poucas dezenas de eventos no total, auditoria de 03/09/2026) — base insuficiente é o padrão aqui, não exceção; declare isso em vez de tratar ausência como anomalia.",
      "Aceite SEI não tem leitura de documento estruturada (mhd_resultados_campo) — mecanismo hoje só existe pro Slot 5.",
      "mac_historico deste assunto pode conter linha de nota livre de verificação de marco temporal (checklist_item_id nulo) — já filtrada antes de chegar em evolução/mudança estrutural, não precisa desconfiar dela aqui.",
      "Observação do MAC deste slot fica em observacoes_por_aba (por grupo/aba), não por item.",
    ],
  };
}
