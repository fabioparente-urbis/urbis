-- 2026_09_10_urbi_cond_imovel_duplicado.sql
--
-- 8ª condição bloqueante do URBI (pedido do Fábio, 10/09/2026): só é permitido UMA Regularização
-- SEI (tipo_processo='regularizacao') OU UM Aceite SEI (tipo_processo='aceite_sei') por imóvel.
-- Identificação do imóvel: IPTU primeiro (dados.iptu), endereço (logradouro+quadra+lote) quando
-- não há IPTU gravado — ver acharImovelConflitante em lib/bdi/vigia.ts.
--
-- O que conta como conflito: qualquer OUTRO processo do mesmo imóvel cujo status NÃO seja
-- INDEFERIDO/ARQUIVADO/ARQUIVADO_DUPLICADO. Indeferido não conta (o projeto não atendia a lei
-- naquela vez, não impede tentar de novo); mas um alvará já aprovado/concluído CONTA PRA SEMPRE
-- — o mesmo imóvel não pode ganhar um segundo alvará de regularização anos depois (pedido
-- explícito do Fábio). Por isso não é só "processo em andamento": é qualquer processo que não
-- terminou em reprovação.
--
-- ativo=false por padrão, mesmo motivo das demais (Slot 1/2 são produção crítica).

BEGIN;

INSERT INTO public.urbi_regras_bloqueio (chave, ativo, parametros) VALUES
  ('COND_IMOVEL_DUPLICADO', false, '{}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

COMMIT;
