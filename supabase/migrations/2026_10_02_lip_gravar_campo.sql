-- lip_gravar_campo — grava UM campo da ficha do LIP (processos.dados) sem reescrever a ficha inteira.
--
-- Por quê: o LIP guarda tudo em processos.dados (jsonb). Quem regrava a ficha inteira a partir de uma
-- cópia lida antes pode apagar o que outra aba/sessão gravou nesse meio-tempo (aconteceu em 15-16/09/2026:
-- 95 campos de um processo). Esta função troca só a chave pedida, dentro do próprio UPDATE do banco —
-- atômica, sem ler e devolver o resto.
--
-- Primeiro uso: o laudo do Slot 5, ao ser emitido, grava atendeAcessibilidade = SIM (regra do Fábio,
-- 02/10/2026: laudo emitido = projeto atende à acessibilidade).
--
-- Segurança: SECURITY INVOKER (padrão) e EXECUTE só para service_role. Nada de anon/authenticated —
-- a exposição anônima de 01/09/2026 não se repete.

BEGIN;

CREATE OR REPLACE FUNCTION public.lip_gravar_campo(
  p_codigo text,
  p_tipo_processo text,
  p_chave text,
  p_valor jsonb
) RETURNS integer
LANGUAGE sql
AS $$
  WITH u AS (
    UPDATE public.processos
       SET dados = jsonb_set(COALESCE(dados, '{}'::jsonb), ARRAY[p_chave], p_valor, true)
     WHERE codigo = p_codigo AND tipo_processo = p_tipo_processo
    RETURNING 1
  )
  SELECT count(*)::int FROM u;
$$;

REVOKE ALL ON FUNCTION public.lip_gravar_campo(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lip_gravar_campo(text, text, text, jsonb) TO service_role;

COMMIT;
