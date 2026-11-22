export type GeminiModel =
  | "gemini-3.5-flash-lite"
  | "gemini-2.5-flash"
  | "gemini-3.6-flash"
  | "gemini-2.0-flash-lite"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro";

/**
 * Modelo PADRÃO de todo o URBIS. Desde 03/11/2026 é o 3.5-flash-lite: o Google desliga o 2.5 em
 * 01/12/2026 e redireciona sozinho para ele, então migramos antes, de propósito (mesmo preço do
 * 2.5). Os prompts do LIP foram afinados no 2.5 e a qualidade NÃO foi medida — se a leitura
 * piorar, o plano B é "gemini-3.6-flash" (mais caro). Aviso: o 3.5 ignora `temperature`. A partir da Fase 2 do plano de leitura de PDF, o padrão
 * deixou de ser a ÚNICA opção: `lib/modeloGemini.ts` troca para um modelo que suporte arquivos
 * grandes quando o PDF passa do teto do 2.5. Quem não informa tamanho continua caindo aqui.
 */
export const GEMINI_MODEL: GeminiModel = "gemini-3.5-flash-lite";

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
