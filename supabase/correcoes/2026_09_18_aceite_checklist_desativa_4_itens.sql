-- ============================================================
-- Slot 2 (Aceite) — checklist, Bloco D do plano
-- docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md, decisões do Fábio em 18/09/2026.
--
-- JÁ APLICADO EM PRODUÇÃO via script avulso — este arquivo é o registro, mesmo padrão de
-- supabase/correcoes/2026_09_18_*.sql. Pode rodar de novo (idempotente).
--
-- Desativa 4 itens do checklist do Aceite que ainda copiavam regra do Slot 1 (Regularização),
-- confirmados pelo Fábio para desativar (nunca apagar):
--   - b1f69e47: CNAE conforme "Uso do Solo Específico" — uso do solo é dispensado no Aceite.
--   - 522314ae: caixa de recarga "acima de 250 m²" como obrigação — no Aceite a caixa não é
--     exigida por padrão (Título II não repete o Art. 2º §4º do Título I).
--   - 02589912: ART da caixa "indispensável... Art.2º §4º" — mesmo problema, cita o artigo do
--     Título I sem o limiar de área fazer sentido no Aceite.
--   - 70f42389: "Rever Uso do Solo. A atividade TEM USO ESPECÍFICO" — não se aplica.
--
-- NÃO desativado (Fábio confirmou, 18/09: "Sim, vale no Aceite"): os 3 itens de corredor viário
-- (c557f20f, 83ec2c26, 21c86749) — regra urbanística geral, vale independente do imóvel ser
-- antigo ou novo. Ficam ativos, sem mudança.
-- ============================================================
BEGIN;

UPDATE mac_checklist_itens SET ativo = false, atualizado_em = now()
 WHERE id IN (
   'b1f69e47-2fec-4cd7-9883-64e845e40fd2',
   '522314ae-49d2-4d4a-a5b3-cb04dda603ab',
   '02589912-deaf-49b7-84fb-ac48183a694e',
   '70f42389-6ce3-4312-b0af-8fd2523a6d1a'
 ) AND ativo;

COMMIT;
