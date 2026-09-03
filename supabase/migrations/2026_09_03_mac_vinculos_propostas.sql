-- 2026_09_03_mac_vinculos_propostas.sql
--
-- Fila + procedimento manual de vinculação LIP/BIP — autorizado explicitamente pelo Fábio em
-- 03/09/2026 para os assuntos Regularização SEI e Aceite SEI (achado da Fase 4 de "TAREFA DA
-- NOITE": 0% de vínculo BIP e ~24% de vínculo LIP nesses dois assuntos, ver
-- supabase/migrations/... auditoria em memória urbis-matriz-lip-mac-bip).
--
-- REGRA DO FÁBIO: "não criar vínculo jurídico automático nem citar lei sem vínculo real ou consulta
-- BIP citável". Por isso este NÃO é um mecanismo de vínculo direto — é uma FILA de PROPOSTAS: toda
-- proposta de vínculo BIP só pode referenciar um `bdi_lei_fragmentos.id` real (FK, nunca texto
-- livre — a busca em app/api/mac/vinculos-fila/buscar-bip retorna só fragmentos que já existem no
-- banco), e nenhuma proposta vira vínculo de verdade (`mac_lip_vinculos`/`mac_bip_vinculos`) sem
-- passar por aprovação administrativa explícita (status pendente → aprovado, nunca automático).
--
-- 8 passos do procedimento manual (proposto na Fase 4, agora implementado):
--   1. selecionar item MAC (app/api/mac/vinculos-fila GET)
--   2. ver campos LIP relacionados (app/api/mac/vinculos-fila/buscar-lip)
--   3. pesquisar fragmentos do BIP (app/api/mac/vinculos-fila/buscar-bip)
--   4. escolher artigo/campo (POST propor, referência real, nunca texto solto)
--   5. indicar confiança (ALTA/MEDIA/BAIXA, coluna `confianca`, mesma escala de
--      mac_lip_vinculos/mac_bip_vinculos)
--   6. registrar justificativa (coluna `justificativa`, obrigatória e não vazia)
--   7. revisão/aprovação administrativa (POST decidir, exige `ctx.irrestrito`, nunca o mesmo
--      usuário que propôs decidindo a própria proposta — ver validação na rota)
--   8. histórico de alterações (linha nunca é apagada; status transita pendente→aprovado/rejeitado,
--      com decidido_por/decidido_em/motivo_decisao; cada transição também vira evento em
--      auditoria_eventos, módulo MAP, ver lib/auditoria-tipos.ts)
--
-- Escopo restrito a Regularização/Aceite SEI é aplicado na API (mac_checklist_itens.modelo_id →
-- mac_checklist_modelos.tipo_processo), não em CHECK de banco — mesmo padrão de decisão já usado
-- neste recorte (ver lib/mac-motor/slot5/autorizacao.ts para o equivalente do Slot 5).
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE TABLE IF NOT EXISTS mac_vinculos_propostas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_item_id      UUID NOT NULL REFERENCES mac_checklist_itens(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('LIP', 'BIP')),

  -- só preenchido quando tipo='LIP' — mesma convenção de texto livre de mac_lip_vinculos.lip_chave
  -- (não há tabela normalizada de campos do LIP para Regularização/Aceite; lip_campos existe, mas
  -- referenciar por id em vez de chave quebraria a simetria com o mecanismo legado chave_lip).
  lip_chave        TEXT,
  papel            TEXT CHECK (papel IN (
                     'ENTRADA_REGRA', 'CONDICAO_APLICABILIDADE', 'EVIDENCIA',
                     'PARAMETRO_CALCULO', 'CONTEXTO', 'RESULTADO_ESPERADO'
                   )),
  obrigatorio      BOOLEAN,

  -- só preenchido quando tipo='BIP' — SEMPRE um fragmento real (FK), nunca texto solto.
  bip_fragmento_id UUID REFERENCES bdi_lei_fragmentos(id) ON DELETE RESTRICT,

  confianca        TEXT NOT NULL CHECK (confianca IN ('ALTA', 'MEDIA', 'BAIXA')),
  justificativa    TEXT NOT NULL CHECK (length(trim(justificativa)) > 0),

  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  criado_por       UUID NOT NULL REFERENCES usuarios(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidido_por     UUID REFERENCES usuarios(id),
  decidido_em      TIMESTAMPTZ,
  motivo_decisao   TEXT,

  -- exatamente um dos dois lados preenchido, de acordo com `tipo`
  CONSTRAINT mac_vinculos_propostas_forma_valida CHECK (
    (tipo = 'LIP' AND lip_chave IS NOT NULL AND papel IS NOT NULL AND obrigatorio IS NOT NULL AND bip_fragmento_id IS NULL)
    OR
    (tipo = 'BIP' AND bip_fragmento_id IS NOT NULL AND lip_chave IS NULL AND papel IS NULL AND obrigatorio IS NULL)
  ),
  -- decisão sempre completa junto (nunca só metade do rastro)
  CONSTRAINT mac_vinculos_propostas_decisao_coerente CHECK (
    (status = 'pendente' AND decidido_por IS NULL AND decidido_em IS NULL)
    OR
    (status IN ('aprovado', 'rejeitado') AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
  )
);

-- Evita duas propostas PENDENTES idênticas (mesmo item + mesmo alvo) — depois de decidida, uma
-- nova proposta para o mesmo alvo é permitida (ex.: reproposta depois de rejeição).
CREATE UNIQUE INDEX IF NOT EXISTS mac_vinculos_propostas_pendente_lip_idx
  ON mac_vinculos_propostas (mac_item_id, lip_chave)
  WHERE status = 'pendente' AND tipo = 'LIP';
CREATE UNIQUE INDEX IF NOT EXISTS mac_vinculos_propostas_pendente_bip_idx
  ON mac_vinculos_propostas (mac_item_id, bip_fragmento_id)
  WHERE status = 'pendente' AND tipo = 'BIP';

CREATE INDEX IF NOT EXISTS mac_vinculos_propostas_item_idx ON mac_vinculos_propostas(mac_item_id);
CREATE INDEX IF NOT EXISTS mac_vinculos_propostas_status_idx ON mac_vinculos_propostas(status);

COMMENT ON TABLE mac_vinculos_propostas IS
  'Fila de propostas de vínculo LIP/BIP para itens do MAC (hoje restrita por API a Regularização/
   Aceite SEI). Nunca é o vínculo em si — só aprovação administrativa grava em mac_lip_vinculos/
   mac_bip_vinculos. Linha nunca é apagada; status transita pendente→aprovado/rejeitado.';

REVOKE ALL ON public.mac_vinculos_propostas FROM anon, authenticated, PUBLIC;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- Ver scripts/_tmp_* (apagados depois de usar): CREATE TABLE + índices + REVOKE rodados dentro de
-- uma transação controlada externamente, inserção de exemplo (proposta LIP e proposta BIP)
-- confirmada respeitando os CHECKs, tentativa de inserção inválida (tipo=LIP com bip_fragmento_id
-- preenchido) confirmada REJEITADA pelo CHECK, tudo desfeito por ROLLBACK, confirmado por fora que
-- a tabela não existia — só então aplicada de verdade.
-- ======================================================================
