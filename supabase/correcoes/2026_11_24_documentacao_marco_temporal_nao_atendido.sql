-- 24/11/2026 (pedido do Fábio): novo item na aba "Documentação" do checklist — obra que não atende o
-- Marco Temporal. Regularização (Slots 1 e 3): 4 de março de 2022. Aceite (Slots 2 e 4): 19 de outubro de 1995.
-- Vai para o fim do grupo. Idempotente (não duplica).
-- Desfazer: DELETE FROM mac_checklist_itens WHERE texto LIKE 'Para pleitear o Alvará de Regularização é obrigatorio%';
BEGIN;
INSERT INTO mac_checklist_itens (modelo_id, grupo, texto, ordem, ativo)
SELECT m.id, 'Documentação',
  'Para pleitear o Alvará de Regularização é obrigatorio que as edificações estejam estruturalmente definidas após ' || v.marco || '. Entende-se por edificações estruturalmente definidas aquelas com a cobertura, lajes, alvenarias e revestimentos concluidos e definitivos. Está obra NÃO TEM DIREITO ao Alvará de Regularização por não atender o Marco Temporal segundo a Lei Complementar 314 de 2018;',
  COALESCE((SELECT MAX(i.ordem) FROM mac_checklist_itens i WHERE i.modelo_id = m.id AND i.grupo = 'Documentação'), 0) + 1,
  true
FROM mac_checklist_modelos m
JOIN (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, '4 de março de 2022'),
  ('2741eaa3-bd5e-477f-b672-d442c1ae4791'::uuid, '4 de março de 2022'),
  ('da29333d-0d9d-4a1b-a810-8dfe8ebbf6b4'::uuid, '19 de outubro de 1995'),
  ('3e86b19c-cd70-49f2-b972-2e5f966dbb60'::uuid, '19 de outubro de 1995')
) AS v(id, marco) ON v.id = m.id
WHERE NOT EXISTS (SELECT 1 FROM mac_checklist_itens x WHERE x.modelo_id = m.id
                  AND x.texto LIKE 'Para pleitear o Alvará de Regularização é obrigatorio%');
COMMIT;
