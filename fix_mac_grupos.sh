#!/bin/bash
# Adiciona botões de marcar grupo inteiro no MAC
# e botão "Iniciar Análise" no ProcessoClient

ANALISE="/Users/fabiomartinssantos/lip-interface/app/analise/[codigo]/page.tsx"
PROCESSO="/Users/fabiomartinssantos/lip-interface/app/processo/[id]/ProcessoClient.tsx"

# ── 1. Adiciona função marcarGrupo após os estados ──────────────────────────
OLD='const [novaAnalise, setNovaAnalise] = useState(false);'
NEW='const [novaAnalise, setNovaAnalise] = useState(false);

  function marcarGrupo(grupo: string, status: "conforme" | "nao_aplica") {
    setItens((prev) => {
      const novo = { ...prev };
      CHECKLIST.filter((i) => i.grupo === grupo).forEach((i) => {
        novo[i.id] = status;
      });
      return novo;
    });
  }'

sed -i '' "s|${OLD}|${NEW}|" "$ANALISE"

# ── 2. Adiciona botões abaixo do título do grupo ─────────────────────────────
OLD='                  {grupo}'
NEW='                  {grupo}
                  {abaAtual === idx && (
                    <span className="ml-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <span onClick={() => marcarGrupo(grupo, "conforme")}
                        className="cursor-pointer text-xs bg-green-800 hover:bg-green-600 text-green-200 px-1.5 py-0.5 rounded">✅</span>
                      <span onClick={() => marcarGrupo(grupo, "nao_aplica")}
                        className="cursor-pointer text-xs bg-slate-600 hover:bg-slate-500 text-slate-300 px-1.5 py-0.5 rounded">⬜</span>
                    </span>
                  )}'

sed -i '' "s|${OLD}|${NEW}|" "$ANALISE"

# ── 3. Botão "Iniciar Análise" no ProcessoClient ─────────────────────────────
OLD='🏠 Home
          </button>'
NEW='🏠 Home
          </button>
          <button onClick={() => { const sei = encodeURIComponent(idUrl); window.open(`/analise/${sei}?tipo=${encodeURIComponent("Regularização")}`, "_blank"); }}
            className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1">
            🔍 Iniciar Análise
          </button>'

sed -i '' "s|${OLD}|${NEW}|" "$PROCESSO"

echo "✅ Botões de grupo + Iniciar Análise instalados!"
