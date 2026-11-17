-- 2026_11_17_processo_lembretes.sql
-- Lembrete pessoal por processo na Pilha. Um por (processo, usuário).
-- Visível: autor, gerente da gerência do autor, Diretor/a e Administrador (regra na rota, service role).
-- Rodar no SQL Editor do projeto kfpupmwd.
CREATE TABLE IF NOT EXISTS processo_lembretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_codigo text NOT NULL,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_codigo, usuario_id)
);
-- Sem policy nenhuma: anon/authenticated não leem; só a rota (service role).
ALTER TABLE processo_lembretes ENABLE ROW LEVEL SECURITY;

-- Desfazer: DROP TABLE IF EXISTS processo_lembretes;
