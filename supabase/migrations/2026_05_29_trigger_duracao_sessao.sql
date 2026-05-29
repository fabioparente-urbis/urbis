-- Trigger: calcula duracao_min automaticamente ao encerrar sessão
-- Desconta tempo_pausado (inatividade + dead-time pós-cron)
CREATE OR REPLACE FUNCTION calcular_duracao_sessao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'encerrada' AND OLD.status = 'ativa' THEN
    NEW.encerrada_em := COALESCE(NEW.encerrada_em, now());
    NEW.duracao_min := GREATEST(0, ROUND(
      (EXTRACT(EPOCH FROM (NEW.encerrada_em - NEW.iniciada_em)) - COALESCE(NEW.tempo_pausado, 0))
      / 60.0,
      2
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calcular_duracao_sessao
BEFORE UPDATE ON urbis_sessoes
FOR EACH ROW
EXECUTE FUNCTION calcular_duracao_sessao();
