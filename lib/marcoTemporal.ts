// ============================================================
// Marco temporal — Lei Complementar nº 314, de 05/11/2018.
//
// A edificação só pode ser regularizada (ou aceita) se já estava
// com a ESTRUTURA CONCLUÍDA antes da data limite do slot. Quem
// atesta isso é SEMPRE o fiscal, no ÚLTIMO laudo de vistoria do
// processo — o URBIS apenas lê o laudo e repassa o veredito, não
// decide por conta própria.
//
// Se o fiscal considerar a obra NÃO APTA, o processo sequer deve
// ser analisado: vai direto para indeferimento por não atender ao
// marco temporal.
// ============================================================

export type MarcoTemporal = {
  /** Data limite no formato exibido ao usuário. */
  data: string;
  /** Rótulo do slot, para as mensagens. */
  rotulo: string;
};

/**
 * Marco temporal por tipo de processo. Slots sem marco (aprovação
 * PP/MP, por exemplo) retornam null e a verificação é ignorada.
 *
 * Aceita as duas grafias históricas de `processos.tipo_processo`
 * ("regularizacao" legado e "regularizacao_sei"), além de variações
 * de caixa — o banco tem registros em REGULARIZACAO maiúsculo.
 */
export function marcoTemporalDoTipo(
  tipoProcesso: string | null | undefined,
): MarcoTemporal | null {
  const t = String(tipoProcesso ?? "").toLowerCase().trim();
  if (!t) return null;
  if (t.startsWith("aceite")) {
    return { data: "19 de outubro de 1995", rotulo: "Aceite SEI" };
  }
  if (t.startsWith("regularizacao")) {
    return { data: "4 de março de 2022", rotulo: "Regularização SEI" };
  }
  return null;
}

/** Bloco da IA com o que o fiscal escreveu no último laudo de vistoria. */
export type LeituraMarcoTemporal = {
  dataConclusaoObra?: string | null;
  estruturaConcluidaAntesDoMarco?: string | null;
  parecerFiscal?: string | null;
  fonte?: string | null;
  trecho?: string | null;
};

export type VeredictoMarcoTemporal = {
  /** true = fiscal reprovou; false = fiscal aprovou; null = laudo não diz. */
  naoApta: boolean | null;
  marco: MarcoTemporal;
  leitura: LeituraMarcoTemporal;
  /** Texto pronto para a janela de aviso e para o registro em Observações. */
  mensagem: string;
};

function ehNao(v: string | null | undefined): boolean {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "não" || s === "nao" || s === "não apta" || s === "nao apta" || s === "inapta";
}

function ehSim(v: string | null | undefined): boolean {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "sim" || s === "apta" || s === "apto";
}

/**
 * Cruza o que a IA leu no laudo com o marco do slot. Não inventa
 * conclusão: se o laudo não responde, devolve `naoApta: null` e o
 * chamador apenas registra a lacuna, sem alarme falso.
 */
export function avaliarMarcoTemporal(
  tipoProcesso: string | null | undefined,
  leitura: LeituraMarcoTemporal | null | undefined,
): VeredictoMarcoTemporal | null {
  const marco = marcoTemporalDoTipo(tipoProcesso);
  if (!marco) return null;

  const l = leitura ?? {};
  const reprovado = ehNao(l.parecerFiscal) || ehNao(l.estruturaConcluidaAntesDoMarco);
  const aprovado = ehSim(l.parecerFiscal) || ehSim(l.estruturaConcluidaAntesDoMarco);

  const naoApta: boolean | null = reprovado ? true : aprovado ? false : null;

  let mensagem: string;
  if (naoApta === true) {
    mensagem =
      `Segundo a vistoria fiscal, a edificação NÃO está apta: a estrutura não estava ` +
      `concluída antes de ${marco.data}. Este processo deve ser INDEFERIDO por não ` +
      `atender ao marco temporal da Lei Complementar nº 314, de 05 de novembro de 2018.`;
  } else if (naoApta === false) {
    mensagem =
      `Vistoria fiscal atesta estrutura concluída antes de ${marco.data} — ` +
      `marco temporal da LC nº 314/2018 atendido.`;
  } else {
    mensagem =
      `A vistoria fiscal não respondeu se a estrutura estava concluída antes de ` +
      `${marco.data}. Conferir manualmente o último laudo antes de analisar.`;
  }

  return { naoApta, marco, leitura: l, mensagem };
}

/**
 * Bloco anexado ao prompt do S3 (leitura do processo SEI inteiro).
 * Vai depois do prompt do slot, então não altera o que já é extraído —
 * só acrescenta a verificação do último laudo de vistoria.
 */
export function blocoPromptMarcoTemporal(
  tipoProcesso: string | null | undefined,
): string {
  const marco = marcoTemporalDoTipo(tipoProcesso);
  if (!marco) return "";

  return `

---
VERIFICAÇÃO ADICIONAL — MARCO TEMPORAL (${marco.rotulo})

Localize o ÚLTIMO laudo de vistoria fiscal do processo (o mais recente por data:
"Relatório de Visita Técnica", "Termo de Vistoria Fiscal", "Relatório Fiscal" ou
equivalente). Se houver mais de um, use SOMENTE o mais recente.

Nesse laudo, responda estritamente com o que o FISCAL escreveu — não deduza, não
calcule por conta própria, não use outros documentos do processo:

1. Em que data a estrutura/edificação foi concluída, segundo o fiscal?
2. Segundo o fiscal, a estrutura já estava concluída ANTES de ${marco.data}?
3. Qual o parecer do fiscal quanto à aptidão da obra: APTA ou NÃO APTA?

Se o laudo não responder a algum item, retorne "Não informado" — nunca chute.

Acrescente ao JSON de resposta a chave de primeiro nível "marcoTemporal"
(irmã de "campos", sem substituir nenhuma chave existente):

"marcoTemporal": {
  "dataConclusaoObra": "<data que o fiscal informou ou 'Não informado'>",
  "estruturaConcluidaAntesDoMarco": "<Sim | Não | Não informado>",
  "parecerFiscal": "<Apta | Não apta | Não informado>",
  "fonte": "<documento e nº SEI do laudo usado + página>",
  "trecho": "<citação curta e literal do laudo que fundamenta a resposta>"
}
---`;
}
