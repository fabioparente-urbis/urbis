-- 2026_09_18_lip_aceite_processo_fisico_comaer.sql
--
-- Bloco A do plano docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md — pedido direto do Fábio
-- (18/09/2026): "no LIP do slot 2 não achei o processo físico... e ele tem que ser preenchido
-- nas leituras de PDF" / "não achei no LIP a documentação: COMAER".
--
-- Cria em lip_campos, SÓ no assunto Aceite SEI (cb574aa0-5040-4fd0-aa60-14b64d9a047a):
--   - processoFisico, na aba "1. Identificação", logo após "Processo SEI"
--   - comaer, na aba "7. Documentos", no fim
-- Copiando tipo/placeholder/valor_padrao das linhas equivalentes do Slot 1 (Regularização SEI).
-- Não toca em nenhuma linha do Slot 1 (33e01883-...) nem do Slot 5.
--
-- JÁ APLICADO EM PRODUÇÃO em 18/09/2026 via script avulso (mesmo efeito deste arquivo). Este
-- arquivo fica só como registro/reprodutibilidade — rodar de novo é seguro (idempotente pelo
-- filtro chave+aba_id).
--
-- NÃO inclui a leitura (prompt) desses campos — isso é o Bloco A, passo 2, e o Bloco C (prompt
-- v36 do Aceite), ainda pendentes de execução.

DO $$
DECLARE
  aba_ident uuid := 'a3a2a750-af06-4b2b-bb69-62457804f433'; -- "1. Identificação" do Aceite SEI
  aba_doc   uuid := '8e904571-3e85-43ea-95c7-6c25f0fb6b10'; -- "7. Documentos" do Aceite SEI
BEGIN
  -- Abre espaço na ordem 3 da aba Identificação (empurra quadra..crea +1)
  UPDATE public.lip_campos SET ordem = 4  WHERE aba_id = aba_ident AND chave = 'quadra';
  UPDATE public.lip_campos SET ordem = 5  WHERE aba_id = aba_ident AND chave = 'lote';
  UPDATE public.lip_campos SET ordem = 6  WHERE aba_id = aba_ident AND chave = 'bairro';
  UPDATE public.lip_campos SET ordem = 7  WHERE aba_id = aba_ident AND chave = 'iptu';
  UPDATE public.lip_campos SET ordem = 8  WHERE aba_id = aba_ident AND chave = 'nome_responsavel_arq';
  UPDATE public.lip_campos SET ordem = 9  WHERE aba_id = aba_ident AND chave = 'cau';
  UPDATE public.lip_campos SET ordem = 10 WHERE aba_id = aba_ident AND chave = 'nome_responsavel_eng';
  UPDATE public.lip_campos SET ordem = 11 WHERE aba_id = aba_ident AND chave = 'crea';

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_ident AND chave = 'processoFisico') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_ident, 'processoFisico', 'Nº Processo Físico', 'texto', NULL,
            'Número do processo físico (se houver)', '', 3, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lip_campos WHERE aba_id = aba_doc AND chave = 'comaer') THEN
    INSERT INTO public.lip_campos (aba_id, chave, label, tipo, opcoes, placeholder, valor_padrao, ordem, ativo)
    VALUES (aba_doc, 'comaer', 'DOC SEI — COMAER', 'texto', NULL, 'Nº SEI ou NP', 'NP', 11, true);
  END IF;
END $$;
