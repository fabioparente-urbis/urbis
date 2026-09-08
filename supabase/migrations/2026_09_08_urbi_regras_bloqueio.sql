-- 2026_09_08_urbi_regras_bloqueio.sql
--
-- Fase A do pedido "URBI intervém em condições que impedem a análise"
-- (docs/URBIS_PLANO_ASSESSOR_ATIVO.md, ver plano de sessão em
-- ~/.claude/plans/floating-humming-orbit.md): cada uma das condições
-- bloqueantes (Slot 1 = Regularização SEI, Slot 2 = Aceite SEI) precisa de um
-- liga/desliga PRÓPRIO, não um interruptor único — pedido explícito do Fábio.
--
-- ativo default FALSE em todas as linhas: Slot 1/2 são produção crítica
-- (CLAUDE.md), a feature é aditiva e nova, então só liga quem decidir ligar,
-- regra por regra, depois de ver funcionando. `parametros` só é usado pela
-- regra dos 180 dias hoje (limiares configuráveis sem precisar mexer em
-- código), mas fica genérico pra caber parâmetro de qualquer regra futura.

BEGIN;

CREATE TABLE IF NOT EXISTS public.urbi_regras_bloqueio (
    chave text PRIMARY KEY,
    ativo boolean NOT NULL DEFAULT false,
    parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
    criado_em timestamp with time zone NOT NULL DEFAULT now(),
    atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.urbi_regras_bloqueio IS
  'Liga/desliga por regra das condições que fazem o URBI avisar/bloquear a análise de um
   processo (Slot 1 e Slot 2). Fail-safe DESLIGADO em erro de leitura, mesmo padrão de
   lib/documentosSei/config.ts. Editada por SQL direto até valer a pena UI de admin.';
COMMENT ON COLUMN public.urbi_regras_bloqueio.parametros IS
  'Limiares específicos da regra, ex.: {"diasBloqueio":180,"diasAviso":170} para
   COND_180_DIAS. Vazio ({}) para regras sem parâmetro.';

INSERT INTO public.urbi_regras_bloqueio (chave, ativo, parametros) VALUES
  ('COND_180_DIAS', false, '{"diasBloqueio":180,"diasAviso":170}'::jsonb),
  ('COND_FISCAL_DIVERGE', false, '{}'::jsonb),
  ('COND_MARCO_TEMPORAL', false, '{}'::jsonb),
  ('COND_USO_SOLO', false, '{}'::jsonb),
  ('COND_BUSCA_ENDERECO', false, '{}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

COMMIT;
