-- 2026_09_05_urbi_radar_retratos.sql
--
-- Radar silencioso incremental da Pilha (Camada 1 da arquitetura mestra do URBI) — autorizado
-- explicitamente pelo Fábio em 05/09/2026, DEPOIS de urbis_config.visao_ligada ter sido desligada
-- (script descartável, registrado em auditoria_eventos) e de a auditoria confirmar que não existe
-- nenhum mecanismo de trigger/evento em LIP/MAC/MDP/documento neste banco — a detecção de mudança
-- é por DIFF DE TIMESTAMP (processos.atualizado_em, analises_mac.atualizado_em, mdp_registros.
-- criado_em, mac_historico.criado_em, mhd_documentos.atualizado_em), nunca por trigger novo —
-- ZERO alteração em rota de escrita de LIP/MAC/MDP/documento/despacho/numeração.
--
-- Esta tabela é ao mesmo tempo o RETRATO (histórico, uma linha por versão) e a FILA (linhas com
-- estado='pendente' são itens aguardando processamento) — um único mecanismo, sem tabela de fila
-- separada, pra manter o desenho o menor possível.
--
-- REGRA DO FÁBIO: "reutilize a mesma função factual do dossiê, para não divergir contagens,
-- situações ou alertas". Por isso os campos abaixo são sempre PROJEÇÃO do que
-- lib/urbi/montarDossie.ts (montarDossieFactual) e lib/urbi/motorProducao.ts
-- (montarRelatorioMotor) já calculam — nunca um cálculo novo. Nunca grava dado pessoal
-- (proprietário/CPF/contato) — só o mesmo recorte factual que já é seguro pro Gemini.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE TABLE IF NOT EXISTS urbi_radar_retratos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_codigo       TEXT NOT NULL,
  tipo_processo         TEXT,
  versao                INTEGER NOT NULL DEFAULT 1,

  estado                TEXT NOT NULL CHECK (estado IN (
                          'pendente', 'em_atualizacao', 'atualizado', 'erro', 'incompleto'
                        )),
  motivo_disparo        TEXT NOT NULL,
  fontes_consultadas    TEXT[] NOT NULL DEFAULT '{}',

  -- Projeção direta de situacoes.* (lib/bdi/situacao.ts, via montarDossieFactual) — nunca
  -- recalculado aqui.
  situacao_geral        TEXT,
  situacao_lip          TEXT,
  situacao_mac          TEXT,

  -- Projeção direta de lip.campos_vazios/campos_em_x/campos_totais (fonte canônica única desde a
  -- Fase AE, vw_bdi_campos_criticos) e das contagens de mac.pendencias/itens_em_branco.
  campos_vazios         INTEGER,
  campos_em_x           INTEGER,
  campos_totais         INTEGER,
  pendencias_mac        INTEGER,
  itens_em_branco_mac   INTEGER,

  -- Relatório inteiro do Motor de Produção (lib/urbi/motorProducao.ts), reaproveitado — nunca
  -- recalculado: { situacao, acoes: [...], esforco, motivo }.
  alertas               JSONB,

  cobertura_completa    BOOLEAN,
  fontes_indisponiveis  TEXT[] NOT NULL DEFAULT '{}',

  -- O maior atualizado_em/criado_em (entre processos/analises_mac/mdp_registros/mac_historico/
  -- mhd_documentos) observado NO MOMENTO em que este retrato foi calculado — é contra ISTO que a
  -- próxima detecção de mudança compara, nunca contra um relógio próprio do Radar.
  watermark_fontes      TIMESTAMPTZ,

  iniciado_em           TIMESTAMPTZ,
  concluido_em          TIMESTAMPTZ,
  erro                  TEXT,

  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS urbi_radar_retratos_processo_versao_idx
  ON urbi_radar_retratos(processo_codigo, versao DESC);
CREATE INDEX IF NOT EXISTS urbi_radar_retratos_fila_idx
  ON urbi_radar_retratos(estado, criado_em) WHERE estado IN ('pendente', 'em_atualizacao');

ALTER TABLE public.urbi_radar_retratos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urbi_radar_retratos FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE urbi_radar_retratos IS
  'Retrato factual versionado por processo (Radar silencioso, Camada 1 da arquitetura mestra do
   URBI) — mesma tabela serve de histórico (uma linha por versão) e de fila incremental (estado
   =''pendente''). Só leitura de lib/urbi/montarDossie.ts + lib/urbi/motorProducao.ts, nunca
   recálculo próprio. Nunca chama Gemini. Nunca escreve em LIP/MAC/MDP/documento/despacho/
   numeração — é observador puro.';
COMMENT ON COLUMN urbi_radar_retratos.motivo_disparo IS
  'Por que este retrato foi (re)calculado — ex.: "nunca analisado", "LIP/tags alterados", "MAC
   alterado", "MDP alterado", "documento (MHD) alterado". Nunca um palpite, sempre a fonte real
   que o diff de timestamp encontrou mudada.';
COMMENT ON COLUMN urbi_radar_retratos.watermark_fontes IS
  'MAX(atualizado_em/criado_em) das fontes relevantes no momento do cálculo — usado pela PRÓXIMA
   varredura de detecção pra decidir se o processo mudou de novo desde então.';

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 05/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- CREATE TABLE + índices + RLS + REVOKE + COMMENT rodados dentro de transação de teste: insert
-- de exemplo com estado='pendente' confirmado aceito; insert com estado fora do enum confirmado
-- REJEITADO pelo CHECK; consulta filtrando estado IN ('pendente','em_atualizacao') usando o
-- índice parcial confirmada funcionando; SELECT como anon (chave publishable) confirmado 401/
-- vazio, nunca dado real. Tudo desfeito por ROLLBACK, confirmado por fora que a tabela não
-- existia — só então aplicada de verdade.
-- ======================================================================
