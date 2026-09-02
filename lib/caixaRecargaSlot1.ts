// ============================================================
// Caixa de recarga / poço de infiltração — Regularização SEI (Slot 1).
//
// Lei Complementar nº 314/2018, Art. 2º, § 4º: a caixa de recarga
// (poço de infiltração) só é obrigatória para edificações com área
// construída ACIMA DE 250 m² E que NÃO tenham ocupado a totalidade
// da área do lote. Abaixo de 250 m² a exigência simplesmente não
// existe — não há, no Slot 1, "caixa proporcional".
//
// ATENÇÃO: isto NÃO é a regra do Slot 5 (Aprovação de Projeto). Lá o
// volume é proporcional à área impermeabilizada (Plano Diretor/ICCAP,
// LC 349/2022), sem corte de 250 m². São leis diferentes, parâmetros
// diferentes e setores diferentes: este arquivo não importa nada de
// `lib/mac-motor/slot5/` e nada do Slot 5 deve importar daqui.
//
// O corte dos 250 m² é uma COMPARAÇÃO NUMÉRICA sobre um campo que o
// LIP já tem — logo é decisão determinística do sistema, nunca da IA.
// À IA cabe só o fato que só ela lê: se o projeto apresenta (ou não)
// caixa, memorial de cálculo e volume no carimbo.
//
// A segunda condição da lei — "não ocupou a totalidade do lote" — não
// tem campo próprio no LIP hoje. Por isso, acima de 250 m² o veredito
// é EXIGÍVEL SALVO ocupação total, e quem confere isso no projeto é o
// analista. O sistema nunca conclui essa parte sozinho.
// ============================================================

import { ehRegularizacaoSei } from "@/lib/compatibilidadeArea";

/** Corte legal do Art. 2º, § 4º da LC 314/2018 — em m². */
export const LIMITE_AREA_CAIXA_M2 = 250;

/** Campo do LIP como ele vive em `processos.dados`. */
export type CampoLip = { valor?: string | null; origem?: string | null; fonte?: string | null } | null | undefined;

export type LeituraCaixaRecarga = {
  /** areaTotal — "Área a ser Regularizada TOTAL" (carimbo/quadro de áreas). */
  areaTotal?: CampoLip;
  /** areaAprovada — "Área Aprovada (se existir)", área já aprovada anteriormente. */
  areaAprovada?: CampoLip;
};

export type SituacaoCaixaRecarga =
  /** Área construída ≤ 250 m² — a lei não exige caixa. Decisão fechada. */
  | "DISPENSADA"
  /** Área construída > 250 m² — exigível, salvo ocupação total do lote (confere o analista). */
  | "EXIGIVEL_SALVO_OCUPACAO_TOTAL"
  /** Área construída não informada — sem ela não há como aplicar o corte. */
  | "INDETERMINADA";

export type VeredictoCaixaRecarga = {
  situacao: SituacaoCaixaRecarga;
  /** true = dispensada pela área; false = a área não dispensa; null = falta a área para decidir. */
  dispensadaPorArea: boolean | null;
  /** Área construída considerada na comparação, em m² (0 quando desconhecida). */
  areaConsiderada: number;
  /** Parcelas somadas, para o analista conferir de onde saiu o número. */
  parcelas: { areaTotal: number; areaAprovada: number };
  /** Texto pronto para a tela do LIP, para o VCP e para o registro em Observações. */
  mensagem: string;
};

/**
 * Mesmo parser de área do VCP (lib/mrp.ts / s4) e da compatibilidade de
 * área: aceita "1.234,56", "1234,56" e "1234.56", com ou sem "m²".
 * "NP", vazio e lixo viram null — nunca 0, que seria "área zero".
 */
function parseArea(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).replace(/m²|m2/gi, "").trim();
  if (!s || s.toUpperCase() === "NP") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmt(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Aplica o corte dos 250 m² sobre o que o LIP já tem. Determinístico:
 * só comparação numérica, sem IA e sem chute.
 *
 * A área considerada é a soma da área a regularizar (`areaTotal`) com a
 * área existente já aprovada (`areaAprovada`), quando houver. É a leitura
 * CONSERVADORA: a lei fala da edificação, não só do que está sendo
 * regularizado agora, e somar só pode ADIAR uma dispensa — nunca dispensar
 * um caso que a lei exigiria.
 */
export function avaliarCaixaRecarga(leitura: LeituraCaixaRecarga): VeredictoCaixaRecarga {
  const areaTotal = parseArea(leitura.areaTotal?.valor) ?? 0;
  const areaAprovada = parseArea(leitura.areaAprovada?.valor) ?? 0;
  const areaConsiderada = areaTotal + areaAprovada;
  const parcelas = { areaTotal, areaAprovada };

  const detalheParcelas =
    areaAprovada > 0
      ? ` (${fmt(areaTotal)} m² a regularizar + ${fmt(areaAprovada)} m² já aprovados)`
      : "";

  if (areaConsiderada <= 0) {
    return {
      situacao: "INDETERMINADA",
      dispensadaPorArea: null,
      areaConsiderada: 0,
      parcelas,
      mensagem:
        `Área construída não informada no LIP — sem ela o sistema não aplica o corte de ` +
        `${LIMITE_AREA_CAIXA_M2} m² da LC nº 314/2018, Art. 2º, § 4º. Preencha "Área a ser ` +
        `Regularizada TOTAL" para saber se a caixa de recarga é exigível.`,
    };
  }

  if (areaConsiderada <= LIMITE_AREA_CAIXA_M2) {
    return {
      situacao: "DISPENSADA",
      dispensadaPorArea: true,
      areaConsiderada,
      parcelas,
      mensagem:
        `Área construída de ${fmt(areaConsiderada)} m²${detalheParcelas} — não passa de ` +
        `${LIMITE_AREA_CAIXA_M2} m². Caixa de recarga/poço de infiltração DISPENSADA pela ` +
        `LC nº 314/2018, Art. 2º, § 4º, que só a exige acima de ${LIMITE_AREA_CAIXA_M2} m². ` +
        `Não exigir caixa, memorial de cálculo nem ART/RRT de caixa neste processo.`,
    };
  }

  return {
    situacao: "EXIGIVEL_SALVO_OCUPACAO_TOTAL",
    dispensadaPorArea: false,
    areaConsiderada,
    parcelas,
    mensagem:
      `Área construída de ${fmt(areaConsiderada)} m²${detalheParcelas} — acima de ` +
      `${LIMITE_AREA_CAIXA_M2} m². Caixa de recarga/poço de infiltração EXIGÍVEL pela ` +
      `LC nº 314/2018, Art. 2º, § 4º, SALVO se a edificação ocupou a totalidade da área do ` +
      `lote. Essa segunda condição o LIP não afere — confira no projeto antes de exigir.`,
  };
}

/** Atalho para quem tem `processos.dados` na mão (tela do LIP, rotas, VCP). */
export function avaliarCaixaRecargaDosDados(
  dados: Record<string, CampoLip> | null | undefined,
): VeredictoCaixaRecarga {
  const d = dados ?? {};
  return avaliarCaixaRecarga({ areaTotal: d["areaTotal"], areaAprovada: d["areaAprovada"] });
}

/** Chaves do LIP que só existem por causa da caixa de recarga (Slot 1). */
export const CHAVES_LIP_CAIXA = ["caixa", "artCx", "volMin", "volAt", "caixas"] as const;

/**
 * Chaves que NUNCA devem pré-marcar item do MAC como "não conforme"
 * automaticamente (ver app/api/processo/salvar/route.ts) — em nenhuma das
 * três situações, por decisão do Fábio em 02/09/2026:
 *
 *   - DISPENSADA (área ≤ 250 m²): a lei não exige — marcar "não conforme"
 *     seria exigência sem amparo legal.
 *   - EXIGIVEL_SALVO_OCUPACAO_TOTAL (área > 250 m²): a exigência da lei tem
 *     DUAS condições (área E não ocupar a totalidade do lote) e o LIP só
 *     confere a primeira — marcar "não conforme" pela área sozinha decidiria
 *     pela metade que falta. Fica só o registro "conferir ocupação total do
 *     lote", nunca uma marcação automática negativa.
 *   - INDETERMINADA (área não lida): pela mesma razão — sem o dado, o
 *     sistema não tem base para nenhuma das duas conclusões.
 *
 * Em todos os casos o item continua no checklist, visível e marcável à mão
 * pelo analista — só a marcação AUTOMÁTICA de "não conforme" nunca acontece
 * para estas chaves em Regularização SEI.
 */
export function chavesCaixaDispensadasSlot1(
  tipoProcesso: string | null | undefined,
  dados: Record<string, CampoLip> | null | undefined,
): { chaves: string[]; veredicto: VeredictoCaixaRecarga | null } {
  if (!ehRegularizacaoSei(tipoProcesso)) return { chaves: [], veredicto: null };
  const veredicto = avaliarCaixaRecargaDosDados(dados);
  return { chaves: [...CHAVES_LIP_CAIXA], veredicto };
}

/**
 * Bloco anexado ao prompt do S3, na mesma técnica do marco temporal
 * (lib/marcoTemporal.ts) e da compatibilidade de área: vai DEPOIS do prompt
 * do slot, não altera nada do que já é extraído — só fecha a porta para o
 * modelo DEDUZIR a caixa a partir da área. O corte dos 250 m² é conta do
 * sistema; do modelo se quer apenas o fato que está no papel.
 */
export function blocoPromptCaixaRecarga(tipoProcesso: string | null | undefined): string {
  if (!ehRegularizacaoSei(tipoProcesso)) return "";

  return `

---
VERIFICAÇÃO ADICIONAL — CAIXA DE RECARGA (Regularização SEI)

O campo "caixa" é FATO, não conclusão jurídica. Responda "Sim" apenas se o
PRÓPRIO projeto/laudo apresentar caixa de infiltração/recarga — indicação no
carimbo, memorial de cálculo, volume em m³, locação da caixa na planta.
Responda "Não" quando nada disso aparecer.

NUNCA deduza "caixa": "Sim" a partir da área construída, do limite de
${LIMITE_AREA_CAIXA_M2} m² da LC nº 314/2018 ou de qualquer outro cálculo. Se a
caixa é ou não EXIGÍVEL é decidido pelo próprio sistema, comparando a área do
LIP com o limite legal — dizer "Sim" porque a área é grande faz o sistema
acreditar que a caixa já está no projeto quando ela não está.
---`;
}
