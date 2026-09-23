-- Radar do URBI (22/09/2026) — passa a guardar UMA LINHA POR PROCESSO (upsert), não uma linha
-- por passada. Sem isso, qualquer processo cujo watermark mude vira linha nova pra sempre — foi
-- o que acumulou 40.995 retratos pra 89 processos e derrubou o banco (ver
-- docs/URBIS_RADAR_DESLIGADO_22SET.md).
--
-- A limpeza manual de 22/09 já deixou a tabela com exatamente 1 linha por processo_codigo — este
-- índice único é o que impede a tabela de voltar a crescer sem controle, forçando o código
-- (lib/urbi/radar.ts) a fazer upsert em vez de insert.
create unique index if not exists urbi_radar_retratos_processo_codigo_uidx
  on urbi_radar_retratos (processo_codigo);
