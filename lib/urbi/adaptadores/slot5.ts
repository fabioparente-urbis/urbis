import { montarCobertura, detectarMudancasEstruturais } from "./catalogo";
import type { DossieTecnicoSlot } from "./tipos";
import type { EntradaAdaptador } from "./entrada";

/**
 * Adaptador de leitura — Aprovação de Projeto (Slot 5). Só leitura; não conecta o motor piloto
 * experimental (lib/mac-motor/slot5/experimental/) nem interpretação visual por página/região
 * (mhd_interpretacoes_visao) — isso é Fase G, fora do escopo desta rodada por instrução
 * explícita. Usa mhd_resultados_campo (Fase B) como fonte de leitura de documento, que é o
 * único slot com massa real nessa tabela hoje (auditoria de 03/09/2026: 3 de 3 processos
 * ativos amostrados tinham dado vigente; Regularização e Aceite SEI, zero).
 */
export function montarDossieTecnicoSlot5(entrada: EntradaAdaptador): DossieTecnicoSlot {
  const mudancasEstruturais = detectarMudancasEstruturais(entrada.historicoMac, entrada.itemAtualPorId);

  return {
    slot: "slot_05",
    nome_slot: "Aprovação de Projeto",
    catalogo: {
      quantidade_itens_ativos_agora: entrada.itensAtivosNoModelo,
      fonte: "mac_checklist_itens",
      observacao: "Lido ao vivo do banco a cada dossiê — nunca uma lista fixa. O modelo do Slot 5 tem centenas de itens; consulta em lote (ver selecionarEmLotes) pra não estourar limite de URL do PostgREST.",
    },
    coberturas: [
      montarCobertura("mac_historico (evolução entre passadas)", entrada.historicoMac, null),
      montarCobertura("mhd_resultados_campo (leitura de documento)", entrada.resultadosDocumento, entrada.erroResultadosDocumento),
      { fonte: "mac_bip_vinculos (vínculo aprovado)", disponivel: entrada.itensComVinculoBipAprovado > 0, quantidade: entrada.itensComVinculoBipAprovado, motivo_ausencia: entrada.erroCoberturaBip },
      montarCobertura("mdp_registros", entrada.mdpRegistros, null),
      montarCobertura("mrp_registros", entrada.mrpRegistros, null),
    ],
    mudancas_estruturais: mudancasEstruturais,
    eventos_catalogo_recentes: entrada.eventosCatalogo,
    observacoes_do_slot: [
      "Slot 5 é o único com leitura de documento estruturada (mhd_resultados_campo) hoje — cruzamento LIP×documento (Fase B) só produz resultado real aqui, nos outros 2 slots fica vazio (não é erro, é ausência real de fonte).",
      "Cobertura BIP historicamente alta (~85% dos itens ativos, auditoria de 03/09/2026) — ausência de vínculo num item específico deste processo é mais provável ser exceção real do que padrão do slot, diferente de Regularização/Aceite.",
      "Observação do MAC deste slot fica em observacoes_por_item (por item do checklist), não por aba.",
      "Leitura visual por página/região (mhd_interpretacoes_visao) e o motor piloto experimental não entram aqui de propósito — fora do escopo desta fase.",
    ],
  };
}
