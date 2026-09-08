-- 2026_09_08_urbi_regras_bloqueio_fase_b.sql
--
-- Fase B do pedido "URBI intervém em condições que impedem a análise": as duas condições que
-- exigiam ler o CONTEÚDO de um documento (não só título/presença), destravadas pelo Fábio
-- explicando como fazer sem prompt novo do zero — só campos novos nos prompts P2_EXTRACAO já
-- existentes (ver lib/carimboAssunto.ts e lib/cheadvAprovado.ts):
--
-- COND_ASSUNTO_ERRADO: carimbo do projeto não menciona a palavra do assunto cadastrado
-- (REGULARIZAÇÃO/ACEITE) — condição #6, antes fora de escopo por falta de dado.
-- COND_CHEADV_APTO: despacho CHEADV existe mas a CONCLUSÃO dele não aprova a documentação —
-- condição #7, antes só se sabia que o documento existia (nº SEI), não se aprovou.
--
-- ativo=false por padrão, mesmo motivo das demais (Slot 1/2 são produção crítica).

BEGIN;

INSERT INTO public.urbi_regras_bloqueio (chave, ativo, parametros) VALUES
  ('COND_ASSUNTO_ERRADO', false, '{}'::jsonb),
  ('COND_CHEADV_APTO', false, '{}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

COMMIT;
