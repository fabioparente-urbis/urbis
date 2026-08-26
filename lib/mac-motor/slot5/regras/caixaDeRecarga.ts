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
 * v4 em 2026-08-03 — teste histórico do processo 44353 (TESTE-HIST-44353-AN3) expôs duas falhas
 * reais depois do prompt v2 do ICCAP:
 *   1. o Gemini decidiu o valor de areaImpermeabilizadaMemorial citando uma FÓRMULA simbólica
 *      ("ÁREA IMPERMEABILIZADA (AI) = AT - ACVP") como `trecho`, sem nenhum número documental ao
 *      lado — o prompt pedia transcrição literal, mas nada no código IMPEDIA aceitar um trecho sem
 *      número. Entra `evidenciaMemorialSuficiente()`: sem um número no trecho batendo com o valor
 *      extraído, o item cai para PENDENTE, nunca decide CONFORME/NAO_CONFORME por dedução.
 *   2. o Gemini leu o MESMO valor (1,78) para volumeExigidoCarimbo e volumeProjetadoCarimbo — uma
 *      confusão de linha real —, e a regra anterior nem percebia, porque só usava o LIP quando
 *      presente e ignorava silenciosamente o que o Gemini tinha lido do documento. Agora, quando
 *      LIP e Gemini têm os dois um valor de volume projetado, eles são COMPARADOS: divergência
 *      acima da tolerância vira REVISAO_MANUAL (nunca um CONFORME que esconde a discordância); e
 *      quando só o LIP tem valor (Gemini se absteve/não achou), a justificativa deixa isso
 *      explícito — não se apresenta como confirmação documental.
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
/** v4: guarda de evidência do memorial (nunca CONFORME por fórmula sem número documental) +
 *  cruzamento LIP×Gemini do volume projetado (divergência vira REVISAO_MANUAL, fallback é
 *  explícito na justificativa); v3: camposLip do item VOLUME passa a gravar os 3 campos usados
 *  (era {}); v2: volume exigido usa sempre a área impermeável calculada, nunca a declarada no
 *  memorial. */
export const REGRA_VERSAO_CAIXA_RECARGA = 5;

/** "Para cada 200,00m² de terreno impermeabilizado, atender 1,00m³" — do próprio texto do item MAC. */
export const M2_IMPERMEAVEL_POR_M3_EXIGIDO = 200;
/** Tolerância de engenharia do motor (arredondamento de memorial de cálculo), não citação legal. */
export const TOLERANCIA_AREA_IMPERMEAVEL_M2 = 1.0;
/** Mesmo padrão de TOLERANCIA_ARREDONDAMENTO já usado em lib/rastreabilidade/lipSlot5.ts para m³. */
export const TOLERANCIA_VOLUME_M3 = 0.02;

export type EntradaDecisaoCaixaRecarga = {
  /** área do terreno − área permeável (grama), já calculada no LIP — ver `areaImpermeabilizada`
   * em lib/lerPastaSlot5.ts. A não permeável (concregrama/floreira) não entra nessa subtração:
   * conta como índice paisagístico, não como permeável, e por isso continua impermeável para
   * este cálculo (regra do Fábio, 26/08/2026). Único source of truth: este motor NÃO recalcula
   * terreno−permeável por conta própria — se recalculasse, um valor editado à mão no LIP depois
   * da leitura (ex.: `areaPermeavelProjetada` corrigido manualmente) divergiria do que a caixa de
   * recarga usa, sem ninguém perceber. */
  areaImpermeabilizada: CampoLipCongelado;
  /** m³ — se o LIP já leu do carimbo (doDoc); valorNormalizado null = LIP não leu. */
  volumeDaCaixaDeRecarga: CampoLipCongelado;
  /** resposta do Gemini sobre a prancha (ver prompts.PROMPT_CAIXA_RECARGA). */
  fatos: FatoExtraido[];
};

export type SaidaCaixaDeRecarga = {
  memorial: SaidaRegraItem;
  volume: SaidaRegraItem;
};

/** Rótulo usual do memorial — cobre "IMPERMEABILIZADA"/"IMPERMEABILIZADO" em qualquer grafia. */
const ROTULO_USUAL_MEMORIAL = /IMPERMEABILIZAD/i;

/**
 * Todos os números BR do trecho (mesma tolerância a unidade colada do parser — "356,93 M²" conta),
 * conferidos contra o valor que o Gemini disse ter extraído. Trava o caso real do teste histórico:
 * um `trecho` puramente simbólico ("AI = AT - ACVP") não tem nenhum dígito, então nunca bate aqui,
 * não importa o que o `valor` diga.
 */
function trechoTemNumeroDocumental(trecho: string | null, valorEsperado: number): boolean {
  if (!trecho) return false;
  const candidatos = trecho.match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?/g) ?? [];
  return candidatos.some((c) => {
    const n = parseNumeroBR(c);
    return n !== null && Math.abs(n - valorEsperado) <= TOLERANCIA_AREA_IMPERMEAVEL_M2;
  });
}

/**
 * Guarda determinística: CONFORME/NAO_CONFORME do memorial só acontece com prova concreta — nunca
 * por fórmula genérica sem o número documental ao lado. Rótulo alternativo/ambíguo (qualquer coisa
 * que não contenha "IMPERMEABILIZAD") só é aceito se vier com uma observação não-trivial explicando
 * a expressão documental que o sustenta — é o prompt que instrui o Gemini a preencher essa
 * observação; esta função é onde isso é EXIGIDO, não sugerido.
 */
function evidenciaMemorialSuficiente(
  fato: FatoExtraido,
  valorExtraido: number,
): { ok: true } | { ok: false; motivo: string } {
  if ("abstencao" in fato) return { ok: false, motivo: "fato é uma abstenção" };
  if (!trechoTemNumeroDocumental(fato.trecho, valorExtraido)) {
    return {
      ok: false,
      motivo: `o trecho ("${fato.trecho ?? "vazio"}") não contém o número ${valorExtraido.toFixed(2)} — pode ser uma fórmula ou rótulo genérico sem número documental associado`,
    };
  }
  if (!ROTULO_USUAL_MEMORIAL.test(fato.trecho ?? "")) {
    const observacao = fato.observacao?.trim() ?? "";
    if (observacao.length < 10) {
      return {
        ok: false,
        motivo: `o trecho não usa o rótulo usual ("ÁREA IMPERMEABILIZADA") e não veio observação explicando a expressão documental que sustenta a leitura de um rótulo alternativo`,
      };
    }
  }
  return { ok: true };
}

export function decidirCaixaDeRecarga(entrada: EntradaDecisaoCaixaRecarga): SaidaCaixaDeRecarga {
  // Único source of truth: lido pronto do LIP, nunca recalculado aqui — ver o comentário do tipo.
  const areaImpermeabilizadaCalculada = entrada.areaImpermeabilizada.valorNormalizado;

  const fatoMemorial = buscarFato(entrada.fatos, "areaImpermeabilizadaMemorial");
  const areaImpermeabilizadaMemorial =
    fatoMemorial && !("abstencao" in fatoMemorial) ? parseNumeroBR(fatoMemorial.valor) : null;

  const memorial = decidirMemorial({
    areaImpermeabilizada: entrada.areaImpermeabilizada,
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

  // v4: LIP e Gemini chegam SEPARADOS em decidirVolume — quem cruza os dois (e decide se diverge
  // o bastante para exigir revisão) é a regra, não mais um "??" silencioso aqui.
  const volume = decidirVolume({
    areaImpermeabilizada: entrada.areaImpermeabilizada,
    volumeDaCaixaDeRecarga: entrada.volumeDaCaixaDeRecarga,
    areaImpermeabilizadaEfetiva: areaImpermeabilizadaCalculada,
    volumeProjetadoLip: entrada.volumeDaCaixaDeRecarga.valorNormalizado,
    volumeProjetadoGemini,
    volumeExigidoCarimbo,
    fatoVolumeProjetado,
    fatoVolumeExigidoCarimbo,
    fatoMemorial,
  });

  return { memorial: comGuardaDeConfianca(memorial), volume: comGuardaDeConfianca(volume) };
}

function decidirMemorial(p: {
  areaImpermeabilizada: CampoLipCongelado;
  areaImpermeabilizadaCalculada: number | null;
  fatoMemorial: FatoExtraido | undefined;
  areaImpermeabilizadaMemorial: number | null;
}): SaidaRegraItem {
  const base = {
    macItemId: MAC_ITEM_CAIXA_RECARGA_MEMORIAL,
    regraId: REGRA_ID_CAIXA_RECARGA,
    regraVersao: REGRA_VERSAO_CAIXA_RECARGA,
    camposLip: { areaImpermeabilizada: p.areaImpermeabilizada },
    fatosUsados: p.fatoMemorial ? [p.fatoMemorial] : [],
  };

  if (p.areaImpermeabilizadaCalculada === null) {
    return {
      ...base,
      aplicabilidade: "INDETERMINADO",
      resultado: "NAO_AVALIADO",
      confianca: null,
      justificativa: "área impermeabilizada ainda não foi calculada pelo LIP (depende de areaTerreno e areaPermeavelProjetada) — motor não pode conferir a fórmula do item.",
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

  const evidencia = evidenciaMemorialSuficiente(p.fatoMemorial, p.areaImpermeabilizadaMemorial);
  if (!evidencia.ok) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "PENDENTE",
      confianca: null,
      justificativa: `item é aplicável e o motor leu ${p.areaImpermeabilizadaMemorial.toFixed(2)} m² para a área impermeabilizada, mas a evidência documental é insuficiente para decidir automaticamente: ${evidencia.motivo}. Calculada pela fórmula (terreno − permeável): ${p.areaImpermeabilizadaCalculada.toFixed(2)} m². Exige revisão humana antes de decidir.`,
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
  areaImpermeabilizada: CampoLipCongelado;
  volumeDaCaixaDeRecarga: CampoLipCongelado;
  areaImpermeabilizadaEfetiva: number | null;
  /** volume "ATENDIDO/PROJETADO" do LIP (processos.dados) — pode ser null. */
  volumeProjetadoLip: number | null;
  /** volume "ATENDIDO/PROJETADO" lido pelo Gemini do carimbo — pode ser null (absteve-se/não achou). */
  volumeProjetadoGemini: number | null;
  volumeExigidoCarimbo: number | null;
  fatoVolumeProjetado: FatoExtraido | undefined;
  fatoVolumeExigidoCarimbo: FatoExtraido | undefined;
  fatoMemorial: FatoExtraido | undefined;
}): SaidaRegraItem {
  const fatosUsados = [p.fatoVolumeProjetado, p.fatoVolumeExigidoCarimbo, p.fatoMemorial].filter(
    (f): f is FatoExtraido => !!f,
  );
  const base = {
    macItemId: MAC_ITEM_CAIXA_RECARGA_VOLUME,
    regraId: REGRA_ID_CAIXA_RECARGA,
    regraVersao: REGRA_VERSAO_CAIXA_RECARGA,
    // os campos do LIP EFETIVAMENTE usados por este item — correção de revisão independente,
    // antes gravava {} apesar de depender deles.
    camposLip: { areaImpermeabilizada: p.areaImpermeabilizada, volumeDaCaixaDeRecarga: p.volumeDaCaixaDeRecarga },
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

  // v4 — cruzamento LIP × Gemini do volume PROJETADO/ATENDIDO. Antes, um "??" silencioso descartava
  // a leitura do Gemini sempre que o LIP tinha valor — se o Gemini tivesse lido algo DIVERGENTE
  // (confundido EXIGIDO com ATENDIDO, por exemplo), ninguém percebia. Agora: os dois presentes e
  // divergentes → REVISAO_MANUAL, com os dois valores citados; só o LIP presente → segue, mas a
  // justificativa deixa explícito que não houve confirmação documental (não é o mesmo que "Gemini
  // confirmou"); só o Gemini presente → usa a leitura documental, LIP não tinha o dado.
  let volumeProjetadoEfetivo: number | null;
  let origemVolumeProjetado: string;
  let confirmadoDocumentalmente: boolean;

  if (p.volumeProjetadoLip !== null && p.volumeProjetadoGemini !== null) {
    const diffProjetado = Math.abs(p.volumeProjetadoLip - p.volumeProjetadoGemini);
    if (diffProjetado > TOLERANCIA_VOLUME_M3) {
      return {
        ...base,
        aplicabilidade: "APLICAVEL",
        resultado: "REVISAO_MANUAL",
        confianca: "BAIXA",
        justificativa: `LIP declara volume projetado ${p.volumeProjetadoLip.toFixed(2)} m³, mas a leitura do carimbo pelo Gemini encontrou ${p.volumeProjetadoGemini.toFixed(2)} m³ para a mesma linha (diferença ${diffProjetado.toFixed(2)} m³, acima da tolerância de ${TOLERANCIA_VOLUME_M3} m³) — LIP e documento divergem, exige revisão humana antes de decidir. Ambos os valores e evidências preservados.`,
        requerRevisao: true,
      };
    }
    volumeProjetadoEfetivo = p.volumeProjetadoLip;
    origemVolumeProjetado = `LIP ${p.volumeProjetadoLip.toFixed(2)} m³, confirmado pela leitura documental do Gemini (${p.volumeProjetadoGemini.toFixed(2)} m³)`;
    confirmadoDocumentalmente = true;
  } else if (p.volumeProjetadoLip !== null) {
    volumeProjetadoEfetivo = p.volumeProjetadoLip;
    origemVolumeProjetado = `apenas o LIP (${p.volumeProjetadoLip.toFixed(2)} m³) — motor NÃO confirmou documentalmente; Gemini se absteve ou não encontrou a linha ATENDIDO/PROJETADO no carimbo`;
    confirmadoDocumentalmente = false;
  } else if (p.volumeProjetadoGemini !== null) {
    volumeProjetadoEfetivo = p.volumeProjetadoGemini;
    origemVolumeProjetado = `leitura documental do Gemini (${p.volumeProjetadoGemini.toFixed(2)} m³) — LIP não tem o valor`;
    confirmadoDocumentalmente = true;
  } else {
    volumeProjetadoEfetivo = null;
    origemVolumeProjetado = "nenhuma fonte (nem LIP, nem Gemini) trouxe o volume projetado";
    confirmadoDocumentalmente = false;
  }

  if (volumeProjetadoEfetivo === null) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "PENDENTE",
      confianca: null,
      justificativa: `volume exigido calculado: ${volumeExigidoCalculado.toFixed(2)} m³ (área impermeabilizada ${p.areaImpermeabilizadaEfetiva.toFixed(2)} m² ÷ ${M2_IMPERMEAVEL_POR_M3_EXIGIDO} m²/m³), mas o volume projetado não foi lido (${origemVolumeProjetado}).`,
      requerRevisao: true,
    };
  }

  const confiancaFatos = confiancaMinima(fatosUsados) ?? "MEDIA";
  // fallback puro pro LIP (sem confirmação do Gemini) nunca sai como ALTA — a leitura documental
  // não corroborou, então a confiança tem que refletir isso, mesmo que os outros fatos usados
  // (ex.: o memorial) tenham confiança alta.
  const confianca: Confianca = contradicaoExigido
    ? "BAIXA"
    : !confirmadoDocumentalmente && confiancaFatos === "ALTA"
      ? "MEDIA"
      : confiancaFatos;
  const atende = volumeProjetadoEfetivo >= volumeExigidoCalculado - TOLERANCIA_VOLUME_M3;

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
    justificativa: `volume projetado ${volumeProjetadoEfetivo.toFixed(2)} m³ (${origemVolumeProjetado}) × exigido ${volumeExigidoCalculado.toFixed(2)} m³ (área impermeabilizada ${p.areaImpermeabilizadaEfetiva.toFixed(2)} m² ÷ ${M2_IMPERMEAVEL_POR_M3_EXIGIDO} m²/m³) — ${atende ? "atende" : "não atende"} (tolerância ${TOLERANCIA_VOLUME_M3} m³).`,
    requerRevisao: false,
  };
}
