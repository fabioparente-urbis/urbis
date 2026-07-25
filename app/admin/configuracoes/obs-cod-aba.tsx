"use client";
// OBS COD — caderno de observações sobre o código.
//
// Registro do que precisa sobreviver à memória de quem estava na sala:
// decisões tomadas, pendências conhecidas e riscos que ainda não viraram
// problema. Não é lista de tarefas — é o "por que o sistema é assim".
import { useEffect, useState } from "react";
import { Loader2, Plus, Check, RotateCcw, Trash2, Pencil } from "lucide-react";

type Obs = {
  id: string;
  titulo: string;
  texto: string;
  categoria: string;
  situacao: string;
  onde: string | null;
  criado_em: string;
  criado_por_nome: string | null;
  resolvido_em: string | null;
  resolvido_por_nome: string | null;
};

const CATEGORIAS: { valor: string; rotulo: string; cor: string }[] = [
  { valor: "arquitetura", rotulo: "Arquitetura", cor: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { valor: "bug", rotulo: "Bug", cor: "bg-red-100 text-red-800 border-red-300" },
  { valor: "decisao", rotulo: "Decisão", cor: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { valor: "pendencia", rotulo: "Pendência", cor: "bg-amber-100 text-amber-800 border-amber-300" },
  { valor: "risco", rotulo: "Risco", cor: "bg-orange-100 text-orange-800 border-orange-300" },
];
const corDe = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.cor ?? CATEGORIAS[3].cor;
const rotuloDe = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.rotulo ?? c;
const dt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const VAZIO = { id: "", titulo: "", texto: "", categoria: "pendencia", onde: "" };

export function AbaObsCod() {
  const [obs, setObs] = useState<Obs[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ ...VAZIO });
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<"abertas" | "todas">("abertas");

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const res = await fetch("/api/admin/obs-cod");
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Falha ao carregar."); return; }
      setObs(json.data ?? []);
    } catch (e: any) { setErro(e?.message || "Erro inesperado."); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!form.titulo.trim()) { setErro("Escreva um título."); return; }
    setSalvando(true); setErro("");
    try {
      const res = await fetch("/api/admin/obs-cod", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Falha ao salvar."); return; }
      setForm({ ...VAZIO }); setEditando(false); carregar();
    } catch (e: any) { setErro(e?.message || "Erro inesperado."); } finally { setSalvando(false); }
  }

  async function alternarSituacao(o: Obs) {
    await fetch("/api/admin/obs-cod", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, situacao: o.situacao === "aberto" ? "resolvido" : "aberto" }),
    });
    carregar();
  }

  async function apagar(o: Obs) {
    if (!confirm(`Apagar a observação "${o.titulo}"?\n\nSe ela já foi resolvida, prefira deixá-la marcada como resolvida — vira histórico do porquê.`)) return;
    await fetch("/api/admin/obs-cod", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id }),
    });
    carregar();
  }

  const lista = filtro === "abertas" ? obs.filter((o) => o.situacao === "aberto") : obs;
  const abertas = obs.filter((o) => o.situacao === "aberto").length;

  return (
    <div className="max-w-5xl">
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Coisas do código que precisam ser lembradas: decisões tomadas, pendências conhecidas e riscos
        que ainda não viraram problema. Resolvido não some — fica como histórico do porquê.
      </p>

      {/* Formulário */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-5">
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 flex-wrap">
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título — ex.: a escolha da tela do MAC está fixa no código"
              className="flex-1 min-w-[280px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
              {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
            </select>
          </div>
          <input value={form.onde} onChange={(e) => setForm({ ...form, onde: e.target.value })}
            placeholder="Onde — ex.: app/processo/ProcessoClient.tsx, rota /api/lip/s3"
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          <textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} rows={4}
            placeholder="O que precisa ser lembrado, e por quê. Escreva para quem vai ler daqui a seis meses sem contexto nenhum."
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y" />
          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando}
              className="inline-flex items-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] px-4 py-2 rounded-lg text-sm font-medium">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {editando ? "Salvar alteração" : "Anotar"}
            </button>
            {editando && (
              <button onClick={() => { setForm({ ...VAZIO }); setEditando(false); }}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm">Cancelar</button>
            )}
          </div>
        </div>
      </div>

      {erro && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{erro}</div>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {(["abertas", "todas"] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtro === f ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            {f === "abertas" ? `Abertas (${abertas})` : `Todas (${obs.length})`}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="text-[var(--text-muted)] text-sm inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="text-[var(--text-muted)] text-sm border border-dashed border-[var(--border)] rounded-xl px-4 py-10 text-center">
          {filtro === "abertas" ? "Nenhuma observação aberta." : "Nada anotado ainda."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((o) => (
            <div key={o.id} className={`rounded-xl border p-4 ${o.situacao === "resolvido" ? "border-[var(--border)] bg-[var(--bg-secondary)]/40 opacity-70" : "border-[var(--border)] bg-[var(--bg-card)]"}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${corDe(o.categoria)}`}>{rotuloDe(o.categoria)}</span>
                    {o.situacao === "resolvido" && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-300">✓ Resolvido</span>
                    )}
                    <span className={`font-bold text-[var(--text-primary)] ${o.situacao === "resolvido" ? "line-through" : ""}`}>{o.titulo}</span>
                  </div>
                  {o.onde && <p className="text-xs text-[var(--accent)] font-mono mb-1">{o.onde}</p>}
                  {o.texto && <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{o.texto}</p>}
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Anotado em {dt(o.criado_em)}{o.criado_por_nome ? ` por ${o.criado_por_nome}` : ""}
                    {o.situacao === "resolvido" && ` · resolvido em ${dt(o.resolvido_em)}${o.resolvido_por_nome ? ` por ${o.resolvido_por_nome}` : ""}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setForm({ id: o.id, titulo: o.titulo, texto: o.texto, categoria: o.categoria, onde: o.onde ?? "" }); setEditando(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    title="Editar" className="border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] px-2.5 py-1.5 rounded-lg text-xs"><Pencil size={13} /></button>
                  <button onClick={() => alternarSituacao(o)} title={o.situacao === "aberto" ? "Marcar como resolvido" : "Reabrir"}
                    className="border border-[#059669] text-[#059669] hover:bg-[#059669] hover:text-white px-2.5 py-1.5 rounded-lg text-xs">
                    {o.situacao === "aberto" ? <Check size={13} /> : <RotateCcw size={13} />}
                  </button>
                  <button onClick={() => apagar(o)} title="Apagar"
                    className="border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white px-2.5 py-1.5 rounded-lg text-xs"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
