-- Furo achado pelo Fábio em 22/09/2026, durante o estudo do URBIS OFFLINE: POST
-- /api/numeracao/faixa só conferia sobreposição contra as faixas do PRÓPRIO analista. Outro
-- analista podia cadastrar a mesma faixa (ex.: 1613–1700) e os dois emitiriam o mesmo número de
-- despacho/parecer sem aviso. A rota foi corrigida para conferir contra todos; esta constraint é
-- a trava definitiva no banco, que vale também para gravação concorrente e qualquer escrita fora
-- da rota.
--
-- Conferido antes de escrever (22/09/2026, script Node + supabase-js, só leitura): 5 faixas, todas
-- do mesmo analista, 0 sobreposições; 93 usos em urbis_numeracao_uso, nenhum número usado por
-- mais de um analista. A constraint entra sem conflito com o que já existe.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE urbis_numeracao_faixas
  ADD CONSTRAINT urbis_numeracao_faixas_sem_sobreposicao
  EXCLUDE USING gist (
    tipo WITH =,
    ano WITH =,
    int8range(numero_inicial, numero_final, '[]') WITH &&
  );
