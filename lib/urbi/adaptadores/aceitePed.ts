import { montarCobertura, detectarMudancasEstruturais } from "./catalogo";
import type { DossieTecnicoSlot } from "./tipos";
import type { EntradaAdaptador } from "./entrada";

/**
 * Adaptador de leitura — Aceite PED (Slot 4). CÓPIA POR LEITURA do adaptador do Slot 2
 * (`./aceiteSei.ts`), 16/10/2026. Somente leitura. As notas de calibração do Slot 2 (auditoria
 * de 03/09/2026) NÃO foram copiadas: eram fatos do histórico do Aceite SEI e não valem para um
 * slot recém-criado — trocadas pelo que é verdade aqui.
 */
export function montarDossieTecnicoAceitePed(entrada: EntradaAdaptador): DossieTecnicoSlot {
  const mudancasEstruturais = detectarMudancasEstruturais(entrada.historicoMac, entrada.itemAtualPorId);

  return {
    slot: "slot_04",
    nome_slot: "Aceite PED",
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
      "Aceite PED é um slot NOVO (criado em 16/10/2026 como cópia do Slot 2 — Aceite SEI): quase nenhuma massa histórica ainda. Base insuficiente é o padrão aqui, não exceção; declare isso em vez de tratar ausência como anomalia. Nunca use estatística do Aceite SEI como se fosse deste slot.",
      "Aceite PED não tem leitura de documento estruturada (mhd_resultados_campo) — mecanismo hoje só existe pro Slot 5.",
      "mac_historico deste assunto pode conter linha de nota livre de verificação de marco temporal (checklist_item_id nulo) — já filtrada antes de chegar em evolução/mudança estrutural, não precisa desconfiar dela aqui.",
      "Observação do MAC deste slot fica em observacoes_por_aba (por grupo/aba), não por item.",
    ],
  };
}
