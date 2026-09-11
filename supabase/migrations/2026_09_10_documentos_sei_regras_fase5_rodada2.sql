-- ============================================================================
-- Fase 5 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md — 2ª rodada
-- (10/09/2026): 2 papéis novos vindos de exemplos reais que o Fábio lembrou
-- depois da 1ª rodada — COMAER (RETORNOS/2026/08.17) e Outorga Onerosa
-- (RETORNOS/2026/06.22, Análise 3). Nenhum dos dois tem campo correspondente
-- no LIP ainda — só melhoram a classificação/cobertura do MHD.
--
-- Idempotente por linha, mesmo padrão da migration da 1ª rodada.
-- ============================================================================

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'liberacao_comaer', '\bcomando\s+da\s+aeronautica\b', 62,
  'Declaração de inexigibilidade do COMAER — documento federal, sem carimbo próprio do SEI. Medido em COMAER 10375631.pdf.'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'liberacao_comaer'
);

insert into documentos_sei_regras_identificacao (tabela, papel, regex, ordem, descricao)
select 'peca', 'outorga_onerosa', '\boutorga\s+onerosa\s+do\s+direito\s+de\s+construir\b', 63,
  'Certidão de Outorga Onerosa do Direito de Construir (OODC). Medido em ONEROSA 10072818.pdf pg. 2 — a frase completa evita casar a tabela técnica "quadro de áreas onerosa" da pg. 1 do mesmo PDF.'
where not exists (
  select 1 from documentos_sei_regras_identificacao where tabela = 'peca' and papel = 'outorga_onerosa'
);
