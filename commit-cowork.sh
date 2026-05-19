#!/usr/bin/env bash
# Commit + push das 5 alterações implementadas pelo Cowork.
# Rode no terminal do macOS dentro de /Users/fabiomartinssantos/lip-interface.

set -euo pipefail

cd "$(dirname "$0")"

# Limpa um lock estale e um arquivo de teste que o sandbox criou (se existirem).
rm -f .git/index.lock .git/test-write-perm 2>/dev/null || true

git add -A
git commit -m "feat(cowork): snapshot BDI no backup, Web Speech no URBI, ajustes na home

- ITEM 1: ao gerar backup, consolida mrp_registros em JSON estático em bdi_snapshots
  (nova migration 2026_05_18_create_bdi_snapshots.sql + endpoint
  /api/admin/bdi/snapshot). Botão da tela /admin/backup renomeado para 'Gerar Backup'.
- ITEM 2: URBI Chat Box ganha Web Speech API — botão microfone (STT),
  leitura por voz das respostas (TTS), switch mudo/som e mapeamento de
  intenções em components/urbi/urbi-intencoes.json + hook useWebSpeech.
- ITEM 3: ícone do botão 'MRP — Equipe' agora usa TrendingUp (lucide-react)
  para deixar de conflitar com 'Gestão de usuários'.
- ITEM 4: na home, 'Backup & Restauração' sobe para a posição do MRP
  e 'MRP — Minha Produtividade' desce para o final.
- ITEM 5: 'Gerenciar Checklists' renomeado para 'Gerenciar MAC' em
  app/page.tsx, analise-aceite e analise-regularizacao."

git push origin HEAD
