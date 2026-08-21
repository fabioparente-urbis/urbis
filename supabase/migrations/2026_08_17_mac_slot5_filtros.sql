-- ============================================================================
-- Filtros de aplicabilidade do MAC — Slot 5 (Aprovação de Projeto)
--
-- Tira os filtros do código e põe no banco, para o analista criar e ajustar
-- pela tela sem depender de deploy. Cada filtro liga uma CONDIÇÃO (lida do LIP
-- ou do texto dos documentos da pasta) aos ITENS que saem da análise.
--
-- Escopo: exclusivo do Slot 5. Nenhuma tabela do Slot 1 é alterada; a tabela
-- nasce nova e ninguém mais a lê.
-- ============================================================================

create table if not exists mac_slot5_filtros (
  id            uuid primary key default gen_random_uuid(),

  -- Rótulo do botão, no vocabulário do analista: "NÃO É POSTO", "S/ MARQUISE".
  nome          text not null,
  descricao     text,
  ordem         integer not null default 100,
  ativo         boolean not null default true,

  -- Como o filtro decide sozinho:
  --   CAMPO_LIP_AUSENTE  todos os campos em `campos_lip` valem NP/NÃO   → aciona
  --   CAMPO_LIP_IGUAL    algum campo de `campos_lip` casa `valor_esperado` → aciona
  --   PALAVRA_AUSENTE    nenhum termo de `termos` aparece nos `papeis_documento` → aciona
  --   MANUAL             sem automação; só o botão na tela
  tipo_condicao text not null default 'MANUAL'
                check (tipo_condicao in ('CAMPO_LIP_AUSENTE','CAMPO_LIP_IGUAL','PALAVRA_AUSENTE','MANUAL')),

  campos_lip        text[] not null default '{}',
  valor_esperado    text,
  termos            text[] not null default '{}',
  papeis_documento  text[] not null default '{}',

  -- O que sai da análise quando o filtro aciona. Os três convivem e somam:
  --   grupos       → grupos inteiros
  --   itens_ids    → itens avulsos, escolhidos a dedo
  --   termos_item  → todo item cujo TEXTO cite um destes termos, em qualquer
  --                  grupo (palavra inteira, sem acento). É o que faz "APRO DE
  --                  PROJ" alcançar as linhas sobre modificação/acréscimo que
  --                  vivem espalhadas em Carimbo, Corredor Viário etc.
  grupos        text[] not null default '{}',
  itens_ids     uuid[] not null default '{}',
  termos_item   text[] not null default '{}',

  -- Status que os itens recebem. Hoje sempre 'nao_aplica'; a coluna existe
  -- para um filtro futuro que pré-marque conforme sem precisar de migration.
  status_alvo   text not null default 'nao_aplica'
                check (status_alvo in ('conforme','nao_conforme','nao_aplica')),

  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_mac_slot5_filtros_ativo on mac_slot5_filtros (ativo, ordem);

comment on table mac_slot5_filtros is
  'Filtros de aplicabilidade do MAC do Slot 5: condição lida do LIP/documentos → itens que saem da análise.';
comment on column mac_slot5_filtros.tipo_condicao is
  'CAMPO_LIP_AUSENTE | CAMPO_LIP_IGUAL | PALAVRA_AUSENTE | MANUAL. MANUAL não aciona sozinho.';
comment on column mac_slot5_filtros.itens_ids is
  'Itens avulsos de mac_checklist_itens, para quando o filtro não cobre o grupo inteiro.';

-- ── Flag "MAC não concluído" ────────────────────────────────────────────────
-- Espelha o `lip_incompleto` que já existe: marca o processo cujo MAC ficou pela
-- metade, para aparecer na pilha de processos. Coluna nova, ninguém mais a lê.
alter table processos add column if not exists mac_incompleto boolean not null default false;

comment on column processos.mac_incompleto is
  'MAC marcado como não concluído pelo analista (espelha lip_incompleto, que é do LIP).';

-- ── Carga inicial: as regras que hoje vivem em lib/mac-motor/slot5/aplicabilidade.ts ──
-- Idempotente: só insere se a tabela estiver vazia, para não duplicar em re-execução.
insert into mac_slot5_filtros (nome, descricao, ordem, tipo_condicao, campos_lip, valor_esperado, termos, papeis_documento, grupos, termos_item)
select * from (values
  ('APRO DE PROJ', 'Aprovação nova — cai tudo que é de modificação, acréscimo ou reforma', 10,
   'CAMPO_LIP_IGUAL', array['tipoProcessoLip'], 'APROVAÇÃO DE PROJETO', array[]::text[], array[]::text[],
   array['PROCESSOS MODIFICAÇÃO SEM ACRÉSCIMO','PROCESSOS MODIFICAÇÃO COM ACRÉSCIMO'],
   array['MODIFICACAO','MODIFICACOES','ACRESCIMO','ACRESCIMOS','REFORMA','REFORMAS']),

  ('COMERCIAL', 'Sem uso habitacional — cai tudo que é de residência/habitação', 20,
   'CAMPO_LIP_AUSENTE', array['habitacional','habSeriada','habColetiva','misto'], null, array[]::text[], array[]::text[],
   array['VAGAS PARA USO HABITACIONAL','HABITAÇÃO SERIADA',
         'HABITAÇÃO SERIADA E COLETIVA NÃO INTEGRANTES DE LOTEAMENTO',
         'QUANTO À APLICAÇÃO DO DF Nº 9.451, DE 26/07/2018',
         '47.QUANTO À APLICAÇÃO DO DF Nº 9.451, DE 26/07/2018 - APRESENTAR NO PROJETO',
         'ÍNDICE DE APROVEITAMENTO (Art. 196 da LC 349/2022)',
         'ÍNDICE DE APROVEITAMENTO PARA ATIVIDADE ECONÔMICA'],
   array['HABITACIONAL','HABITACAO','RESIDENCIAL','RESIDENCIA','MORADIA','QUITINETE','APARTAMENTO']),

  ('S/ ONEROSA', 'Sem outorga onerosa e sem TDC', 30,
   'CAMPO_LIP_AUSENTE', array['outorgaOnerosa','tDC'], null, array[]::text[], array[]::text[],
   array['COEFICIENTE DE APROVEITAMENTO BÁSICO NÃO ONEROSO E ONEROSO Art. 242 LC N°349 /2022) E TDC'], array[]::text[]),

  ('S/ BAIA DE DES', 'Sem baia de desaceleração de velocidade', 40,
   'CAMPO_LIP_AUSENTE', array['art163BaiaDeDesaceleracaoAa'], null, array[]::text[], array[]::text[],
   array['BAIA DE DESACELERAÇÃO DE VELOCIDADE'], array[]::text[]),

  ('NÃO É PENSÃO', 'Sem quitinete, pensão, pensionato ou casa de estudantes', 50,
   'CAMPO_LIP_AUSENTE', array['quitinete','quitineteEmAab130'], null, array[]::text[], array[]::text[],
   array['PENSAO, PENSIONATO E CASA DE ESTUDANTES – LC nº364/2023 – Art. 121'], array[]::text[]),

  ('NÃO É POSTO', 'Projeto não menciona posto, combustível nem abastecimento', 60,
   'PALAVRA_AUSENTE', array[]::text[], null, array['POSTO','COMBUSTIVEL','ABASTECIMENTO'], array['projeto','uso_solo'],
   array['POSTO DE COMBUSTIVEL – LC nº364/2023 – Art. 120',
         'Rebaixo para atividade: Posto de COMERCIO E COMBUSTÍVEL E SERVIÇOS AUTOMOTIVOS: §10º'], array[]::text[]),

  ('S/ MARQUISE', 'Projeto não menciona marquise', 70,
   'PALAVRA_AUSENTE', array[]::text[], null, array['MARQUISE','MARQUISES'], array['projeto'],
   array['MARQUISES E COBERTURAS'], array[]::text[]),

  ('S/ SUBSOLO', 'Projeto não menciona subsolo', 80,
   'PALAVRA_AUSENTE', array[]::text[], null, array['SUBSOLO'], array['projeto'],
   array['SUBSOLO AFLORADO (RECUO E ALTURA)'], array[]::text[]),

  ('S/ CARGA E DES', 'Projeto não menciona carga e descarga', 90,
   'PALAVRA_AUSENTE', array[]::text[], null, array['CARGA E DESCARGA','C/D'], array['projeto'],
   array['EXIGENCIA DE CARGA E DESCARGA – LEI DE ATIVI N°10.8450 DE 04/11/22 e INSTRUÇÃO NORMATIVA Nº8 01/10/2023',
         'SOLUÇÃO ALTERNATIVA PARA CARGA E DESCARGA EM EDIFICAÇÃO REGULAR EXISTENTE – Art. 17 LC n°10.845/2022)'], array[]::text[]),

  ('S/ EMB E DESE', 'Projeto não menciona embarque e desembarque', 100,
   'PALAVRA_AUSENTE', array[]::text[], null, array['EMBARQUE','DESEMBARQUE'], array['projeto'],
   array['EMBARQUE E DESEMBARQUE'], array[]::text[]),

  ('S/ EIT E EIV', 'Sem estudo de impacto de trânsito ou de vizinhança', 110,
   'PALAVRA_AUSENTE', array[]::text[], null, array['EIT','EIV','ESTUDO DE IMPACTO'], array['projeto','uso_solo'],
   array['EIT / EIV'], array[]::text[]),

  -- Condição pronta; a lista de grupos exclusivos de grande porte ainda precisa
  -- ser definida pelo analista — nenhum item do checklist diz "grande porte".
  ('MEDIO PORTE', 'Não é projeto de grande porte — DEFINIR OS GRUPOS', 120,
   'CAMPO_LIP_AUSENTE', array['grandePorte'], null, array[]::text[], array[]::text[],
   array[]::text[], array[]::text[]),

  -- Sem automação segura hoje: o corredor viário costuma SE APLICAR quando o uso
  -- do solo o declara. Fica como botão manual até existir condição confiável.
  ('S/ CORREDOR', 'Sem corredor viário — acionar à mão', 130,
   'MANUAL', array[]::text[], null, array[]::text[], array[]::text[],
   array['CORREDOR VIÁRIO'], array[]::text[])
) as v
where not exists (select 1 from mac_slot5_filtros);
