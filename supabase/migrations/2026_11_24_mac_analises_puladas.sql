-- 2026_11_24_mac_analises_puladas.sql
-- Botão "pular análise" no MAC dos 5 slots (Fábio, 24/11/2026): a análise N foi feita por outro analista
-- ou no Excel. Dentro do MAC a marca liga e desliga (fixada = false); ao SAIR do MAC ela vira fixa
-- (fixada = true) e ninguém mais desfaz. Tabela própria: não é análise (não conta no MRP, não gera
-- despacho, não aparece nos satélites) — só libera a próxima e faz o servidor numerar a seguinte certo.
CREATE TABLE IF NOT EXISTS mac_analises_puladas (
  processo_codigo text NOT NULL,
  numero_analise int NOT NULL CHECK (numero_analise BETWEEN 1 AND 20),
  fixada boolean NOT NULL DEFAULT false,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  fixada_em timestamptz,
  PRIMARY KEY (processo_codigo, numero_analise)
);
-- Sem policy: só as rotas (service role) leem e gravam.
ALTER TABLE mac_analises_puladas ENABLE ROW LEVEL SECURITY;

-- Desfazer: DROP TABLE IF EXISTS mac_analises_puladas;
