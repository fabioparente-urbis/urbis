-- 2026_09_02_bdi_analises_em_andamento.sql
--
-- ✅ APLICADA em produção em 03/09/2026, depois de revisão do Fábio e teste
--    completo em transação com ROLLBACK (CREATE VIEW + REVOKE rodados,
--    resultado conferido, tudo desfeito, só então aplicado de verdade).
--    Confirmado por leitura direta no banco após aplicar: security_invoker
--    =true, grants só postgres/service_role, mesmo resultado do teste
--    (3 processos de Regularização) — sem divergência.
--
-- POR QUE ESTA VIEW
--
-- Parte do recorte "BDI vivo — inteligência por evidência". As views já
-- aplicadas (vw_bdi_tempo_etapas) só enxergam processo que JÁ fechou — tem
-- início E fim. Isso deixa cego o outro lado do mesmo fato: quantos
-- processos estão com análise iniciada e NUNCA concluída, e há quanto
-- tempo. É a metade que falta da prioridade "análises iniciadas e
-- concluídas" do recorte.
--
-- CORREÇÃO DE 02/09/2026 (revisão "Inteligência URBIS — fechamento da
-- base"): a primeira versão desta view usava só
-- `analise_concluida_em IS NULL` pra decidir "em andamento". Testado contra
-- produção antes de aplicar: dos 18 processos que essa condição pegava, só
-- 3 estavam REALMENTE em análise — os outros 15 (83%) já tinham despacho
-- commitado em `analises_mac`, só não foram indeferidos/arquivados (única
-- coisa que seta `analise_concluida_em` hoje, ver lib/bdi/situacao.ts). Ou
-- seja: a versão original ia chamar de "em andamento" um processo que já
-- saiu da mesa do analista e está esperando o interessado. Corrigido:
-- agora também exige que a passada mais recente em `analises_mac` não
-- tenha despacho nem parecer commitado — mesma condição que
-- `situacaoMac()` usa pra "Em análise" (lib/bdi/situacao.ts), pra não
-- discordar do resto do painel.
--
-- CUSTO ZERO: SQL sobre processos.analise_iniciada_em/analise_concluida_em
-- e analises_mac, que já existem e já são gravados (Slot 1/2 desde sempre,
-- Slot 5 desde 02/09/2026 — commit da fundação de eventos do Slot 5).
-- Nenhuma chamada a serviço externo.
--
-- NÃO É PREVISÃO: é contagem de processo com início gravado, fim ainda
-- ausente E sem despacho/parecer na passada atual — e há quanto tempo isso
-- é verdade AGORA. Não estima quando vai fechar, não ordena por analista,
-- não atribui causa.
--
-- SEPARAÇÃO POR ASSUNTO: `tipo_processo` vem direto de `processos`, sem
-- hardcode de slug — um assunto novo aparece na view sozinho, mesmo padrão
-- de todas as views deste recorte.
--
-- Segurança: mesmo padrão das views anteriores — security_invoker = true,
-- sem grant para anon/authenticated.

BEGIN;

CREATE OR REPLACE VIEW public.vw_bdi_analises_em_andamento
WITH (security_invoker = true) AS
  WITH ultima_passada AS (
    SELECT DISTINCT ON (processo_codigo)
      processo_codigo, numero_analise, numero_despacho, numero_parecer
    FROM analises_mac
    WHERE excluido_em IS NULL
    ORDER BY processo_codigo, numero_analise DESC
  )
  SELECT
    lower(p.tipo_processo)                                                          AS tipo_processo,
    count(*)                                                                        AS processos_em_andamento,
    round(avg(extract(epoch FROM (now() - p.analise_iniciada_em)) / 86400.0), 1)     AS dias_media_em_aberto,
    max(round(extract(epoch FROM (now() - p.analise_iniciada_em)) / 86400.0, 1))     AS dias_mais_antigo
  FROM processos p
  LEFT JOIN ultima_passada up ON up.processo_codigo = p.codigo
  WHERE p.excluido_em IS NULL
    AND p.analise_iniciada_em IS NOT NULL
    AND p.analise_concluida_em IS NULL
    -- a passada mais recente não pode já ter documento — senão é "aguardando
    -- retorno do interessado", não "em andamento" (achado acima).
    AND coalesce(up.numero_despacho, up.numero_parecer) IS NULL
  GROUP BY 1
  ORDER BY processos_em_andamento DESC;

REVOKE ALL ON public.vw_bdi_analises_em_andamento FROM anon, authenticated, PUBLIC;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 02/09/2026, só leitura contra produção
-- ======================================================================
-- Versão original (só analise_concluida_em IS NULL): 18 processos.
-- Versão corrigida (também exige passada atual sem despacho/parecer):
--
--  tipo_processo  | processos_em_andamento | dias_media_em_aberto | dias_mais_antigo
--  regularizacao  | 3                      | 22.7                  | 41.0
--
-- Os outros 15 da versão original eram "aguardando retorno do
-- interessado" de verdade (despacho já commitado) — não entram mais.
-- Slot 5 e Aceite SEI: nenhum processo em análise sem documento hoje.
-- ======================================================================
