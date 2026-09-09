-- "MAC só inicia importando PDF ou copiando a análise anterior" — 08/09/2026, pedido do Fábio.
-- Hoje QUALQUER toque no checklist já criava/salvava a análise (autosave), então uma análise
-- "iniciada" podia não ter nenhum conteúdo real por trás. `mac_carregado` marca quando a análise
-- de fato recebeu conteúdo por um dos dois caminhos que ele considera "começou de verdade" — usada
-- só pra classificação (Pilha/URBI/BDI), nunca pra travar salvamento ou emissão.
ALTER TABLE analises_mac
  ADD COLUMN IF NOT EXISTS mac_carregado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN analises_mac.mac_carregado IS
  'true quando a análise recebeu conteúdo via leitura de PDF (LER PROCESSO/LER ARQUIVOS INDIVIDUAIS) ou cópia da análise anterior. Usado só pra classificação de situação (lib/bdi/situacao.ts), nunca bloqueia salvamento.';
