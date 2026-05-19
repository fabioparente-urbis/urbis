#!/usr/bin/env bash
# Commit + push do gerenciador completo de leis do BDI implementado pelo Cowork.
# Rode no terminal do macOS dentro de /Users/fabiomartinssantos/lip-interface.

set -euo pipefail

cd "$(dirname "$0")"

# Limpa locks estale e artefatos de teste que o sandbox possa ter deixado.
rm -f .git/index.lock .git/test-write-perm .git/test-write 2>/dev/null || true

git add -A
git commit -m "feat(bdi/leis): gerenciador completo de leis (CRUD + reindexar + exclusão segura)

Expansão do módulo /admin/bdi/leis com CRUD completo:

- Adicionar lei (POST /api/admin/bdi/leis): formulário com título, número,
  ano, tipo (dropdown 8 tipos), ementa e PDF opcional. Multipart suporta
  upload + indexação inline.
- Editar metadados (PUT /api/admin/bdi/leis/[id]): só atualiza colunas
  permitidas; não toca em fragmentos.
- Reindexar (POST /api/admin/bdi/leis/[id]/reindexar): baixa o PDF do R2
  via URL assinada e repassa para o pipeline /api/bdi/indexar-lei.
- Excluir lei (DELETE /api/admin/bdi/leis/[id]): com gate de confirmação —
  GET /api/admin/bdi/leis/[id]/referencias retorna itens de
  mac_checklist_itens.ref que potencialmente citam a lei (heurística por
  número/tipo/título); modal exige digitar 'EXCLUIR' antes de prosseguir.
  Remove PDF do R2 + DELETE bdi_lei_fragmentos + DELETE bdi_documentos_lei.

Outros ajustes:

- app/api/bdi/indexar-lei/route.ts: faz upload do PDF para o R2 e persiste
  url_pdf em bdi_documentos_lei (degrada com warning se o R2 falhar).
- lib/r2.ts: helper de upload/delete/signGetUrl/keyFromUrl compartilhado.
- Restrito a perfis irrestritos (Administrador / Diretora) via
  autenticar() em todos os endpoints."

git push origin HEAD
