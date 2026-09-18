-- ============================================================
-- Slot 1 (Regularização SEI) — checklist, grupo "No Setor Central/APL:
-- Art.15 LC 314/2018:" (a primeira aba do MAC).
--
-- Pedido direto do Fábio (18/09/2026), com foto da tela e foto do documento de
-- referência da chefia: "no MAC do slot 1 essa aba ta com itens repetidos...
-- mandei a foto do que o checklist tinha que olhar nesta aba". A foto de
-- referência confirma: era pra ser 1 item só com os pontos em lista — igual
-- ao que já foi corrigido no Aceite (Slot 2) mais cedo hoje, mesmo defeito,
-- byte a byte igual (mesmo texto, mesma duplicata do bullet "índice
-- paisagístico mínimo de 15%").
--
-- JÁ APLICADO EM PRODUÇÃO via script avulso — este arquivo é o registro,
-- mesmo padrão de supabase/correcoes/2026_09_18_*.sql. Idempotente.
--
-- CONFERIDO ANTES DE APLICAR (diferente do Aceite, que não tinha nenhuma
-- marcação): 96 análises reais do Slot 1 têm marcação nesses 8 itens — mas
-- em TODAS elas, os 8 itens do grupo estavam sempre marcados com o MESMO
-- status entre si (ex.: todos "nao_aplica", ou todos "conforme") — nunca
-- um diferente do outro. Isso é evidência de que os analistas sempre
-- usaram "Todos Conformes"/"Todos N/A" nesse grupo, nunca item a item.
-- Por isso, manter o item sobrevivente (92112534, ordem 1) COM O MESMO
-- status que ele já tinha em cada análise preserva o resultado exibido —
-- nenhuma análise muda de "conforme" para outra coisa. Os 6 itens
-- desativados (nunca apagados) simplesmente deixam de aparecer soltos.
--
-- Slot 1 tocado com autorização explícita desta mensagem do Fábio, ESCOPO
-- RESTRITO a este único grupo do checklist — nada mais do Slot 1 foi
-- tocado nesta sessão.
-- ============================================================
BEGIN;

UPDATE mac_checklist_itens
   SET texto = 'As normas previstas abaixo terão validade de 01 ano a partir da regulamentação do respectivo APL. (averiguar data).' || chr(10) ||
                'Para as novas edificações, quais sejam, uso habitacional e atividades econômicas na tipologia de macro-projeto, localizadas no setor Central e nas áreas delimitadas com APL Modas – Arranjo Produtivo Local da Moda, fica estabelecidos os seguintes parâmetros abaixo:' || chr(10) ||
                '•Atender ocupação de 100% até altura de 14,50 m;' || chr(10) ||
                '•Não incidirão recuos frontais, laterais e fundos mínimos obrigatórios até a altura de 14,50m da edificação;' || chr(10) ||
                '•Permitido o índice de ocupação de 100% entre 14,50 m e 32,00 desde que respeitado os recuos ou afastamentos da LC 349/2024;' || chr(10) ||
                '•As alturas da edificação serão medidas a partir do nível 0,00;' || chr(10) ||
                '•Atender índice paisagístico mínimo de 15%, podendo ser em cobertura vegetal não permeável;' || chr(10) ||
                '•Atender 1 vaga/ 60 m² de área destinada à atividade econômica;' || chr(10) ||
                '•Para demais parâmetros urbanísticos atender Legislação vigente; (§1º) – averiguar unidade territorial em que estiver inserida;',
       atualizado_em = now()
 WHERE id = '92112534-c1ff-430f-a4e0-ed4bf1f7fe30'
   AND ativo;

UPDATE mac_checklist_itens SET ativo = false, atualizado_em = now()
 WHERE id IN (
   '9109a59a-06be-4ff0-8c93-79125398324c',
   '5ddb932b-5969-4181-9b7a-8004e1f88d86',
   '0b172e38-9012-40c5-bece-e0c62857a3ff',
   'a9ce95a9-6d1d-4018-9750-a188a0ed71bb',
   '6c5f315b-2885-4c46-866a-0da1d76b2bea',
   'd2b971bd-28f3-4004-a2f4-04929f0483a3'
 ) AND ativo;

-- O item dos templos religiosos (1e7c1380) é regra distinta e NÃO foi tocado.

COMMIT;
