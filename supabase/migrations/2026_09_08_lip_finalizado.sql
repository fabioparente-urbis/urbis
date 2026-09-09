-- "Finalizar LIP" — 08/09/2026, pedido do Fábio: botão que marca o LIP como finalizado por
-- enquanto (mesmo que incompleto) e exporta o Excel na hora. Diferente de `lip_incompleto`
-- (marca vermelho, "não terminei ainda"): `lip_finalizado` é "decidi parar por aqui e seguir
-- pro MAC com o que tem". Os dois podem coexistir (finalizou incompleto de propósito).
-- Escopo: Slot 1 (Regularização) e Slot 2 (Aceite SEI), por pedido explícito dele — o botão na
-- tela é condicionado por tipo_processo, a coluna existe pra todos sem problema.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS lip_finalizado    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lip_finalizado_em TIMESTAMPTZ;

COMMENT ON COLUMN processos.lip_finalizado IS
  'Analista clicou "Finalizar LIP" — decidiu parar de preencher e seguir pro MAC, mesmo que incompleto. Não é o mesmo que lip_incompleto (que é "sei que falta algo").';
COMMENT ON COLUMN processos.lip_finalizado_em IS
  'Quando "Finalizar LIP" foi clicado pela última vez.';
