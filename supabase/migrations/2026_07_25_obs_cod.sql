-- 2026_07_25_obs_cod.sql
--
-- OBS COD — caderno de observações sobre o código, dentro do próprio
-- sistema.
--
-- Motivo: as decisões e pendências técnicas vinham sendo combinadas em
-- conversa e se perdiam. Coisas que precisam sobreviver à memória de
-- quem estava na sala: "a escolha da tela do MAC está fixa no código",
-- "o laudo do slot 5 ainda aponta para o template da Regularização",
-- "a trava de orçamento do Gemini nunca funcionou porque ninguém escreve
-- na tabela que ela consulta".
--
-- Não é bug tracker nem TODO de tarefa: é registro de por que o sistema
-- é como é, e do que se sabe que está torto e ainda não foi endireitado.
--
-- Aditiva. Reversão comentada no fim.

CREATE TABLE IF NOT EXISTS obs_cod (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       TEXT NOT NULL,
  texto        TEXT NOT NULL DEFAULT '',
  -- Onde dói: 'arquitetura' | 'bug' | 'decisao' | 'pendencia' | 'risco'
  categoria    TEXT NOT NULL DEFAULT 'pendencia',
  -- 'aberto' | 'resolvido'. Resolvido não some — vira histórico do porquê.
  situacao     TEXT NOT NULL DEFAULT 'aberto',
  -- Onde no sistema (arquivo, rota, módulo). Texto livre de propósito.
  onde         TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por   UUID,
  atualizado_em TIMESTAMPTZ,
  resolvido_em  TIMESTAMPTZ,
  resolvido_por UUID
);

COMMENT ON TABLE obs_cod IS
  'Caderno de observacoes tecnicas: decisoes, pendencias e riscos conhecidos do codigo.';

CREATE INDEX IF NOT EXISTS idx_obs_cod_abertas
  ON obs_cod (criado_em DESC) WHERE situacao = 'aberto';

-- ── REVERSÃO (não rodar junto) ───────────────────────────────────────
-- DROP INDEX IF EXISTS idx_obs_cod_abertas;
-- DROP TABLE IF EXISTS obs_cod;
