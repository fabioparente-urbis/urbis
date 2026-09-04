/**
 * lib/urbi/manifestoFontes.ts — Fase AB da Inteligência URBIS (04/09/2026): manifesto de fontes
 * do dossiê, calculado inteiramente em CÓDIGO a partir do mesmo recorte que foi enviado ao
 * Gemini — nunca depende do texto de resposta do modelo. É a parte "verificável sem confiar
 * cegamente" do contrato de resposta (ver lib/urbi/contratoResposta.ts): mesmo que a prosa do
 * Gemini esteja errada ou incompleta, o manifesto mostra o que realmente foi carregado, direto
 * do backend, pro analista conferir.
 *
 * Biblioteca pura (sem rede, sem banco): recebe contagens já apuradas por quem monta o dossiê
 * (app/api/urbi/chat/route.ts) e devolve uma lista curta, em linguagem humana — nunca UUID,
 * chave interna ou nome de tabela/coluna.
 */

export type FonteManifesto = { tipo: string; detalhe: string };

export type ManifestoFontes = {
  processo: string;
  slot: string | null;
  nome_slot: string;
  fontes: FonteManifesto[];
  cobertura_completa: boolean;
  fontes_indisponiveis: string[];
};

export type EntradaManifesto = {
  codigo: string;
  slot: string | null;
  nomeSlot: string;
  camposTecnicos: number;
  camposVazios: number;
  camposEmX: number;
  historicoLipTotal: number;
  historicoLipMostrado: number;
  numeroAnalises: number;
  numeroUltimaAnalise: number | null;
  pendenciasTotal: number;
  pendenciasMostradas: number;
  itensEmBrancoTotal: number;
  itensEmBrancoMostrados: number;
  itensChecklistTotal: number;
  evolucaoCorrigidosTotal: number;
  evolucaoCorrigidosMostrados: number;
  evolucaoVoltaramTotal: number;
  evolucaoVoltaramMostrados: number;
  evolucaoMantidosTotal: number;
  evolucaoMantidosMostrados: number;
  cruzamentosTotal: number;
  cruzamentosMostrados: number;
  /** Referências do BIP já vinculadas E aprovadas, dedupe, na ordem em que apareceram — só das
   *  pendências que de fato foram enviadas ao modelo (nunca do dossiê inteiro não recortado). */
  referenciasBip: string[];
  documentosEmitidos: number;
  documentosMhd: number;
  coberturaCompleta: boolean;
  fontesIndisponiveis: string[];
};

/** "(mostrando X de Y)" só quando o recorte cortou algo real — nunca aparece quando mostrado===total. */
function parcial(total: number, mostrado: number): string {
  return total > mostrado ? ` (mostrando ${mostrado} de ${total})` : "";
}

export function montarManifestoFontes(e: EntradaManifesto): ManifestoFontes {
  const fontes: FonteManifesto[] = [];

  if (e.camposTecnicos > 0 || e.camposVazios > 0 || e.camposEmX > 0) {
    fontes.push({
      tipo: "LIP",
      detalhe: `${e.camposTecnicos} campo(s) técnico(s) preenchido(s), ${e.camposVazios} vazio(s), ${e.camposEmX} em X`,
    });
  }
  if (e.historicoLipTotal > 0) {
    fontes.push({
      tipo: "LIP",
      detalhe: `${e.historicoLipMostrado} registro(s) de alteração recente de campo${parcial(e.historicoLipTotal, e.historicoLipMostrado)}`,
    });
  }
  if (e.numeroAnalises > 0) {
    fontes.push({
      tipo: "MAC",
      detalhe: `análise nº ${e.numeroUltimaAnalise ?? "?"} de ${e.numeroAnalises} — ${e.pendenciasMostradas} pendência(s)${parcial(e.pendenciasTotal, e.pendenciasMostradas)}, ${e.itensEmBrancoMostrados} item(ns) em branco${parcial(e.itensEmBrancoTotal, e.itensEmBrancoMostrados)} de ${e.itensChecklistTotal} no checklist`,
    });
  }
  if (e.evolucaoCorrigidosTotal || e.evolucaoVoltaramTotal || e.evolucaoMantidosTotal) {
    fontes.push({
      tipo: "MAC",
      detalhe: `evolução entre passadas: ${e.evolucaoCorrigidosMostrados} corrigido(s)${parcial(e.evolucaoCorrigidosTotal, e.evolucaoCorrigidosMostrados)}, ${e.evolucaoVoltaramMostrados} voltou/voltaram a não conforme${parcial(e.evolucaoVoltaramTotal, e.evolucaoVoltaramMostrados)}, ${e.evolucaoMantidosMostrados} mantido(s) pendente(s)${parcial(e.evolucaoMantidosTotal, e.evolucaoMantidosMostrados)}`,
    });
  }
  if (e.cruzamentosTotal > 0) {
    fontes.push({
      tipo: "Cruzamento LIP × MAC × BIP",
      detalhe: `${e.cruzamentosMostrados} ponto(s) de divergência ou ausência de base jurídica${parcial(e.cruzamentosTotal, e.cruzamentosMostrados)}`,
    });
  }
  if (e.referenciasBip.length > 0) {
    const amostra = e.referenciasBip.slice(0, 5).join("; ");
    fontes.push({
      tipo: "BIP",
      detalhe: `${e.referenciasBip.length} referência(s) legal(is) vinculada(s) e aprovada(s): ${amostra}${e.referenciasBip.length > 5 ? "…" : ""}`,
    });
  }
  if (e.documentosEmitidos > 0 || e.documentosMhd > 0) {
    fontes.push({
      tipo: "Documentos",
      detalhe: `${e.documentosEmitidos} documento(s) emitido(s) neste processo, ${e.documentosMhd} documento(s) recebido(s) (MHD)`,
    });
  }

  return {
    processo: e.codigo,
    slot: e.slot,
    nome_slot: e.nomeSlot,
    fontes,
    cobertura_completa: e.coberturaCompleta,
    fontes_indisponiveis: e.fontesIndisponiveis,
  };
}
