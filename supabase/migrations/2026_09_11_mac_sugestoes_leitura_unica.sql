-- 2026_09_11_mac_sugestoes_leitura_unica.sql
--
-- Fase 9B do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md: quando a leitura combinada
-- (interruptor urbis_config.leitura_unica_lip_mac_ativo) roda a partir do botão LER PROCESSO do
-- LIP (app/api/lip/s3/route.ts), o bloco do checklist MAC produzido na mesma chamada precisa
-- ficar em algum lugar até o analista abrir a tela do MAC (app/analise-regularizacao/[codigo] ou
-- app/analise-aceite-sei/[codigo]) — são páginas diferentes, sem estado compartilhado.
--
-- Por que não reaproveitar documentos_ia_cache (Fase 8): aquela tabela é chaveada por HASH de
-- bytes do arquivo (para não pagar duas vezes pelo MESMO PDF); a tela do MAC não tem o arquivo
-- nem o hash disponível quando abre — só o código do processo. Chave própria aqui.
--
-- `aplicado=false` por padrão: a tela do MAC mostra um aviso "IA já leu isso pelo LIP — aplicar
-- sugestões?" e só marca aplicado=true quando o analista clicar (nunca aplica sozinho — mesmo
-- princípio de "proposta, nunca grava sozinho" das Fases 7/8).

BEGIN;

CREATE TABLE IF NOT EXISTS public.mac_sugestoes_leitura_unica (
  processo_codigo text PRIMARY KEY,
  sugestao        jsonb NOT NULL,
  aplicado        boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mac_sugestoes_leitura_unica IS
  'Fase 9B: sugestão de checklist MAC produzida pela leitura combinada do LIP (LER PROCESSO),
   aguardando o analista aplicar na tela do MAC. Uma leitura nova sobrescreve a anterior do mesmo
   processo (upsert por processo_codigo) e reseta aplicado para false.';

COMMIT;

-- ======================================================================
-- Ainda NÃO aplicada. Rodar em transação de teste com ROLLBACK antes de aplicar de verdade,
-- mesmo padrão das migrations anteriores desta fase.
-- ======================================================================
