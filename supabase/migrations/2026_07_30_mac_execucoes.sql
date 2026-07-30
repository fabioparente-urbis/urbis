-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-07-30 · MAC — camada de EXECUÇÃO. Infraestrutura, sem motor de regras.
--
-- A rastreabilidade (lib/rastreabilidade/) já separa REGRA GERAL (no código, igual em
-- todo processo) de EXECUÇÃO (o que aconteceu num processo). Para o LIP essa execução
-- mora em mhd_resultados_campo. Para o MAC ainda não existia onde morar — é isso que
-- estas três tabelas resolvem.
--
-- Hierarquia:
--   mac_execucoes        → uma rodada do motor sobre um processo, numa versão de
--                           LIP+MAC+BIP. Imutável depois de concluída.
--   mac_resultados_item  → o resultado de UM item do MAC, dentro de uma execução.
--                           O valor original NUNCA é sobrescrito — é o mesmo princípio
--                           de `mhd_resultados_campo.valor` vs `valor_manual`.
--   mac_resultados_revisoes → toda correção humana sobre um resultado, com quem,
--                           quando e por quê. O resultado original continua intacto
--                           em mac_resultados_item; a revisão é sempre um registro
--                           NOVO, nunca um UPDATE destrutivo.
--
-- Reexecução: rodar o motor de novo sobre o mesmo processo cria uma NOVA linha em
-- mac_execucoes — a anterior nunca é apagada nem alterada. É o que torna a
-- reexecução seguRA (idempotente do ponto de vista de quem chama: repetir a operação
-- não corrompe nem duplica o histórico já concluído).
--
-- O cadastro do MAC (mac_checklist_itens, 768 itens) continua imutável por esta
-- migration — nenhuma coluna nova aqui, nenhum vínculo alterado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── mac_execucoes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mac_execucoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id    UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,

  -- snapshot de versão das três matrizes no momento desta execução — o que permite
  -- reproduzir exatamente o que o motor viu, mesmo que LIP/MAC/BIP evoluam depois
  versao_lip     TEXT NOT NULL,
  versao_mac     TEXT NOT NULL,
  versao_bip     TEXT NOT NULL,

  status         TEXT NOT NULL DEFAULT 'EM_EXECUCAO'
                 CHECK (status IN ('EM_EXECUCAO','CONCLUIDA','ERRO','CANCELADA')),

  iniciado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em   TIMESTAMPTZ,
  duracao_ms     INT,

  criado_por     UUID REFERENCES usuarios(id),
  metadata_json  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS mac_execucoes_processo_idx ON mac_execucoes(processo_id);
CREATE INDEX IF NOT EXISTS mac_execucoes_status_idx   ON mac_execucoes(status);

COMMENT ON TABLE mac_execucoes IS
  'Uma rodada do motor do MAC sobre um processo. Imutável após concluido_em ser
   preenchido — reexecutar cria uma linha nova, nunca sobrescreve esta.';
COMMENT ON COLUMN mac_execucoes.versao_lip IS
  'Identificador reproduzível (hash ou versão) da matriz LIP usada nesta execução.';
COMMENT ON COLUMN mac_execucoes.versao_mac IS
  'Identificador reproduzível (hash ou versão) da matriz MAC (ITENS_MAC_SLOT5) usada nesta execução.';
COMMENT ON COLUMN mac_execucoes.versao_bip IS
  'Identificador reproduzível (hash ou versão) do conjunto de vínculos BIP usado nesta execução.';

-- ── mac_resultados_item ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mac_resultados_item (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id      UUID NOT NULL REFERENCES mac_execucoes(id) ON DELETE CASCADE,
  mac_item_id      UUID NOT NULL REFERENCES mac_checklist_itens(id) ON DELETE CASCADE,

  aplicabilidade   TEXT NOT NULL
                   CHECK (aplicabilidade IN ('APLICAVEL','NAO_APLICAVEL','INDETERMINADO','ERRO_DADOS')),
  resultado        TEXT NOT NULL
                   CHECK (resultado IN ('CONFORME','NAO_CONFORME','PENDENTE','NAO_AVALIADO','REVISAO_MANUAL')),
  confianca        TEXT CHECK (confianca IN ('ALTA','MEDIA','BAIXA')),
  justificativa    TEXT NOT NULL,

  -- reprodutibilidade: o que o motor leu e usou para decidir, congelado no momento da execução
  evidencias_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  campos_lip_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  vinculos_bip_json   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- qual regra declarativa decidiu, e em que versão dela
  regra_id         TEXT NOT NULL,
  regra_versao     INT NOT NULL DEFAULT 1,

  requer_revisao   BOOLEAN NOT NULL DEFAULT false,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (execucao_id, mac_item_id)
);

CREATE INDEX IF NOT EXISTS mac_resultados_item_execucao_idx ON mac_resultados_item(execucao_id);
CREATE INDEX IF NOT EXISTS mac_resultados_item_item_idx     ON mac_resultados_item(mac_item_id);
CREATE INDEX IF NOT EXISTS mac_resultados_item_revisao_idx  ON mac_resultados_item(requer_revisao)
  WHERE requer_revisao;

COMMENT ON TABLE mac_resultados_item IS
  'Resultado de um item do MAC dentro de uma execução. Uma linha por (execucao_id,
   mac_item_id) — nunca é atualizada depois de criada; correções humanas vivem à
   parte em mac_resultados_revisoes, preservando este valor original.';
COMMENT ON COLUMN mac_resultados_item.campos_lip_json IS
  'Snapshot dos valores do LIP efetivamente lidos por esta regra, para reproduzir o
   resultado mesmo que o LIP mude depois.';
COMMENT ON COLUMN mac_resultados_item.regra_id IS
  'Identificador da regra declarativa que produziu este resultado (núcleo versionado
   fora da tela — FASE 4, ainda não implementada nesta migration).';

-- ── mac_resultados_revisoes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mac_resultados_revisoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado_item_id   UUID NOT NULL REFERENCES mac_resultados_item(id) ON DELETE CASCADE,
  usuario_id          UUID NOT NULL REFERENCES usuarios(id),

  resultado_anterior  TEXT NOT NULL
                      CHECK (resultado_anterior IN ('CONFORME','NAO_CONFORME','PENDENTE','NAO_AVALIADO','REVISAO_MANUAL')),
  resultado_novo      TEXT NOT NULL
                      CHECK (resultado_novo IN ('CONFORME','NAO_CONFORME','PENDENTE','NAO_AVALIADO','REVISAO_MANUAL')),
  justificativa       TEXT NOT NULL,

  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mac_resultados_revisoes_item_idx ON mac_resultados_revisoes(resultado_item_id);

COMMENT ON TABLE mac_resultados_revisoes IS
  'Trilha de auditoria de correções humanas sobre mac_resultados_item. Cada override
   do analista é uma linha NOVA aqui — nunca um UPDATE em mac_resultados_item. O
   resultado "efetivo" de um item é a revisão mais recente, se houver, senão o
   original. Justificativa é obrigatória: não existe correção silenciosa.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO:
--   DROP TABLE IF EXISTS mac_resultados_revisoes;
--   DROP TABLE IF EXISTS mac_resultados_item;
--   DROP TABLE IF EXISTS mac_execucoes;
-- ─────────────────────────────────────────────────────────────────────────────
