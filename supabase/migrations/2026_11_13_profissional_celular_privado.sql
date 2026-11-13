-- Celular do responsável técnico — dado PRIVADO, só o Administrador lê/grava,
-- exclusivamente pela rota /api/admin/profissional-celular (service role).
-- Tabela separada de propósito: fora de processos.dados, para não vazar para
-- MDP, URBI, exportações, documentos nem para o celular (/api/mobile).
CREATE TABLE IF NOT EXISTS profissional_celular (
  profissional_id UUID PRIMARY KEY REFERENCES profissionais(id),
  celular         TEXT NOT NULL,
  atualizado_por  UUID REFERENCES usuarios(id),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profissional_celular ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profissional_celular FROM anon, authenticated;
