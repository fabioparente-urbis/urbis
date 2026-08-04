/**
 * lib/mac-motor/slot5/ponteMhd.ts — ponte entre o piloto (mac_resultados_item) e a tela de
 * endereçamento do slot_05 (mhd_resultados_campo, lida por app/admin/rastreabilidade).
 *
 * Sem isto, um item que o piloto resolveu de verdade (ex.: dimensões do terreno, estável e
 * ALTA) nunca aparecia como RESOLVIDO na tela — ficava indistinguível dos itens que ninguém
 * tentou. Escreve sempre UM item por chamada, via `registrarResultadoItem` (lib/mhd.ts) — nunca
 * `registrarResultados()`, que substitui o lote inteiro e aposentaria por engano as respostas
 * manuais dos outros itens do processo.
 *
 * Mapeamento aplicabilidade/resultado (vocabulário do piloto) → resultado (vocabulário do MHD,
 * o mesmo que decide a postura na tela — ver memória urbis-mac-slot5-plano-posturas):
 *   NAO_APLICAVEL              → NAO_APLICAVEL         (postura NAO_APLICAVEL)
 *   ERRO_DADOS / INDETERMINADO → BLOQUEADO             (postura VEREDITO_HUMANO — regra não
 *                                                        conseguiu concluir nada, precisa de gente)
 *   CONFORME / NAO_CONFORME    → INFERIDO              (postura RESOLVIDO — o valor veio de
 *                                                        leitura de imagem por Gemini, não é
 *                                                        reprodutível como ENCONTRADO; exige
 *                                                        confiança e confirmação do analista,
 *                                                        exatamente o "analista confirma" do plano)
 *   PENDENTE                   → AGUARDANDO_FATO       (postura DADO_NECESSARIO — o motor
 *                                                        absteve-se, pergunta assistida)
 *   REVISAO_MANUAL             → BLOQUEADO             (postura VEREDITO_HUMANO — contradição
 *                                                        LIP×Gemini, nunca resolvida em silêncio)
 *   NAO_AVALIADO                → nada é escrito         (motor não chegou a decidir nada
 *                                                        reproduzível; a tela trata ausência de
 *                                                        resultado do mesmo jeito, catch-all)
 *
 * `versao`/`hash` do MHD normalmente reproduzem a declaração do item na matriz de
 * rastreabilidade — mas os itens do piloto ainda estão declarados genericamente lá (ANALISTA/
 * MANUAL_SEM_DADO_LIP, sem descrever esta automação). Reproduzir a automação de verdade é o
 * `regraId`/`regraVersao` do PRÓPRIO piloto — é o que se usa aqui, documentado como tal.
 */
import { registrarResultadoItem, type ResumoResultadoItem } from "@/lib/mhd";
import type { Aplicabilidade, Confianca, Resultado } from "@/lib/mac-execucao";

const CONFIANCA_NUMERICA: Record<Confianca, number> = { ALTA: 0.9, MEDIA: 0.6, BAIXA: 0.3 };

export async function publicarResultadoNaMhd(args: {
  processoCodigo: string;
  macItemId: string;
  aplicabilidade: Aplicabilidade;
  resultado: Resultado;
  confianca: Confianca | null | undefined;
  justificativa: string;
  regraId: string;
  regraVersao: number;
}): Promise<ResumoResultadoItem> {
  const { processoCodigo, macItemId, aplicabilidade, resultado, confianca, justificativa, regraId, regraVersao } = args;

  let mhdResultado: string;
  let valor: string | null = null;
  let confiancaNumerica: number | null = null;

  if (aplicabilidade === "NAO_APLICAVEL") {
    mhdResultado = "NAO_APLICAVEL";
  } else if (aplicabilidade === "ERRO_DADOS" || aplicabilidade === "INDETERMINADO") {
    mhdResultado = "BLOQUEADO";
  } else if (resultado === "CONFORME" || resultado === "NAO_CONFORME") {
    mhdResultado = "INFERIDO";
    valor = resultado === "CONFORME" ? "Conforme" : "Não conforme";
    confiancaNumerica = confianca ? CONFIANCA_NUMERICA[confianca] : null;
  } else if (resultado === "PENDENTE") {
    mhdResultado = "AGUARDANDO_FATO";
  } else if (resultado === "REVISAO_MANUAL") {
    mhdResultado = "BLOQUEADO";
  } else {
    // NAO_AVALIADO — nada reproduzível para publicar.
    return { ativa: false, gravou: false, problemas: [] };
  }

  return registrarResultadoItem({
    processoCodigo, modulo: "MAC", slot: "slot_05", chave: macItemId,
    resultado: mhdResultado, valor, fonte: "PRANCHA", evidencia: justificativa,
    confianca: confiancaNumerica, versao: regraVersao, hash: regraId,
  });
}
