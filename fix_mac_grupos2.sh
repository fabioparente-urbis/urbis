#!/bin/bash
ANALISE="/Users/fabiomartinssantos/lip-interface/app/analise/[codigo]/page.tsx"

# 1. Adiciona função marcarGrupo se não existe
grep -q "function marcarGrupo" "$ANALISE" || sed -i '' 's/const \[novaAnalise, setNovaAnalise\] = useState(false);/const [novaAnalise, setNovaAnalise] = useState(false);\n\n  function marcarGrupo(grupo: string, status: "conforme" | "nao_aplica") {\n    setItens((prev) => {\n      const novo = { ...prev };\n      CHECKLIST.filter((i) => i.grupo === grupo).forEach((i) => { novo[i.id] = status; });\n      return novo;\n    });\n  }/' "$ANALISE"

# 2. Adiciona barra de ações rápidas ANTES do bloco de itens do grupo atual
# Busca pela linha do conteúdo do checklist (itens filtrados)
OLD='{/* CONTEÚDO DA ABA ATUAL */'
NEW='{/* AÇÕES RÁPIDAS DO GRUPO */}
          <div className="flex items-center gap-2 px-6 py-2 bg-slate-800 border-b border-slate-700">
            <span className="text-xs text-slate-400 mr-1">Marcar tudo:</span>
            <button onClick={() => marcarGrupo(GRUPOS[abaAtual], "conforme")}
              className="px-2 py-1 rounded text-xs bg-green-800 hover:bg-green-600 text-green-200 font-medium transition-colors">
              ✅ Todos Conformes
            </button>
            <button onClick={() => marcarGrupo(GRUPOS[abaAtual], "nao_aplica")}
              className="px-2 py-1 rounded text-xs bg-slate-600 hover:bg-slate-500 text-slate-300 font-medium transition-colors">
              ⬜ Todos N/A
            </button>
          </div>
          {/* CONTEÚDO DA ABA ATUAL */'

sed -i '' "s|${OLD}|${NEW}|" "$ANALISE"

echo "resultado: $?"
grep -c "Todos Conformes" "$ANALISE" && echo "✅ Botões inseridos!" || echo "❌ Não encontrou o marcador — precisa ajuste manual"
