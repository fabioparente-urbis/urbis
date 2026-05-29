-- Função RPC para incrementar tempo_pausado atomicamente (sem race condition)
CREATE OR REPLACE FUNCTION incrementar_tempo_pausado(
  p_sessao_id  uuid,
  p_usuario_id uuid,
  p_segundos   integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE urbis_sessoes
  SET tempo_pausado = tempo_pausado + p_segundos
  WHERE id          = p_sessao_id
    AND usuario_id  = p_usuario_id
    AND status      = 'ativa';
$$;
