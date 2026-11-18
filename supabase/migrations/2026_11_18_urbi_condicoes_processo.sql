-- 2026_11_18_urbi_condicoes_processo.sql
-- Condições bloqueantes do URBI por processo (Slots 1-4), para a Pilha mostrar o ícone do URBI
-- sem recalcular o Vigia de 200 processos (lição do Radar, 22/09).
--   · urbi_condicoes_processo: o que o Vigia achou na última vez que o LIP foi aberto
--     (recalcula) ou o MAC foi aberto (revisa). Uma linha por (processo, condição).
--   · urbi_condicoes_dispensa: dispensa com quem/quando/motivo. Vale só para a MESMA evidência
--     (evidencia_hash); evidência mudou → a condição volta. "Refazer" do admin revoga todas.
-- Rodar no SQL Editor do projeto kfpupmwd.
CREATE TABLE IF NOT EXISTS urbi_condicoes_processo (
  processo_codigo text NOT NULL,
  condicao_id text NOT NULL,
  titulo text NOT NULL,
  detalhe text NOT NULL,
  evidencia_hash text NOT NULL,
  origem text NOT NULL,          -- 'lip' | 'mac' | 'admin'
  visto_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (processo_codigo, condicao_id)
);
CREATE TABLE IF NOT EXISTS urbi_condicoes_dispensa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_codigo text NOT NULL,
  condicao_id text NOT NULL,
  evidencia_hash text NOT NULL,
  motivo text NOT NULL,
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  revogada_em timestamptz,
  revogada_por uuid REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS urbi_condicoes_dispensa_proc ON urbi_condicoes_dispensa (processo_codigo) WHERE revogada_em IS NULL;
-- Sem policy: só as rotas (service role) leem e gravam.
ALTER TABLE urbi_condicoes_processo ENABLE ROW LEVEL SECURITY;
ALTER TABLE urbi_condicoes_dispensa ENABLE ROW LEVEL SECURITY;

-- Desfazer: DROP TABLE IF EXISTS urbi_condicoes_dispensa; DROP TABLE IF EXISTS urbi_condicoes_processo;
