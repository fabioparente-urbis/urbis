-- 2026_09_03_mac_checklist_itens_alterado_por.sql
--
-- Recorte de segurança pedido pelo Fábio em 03/09/2026, depois da Fase D: as rotas que
-- escrevem em mac_checklist_itens usam a service role direto, sem identificar quem chama —
-- por isso o trigger da Fase D (migration 2026_09_03_mac_checklist_itens_historico.sql) só
-- conseguia usar auth.uid(), que dá NULL nessas conexões. Corrigindo isso no código das rotas
-- (autenticar() + autorização) e aqui no banco: uma coluna pra a rota informar quem é o
-- usuário de verdade, e o trigger passa a preferir ela.
--
-- Não muda nenhum item, regra ou fluxo — só metadado de auditoria (quem alterou), coluna
-- nullable, sem efeito em nenhuma leitura/regra existente do checklist.
--
-- ✅ APLICADA — testada em transação com ROLLBACK antes de aplicar de verdade (ver rodapé).

BEGIN;

ALTER TABLE mac_checklist_itens
  ADD COLUMN IF NOT EXISTS alterado_por UUID REFERENCES usuarios(id);

COMMENT ON COLUMN mac_checklist_itens.alterado_por IS
  'Quem fez a última escrita neste item (POST/PUT/DELETE-lógico) — preenchido pela rota
   (app/api/mac/checklists/itens*), nunca pela tela direto. NULL em linha nunca alterada
   depois desta coluna existir.';

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
      RETURN NEW;
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

  -- Único ajuste desta migration em relação à Fase D: prefere NEW.alterado_por (a rota
  -- identificou o usuário de verdade) e só cai pra auth.uid() se a rota não informou.
  INSERT INTO mac_checklist_itens_historico (item_id, modelo_id, tipo_processo, acao, campos_alterados, registrado_por)
  VALUES (NEW.id, NEW.modelo_id, v_tipo_processo, v_acao, v_campos, COALESCE(NEW.alterado_por, auth.uid()));

  RETURN NEW;
END;
$$;

COMMIT;

-- ======================================================================
-- TESTE — resultado real, 03/09/2026, transação com ROLLBACK antes de aplicar de verdade
-- ======================================================================
-- ALTER TABLE + CREATE OR REPLACE FUNCTION rodados em transação de teste: INSERT com
-- alterado_por preenchido gerou linha em mac_checklist_itens_historico com registrado_por
-- IGUAL ao uuid passado (confirmado com um id real de usuarios); INSERT sem alterado_por
-- gerou registrado_por NULL (auth.uid() também NULL na conexão de teste, esperado — mesma
-- conexão service role de sempre). Tudo desfeito por ROLLBACK, confirmado por fora que a
-- coluna não existia — só então aplicada de verdade.
-- ======================================================================
