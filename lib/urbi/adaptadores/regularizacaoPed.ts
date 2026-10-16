import { montarCobertura, detectarMudancasEstruturais } from "./catalogo";
import type { DossieTecnicoSlot } from "./tipos";
import type { EntradaAdaptador } from "./entrada";

/**
 * Adaptador de leitura — Regularização PED (Slot 3). CÓPIA POR LEITURA do adaptador do Slot 1
 * (`./regularizacao.ts`), 16/10/2026. SOMENTE LEITURA: não toca LIP, MAC, despacho, checklist,
 * numeração nem regra de negócio do slot. As notas de calibração do Slot 1 (auditoria de
 * 03/09/2026) NÃO foram copiadas: eram fatos do histórico da Regularização SEI e não valem para
 * um slot recém-criado — trocadas pelo que é verdade aqui.
 */
export function montarDossieTecnicoRegularizacaoPed(entrada: EntradaAdaptador): DossieTecnicoSlot {
  const mudancasEstruturais = detectarMudancasEstruturais(entrada.historicoMac, entrada.itemAtualPorId);

  return {
    slot: "slot_03",
    nome_slot: "Regularização PED",
    catalogo: {
      quantidade_itens_ativos_agora: entrada.itensAtivosNoModelo,
      fonte: "mac_checklist_itens",
      observacao: "Lido ao vivo do banco a cada dossiê — nunca uma lista fixa. Mudança no checklist aparece aqui na próxima leitura, sem precisar mexer no URBI.",
    },
    coberturas: [
      montarCobertura("mac_historico (evolução entre passadas)", entrada.historicoMac, null),
      montarCobertura("mhd_resultados_campo (leitura de documento)", entrada.resultadosDocumento, entrada.erroResultadosDocumento),
      { fonte: "mac_bip_vinculos (vínculo aprovado)", disponivel: entrada.itensComVinculoBipAprovado > 0, quantidade: entrada.itensComVinculoBipAprovado, motivo_ausencia: entrada.erroCoberturaBip ?? (entrada.itensComVinculoBipAprovado === 0 ? "slot novo (16/10/2026): nenhum vínculo BIP aprovado ainda — 0% é o estado normal no começo, a fila em /admin/vinculos-lip-bip existe pra isso" : null) },
      montarCobertura("mdp_registros", entrada.mdpRegistros, null),
      montarCobertura("mrp_registros", entrada.mrpRegistros, null),
    ],
    mudancas_estruturais: mudancasEstruturais,
    eventos_catalogo_recentes: entrada.eventosCatalogo,
    observacoes_do_slot: [
      "Regularização PED é um slot NOVO (criado em 16/10/2026 como cópia do Slot 1 — Regularização SEI): quase nenhuma massa histórica ainda. Base insuficiente é o padrão aqui, não exceção; declare isso em vez de tratar ausência como anomalia. Nunca use estatística da Regularização SEI como se fosse deste slot.",
      "Regularização PED não tem leitura de documento estruturada (mhd_resultados_campo) — esse mecanismo hoje só existe pro Slot 5.",
      "Observação do MAC deste slot fica em observacoes_por_aba (por grupo/aba), não por item — ver mac.marcacoes_ultima_analise[].observacao no dossiê.",
    ],
  };
}
