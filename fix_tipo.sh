#!/bin/bash

FILE="/Users/fabiomartinssantos/lip-interface/app/processo/[id]/ProcessoClient.tsx"

echo "Aplicando tipo do processo no cabeçalho..."

# Troca 1 — import
sed -i '' 's/import { useParams, useRouter } from "next\/navigation";/import { useParams, useRouter, useSearchParams } from "next\/navigation";/' "$FILE"

# Troca 2 — leitura do searchParams (adiciona após idUrl)
sed -i '' 's/const idUrl = (params?.id as string) ?? "";/const idUrl = (params?.id as string) ?? "";\n  const searchParams = useSearchParams();\n  const tipoProcesso = searchParams.get("tipo") || "Regulariza\xc3\xa7\xc3\xa3o";/' "$FILE"

# Troca 3 — exibe no cabeçalho
sed -i '' 's/{" \xc2\xb7 "}<span className="text-slate-500">Regulariza\xc3\xa7\xc3\xa3o<\/span>/{" \xc2\xb7 "}<span className="text-blue-400 font-semibold">{tipoProcesso}<\/span>/' "$FILE"

echo "Verificando..."
grep -n "tipoProcesso\|useSearchParams" "$FILE" | head -5

echo "Concluido!"
