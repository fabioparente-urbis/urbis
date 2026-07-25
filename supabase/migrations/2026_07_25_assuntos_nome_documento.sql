-- 2026_07_25_assuntos_nome_documento.sql
--
-- Separa o nome de TELA do nome que sai no DOCUMENTO.
--
-- Motivo: na tela o analista pensa em "Regularização SEI" / "Aceite SEI"
-- (o trilho de trabalho, o mesmo vocabulário da lista de Processos e do
-- MRP). No documento, porém, o cabeçalho "Assunto:" é ato oficial e
-- precisa continuar dizendo ALVARÁ DE REGULARIZAÇÃO / ALVARÁ DE ACEITE —
-- Regularização, Aceite e, no futuro, os equivalentes PED são todos
-- espécies de alvará. Um campo só não atende os dois usos.
--
-- Regra: `assuntos.nome` = tela. `assuntos.nome_documento` = cabeçalho do
-- .docx. NULL em nome_documento significa "usa o nome de tela" — é o
-- comportamento de todos os slots novos, que nascem sem nada aqui.
-- Quem lê é `assuntoParaDocumento()` em lib/geradores.ts (faz o UPPER).
--
-- Aditiva e idempotente. Bloco de reversão comentado no fim.

ALTER TABLE assuntos
  ADD COLUMN IF NOT EXISTS nome_documento TEXT;

COMMENT ON COLUMN assuntos.nome IS
  'Nome de TELA do slot (admin, dropdown de abrir processo, listas).';
COMMENT ON COLUMN assuntos.nome_documento IS
  'Texto do cabecalho "Assunto:" nos documentos gerados. NULL = usa `nome`.';

-- Congela o texto que os documentos JÁ vinham imprimindo, antes de trocar
-- o nome de tela. Sem isto, o rename abaixo mudaria o despacho junto.
UPDATE assuntos SET nome_documento = 'Alvará de Regularização'
 WHERE slug = 'regularizacao' AND nome_documento IS NULL;

UPDATE assuntos SET nome_documento = 'Alvará de Aceite'
 WHERE slug = 'aceite_sei' AND nome_documento IS NULL;

-- Agora sim, o nome de tela.
UPDATE assuntos SET nome = 'Regularização SEI' WHERE slug = 'regularizacao';
UPDATE assuntos SET nome = 'Aceite SEI'        WHERE slug = 'aceite_sei';

-- Grafia do tipo_processo dos modelos de MAC: o auto-clone gravava o slug
-- em MAIÚSCULAS ("SLOT_05") enquanto os modelos antigos usam minúsculo
-- ("regularizacao"). O campo não é usado em busca (o filtro é por
-- assunto_id), mas divergência de grafia aqui já custou caro antes.
UPDATE mac_checklist_modelos m
   SET tipo_processo = a.slug
  FROM assuntos a
 WHERE m.assunto_id = a.id
   AND m.tipo_processo IS DISTINCT FROM a.slug;

-- ── REVERSÃO (não rodar junto) ───────────────────────────────────────
-- UPDATE assuntos SET nome = 'Alvará de Regularização' WHERE slug = 'regularizacao';
-- UPDATE assuntos SET nome = 'Alvará de Aceite'        WHERE slug = 'aceite_sei';
-- ALTER TABLE assuntos DROP COLUMN IF EXISTS nome_documento;
