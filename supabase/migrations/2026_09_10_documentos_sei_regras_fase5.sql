-- ============================================================================
-- Fase 5 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md — carga do
-- conhecimento do analista (entrevista 10/09/2026: fluxo Atende Fácil → CONTEC
-- → CHEADV → GEFEP → DIRAAP, e conferência contra documentos reais separados
-- à mão pelo Fábio em 09.04 e 09.08/2026).
--
-- Acrescenta 5 regras 'peca' novas à tabela criada na Fase 4
-- (2026_09_10_documentos_sei_regras_identificacao.sql). Cada regra tem
-- exemplo real medido — ver comentário ao lado de ASSINATURAS_PECA em
-- lib/documentosSei/pecas.ts, mantido idêntico a este arquivo.
--
-- Idempotente por linha (cada INSERT confere a própria existência antes de
-- inserir), diferente da carga inicial da Fase 4 que conferia a tabela
-- inteira — aqui a tabela já pode ter linhas de outra origem.
-- ============================================================================

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'processo_fisico', '\bsolicita\s+o\s+alvara\s+de\s+(regularizacao|aceite)\b', 5,
  'Capa do processo físico (Atende Fácil). Medido em FISICO 3941406.pdf/5340648.pdf — só confirmado para regularização.'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'processo_fisico'
);

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'uso_solo', '\buso\s+do\s+solo\b', 6,
  'Certidão de uso do solo do CONTEC — só Regularização. Medido em USO 4167740.pdf e 5444163.pdf (dois carimbos diferentes, frase comum "uso do solo").'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'uso_solo'
);

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'ortofoto', '\bmapa\s+urbano\s+basico\s+digital\s+de\s+goiania\b', 65,
  'Foto aérea/mapa urbano digital de Goiânia, exigida por lei no rol da CHEADV. Medido em ORTOFOTO 5607055.pdf.'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'ortofoto'
);

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'notificacao_calcada', '\bnotificacao\s+calcada\s+n\b', 95,
  'Notificação de calçada irregular do GEFEP. Medido em NOTIFICACAO DA CALÇADA 6797870.pdf (pg. 4).'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'notificacao_calcada'
);

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'despacho_cheadv', '\bcheadv\b[^.]{0,60}\bconforme\b|\bconforme\b[^.]{0,60}\bcheadv\b', 100,
  'Despacho de CONFORMIDADE documental da CHEADV (não confundir com despacho de pendência) — mesmo teste do compararLip.ts:REGRAS/seiCheadv. Medido em CHEADV 6635217.pdf ("Despacho 956 - CHEADV - Documentação conforme").'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'despacho_cheadv'
);
