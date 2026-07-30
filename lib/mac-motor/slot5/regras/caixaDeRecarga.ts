/**
 * lib/mac-motor/slot5/regras/caixaDeRecarga.ts — arquétipo 2: caixa de recarga / ICCAP.
 *
 * Dois itens MAC reais e acoplados (mesma cadeia de cálculo, mesmo recorte de prancha),
 * confirmados no banco em 2026-07-30, ambos PARCIALMENTE_AUTOMATIZAVEL, modelo PADRÃO —
 * APROVAÇÃO DE PROJETO (assunto_id 78e2f7bb-7d9e-4b66-a6b8-1fd8418361f3):
 *
 *   MEMORIAL (971cc08c-cbc1-4bff-b16c-a19aed12a825) — grupo INDICE PAISAGÍSTICO...:
 *     "Atender o Índice de Controle e Captação de Água Pluvial conforme Art. 300 da LC 349/2022;
 *      REVER MEMORIAL DE CÁLCULO DA CAIXA DE RECARGA: Área Impermeabilizada = área do terreno -
 *      área permeável" — confere se o memorial usa a fórmula certa.
 *
 *   VOLUME (34abc7ef-34c7-4d08-96a0-faf10b548609) — mesmo grupo:
 *     "Para cada 200,00m² de terreno impermeabilizado, atender 1,00m³ de caixa de recarga e/ou
 *      caixa de retenção" — confere se o volume projetado atende o exigido pela área impermeável.
 *
 * v3 em 2026-07-30 — segunda rodada de correções de revisão independente: os 3 campos do LIP
 * chegam como CampoLipCongelado (valor bruto + normalizado + origem de processos.dados), não mais
 * números soltos — e os DOIS itens gravam em `camposLip` todos os campos que efetivamente usaram
 * (antes o item VOLUME gravava `{}`, apesar de depender de areaTerreno/areaPermeavelProjetada/
 * volumeDaCaixaDeRecarga).
 *
 * v2 (mesma rodada anterior): volume exigido usa SEMPRE a área impermeável calculada
 * (terreno−permeável), nunca a declarada no memorial — evita que um memorial errado se
 * auto-aprove (o cálculo do exigido usaria o mesmo erro que o item MEMORIAL está conferindo).
 *
 * `areaTerreno.valorNormalizado`/`areaPermeavelProjetada.valorNormalizado`/
 * `volumeDaCaixaDeRecarga.valorNormalizado` são o LIP: campos `areaTerreno`,
 * `areaPermeavelProjetada`, `volumeDaCaixaDeRecarga` de lib/rastreabilidade/lipSlot5.ts (doDoc,
 * fonte PRANCHA/carimbo — já automáticos hoje quando o carimbo traz o rótulo).
 * `areaImpermeabilizada` do LIP é `porVisao` (grupo C, ainda não implementado) — por isso o motor
 * lê por conta própria via Gemini quando o LIP não tiver o valor.
 */

import type { CampoLipCongelado, Confianca, FatoExtraido, SaidaRegraItem } from "../tipos";
import { buscarFato, comGuardaDeConfianca, confiancaBucket, confiancaMinima, parseNumeroBR } from "../util";

export const MAC_ITEM_CAIXA_RECARGA_MEMORIAL = "971cc08c-cbc1-4bff-b16c-a19aed12a825";
export const MAC_ITEM_CAIXA_RECARGA_VOLUME = "34abc7ef-34c7-4d08-96a0-faf10b548609";
export const REGRA_ID_CAIXA_RECARGA = "slot5.caixaDeRecarga";
/** v3: camposLip do item VOLUME passa a gravar os 3 campos usados (era {}); v2: volume exigido
 *  usa sempre a área impermeável calculada, nunca a declarada no memorial. */
export const REGRA_VERSAO_CAIXA_RECARGA = 3;

/** "Para cada 200,00m² de terreno impermeabilizado, atender 1,00m³" — do próprio texto do item MAC. */
export const M2_IMPERMEAVEL_POR_M3_EXIGIDO = 200;
/** Tolerância de engenharia do motor (arredondamento de memorial de cálculo), não citação legal. */
export const TOLERANCIA_AREA_IMPERMEAVEL_M2 = 1.0;
/** Mesmo padrão de TOLERANCIA_ARREDONDAMENTO já usado em lib/rastreabilidade/lipSlot5.ts para m³. */
export const TOLERANCIA_VOLUME_M3 = 0.02;

export type EntradaDecisaoCaixaRecarga = {
  areaTerreno: CampoLipCongelado;
  areaPermeavelProjetada: CampoLipCongelado;
  /** m³ — se o LIP já leu do carimbo (doDoc); valorNormalizado null = LIP não leu. */
  volumeDaCaixaDeRecarga: CampoLipCongelado;
  /** resposta do Gemini sobre a prancha (ver prompts.PROMPT_CAIXA_RECARGA). */
  fatos: FatoExtraido[];
};

export type SaidaCaixaDeRecarga = {
  memorial: SaidaRegraItem;
  volume: SaidaRegraItem;
};

export function decidirCaixaDeRecarga(entrada: EntradaDecisaoCaixaRecarga): SaidaCaixaDeRecarga {
  const areaTerrenoLip = entrada.areaTerreno.valorNormalizado;
  const areaPermeavelProjetadaLip = entrada.areaPermeavelProjetada.valorNormalizado;

  const areaImpermeabilizadaCalculada =
    areaTerrenoLip !== null && areaPermeavelProjetadaLip !== null ? areaTerrenoLip - areaPermeavelProjetadaLip : null;

  const fatoMemorial = buscarFato(entrada.fatos, "areaImpermeabilizadaMemorial");
  const areaImpermeabilizadaMemorial =
    fatoMemorial && !("abstencao" in fatoMemorial) ? parseNumeroBR(fatoMemorial.valor) : null;

  const memorial = decidirMemorial({
    areaTerreno: entrada.areaTerreno,
    areaPermeavelProjetada: entrada.areaPermeavelProjetada,
    areaImpermeabilizadaCalculada,
    fatoMemorial,
    areaImpermeabilizadaMemorial,
  });

  const fatoVolumeProjetado = buscarFato(entrada.fatos, "volumeProjetadoCarimbo");
  const volumeProjetadoGemini =
    fatoVolumeProjetado && !("abstencao" in fatoVolumeProjetado) ? parseNumeroBR(fatoVolumeProjetado.valor) : null;
  const fatoVolumeExigidoCarimbo = buscarFato(entrada.fatos, "volumeExigidoCarimbo");
  const volumeExigidoCarimbo =
    fatoVolumeExigidoCarimbo && !("abstencao" in fatoVolumeExigidoCarimbo) ? parseNumeroBR(fatoVolumeExigidoCarimbo.valor) : null;

  // área impermeável para calcular o volume exigido: SEMPRE a calculada de forma independente
  // (terreno − permeável, dois campos do LIP), NUNCA o valor que o memorial declara — ver v2 no
  // cabeçalho do arquivo.
  const volumeProjetadoEfetivo = entrada.volumeDaCaixaDeRecarga.valorNormalizado ?? volumeProjetadoGemini;

  const volume = decidirVolume({
    areaTerreno: entrada.areaTerreno,
    areaPermeavelProjetada: entrada.areaPermeavelProjetada,
    volumeDaCaixaDeRecarga: entrada.volumeDaCaixaDeRecarga,
    areaImpermeabilizadaEfetiva: areaImpermeabilizadaCalculada,
    volumeProjetadoEfetivo,
    volumeExigidoCarimbo,
    fatoVolumeProjetado,
    fatoMemorial,
  });

  return { memorial: comGuardaDeConfianca(memorial), volume: comGuardaDeConfianca(volume) };
}

function decidirMemorial(p: {
  areaTerreno: CampoLipCongelado;
  areaPermeavelProjetada: CampoLipCongelado;
  areaImpermeabilizadaCalculada: number | null;
  fatoMemorial: FatoExtraido | undefined;
  areaImpermeabilizadaMemorial: number | null;
}): SaidaRegraItem {
  const base = {
    macItemId: MAC_ITEM_CAIXA_RECARGA_MEMORIAL,
    regraId: REGRA_ID_CAIXA_RECARGA,
    regraVersao: REGRA_VERSAO_CAIXA_RECARGA,
    camposLip: { areaTerreno: p.areaTerreno, areaPermeavelProjetada: p.areaPermeavelProjetada },
    fatosUsados: p.fatoMemorial ? [p.fatoMemorial] : [],
  };

  if (p.areaImpermeabilizadaCalculada === null) {
    return {
      ...base,
      aplicabilidade: "INDETERMINADO",
      resultado: "NAO_AVALIADO",
      confianca: null,
      justificativa: "área do terreno e/ou área permeável projetada ainda não foram lidas pelo LIP — motor não pode calcular a área impermeabilizada exigida pela fórmula do item.",
      requerRevisao: true,
    };
  }
  if (!p.fatoMemorial || "abstencao" in p.fatoMemorial || p.areaImpermeabilizadaMemorial === null) {
    const motivo = p.fatoMemorial && "abstencao" in p.fatoMemorial ? p.fatoMemorial.motivo : "memorial não retornou o valor";
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "PENDENTE",
      confianca: null,
      justificativa: `item é aplicável, mas a área impermeabilizada declarada no memorial não pôde ser lida: ${motivo}. Calculada pela fórmula (terreno − permeável): ${p.areaImpermeabilizadaCalculada.toFixed(2)} m².`,
      requerRevisao: true,
    };
  }

  const diff = Math.abs(p.areaImpermeabilizadaCalculada - p.areaImpermeabilizadaMemorial);
  const confianca = confiancaBucket((p.fatoMemorial as any).confianca);
  if (diff <= TOLERANCIA_AREA_IMPERMEAVEL_M2) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "CONFORME",
      confianca,
      justificativa: `memorial usa a fórmula correta: área impermeabilizada declarada ${p.areaImpermeabilizadaMemorial.toFixed(2)} m² × calculada (terreno − permeável) ${p.areaImpermeabilizadaCalculada.toFixed(2)} m² (diferença ${diff.toFixed(2)} m², dentro da tolerância de ${TOLERANCIA_AREA_IMPERMEAVEL_M2} m²).`,
      requerRevisao: false,
    };
  }
  return {
    ...base,
    aplicabilidade: "APLICAVEL",
    resultado: "NAO_CONFORME",
    confianca,
    justificativa: `memorial diverge da fórmula do item: declarado ${p.areaImpermeabilizadaMemorial.toFixed(2)} m² × calculado (terreno − permeável) ${p.areaImpermeabilizadaCalculada.toFixed(2)} m² (diferença ${diff.toFixed(2)} m², acima da tolerância de ${TOLERANCIA_AREA_IMPERMEAVEL_M2} m²).`,
    requerRevisao: false,
  };
}

function decidirVolume(p: {
  areaTerreno: CampoLipCongelado;
  areaPermeavelProjetada: CampoLipCongelado;
  volumeDaCaixaDeRecarga: CampoLipCongelado;
  areaImpermeabilizadaEfetiva: number | null;
  volumeProjetadoEfetivo: number | null;
  volumeExigidoCarimbo: number | null;
  fatoVolumeProjetado: FatoExtraido | undefined;
  fatoMemorial: FatoExtraido | undefined;
}): SaidaRegraItem {
  const fatosUsados = [p.fatoVolumeProjetado, p.fatoMemorial].filter((f): f is FatoExtraido => !!f);
  const base = {
    macItemId: MAC_ITEM_CAIXA_RECARGA_VOLUME,
    regraId: REGRA_ID_CAIXA_RECARGA,
    regraVersao: REGRA_VERSAO_CAIXA_RECARGA,
    // os 3 campos do LIP EFETIVAMENTE usados por este item — correção de revisão independente,
    // antes gravava {} apesar de depender dos três.
    camposLip: { areaTerreno: p.areaTerreno, areaPermeavelProjetada: p.areaPermeavelProjetada, volumeDaCaixaDeRecarga: p.volumeDaCaixaDeRecarga },
    fatosUsados,
  };

  if (p.areaImpermeabilizadaEfetiva === null) {
    return {
      ...base,
      aplicabilidade: "INDETERMINADO",
      resultado: "NAO_AVALIADO",
      confianca: null,
      justificativa: "área impermeabilizada não disponível (nem memorial, nem cálculo terreno−permeável) — motor não pode calcular o volume exigido.",
      requerRevisao: true,
    };
  }

  const volumeExigidoCalculado = p.areaImpermeabilizadaEfetiva / M2_IMPERMEAVEL_POR_M3_EXIGIDO;

  // checagem de coerência: se o carimbo também declara um EXIGIDO, e ele diverge muito do
  // calculado, é contradição — regra 8 do usuário: contradição nunca vira CONFORME silencioso.
  const contradicaoExigido =
    p.volumeExigidoCarimbo !== null && Math.abs(p.volumeExigidoCarimbo - volumeExigidoCalculado) > TOLERANCIA_VOLUME_M3 * 10;

  if (p.volumeProjetadoEfetivo === null) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "PENDENTE",
      confianca: null,
      justificativa: `volume exigido calculado: ${volumeExigidoCalculado.toFixed(2)} m³ (área impermeabilizada ${p.areaImpermeabilizadaEfetiva.toFixed(2)} m² ÷ ${M2_IMPERMEAVEL_POR_M3_EXIGIDO} m²/m³), mas o volume projetado não foi lido (nem pelo LIP, nem pelo motor).`,
      requerRevisao: true,
    };
  }

  const confiancaFatos = confiancaMinima(fatosUsados) ?? "MEDIA";
  const confianca: Confianca = contradicaoExigido ? "BAIXA" : confiancaFatos;
  const atende = p.volumeProjetadoEfetivo >= volumeExigidoCalculado - TOLERANCIA_VOLUME_M3;

  if (contradicaoExigido) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "REVISAO_MANUAL",
      confianca,
      justificativa: `contradição: carimbo declara EXIGIDO ${p.volumeExigidoCarimbo!.toFixed(2)} m³, mas a fórmula do item (área impermeável ${p.areaImpermeabilizadaEfetiva.toFixed(2)} m² ÷ ${M2_IMPERMEAVEL_POR_M3_EXIGIDO}) dá ${volumeExigidoCalculado.toFixed(2)} m³ — exige revisão humana antes de decidir.`,
      requerRevisao: true,
    };
  }

  return {
    ...base,
    aplicabilidade: "APLICAVEL",
    resultado: atende ? "CONFORME" : "NAO_CONFORME",
    confianca,
    justificativa: `volume projetado ${p.volumeProjetadoEfetivo.toFixed(2)} m³ × exigido ${volumeExigidoCalculado.toFixed(2)} m³ (área impermeabilizada ${p.areaImpermeabilizadaEfetiva.toFixed(2)} m² ÷ ${M2_IMPERMEAVEL_POR_M3_EXIGIDO} m²/m³) — ${atende ? "atende" : "não atende"} (tolerância ${TOLERANCIA_VOLUME_M3} m³).`,
    requerRevisao: false,
  };
}
