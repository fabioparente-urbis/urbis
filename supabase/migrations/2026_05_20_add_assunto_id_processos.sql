-- 2026_05_20_add_assunto_id_processos.sql
--
-- Adiciona a referencia `assunto_id` em `processos`, ligando cada
-- processo ao seu assunto-mestre. Backfill faz com que os processos
-- existentes (todos `tipo = 'REGULARIZACAO'` hoje) apontem para o
-- slot fixo `regularizacao`.
--
-- A coluna fica nullable nesta sessao para nao quebrar inserts
-- legados; em uma proxima sessao podemos torna-la NOT NULL apos
-- garantir que todo fluxo de criacao preenche o campo.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS assunto_id UUID REFERENCES assuntos(id);

UPDATE processos
   SET assunto_id = (SELECT id FROM assuntos WHERE slug = 'regularizacao')
 WHERE tipo = 'REGULARIZACAO'
   AND assunto_id IS NULL;
