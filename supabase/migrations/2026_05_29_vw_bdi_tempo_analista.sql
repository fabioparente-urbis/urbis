-- View de tempo bruto e líquido por analista × processo × dia/semana/mês/ano
-- Criada em 29/05/2026
CREATE OR REPLACE VIEW vw_bdi_tempo_analista AS
SELECT
  u.nome AS analista, u.id AS usuario_id, s.pagina AS processo,
  (date_trunc('day', s.iniciada_em))::date AS dia,
  date_part('week', s.iniciada_em)::int AS semana,
  date_part('month', s.iniciada_em)::int AS mes,
  date_part('year', s.iniciada_em)::int AS ano,
  round(sum(s.duracao_min), 2) AS minutos_brutos,
  round(sum(GREATEST(0, s.duracao_min - COALESCE(s.tempo_pausado, 0) / 60.0)), 2) AS minutos_liquidos,
  count(*) AS total_sessoes,
  max(s.ultimo_ping) AS ultimo_acesso
FROM urbis_sessoes s
JOIN usuarios u ON u.id = s.usuario_id
WHERE s.status = 'encerrada' AND s.duracao_min IS NOT NULL
GROUP BY u.nome, u.id, s.pagina,
  (date_trunc('day', s.iniciada_em))::date,
  date_part('week', s.iniciada_em),
  date_part('month', s.iniciada_em),
  date_part('year', s.iniciada_em)
ORDER BY ano DESC, mes DESC, dia DESC, analista;
