-- 24/11/2026 (pedido do Fábio): novo item na aba "Documentação" do checklist dos Slots 1, 2, 3 e 4.
-- Incompatibilidade do último levantamento com o Laudo de Vistoria -> recolher taxa de nova vistoria
-- e pedir novo laudo da fiscalização. Vai para o fim do grupo. Idempotente (não duplica).
-- Desfazer: DELETE FROM mac_checklist_itens WHERE texto LIKE 'Incompatibilidade do último levantamento com o Laudo de Vistoria%';
BEGIN;
INSERT INTO mac_checklist_itens (modelo_id, grupo, texto, ordem, ativo)
SELECT m.id, 'Documentação',
  'Incompatibilidade do último levantamento com o Laudo de Vistoria. Recolher taxa de nova vistoria e solicitar novo laudo da fiscalização devido a mudança da área construída após vistoria;',
  COALESCE((SELECT MAX(i.ordem) FROM mac_checklist_itens i WHERE i.modelo_id = m.id AND i.grupo = 'Documentação'), 0) + 1,
  true
FROM mac_checklist_modelos m
WHERE m.id IN ('00000000-0000-0000-0000-000000000001','da29333d-0d9d-4a1b-a810-8dfe8ebbf6b4',
               '2741eaa3-bd5e-477f-b672-d442c1ae4791','3e86b19c-cd70-49f2-b972-2e5f966dbb60')
  AND NOT EXISTS (SELECT 1 FROM mac_checklist_itens x WHERE x.modelo_id = m.id
                  AND x.texto LIKE 'Incompatibilidade do último levantamento com o Laudo de Vistoria%');
COMMIT;
