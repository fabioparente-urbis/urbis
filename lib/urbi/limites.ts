/**
 * lib/urbi/limites.ts — teto operacional do chat do URBI, extraído de app/api/urbi/chat/route.ts
 * (Fase V, 05/09/2026) pra ter fonte única entre quem APLICA o limite (a própria rota de chat) e
 * quem só EXIBE o limite vigente (painel "Prontidão para piloto", /admin/urbi). Duplicar o número
 * nos dois lugares seria o mesmo risco já visto noutras partes deste projeto: os dois divergirem
 * silenciosamente depois de um ajuste feito só num dos arquivos.
 */
export const LIMITE_CHAMADAS_CHAT_HORA = 200;

/** Mesmas operações contadas pela trava de budget do chat (app/api/urbi/chat/route.ts) — extraído
 *  aqui pra quem só LÊ o uso (painel de prontidão) contar exatamente o mesmo balde. */
export const OPERACOES_CHAT_URBI = ["chat_geral", "chat_bip", "chat_onmount", "chat_coanalista", "chat_coanalista_bip"] as const;
