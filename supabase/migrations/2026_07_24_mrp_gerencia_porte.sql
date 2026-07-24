-- 2026_07_24_mrp_gerencia_porte.sql
--
-- Separa dois conceitos que estavam na MESMA coluna.
--
-- Situacao anterior: `mrp_registros.porte` guardava GERECCO/GERAED/GERAGP,
-- que sao GERENCIAS, e o valor era DEDUZIDO DA AREA da obra
-- (lib/mrp.ts inferirPorte: >2000 -> GERAGP, >540 -> GERAED, senao GERECCO).
-- A tela do MRP rotulava essa coluna como "Gerencia". Resultado: a gerencia
-- exibida mudava conforme o tamanho da edificacao, e nao conforme quem
-- assinou o documento.
--
-- A partir daqui:
--   - `gerencia` = gerencia do ANALISTA na data da emissao (congelada).
--                  Congelada de proposito: se a pessoa mudar de gerencia,
--                  o historico de produtividade nao pode se reescrever.
--   - `porte`    = PP | MP | GP, porte da EDIFICACAO pela area construida.
--
-- A PONTUACAO NAO MUDA: o calculo em uso (lib/mrp-pontuacao.ts, tabela
-- mrp_pontuacao) considera apenas tipo_despacho + area_construida e nunca
-- leu esta coluna. As faixas de area seguem identicas.
--
-- Idempotente. Reversao no fim.

ALTER TABLE mrp_registros
  ADD COLUMN IF NOT EXISTS gerencia TEXT;

CREATE INDEX IF NOT EXISTS idx_mrp_registros_gerencia
  ON mrp_registros (gerencia, ano, mes);

COMMENT ON COLUMN mrp_registros.gerencia IS
  'Gerencia do analista NA DATA DA EMISSAO (GERECCO/GERAED/GERAGP), copiada '
  'de usuarios.gerencia. Congelada: nao acompanha mudanca de lotacao.';

COMMENT ON COLUMN mrp_registros.porte IS
  'Porte da EDIFICACAO pela area construida: PP (<=540 m2), MP (<=2000 m2), '
  'GP (>2000 m2). Ate 2026-07-24 esta coluna guardava a gerencia por engano.';

-- O default 'MP' da criacao da tabela volta a fazer sentido agora que a
-- coluna e porte de novo.
ALTER TABLE mrp_registros ALTER COLUMN porte SET DEFAULT 'MP';

-- ─────────────────────────────────────────────────────────────────────
-- REVERSAO (nao rodar junto):
--   DROP INDEX IF EXISTS idx_mrp_registros_gerencia;
--   ALTER TABLE mrp_registros DROP COLUMN IF EXISTS gerencia;
--   ALTER TABLE mrp_registros ALTER COLUMN porte SET DEFAULT 'GERAED';
--   (os valores de `porte` voltam pelo backup JSON do backfill)
-- ─────────────────────────────────────────────────────────────────────
