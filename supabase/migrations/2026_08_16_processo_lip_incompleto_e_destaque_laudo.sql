-- Dois recursos pedidos pelo usuário para o LIP (Slot 1 — Regularização SEI
-- e Slot 2 — Aceite SEI; a tela do LIP em app/processo/ProcessoClient.tsx é
-- compartilhada pelos dois, então uma coluna só em `processos` serve aos
-- dois tipos):
--
-- 1) lip_incompleto: botão na tela do LIP pra marcar "LIP não concluído".
--    Quando true, o card do processo na pilha (app/processos/page.tsx)
--    fica com fundo vermelho bem suave. Desmarcando, volta ao normal.
--
-- 2) laudo_campos_ocultos: lista de chaves de campo (lip_campos.chave) que
--    o analista desligou manualmente do destaque verde. Por padrão (array
--    vazio) todo campo que alimenta o Laudo (ver CAMPOS_LAUDO em
--    ProcessoClient.tsx, espelhando app/api/mac/gerar-laudo/route.ts) fica
--    com fundo verde clarinho; o analista pode apagar esse destaque campo a
--    campo sem que ele fique "verde pra sempre".
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS lip_incompleto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS laudo_campos_ocultos text[] NOT NULL DEFAULT '{}';
