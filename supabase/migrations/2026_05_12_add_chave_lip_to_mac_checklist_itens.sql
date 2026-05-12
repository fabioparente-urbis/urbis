-- Mapeia um item do checklist do MAC a uma chave de campo do LIP.
-- Quando o LIP é salvo com o campo `chave_lip` vazio ou com valor "X",
-- o backend pré-marca esse item como `nao_conforme` na análise mais
-- recente do processo (ver app/api/processo/salvar/route.ts).
alter table mac_checklist_itens
  add column if not exists chave_lip text;

create index if not exists idx_mac_checklist_itens_chave_lip
  on mac_checklist_itens(chave_lip)
  where chave_lip is not null;
