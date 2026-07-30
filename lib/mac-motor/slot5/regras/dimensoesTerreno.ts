/**
 * lib/mac-motor/slot5/regras/dimensoesTerreno.ts — arquétipo 1: compatibilização das dimensões
 * e área do terreno entre a planta (projeto) e a Certidão de Matrícula.
 *
 * MAC item: 9086573b-14cc-45f9-9769-eb88f8ab5d0d, grupo "PLANTA DE SITUAÇÃO" —
 *   "Compatibilizar a área e as dimensões do terreno com o documento de propriedade do imóvel"
 * (modelo PADRÃO — APROVAÇÃO DE PROJETO, assunto_id 78e2f7bb-7d9e-4b66-a6b8-1fd8418361f3).
 *
 * v3 em 2026-07-30 — segunda rodada de correções de revisão independente:
 *   - CONFORME automático agora exige as 5 medidas comparáveis (área + frente + fundo + lateral
 *     esquerda + lateral direita, nos dois documentos) TODAS dentro da tolerância. Faltar
 *     qualquer uma das 4 dimensões (não só "nenhuma") já força REVISAO_MANUAL. Terrenos
 *     irregulares ou com mais de 4 lados também ficam em revisão nesta versão — o motor não tem
 *     como comparar um 5º lado, então cai no mesmo caminho de "faltou dimensão".
 *   - `areaTerreno` chega como CampoLipCongelado (valor bruto + normalizado + origem, de
 *     processos.dados), não mais um número solto — e é isso que vai para `camposLip`.
 *
 * v2 (mesmo dia, rodada anterior) trocou a tolerância de 1% inventada por 0,02 (mesmo padrão de
 * lib/rastreabilidade/lipSlot5.ts) e passou a comparar dimensões, não só área.
 *
 * `areaTerreno.valorNormalizado` é o LIP: `areaTerreno` (lib/rastreabilidade/lipSlot5.ts, doDoc,
 * fonte PRANCHA, carimbo) — usado como o lado "planta" da área quando disponível; cai para a
 * leitura do Gemini só se o LIP não tiver o valor. As dimensões de perímetro não têm equivalente
 * no LIP hoje (grupo C, não implementado) — vêm inteiramente da leitura própria deste motor.
 */

import type { CampoLipCongelado, Confianca, FatoExtraido, SaidaRegraItem } from "../tipos";
import { comGuardaDeConfianca, confiancaMinima, fatoNumerico } from "../util";

export const MAC_ITEM_DIMENSOES_TERRENO = "9086573b-14cc-45f9-9769-eb88f8ab5d0d";
export const REGRA_ID_DIMENSOES_TERRENO = "slot5.dimensoesTerreno";
export const REGRA_VERSAO_DIMENSOES_TERRENO = 3;

/** Mesma tolerância de arredondamento já usada em lib/rastreabilidade/lipSlot5.ts (não inventada aqui). */
export const TOLERANCIA_ARREDONDAMENTO = 0.02;

const MEDIDAS = ["area", "frente", "fundo", "lateralEsquerda", "lateralDireita"] as const;
type MedidaNome = (typeof MEDIDAS)[number];
/** As 4 dimensões de perímetro obrigatórias para um CONFORME automático — área não conta aqui. */
const DIMENSOES_OBRIGATORIAS = MEDIDAS.filter((m) => m !== "area");

type ComparacaoMedida = {
  medida: MedidaNome;
  planta: number | null;
  certidao: number | null;
  comparavel: boolean;
  dentroDaTolerancia: boolean | null;
  diferenca: number | null;
};

function compararMedidas(fatos: FatoExtraido[], areaTerrenoLip: number | null): ComparacaoMedida[] {
  return MEDIDAS.map((medida) => {
    const planta = medida === "area" && areaTerrenoLip !== null ? areaTerrenoLip : fatoNumerico(fatos, `${medida}:planta`);
    const certidao = fatoNumerico(fatos, `${medida}:certidao`);
    const comparavel = planta !== null && certidao !== null;
    const diferenca = comparavel ? Math.abs(planta! - certidao!) : null;
    return { medida, planta, certidao, comparavel, diferenca, dentroDaTolerancia: comparavel ? diferenca! <= TOLERANCIA_ARREDONDAMENTO : null };
  });
}

const fmt = (n: number | null) => (n === null ? "?" : n.toFixed(2));

export type EntradaDecisaoDimensoesTerreno = {
  /** LIP `areaTerreno` congelado (valor bruto, normalizado e origem de processos.dados). */
  areaTerreno: CampoLipCongelado;
  /** resposta do Gemini sobre planta + certidão (ver prompts.PROMPT_DIMENSOES_TERRENO). */
  fatos: FatoExtraido[];
};

/**
 * Decisão pura — sem rede, sem banco. Nunca devolve CONFORME por ausência de divergência não
 * verificada, nem por presença de documento não relacionado à medida em si, nem por comparação
 * parcial das dimensões — só arredondamento decide sozinho, e só quando as 5 medidas existem.
 */
export function decidirDimensoesTerreno(entrada: EntradaDecisaoDimensoesTerreno): SaidaRegraItem {
  return comGuardaDeConfianca(decidirDimensoesTerrenoBruto(entrada));
}

function decidirDimensoesTerrenoBruto(entrada: EntradaDecisaoDimensoesTerreno): SaidaRegraItem {
  const base = {
    macItemId: MAC_ITEM_DIMENSOES_TERRENO,
    regraId: REGRA_ID_DIMENSOES_TERRENO,
    regraVersao: REGRA_VERSAO_DIMENSOES_TERRENO,
    camposLip: { areaTerreno: entrada.areaTerreno },
    fatosUsados: entrada.fatos,
  };

  const comparacoes = compararMedidas(entrada.fatos, entrada.areaTerreno.valorNormalizado);
  const areaComp = comparacoes.find((c) => c.medida === "area")!;
  const fatosLidos = entrada.fatos.filter((f) => !("abstencao" in f));
  const confianca: Confianca | null = confiancaMinima(fatosLidos);

  if (!areaComp.comparavel) {
    if (areaComp.planta === null && areaComp.certidao === null) {
      return {
        ...base,
        aplicabilidade: "INDETERMINADO",
        resultado: "NAO_AVALIADO",
        confianca: null,
        justificativa: "área do terreno não disponível nem pela planta/LIP nem pela leitura da certidão — motor não tem com o que comparar.",
        requerRevisao: true,
      };
    }
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "PENDENTE",
      confianca: null,
      justificativa: `área disponível de só um lado (${areaComp.planta !== null ? `planta ${fmt(areaComp.planta)} m²` : `certidão ${fmt(areaComp.certidao)} m²`}) — falta o outro lado para comparar.`,
      requerRevisao: true,
    };
  }

  const dimensoes = comparacoes.filter((c) => c.medida !== "area");
  const faltantes = dimensoes.filter((c) => !c.comparavel);

  if (faltantes.length > 0) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "REVISAO_MANUAL",
      confianca,
      justificativa: `área comparável (planta ${fmt(areaComp.planta)} m² × certidão ${fmt(areaComp.certidao)} m²), mas faltam ${faltantes.length} de ${DIMENSOES_OBRIGATORIAS.length} medidas de perímetro obrigatórias para decisão automática (${faltantes.map((f) => f.medida).join(", ")}). Terrenos irregulares ou com mais de 4 lados também ficam em revisão nesta versão — exige revisão humana.`,
      requerRevisao: true,
    };
  }

  const todasDentro = areaComp.dentroDaTolerancia === true && dimensoes.every((c) => c.dentroDaTolerancia === true);
  if (todasDentro) {
    return {
      ...base,
      aplicabilidade: "APLICAVEL",
      resultado: "CONFORME",
      confianca,
      justificativa: `área e as 4 medidas de perímetro conferem entre planta e certidão, dentro da tolerância de arredondamento (${TOLERANCIA_ARREDONDAMENTO}): ${[areaComp, ...dimensoes].map((c) => `${c.medida} ${fmt(c.planta)}×${fmt(c.certidao)}`).join(", ")}.`,
      requerRevisao: false,
    };
  }

  const divergentes = [areaComp, ...dimensoes].filter((c) => c.dentroDaTolerancia === false);
  return {
    ...base,
    aplicabilidade: "APLICAVEL",
    resultado: "REVISAO_MANUAL",
    confianca,
    justificativa: `divergência entre planta e certidão em: ${divergentes.map((c) => `${c.medida} (planta ${fmt(c.planta)} × certidão ${fmt(c.certidao)}, diferença ${fmt(c.diferenca)})`).join("; ")}. Decisão não é automática — exige revisão humana.`,
    requerRevisao: true,
  };
}
