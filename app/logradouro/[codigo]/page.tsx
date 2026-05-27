"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";

type DadosVia = {
  bairro?: string; nome_logradouro?: string; hierarquia_viaria?: string;
  largura_via?: number | null; larg_calcada?: number | null;
  largura_pista?: number | null; largura_ilha?: number | null; area?: number | null;
};
type Slot = {
  bairroBusca: string; bairroOpcoes: string[];
  logradouroBusca: string; logradouroOpcoes: string[];
  dados: DadosVia | null;
};
const vazio = (): Slot => ({ bairroBusca: "", bairroOpcoes: [], logradouroBusca: "", logradouroOpcoes: [], dados: null });

export default function LogradouroPage() {
  const router = useRouter();
  const params = useParams();
  const codigo = params.codigo as string;
  const [slots, setSlots] = useState<Slot[]>([vazio(), vazio(), vazio(), vazio()]);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const tB = useRef<any[]>([null, null, null, null]);
  const tL = useRef<any[]>([null, null, null, null]);

  useEffect(() => {
    fetch(`/api/processo/logradouro?codigo=${encodeURIComponent(codigo)}`)
      .then(r => r.json()).then(j => {
        if (!j.ok || !Array.isArray(j.data)) return;
        setSlots(prev => prev.map((s, i) => {
          const v: DadosVia = j.data[i];
          if (!v) return s;
          return { ...s, bairroBusca: v.bairro || "", logradouroBusca: v.nome_logradouro || "", dados: v };
        }));
      });
  }, [codigo]);

  function up(i: number, patch: Partial<Slot>) {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  async function buscarBairros(i: number, q: string) {
    up(i, { bairroBusca: q, dados: null, logradouroBusca: "", logradouroOpcoes: [] });
    clearTimeout(tB.current[i]);
    if (q.length < 2) { up(i, { bairroOpcoes: [] }); return; }
    tB.current[i] = setTimeout(async () => {
      const r = await fetch(`/api/logradouros?tipo=bairros&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      up(i, { bairroOpcoes: j.data || [] });
    }, 300);
  }
  function selBairro(i: number, b: string) {
    up(i, { bairroBusca: b, bairroOpcoes: [], logradouroBusca: "", logradouroOpcoes: [], dados: null });
  }
  async function buscarLogradouros(i: number, q: string) {
    up(i, { logradouroBusca: q, dados: null });
    clearTimeout(tL.current[i]);
    const bairro = slots[i].bairroBusca;
    if (!bairro || q.length < 1) { up(i, { logradouroOpcoes: [] }); return; }
    tL.current[i] = setTimeout(async () => {
      const r = await fetch(`/api/logradouros?bairro=${encodeURIComponent(bairro)}&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      up(i, { logradouroOpcoes: j.data || [] });
    }, 300);
  }
  async function selLog(i: number, l: string) {
    const bairro = slots[i].bairroBusca;
    up(i, { logradouroBusca: l, logradouroOpcoes: [] });
    const r = await fetch(`/api/logradouros?bairro=${encodeURIComponent(bairro)}&logradouro=${encodeURIComponent(l)}`);
    const j = await r.json();
    if (j.ok && j.data) up(i, { dados: j.data });
  }
  function limpar(i: number) { setSlots(prev => prev.map((s, idx) => idx === i ? vazio() : s)); }
  async function salvar() {
    setSalvando(true);
    await fetch("/api/processo/logradouro", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, vias: slots.filter(s => s.dados).map(s => s.dados!) }),
    });
    setSalvando(false); setSalvo(true);
    setTimeout(() => router.push(`/analise-regularizacao/${encodeURIComponent(codigo)}`), 900);
  }

  const CAMPOS: [string, keyof DadosVia][] = [
    ["Hierarquia","hierarquia_viaria"],["L.Via","largura_via"],["L.Calçada","larg_calcada"],
    ["L.Pista","largura_pista"],["L.Ilha","largura_ilha"],["Área","area"],
  ];
  function fmt(label: string, val: any) {
    if (!val && val !== 0) return "—";
    if (label === "Hierarquia") return String(val);
    if (label === "Área") return `${val}m²`;
    return `${val}m`;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push(`/analise-regularizacao/${encodeURIComponent(codigo)}`)}
          className="text-slate-400 hover:text-white text-sm">← Voltar ao MAC</button>
        <h1 className="text-lg font-bold">🗺️ Via no Cadastro Imobiliário</h1>
        <span className="ml-2 text-slate-400 text-sm font-mono">{codigo}</span>
      </header>
      <main className="p-6 max-w-5xl mx-auto">
        <p className="text-slate-400 text-sm mb-6">Informe até 4 logradouros para este processo.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {slots.map((slot, i) => (
            <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Logradouro {i + 1}</span>
                {(slot.dados || slot.bairroBusca) && (
                  <button onClick={() => limpar(i)} className="text-xs text-slate-500 hover:text-red-400 transition-colors">✕ Limpar</button>
                )}
              </div>
              <div className="relative mb-2">
                <label className="text-xs text-slate-500 mb-1 block">Setor / Bairro</label>
                <input value={slot.bairroBusca} onChange={e => buscarBairros(i, e.target.value)}
                  placeholder="Digite para buscar..."
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {slot.bairroOpcoes.length > 0 && (
                  <ul className="absolute z-20 bg-slate-800 border border-slate-600 rounded shadow-xl w-full max-h-40 overflow-y-auto mt-1">
                    {slot.bairroOpcoes.map(b => <li key={b} onClick={() => selBairro(i, b)} className="px-3 py-2 text-sm hover:bg-slate-700 cursor-pointer">{b}</li>)}
                  </ul>
                )}
              </div>
              <div className="relative mb-3">
                <label className="text-xs text-slate-500 mb-1 block">Logradouro</label>
                <input value={slot.logradouroBusca} onChange={e => buscarLogradouros(i, e.target.value)}
                  placeholder="Digite para buscar..." disabled={!slot.bairroBusca}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40" />
                {slot.logradouroOpcoes.length > 0 && (
                  <ul className="absolute z-20 bg-slate-800 border border-slate-600 rounded shadow-xl w-full max-h-40 overflow-y-auto mt-1">
                    {slot.logradouroOpcoes.map(l => <li key={l} onClick={() => selLog(i, l)} className="px-3 py-2 text-sm hover:bg-slate-700 cursor-pointer">{l}</li>)}
                  </ul>
                )}
              </div>
              {slot.dados ? (
                <div className="grid grid-cols-3 gap-2">
                  {CAMPOS.map(([label, key]) => (
                    <div key={label} className="bg-slate-900 border border-slate-700 rounded p-2 text-center">
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="text-sm font-bold text-slate-200">{fmt(label, slot.dados![key])}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-600 text-center py-4">Selecione bairro e logradouro</div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-3">
          <button onClick={salvar} disabled={salvando || salvo}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors">
            {salvo ? "✓ Salvo!" : salvando ? "Salvando..." : "💾 Salvar"}
          </button>
          <button onClick={() => router.push(`/analise-regularizacao/${encodeURIComponent(codigo)}`)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold px-6 py-3 rounded-xl text-sm transition-colors">
            Voltar ao MAC
          </button>
        </div>
      </main>
    </div>
  );
}
