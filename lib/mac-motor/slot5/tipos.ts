/**
 * lib/mac-motor/slot5/tipos.ts — vocabulário do motor híbrido do MAC, Slot 5 (Aprovação de Projeto).
 *
 * Isolado de propósito: nenhum tipo aqui é importado por nem importa de código do Slot 1
 * (Regularização/Aceite). Consome `lib/mac-execucao/*` (infraestrutura de execução, comum a
 * qualquer slot) só como cliente — não altera nada lá.
 *
 * ── CONTRATO GEMINI × CÓDIGO ─────────────────────────────────────────────────────
 * O Gemini SÓ extrai e interpreta fatos de documentos (FatoExtraido). Ele nunca decide
 * aplicabilidade, conformidade ou resultado — isso é sempre calculado em código determinístico,
 * a partir dos fatos (extraídos ou já vindos do LIP). Ver `regras/*.ts`.
 */

/** Um fato lido de um documento pelo Gemini, ou a abstenção explícita quando não deu para ler. */
export type FatoExtraido =
  | {
      nome: string;
      valor: string;
      unidade: string | null;
      documento: string;
      pagina: number | null;
      trecho: string | null;
      confianca: number; // 0..1
      observacao: string | null;
    }
  | {
      nome: string;
      abstencao: true;
      motivo: string;
      documento: string | null;
    };

export const foiLido = (f: FatoExtraido): f is Extract<FatoExtraido, { valor: string }> =>
  !("abstencao" in f) || f.abstencao !== true;

/** Resposta bruta esperada do Gemini para qualquer prompt deste motor. */
export type RespostaExtracao = {
  fatos: FatoExtraido[];
};

/** Documento de entrada para uma chamada de extração — já em memória, sem tocar em storage do LIP. */
export type DocumentoEntrada = {
  papel: string; // ex.: "certidao_matricula", "projeto"
  nomeArquivo: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
};

/** O que uma chamada ao Gemini deste motor custou e devolveu, para auditoria. */
export type ResultadoExtracao = {
  fatos: FatoExtraido[];
  modelo: string;
  promptId: string;
  promptVersao: number;
  promptHash: string;
  bruto: string;
  msModelo: number;
};

export type Confianca = "ALTA" | "MEDIA" | "BAIXA";

/**
 * Um campo do LIP (`processos.dados[chave]`), congelado tal como está no processo — valor bruto
 * (string, como o analista/leitor gravou), valor normalizado (número, para o cálculo) e origem
 * (preservada exatamente como já existe em `processos.dados`, sem inventar vocabulário novo).
 * null em qualquer campo = o LIP não tem esse dado.
 */
export type CampoLipCongelado = {
  valor: string | null;
  valorNormalizado: number | null;
  origem: string | null;
};

/** O que uma regra determinística do Slot 5 decidiu para UM item do MAC. */
export type SaidaRegraItem = {
  macItemId: string;
  aplicabilidade: "APLICAVEL" | "NAO_APLICAVEL" | "INDETERMINADO" | "ERRO_DADOS";
  resultado: "CONFORME" | "NAO_CONFORME" | "PENDENTE" | "NAO_AVALIADO" | "REVISAO_MANUAL";
  confianca: Confianca | null;
  justificativa: string;
  camposLip: Record<string, unknown>;
  fatosUsados: FatoExtraido[];
  regraId: string;
  regraVersao: number;
  requerRevisao: boolean;
};
