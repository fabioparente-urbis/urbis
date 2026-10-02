-- ============================================================================
-- Classificação manual de item → filtro (MAC do Slot 5)
--
-- O analista abre o botão 🏷️ de um item do checklist e diz a QUAL filtro ele pertence (ou a nenhum).
-- É a forma de ir otimizando os filtros aos poucos, item a item, enquanto analisa — sem editar a
-- lista de ids de cada filtro nem mexer em código.
--
-- Regra (a classificação manual SEMPRE vence a automática — grupos, termos_item, itens_ids, termos):
--   · linha com filtro = 'banco:<uuid do mac_slot5_filtros>' → o item pertence SÓ a esse filtro;
--   · linha com filtro = 'tema:<id do filtro de tema da tela>' → idem, para os filtros de tema;
--   · linha com filtro = 'nenhum' → o item não pertence a filtro nenhum;
--   · sem linha → vale a regra automática de hoje.
-- Só vale para as PRÓXIMAS aplicações de filtro; análises já marcadas não mudam.
--
-- Escopo: exclusivo do Slot 5 (os itens são do modelo do Slot 5). Só o servidor (service_role) lê/escreve.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mac_slot5_item_filtro (
  item_id       uuid PRIMARY KEY REFERENCES public.mac_checklist_itens(id) ON DELETE CASCADE,
  filtro        text NOT NULL CHECK (filtro = 'nenhum' OR filtro ~ '^(banco|tema):.+'),
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mac_slot5_item_filtro IS
  'Classificação manual item → filtro do MAC do Slot 5 (vence a regra automática). Sem linha = automático.';

ALTER TABLE public.mac_slot5_item_filtro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mac_slot5_item_filtro FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mac_slot5_item_filtro TO service_role;

COMMIT;
