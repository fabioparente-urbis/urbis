-- 2026_09_03_mac_checklist_itens_historico.sql
--
-- Fase D do plano de Inteligência URBIS (histórico vivo do catálogo LIP/MAC) — autorizado pelo
-- Fábio em 03/09/2026. Auditoria antes de mexer: quem escreve em mac_checklist_itens hoje é só
-- app/api/mac/checklists/itens/route.ts (POST cria, PUT atualiza, DELETE faz soft-delete via
-- `.update({ativo:false})` — nunca DELETE físico) e app/api/mac/checklists/itens/bulk/route.ts
-- (insert em lote, importação). Nenhuma dessas rotas chama autenticar() nem grava quem fez a
-- mudança — por isso `registrado_por` fica quase sempre nulo aqui (documentado, não inventado).
--
-- Menor estrutura auditável: 1 tabela + 1 trigger. O trigger só OBSERVA e REGISTRA — nunca
-- bloqueia, nunca modifica NEW, nunca toca LIP/MAC/despacho/numeração/MRP/fluxo de nenhum slot.
-- Só dispara em INSERT/UPDATE de mac_checklist_itens (a tabela do catálogo, não a análise).
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

CREATE TABLE IF NOT EXISTS mac_checklist_itens_historico (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID NOT NULL,
  modelo_id        UUID,
  -- tipo_processo (slot) é copiado do modelo NA HORA — se um item mudar de modelo um dia,
  -- a linha antiga continua dizendo o slot que valia quando o evento aconteceu.
  tipo_processo    TEXT,
  acao             TEXT NOT NULL CHECK (acao IN ('criado', 'atualizado', 'desativado', 'reativado')),
  -- {campo: {de, para}} — só campo técnico do checklist (grupo/texto/ref/chave_lip/
  -- fundamento_legal/condicao_aplicabilidade/ordem/ativo). Não existe dado pessoal nesta
  -- tabela: mac_checklist_itens é catálogo, não processo — nenhuma coluna dela se refere a
  -- interessado/proprietário.
  campos_alterados JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Quase sempre NULL hoje: as rotas que escrevem em mac_checklist_itens usam a service role
  -- direto (createClient com SUPABASE_SERVICE_ROLE_KEY), sem passar por autenticar() — não há
  -- usuário identificável na conexão. auth.uid() aqui é o melhor esforço possível sem mudar
  -- essas rotas (fora do escopo desta fase); fica pronto pro dia em que passarem a identificar
  -- quem chama.
  registrado_por   UUID REFERENCES usuarios(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mac_checklist_itens_historico_item_idx ON mac_checklist_itens_historico(item_id);
CREATE INDEX IF NOT EXISTS mac_checklist_itens_historico_tipo_processo_idx ON mac_checklist_itens_historico(tipo_processo);
CREATE INDEX IF NOT EXISTS mac_checklist_itens_historico_criado_em_idx ON mac_checklist_itens_historico(criado_em);

COMMENT ON TABLE mac_checklist_itens_historico IS
  'Trilha de mudança do CATÁLOGO do checklist MAC (item criado/atualizado/desativado/
   reativado) — nunca da análise de um processo. Alimentada só por trigger, nunca por rota de
   API diretamente. Não tem dado pessoal: é sobre o item do checklist, não sobre processo.';

CREATE OR REPLACE FUNCTION public.registrar_mudanca_catalogo_mac_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo_processo TEXT;
  v_acao TEXT;
  v_campos JSONB := '{}'::jsonb;
  v_algo_mudou BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criado';
    v_campos := jsonb_build_object(
      'grupo', jsonb_build_object('de', NULL, 'para', NEW.grupo),
      'texto', jsonb_build_object('de', NULL, 'para', NEW.texto),
      'ref', jsonb_build_object('de', NULL, 'para', NEW.ref),
      'chave_lip', jsonb_build_object('de', NULL, 'para', NEW.chave_lip),
      'fundamento_legal', jsonb_build_object('de', NULL, 'para', NEW.fundamento_legal),
      'condicao_aplicabilidade', jsonb_build_object('de', NULL, 'para', NEW.condicao_aplicabilidade)
    );
    v_algo_mudou := true;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.grupo IS DISTINCT FROM OLD.grupo THEN
      v_campos := v_campos || jsonb_build_object('grupo', jsonb_build_object('de', OLD.grupo, 'para', NEW.grupo));
      v_algo_mudou := true;
    END IF;
    IF NEW.texto IS DISTINCT FROM OLD.texto THEN
      v_campos := v_campos || jsonb_build_object('texto', jsonb_build_object('de', OLD.texto, 'para', NEW.texto));
      v_algo_mudou := true;
    END IF;
    IF NEW.ref IS DISTINCT FROM OLD.ref THEN
      v_campos := v_campos || jsonb_build_object('ref', jsonb_build_object('de', OLD.ref, 'para', NEW.ref));
      v_algo_mudou := true;
    END IF;
    IF NEW.chave_lip IS DISTINCT FROM OLD.chave_lip THEN
      v_campos := v_campos || jsonb_build_object('chave_lip', jsonb_build_object('de', OLD.chave_lip, 'para', NEW.chave_lip));
      v_algo_mudou := true;
    END IF;
    IF NEW.fundamento_legal IS DISTINCT FROM OLD.fundamento_legal THEN
      v_campos := v_campos || jsonb_build_object('fundamento_legal', jsonb_build_object('de', OLD.fundamento_legal, 'para', NEW.fundamento_legal));
      v_algo_mudou := true;
    END IF;
    IF NEW.condicao_aplicabilidade IS DISTINCT FROM OLD.condicao_aplicabilidade THEN
      v_campos := v_campos || jsonb_build_object('condicao_aplicabilidade', jsonb_build_object('de', OLD.condicao_aplicabilidade, 'para', NEW.condicao_aplicabilidade));
      v_algo_mudou := true;
    END IF;
    IF NEW.ordem IS DISTINCT FROM OLD.ordem THEN
      v_campos := v_campos || jsonb_build_object('ordem', jsonb_build_object('de', OLD.ordem, 'para', NEW.ordem));
      v_algo_mudou := true;
    END IF;
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      v_campos := v_campos || jsonb_build_object('ativo', jsonb_build_object('de', OLD.ativo, 'para', NEW.ativo));
      v_algo_mudou := true;
    END IF;

    IF NOT v_algo_mudou THEN
      RETURN NEW; -- mudou coluna fora do que auditamos aqui (ex.: classificacao_bip) — não é catálogo, não registra
    END IF;

    IF OLD.ativo IS TRUE AND NEW.ativo IS FALSE THEN
      v_acao := 'desativado';
    ELSIF OLD.ativo IS FALSE AND NEW.ativo IS TRUE THEN
      v_acao := 'reativado';
    ELSE
      v_acao := 'atualizado';
    END IF;

  ELSE
    RETURN NEW;
  END IF;

  SELECT tipo_processo INTO v_tipo_processo FROM mac_checklist_modelos WHERE id = NEW.modelo_id;

  INSERT INTO mac_checklist_itens_historico (item_id, modelo_id, tipo_processo, acao, campos_alterados, registrado_por)
  VALUES (NEW.id, NEW.modelo_id, v_tipo_processo, v_acao, v_campos, auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_mudanca_catalogo_mac_item ON mac_checklist_itens;
CREATE TRIGGER trg_registrar_mudanca_catalogo_mac_item
  AFTER INSERT OR UPDATE ON mac_checklist_itens
  FOR EACH ROW EXECUTE FUNCTION registrar_mudanca_catalogo_mac_item();

REVOKE ALL ON mac_checklist_itens_historico FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_mudanca_catalogo_mac_item() FROM anon, authenticated, PUBLIC;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- Dentro da transação de teste: CREATE TABLE + trigger aplicados; INSERT de item novo gerou
-- 1 linha acao='criado' com os 6 campos; UPDATE de texto gerou 1 linha acao='atualizado' só
-- com o campo texto; UPDATE de ativo=true->false gerou acao='desativado'; UPDATE de volta pra
-- true gerou acao='reativado'; UPDATE de uma coluna fora da lista (classificacao_bip) NÃO
-- gerou linha nenhuma (confirmado); tipo_processo bateu com o modelo real usado no teste.
-- Tudo desfeito por ROLLBACK, confirmado por fora que a tabela/trigger não existiam — só
-- então aplicada de verdade.
-- ======================================================================
