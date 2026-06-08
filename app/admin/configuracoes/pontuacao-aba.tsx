"use client";
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";

type Regra = {
  id: string;
  tipo_despacho: string | null;
  area_min: number | null;
  area_max: number | null;
  pontos: number;
  descricao: string;
  ordem: number;
};

export function AbaPontuacao() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [metaInput, setMetaInput] = useState("100");
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [sucessoMeta, setSucessoMeta] = useState(false);

  useEffect(() => {
    fetch("/api/admin/config", { credentials: "include" })
      .then(r => r.json())
      .then(j => { if (j.ok && j.data?.meta_processos_mensal) setMetaInput(String(j.data.meta_processos_mensal)); });
    fetch("/api/mrp/pontuacao", { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          setRegras(j.data);
          const ed: Record<string, string> = {};
          for (const r of j.data) ed[r.id] = String(r.pontos);
          setEdicao(ed);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function salvar(r: Regra) {
    setSalvando(r.id); setErro("");
    const res = await fetch("/api/mrp/pontuacao", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, pontos: parseFloat(edicao[r.id] || "0"), descricao: r.descricao }),
    });
    const j = await res.json();
    setSalvando(null);
    if (!j.ok) { setErro(j.erro || "Erro ao salvar"); return; }
    setSucesso(r.id);
    setRegras(prev => prev.map(x => x.id === r.id ? { ...x, pontos: parseFloat(edicao[r.id]) } : x));
    setTimeout(() => setSucesso(s => s === r.id ? null : s), 2500);
  }

  async function salvarMeta() {
    const val = parseInt(metaInput);
    if (!val || val < 1) return;
    setSalvandoMeta(true); setSucessoMeta(false);
    const res = await fetch("/api/admin/config", {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta_processos_mensal: val }),
    });
    const j = await res.json();
    setSalvandoMeta(false);
    if (j.ok) { setSucessoMeta(true); setTimeout(() => setSucessoMeta(false), 2500); }
  }

  function mudou(r: Regra) {
    return parseFloat(edicao[r.id] || "0") !== Number(r.pontos);
  }

  if (loading) return <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm"><Loader2 size={16} className="animate-spin" /> Carregando…</div>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Tabela de Pontuação MRP</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Pontos atribuídos automaticamente ao gerar despacho, baseados no tipo e área construída.
        Fórmula: ATENDIMENTO → 0.5 pts · área &gt; 2000m² → 4.5 pts · área &lt; 540m² → 2.5 pts · demais → 3.5 pts.
      </p>

      <div className="mb-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-center gap-4">
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">Meta Mensal de Pontos</div>
          <div className="text-xs text-[var(--text-muted)]">Referência de produtividade para todos os analistas.</div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="number" min={1} value={metaInput} onChange={e => setMetaInput(e.target.value)}
            className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          <span className="text-sm text-[var(--text-muted)]">pts/mês</span>
          <button onClick={salvarMeta} disabled={salvandoMeta}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--text-primary)] font-bold px-4 py-1.5 rounded-lg text-sm transition-colors">
            {salvandoMeta ? "Salvando..." : "Salvar"}
          </button>
          {sucessoMeta && <span className="text-emerald-400 text-sm">✓ Salvo</span>}
        </div>
      </div>

      {erro && <div className="mb-4 text-sm text-red-300 bg-red-900/30 border border-red-800 rounded-lg px-4 py-2">{erro}</div>}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden">
        <div className="grid grid-cols-[40px_1fr_200px_120px_100px] gap-3 px-4 py-3 text-xs uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border)]">
          <div>#</div>
          <div>Condição</div>
          <div>Descrição</div>
          <div className="text-center">Pontos</div>
          <div className="text-right pr-2">Ação</div>
        </div>

        {regras.map(r => (
          <div key={r.id} className="grid grid-cols-[40px_1fr_200px_120px_100px] gap-3 px-4 py-3 items-center border-b border-[var(--border)] last:border-0">
            <div className="text-[var(--text-muted)] text-sm">{r.ordem}</div>

            <div className="text-sm text-[var(--text-primary)]">
              {r.tipo_despacho
                ? <span className="inline-block px-2 py-0.5 rounded bg-[var(--surface)] text-xs font-mono">tipo = {r.tipo_despacho}</span>
                : r.area_min !== null && r.area_max !== null
                  ? <span>{r.area_min}m² ≤ área &lt; {r.area_max}m²</span>
                  : r.area_min !== null
                    ? <span>área &gt; {r.area_min}m²</span>
                    : r.area_max !== null
                      ? <span>área &lt; {r.area_max}m²</span>
                      : <span className="text-[var(--text-muted)]">padrão</span>
              }
            </div>

            <div className="text-sm text-[var(--text-secondary)]">{r.descricao}</div>

            <div className="flex justify-center">
              <div className="flex items-center gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5">
                <input
                  type="number" step="0.5" min="0" max="10"
                  value={edicao[r.id] ?? String(r.pontos)}
                  onChange={e => setEdicao(prev => ({ ...prev, [r.id]: e.target.value }))}
                  className="w-14 bg-transparent text-[var(--text-primary)] text-sm font-semibold text-center focus:outline-none"
                />
                <span className="text-[var(--text-muted)] text-xs">pts</span>
              </div>
            </div>

            <div className="flex justify-end pr-2">
              {sucesso === r.id
                ? <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Check size={14} /> Salvo</span>
                : <button
                    onClick={() => salvar(r)}
                    disabled={!mudou(r) || salvando === r.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mudou(r) && salvando !== r.id ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)]" : "bg-[var(--surface)] text-[var(--text-muted)] cursor-not-allowed"}`}>
                    {salvando === r.id ? <><Loader2 size={12} className="animate-spin" /> Salvando</> : "Salvar"}
                  </button>
              }
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--text-muted)] mb-3 font-medium uppercase tracking-wide">Simulador</div>
        <SimuladorPontos regras={regras} />
      </div>
    </div>
  );
}

function SimuladorPontos({ regras }: { regras: Regra[] }) {
  const [tipo, setTipo] = useState("despacho");
  const [area, setArea] = useState("300");

  function calcular(): number {
    const a = parseFloat(area) || 0;
    const t = tipo.toUpperCase();
    const sorted = [...regras].sort((x, y) => x.ordem - y.ordem);
    for (const r of sorted) {
      if (r.tipo_despacho && r.tipo_despacho !== t) continue;
      if (r.area_min !== null && a <= r.area_min) continue;
      if (r.area_max !== null && a >= r.area_max) continue;
      return Number(r.pontos);
    }
    return 0;
  }

  const pts = calcular();

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">Tipo despacho</label>
        <input value={tipo} onChange={e => setTipo(e.target.value)}
          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none w-40" />
      </div>
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">Área construída (m²)</label>
        <input type="number" value={area} onChange={e => setArea(e.target.value)}
          className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none w-32" />
      </div>
      <div className="pb-0.5">
        <div className="text-xs text-[var(--text-muted)] mb-1">Resultado</div>
        <div className="text-2xl font-bold" style={{ color: "#10b981" }}>{pts} pts</div>
      </div>
    </div>
  );
}
