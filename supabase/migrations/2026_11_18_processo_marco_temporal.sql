-- 2026_11_18_processo_marco_temporal.sql
-- "Marco Temporal atendido?" marcado pelo analista no MAC dos Slots 1-4. Um por processo.
-- Tabela própria (e não processos.dados) porque o salvar do LIP regrava `dados` inteiro.
-- Com valor 'sim', o URBI não mostra o aviso "Marco temporal não atendido" (lib/bdi/vigia.ts).
CREATE TABLE IF NOT EXISTS processo_marco_temporal (
  processo_codigo text PRIMARY KEY,
  valor text NOT NULL CHECK (valor IN ('sim','nao')),
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
-- Sem policy: só a rota (service role) lê e grava.
ALTER TABLE processo_marco_temporal ENABLE ROW LEVEL SECURITY;

-- Desfazer: DROP TABLE IF EXISTS processo_marco_temporal;
