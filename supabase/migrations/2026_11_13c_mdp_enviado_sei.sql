-- 2026_11_13c_mdp_enviado_sei.sql
-- "Enviou no SEI?": o analista confirma que o despacho/parecer emitido foi para o SEI.
-- Rodar no SQL Editor do projeto kfpupmwd.
ALTER TABLE mdp_registros
  ADD COLUMN IF NOT EXISTS enviado_sei_em timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_sei_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_sei_dispensado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mdp_registros.enviado_sei_em IS 'Quando o analista confirmou o envio ao SEI (hora do servidor).';
COMMENT ON COLUMN mdp_registros.enviado_sei_dispensado IS 'true = registro anterior ao recurso, tratado como ja resolvido (nao alerta).';

-- Tudo que ja existe hoje fica "tratado": o alerta vale so dali para frente.
UPDATE mdp_registros SET enviado_sei_dispensado = true WHERE enviado_sei_em IS NULL;

-- Desfazer:
--   ALTER TABLE mdp_registros DROP COLUMN IF EXISTS enviado_sei_em, DROP COLUMN IF EXISTS enviado_sei_por, DROP COLUMN IF EXISTS enviado_sei_dispensado;
