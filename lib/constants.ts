export type GeminiModel =
  | "gemini-2.5-flash"
  | "gemini-3.6-flash"
  | "gemini-2.0-flash-lite"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro";

/**
 * Modelo PADRÃO de todo o URBIS. Continua sendo o 2.5 — ele lê mais barato e é em cima dele que
 * os prompts do LIP foram afinados. A partir da Fase 2 do plano de leitura de PDF, o padrão
 * deixou de ser a ÚNICA opção: `lib/modeloGemini.ts` troca para um modelo que suporte arquivos
 * grandes quando o PDF passa do teto do 2.5. Quem não informa tamanho continua caindo aqui.
 */
export const GEMINI_MODEL: GeminiModel = "gemini-2.5-flash";

/**
 * Texto ÚNICO mostrado ao analista quando uma função que precisa de IA está DESLIGADA — regra
 * definida pelo Fábio em 07/09/2026 e registrada em `docs/URBIS_PLANO_GOVERNANCA_IA.md` §5.
 *
 * Vale só para bloqueio por INTERRUPTOR/ORÇAMENTO (algo que só o Administrador destrava). Teto de
 * ritmo — "20 páginas/hora", "limite de chamadas/hora" — NUNCA usa este texto: ali pedir liberação
 * não adianta, o bloqueio se desfaz sozinho, e mandar o analista incomodar o Administrador por
 * algo que passa em uma hora é ruído. Esses casos continuam dizendo "tente de novo daqui a pouco".
 *
 * Constante e não texto solto em cada rota porque o problema que este aviso resolve é o analista
 * não saber POR QUE algo não funcionou: se cada ponto inventa sua frase, ele volta a não saber.
 */
export const AVISO_IA_DESLIGADA =
  "Os gastos com IA estão desligados. Solicite ao Administrador que libere gastos com IA para usar esta função.";
