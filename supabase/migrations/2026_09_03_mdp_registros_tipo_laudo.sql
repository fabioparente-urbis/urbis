-- 2026_09_03_mdp_registros_tipo_laudo.sql
--
-- BUG REAL achado durante auditoria da Inteligência URBIS (Fase H/G — "se encontrar problema
-- de schema ou CHECK, corrija apenas se puder demonstrar em transação com ROLLBACK que é
-- defeito de aplicação/schema, sem mudar conteúdo jurídico"): lib/mdpGravar.ts
-- (gravarRegistroMDPLaudo, linha ~63-74) sempre gravou `tipo: "laudo"` em mdp_registros —
-- essa função existe especificamente porque o Laudo era o satélite que faltava no MDP
-- (comentário no topo do próprio arquivo, referência ao ADENDO do CLAUDE.md sobre módulo
-- principal disparar pra todos os satélites). Mas mdp_registros_tipo_check só permite
-- 'interno', 'despacho', 'indeferimento', 'arquivamento' — NUNCA incluiu 'laudo'.
--
-- Resultado real, confirmado hoje (0 linhas com tipo='laudo' na tabela e insert de teste
-- reproduzindo falha): TODA emissão de Laudo, desde que este código existe, falhou
-- silenciosamente ao tentar se registrar no MDP (a função captura o erro de propósito — "o
-- laudo NÃO deve quebrar se o MDP estiver fora" — então a emissão do documento nunca quebrou,
-- só o registro satélite ficou sempre ausente). Exatamente o caso que o CLAUDE.md descreve:
-- "uma emissão que não chega ao MDP deixa campos do LIP aguardando o fato pra sempre".
--
-- Correção mínima: só adiciona 'laudo' à lista já existente do CHECK. Não muda nenhum valor
-- gravado, não mexe em despacho/checklist/numeração de nenhum slot — mdp_registros é tabela
-- satélite compartilhada (módulo MDP do CLAUDE.md), não uma regra operacional de slot. Nenhum
-- conteúdo jurídico é alterado.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE mdp_registros DROP CONSTRAINT mdp_registros_tipo_check;
ALTER TABLE mdp_registros ADD CONSTRAINT mdp_registros_tipo_check CHECK (tipo IN (
  'interno', 'despacho', 'indeferimento', 'arquivamento', 'laudo'
));

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- 1) ANTES da correção: insert com tipo='laudo' reproduzindo exatamente o payload de
--    gravarRegistroMDPLaudo (lib/mdpGravar.ts) confirmado REJEITADO pela constraint antiga —
--    prova de que o bug é real, não suposição de leitura de código.
-- 2) DROP+ADD CONSTRAINT rodado dentro de transação de teste: insert com tipo='laudo' agora
--    aceito; insert com tipo fora da lista (ex.: 'qualquer_coisa') continua rejeitado; os 4
--    tipos antigos continuam aceitos. Tudo desfeito por ROLLBACK, confirmado por fora que a
--    constraint antiga ainda valia — só então aplicada de verdade.
-- ======================================================================
