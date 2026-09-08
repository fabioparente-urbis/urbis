"use client";

/**
 * DESLIGADO em 08/09/2026, a pedido do Fábio: "deixa esse trem logado de vez... passo o dia
 * trabalhando e toda hora tenho que parar pra resolver algo e voltar".
 *
 * O que existia aqui: 30 min sem clicar/digitar/rolar → chamava /api/auth/logout e mandava pra
 * /login. Somado ao `access_token` do Supabase que vencia em 1h sem renovação (corrigido no
 * mesmo dia — ver `middleware.ts`), era o motivo de o analista ser jogado pra fora várias vezes
 * ao longo do expediente.
 *
 * POR QUE ISSO NÃO CUSTA A MEDIÇÃO DO TEMPO DE TRABALHO — que era a preocupação declarada dele
 * ao pedir: a medição NUNCA dependeu deste logout. Quem mede é `hooks/useSessionHeartbeat.ts`,
 * que já funciona por interação real: o batimento PAUSA após 5 min sem mouse/teclado/rolagem e o
 * tempo parado é descontado da sessão (`/api/sessao/pausar` → coluna `tempo_pausado`, que a view
 * `vw_bdi_tempo_analista` subtrai pra calcular `minutos_liquidos`). Aba esquecida aberta não
 * vira tempo trabalhado nem antes nem depois desta mudança; sessão abandonada é encerrada do
 * lado do servidor (pg_cron), não pelo logout do navegador.
 *
 * O arquivo continua existindo, e `components/AutoLogout.tsx` continua chamando, pra não espalhar
 * a mudança por vários pontos: aqui é o lugar único onde a decisão está escrita e explicada.
 * Religar é reescrever esta função — a decisão é de política de segurança, não de código.
 */
export function useAutoLogout() {
  // Sem efeito de propósito.
}
