-- Achado da auditoria do BDI (02/09/2026, 47 linhas órfãs), investigado a fundo em 09/09/2026:
-- 9 linhas de `mrp_registros` têm `processo_codigo` errado — preenchido com `numero_fisico` (o
-- protocolo físico) em vez do código real do processo. O campo `numero_sei` de cada uma já
-- tinha o valor certo, e cada um foi conferido contra `processos.codigo` antes desta migration
-- (todos existem, ativos, `excluido_em IS NULL`) — não é suposição, é reapontamento confirmado.
--
-- Os outros ~15 órfãos investigados na mesma auditoria NÃO entram aqui: são produtividade de
-- serviço "fora do URBIS" (observação "Lançado a partir da planilha de produção"), processo que
-- nunca existiu como linha em `processos` — não tem pra onde reapontar, e não é bug.
--
-- IDs e de/para conferidos por script (Node + supabase-js) contra o banco de produção antes de
-- escrever esta migration — não repetir a investigação, os 9 já estão fechados.

UPDATE mrp_registros SET processo_codigo = '25.5.000088425-0' WHERE id = 'eeb437fc-d187-4558-b483-7fb0f47100b0' AND processo_codigo = '92459732';
UPDATE mrp_registros SET processo_codigo = '25.5.000048240-3' WHERE id = '2a2f1006-cda6-46e2-a7bd-336e83bcf5c2' AND processo_codigo = '92396753';
UPDATE mrp_registros SET processo_codigo = '25.5.000087937-0' WHERE id = 'dc64184e-d3ea-48fe-b04b-21191ba52e11' AND processo_codigo = '92458691';
UPDATE mrp_registros SET processo_codigo = '25.5.000081902-5' WHERE id = '9a78f9d6-0ee3-48f6-a36b-06caa0f354f3' AND processo_codigo = '92448181';
UPDATE mrp_registros SET processo_codigo = '24.5.000050678-0' WHERE id = 'f573cd0d-0fcc-4560-b309-91bc018571f2' AND processo_codigo = '92259425';
UPDATE mrp_registros SET processo_codigo = '25.5.000027562-9' WHERE id = '950bb289-9920-4b75-92d5-f1e7410561b5' AND processo_codigo = '92360041';
UPDATE mrp_registros SET processo_codigo = '25.5.000020730-5' WHERE id = '4fb2f706-f937-4d4c-99b3-e2d0109ece3e' AND processo_codigo = '92347589';
UPDATE mrp_registros SET processo_codigo = '25.5.000081077-0' WHERE id = '0b9d7e93-a05e-4806-8fbc-2ae693b27c4f' AND processo_codigo = '92446741';
UPDATE mrp_registros SET processo_codigo = '24.5.000057800-5' WHERE id = '4956657f-a0c2-459a-a9e9-e79b71cd4bee' AND processo_codigo = '25.5.000059276-4';

-- Achado no mesmo levantamento: 9 linhas de `analises_mac.tipo_processo` gravadas
-- 'REGULARIZACAO' maiúsculo (o padrão do resto do sistema é 'regularizacao' minúsculo) — sem
-- ambiguidade nenhuma, é só diferença de caixa.
UPDATE analises_mac SET tipo_processo = 'regularizacao' WHERE tipo_processo = 'REGULARIZACAO';
