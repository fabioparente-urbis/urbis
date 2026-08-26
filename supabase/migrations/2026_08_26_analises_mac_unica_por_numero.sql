-- Impede duas análises com o mesmo número no mesmo processo.
--
-- Em 26/08/2026 o processo 25.5.000047197-5 ficou com DUAS linhas de
-- "Análise 2": uma criada pela tela e outra por inserção direta no banco
-- durante uma reconstituição manual. A tela lê `analises_mac` ordenando por
-- numero_analise e exibe uma delas — a outra vira uma linha fantasma,
-- invisível, que continua recebendo gravações. Horas foram gastas
-- "corrigindo" a linha que ninguém via.
--
-- O caso não foi isolado: o processo 25.5.000060609-9 já tinha duas
-- Análises 2 criadas com 171ms de diferença (disparo duplo do autosave ao
-- criar a análise), uma delas completamente vazia.
--
-- Índice PARCIAL: análises na lixeira (excluido_em preenchido) ficam de
-- fora, senão zerar e recriar uma análise passaria a colidir com o próprio
-- histórico.
--
-- Pré-requisito: não pode haver duplicata ativa. Para conferir antes:
--   SELECT processo_codigo, tipo_processo, numero_analise, count(*)
--     FROM analises_mac WHERE excluido_em IS NULL
--    GROUP BY 1,2,3 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS analises_mac_unica_por_numero
  ON analises_mac (processo_codigo, tipo_processo, numero_analise)
  WHERE excluido_em IS NULL;

-- Reversão:
-- DROP INDEX IF EXISTS analises_mac_unica_por_numero;
