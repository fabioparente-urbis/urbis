-- Versiona a meta mensal de pontos, para que alterar a meta não reescreva
-- o julgamento dos meses já fechados.
--
-- Antes: a meta era o valor fixo META_BASE = 100 no código (lib/mrp.ts), e o
-- campo "Meta Mensal de Pontos" da tela de administração gravava em
-- urbis_config.meta_processos_mensal — que o painel do MRP nunca lia. Ou seja,
-- mudar a meta pela tela não surtia efeito nenhum; e se surtisse, valeria
-- retroativamente para todos os meses do histórico.
--
-- Agora cada meta tem data de início de vigência. O painel resolve, para cada
-- mês exibido, qual meta estava valendo naquele mês.

CREATE TABLE IF NOT EXISTS mrp_meta_historico (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta          NUMERIC NOT NULL CHECK (meta > 0),
  -- Primeiro dia do mês a partir do qual esta meta vale.
  vigente_desde DATE NOT NULL UNIQUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por    UUID REFERENCES usuarios(id)
);

COMMENT ON TABLE mrp_meta_historico IS
  'Histórico de metas mensais de pontos. O painel usa, para cada mês, a meta com maior vigente_desde <= primeiro dia daquele mês.';

CREATE INDEX IF NOT EXISTS idx_mrp_meta_historico_vigencia
  ON mrp_meta_historico (vigente_desde DESC);

-- Semeia com a meta que sempre valeu (100), a partir de uma data anterior a
-- qualquer registro — assim todo o histórico continua sendo avaliado pelos
-- mesmos 100 pts que valiam quando foi trabalhado.
INSERT INTO mrp_meta_historico (meta, vigente_desde)
SELECT 100, DATE '2020-01-01'
WHERE NOT EXISTS (SELECT 1 FROM mrp_meta_historico);
