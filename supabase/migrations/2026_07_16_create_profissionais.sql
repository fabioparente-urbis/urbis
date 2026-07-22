-- Módulo Profissionais — Bloco B (fundação, sem motor de notas).
-- Entidade estruturada para responsáveis técnicos, ausente até aqui:
-- todo esse dado vivia como texto livre em processos.dados (JSONB).
--
-- processo_profissionais usa processo_id UUID com FK real — não repete o
-- padrão processo_codigo (TEXT, sem FK) que gerou órfãos em analises_mac
-- e mrp_registros.

CREATE TABLE IF NOT EXISTS profissionais (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_original    TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  tipo_pessoa      TEXT NOT NULL DEFAULT 'fisica',   -- 'fisica' | 'juridica'
  cau              TEXT,
  crea             TEXT,
  uf_conselho      TEXT,
  cpf_cnpj         TEXT,
  validado         BOOLEAN NOT NULL DEFAULT false,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  -- Soft merge reversível: nunca apaga o registro duplicado. Ele passa a
  -- apontar pra cá e some das listagens ativas, mas todo histórico e
  -- vínculo permanece íntegro — a união pode ser desfeita a qualquer
  -- momento zerando este campo.
  merged_into_id   UUID REFERENCES profissionais(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profissionais_nome_normalizado ON profissionais (nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_profissionais_cau ON profissionais (cau) WHERE cau IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profissionais_crea ON profissionais (crea) WHERE crea IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profissionais_merged_into ON profissionais (merged_into_id) WHERE merged_into_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS processo_profissionais (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id      UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  profissional_id  UUID NOT NULL REFERENCES profissionais(id),
  papel            TEXT NOT NULL,   -- 'autor_arquiteto' | 'responsavel_engenheiro'
  origem           TEXT NOT NULL DEFAULT 'backfill_jsonb',  -- 'backfill_jsonb' | 'manual' | 'lip'
  confianca        TEXT NOT NULL DEFAULT 'media',            -- 'alta' | 'media' | 'baixa'
  valor_original   TEXT,     -- valor exato como veio do JSONB, antes de normalizar
  campo_original   TEXT,     -- ex: 'nome_responsavel_arq'
  confirmado_por   UUID REFERENCES usuarios(id),
  confirmado_em    TIMESTAMPTZ,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_id, profissional_id, papel)
);

CREATE INDEX IF NOT EXISTS idx_processo_profissionais_processo ON processo_profissionais (processo_id);
CREATE INDEX IF NOT EXISTS idx_processo_profissionais_profissional ON processo_profissionais (profissional_id);

-- Registro de execuções de backfill — idempotência e auditoria de quando
-- e como os dados foram importados do JSONB legado.
CREATE TABLE IF NOT EXISTS profissionais_backfill_execucoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em     TIMESTAMPTZ,
  modo             TEXT NOT NULL,   -- 'dry_run' | 'aplicado'
  processos_lidos  INTEGER,
  profissionais_criados INTEGER,
  vinculos_criados INTEGER,
  ignorados_sentinela   INTEGER,
  detalhe          JSONB
);

COMMENT ON TABLE profissionais IS 'Entidade estruturada de responsáveis técnicos. Fase 1 do módulo Profissionais — sem notas, sem estatística, apenas cadastro + vínculo.';
COMMENT ON TABLE processo_profissionais IS 'Vínculo N:N entre processos e profissionais, com FK real (processo_id) e proveniência completa por registro.';
COMMENT ON COLUMN profissionais.merged_into_id IS 'Se preenchido, este registro foi unificado a outro (soft merge). Nunca excluir a linha; para desfazer, zerar este campo.';
