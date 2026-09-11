-- ============================================================================
-- Fase 4 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md
--
-- Tira as regras de identificação de peça/documento do código (`ASSINATURAS_PECA`
-- em lib/documentosSei/pecas.ts e `ASSINATURAS_CONTEUDO` em
-- lib/documentosSei/fatiar.ts) e põe no banco, para o analista adicionar ou
-- ajustar uma regra pela tela sem depender de deploy.
--
-- Uma tabela só para as duas famílias de regra, distinguidas pela coluna
-- `tabela` — mesmo "espírito" das duas listas de código, cada uma com seu
-- próprio conjunto de papéis válidos e seu próprio regime de comparação:
--   'peca'      → ASSINATURAS_PECA: testada contra o texto NORMALIZADO da
--                 página (minúsculo, sem acento) — regex sem acento, sem flag.
--   'conteudo'  → ASSINATURAS_CONTEUDO: testada contra o texto CRU da página,
--                 case-insensitive — regex pode ter classe de caractere
--                 acentuada, compilada com flag 'i' no código.
--
-- Escopo: só a leitura de PDF do SEI (Slots 1/2). Tabela nova, ninguém mais a
-- lê. Nenhum caminho de leitura muda de comportamento com esta migration
-- sozinha — o código só passa a LER daqui numa mudança separada, com fallback
-- para o array hardcoded se a tabela estiver vazia ou a leitura falhar.
-- ============================================================================

create table if not exists documentos_sei_regras_identificacao (
  id            uuid primary key default gen_random_uuid(),

  tabela        text not null check (tabela in ('peca', 'conteudo')),
  papel         text not null,
  regex         text not null,
  descricao     text,
  ordem         integer not null default 100,
  ativo         boolean not null default true,

  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_documentos_sei_regras_tabela_ativo
  on documentos_sei_regras_identificacao (tabela, ativo, ordem);

comment on table documentos_sei_regras_identificacao is
  'Regras de identificação de peça/documento do fatiador de PDF do SEI (Fase 4). Ordem importa: a primeira regra ativa que casar decide o papel.';
comment on column documentos_sei_regras_identificacao.tabela is
  'peca (ASSINATURAS_PECA, texto normalizado) | conteudo (ASSINATURAS_CONTEUDO, texto cru + regex case-insensitive)';
comment on column documentos_sei_regras_identificacao.papel is
  'Precisa ser um dos papéis que o código já reconhece (PapelPeca ou PapelPorConteudo) — papel desconhecido é ignorado na leitura, nunca inventa comportamento novo.';

-- ── Carga inicial: reproduz exatamente ASSINATURAS_PECA (lib/documentosSei/pecas.ts) ──
-- Idempotente: só insere se a tabela ainda não tiver nenhuma linha 'peca'.
insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem)
select * from (values
  ('peca', 'matricula',         '\b(certidao\s+de\s+matricula|registro\s+de\s+imoveis)\b', 10),
  ('peca', 'art_levantamento',  '\b(art|rrt)\b[^.]{0,40}\blevantamento\b|\blevantamento\b[^.]{0,40}\b(art|rrt)\b', 20),
  ('peca', 'art_caixa',         '\b(art|rrt)\b[^.]{0,40}\bcaixa\b|\bcaixa\b[^.]{0,40}\b(art|rrt)\b', 30),
  ('peca', 'art',               '\b(art\s+obra\s+ou\s+servico|anotacao\s+de\s+responsabilidade\s+tecnica|detalhes?\s+do\s+rrt|n[ºo°]?\s*(do\s+)?rrt)\b', 40),
  ('peca', 'levantamento',      '\blevantamento\s+(planialtimetrico|topografico)\b', 50),
  ('peca', 'projeto',           '\b(area\s+total\s+da\s+construcao|projeto\s+legal\s+de\s+arquitetura|quadro\s+de\s+areas)\b', 60),
  ('peca', 'laudo',             '\blaudo\s+(tecnico|de\s+vistoria|geologico|estrutural)?\b', 70),
  ('peca', 'vistoria',          '\b(relatorio\s+de\s+vistoria|relatorio\s+de\s+fiscalizacao|relatorio\s+circunstanciado)\b', 80),
  ('peca', 'foto',              '\b(registro\s+fotografico|fotografia|fotos?\s+do\s+local)\b', 90),
  ('peca', 'memorial',          '\bmemorial\s+(descritivo|de\s+calculo)\b', 100),
  ('peca', 'procuracao',        '\bprocuracao\b', 110),
  ('peca', 'embargo',           '\bembargo\b', 120),
  ('peca', 'despacho',          '^\s*despacho\b', 130),
  ('peca', 'parecer',           '^\s*parecer\b', 140),
  ('peca', 'oficio',            '^\s*of[ií]cio\b', 150),
  ('peca', 'requerimento',      '\brequerimento\b', 160),
  ('peca', 'email',             '\bde\s*:.*\bpara\s*:|assunto\s*:', 170),
  ('peca', 'certidao',          '\bcertidao\b', 180)
) as v
where not exists (select 1 from documentos_sei_regras_identificacao where tabela = 'peca');

-- ── Carga inicial: reproduz exatamente ASSINATURAS_CONTEUDO (lib/documentosSei/fatiar.ts) ──
-- Sem a flag 'i' embutida no texto — o código compila regra de 'conteudo' sempre case-insensitive.
insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem)
select * from (values
  ('conteudo', 'busca',    'busca(s)?\s+no\s+endere[çc]o|busca(s)?\s+de\s+processos?\s+arquivad|processos?\s+arquivad[oa]s?\s+no\s+endere[çc]o|projeto\s+anteriormente\s+aprovado', 10),
  ('conteudo', 'vistoria', 'termo\s+de\s+vistoria|relat[óo]rio\s+de\s+fiscaliza[çc][ãa]o|relat[óo]rio\s+de\s+vistoria|relat[óo]rio\s+circunstanciado', 20),
  ('conteudo', 'foto',     'registro\s+fotogr[áa]fico', 30)
) as v
where not exists (select 1 from documentos_sei_regras_identificacao where tabela = 'conteudo');
