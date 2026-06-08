"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Download, ChevronDown, ChevronUp } from "lucide-react";

const MODULOS = ["", "LIP", "MAC", "DESPACHO", "LOGRADOURO", "SISTEMA"];
const CORES_MODULO: Record<string, string> = {
  LIP: "#3b82f6", MAC: "#10b981", DESPACHO: "#f59e0b",
  LOGRADOURO: "#8b5cf6", SISTEMA: "#6b7280",
};
const COR_IDLE = "#f43f5e";

function fmtTempo(s: number): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
function fmtData(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit" });
}

// ── Mini bar chart ──────────────────────────────────────────────
function BarChart({ dados, cor, label }: {
  dados: { label: string; value: number }[];
  cor: string;
  label: string;
}) {
  const max = Math.max(...dados.map(d => d.value), 1);
  return (
    <div className="w-full">
      <div className="text-xs text-[var(--text-muted)] mb-2">{label}</div>
      <div className="flex items-end gap-1 h-24">
        {dados.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full rounded-t-sm transition-all" style={{
              height: `${Math.max(2, (d.value / max) * 88)}px`,
              backgroundColor: cor,
              opacity: 0.85,
            }} title={`${d.label}: ${d.value}`} />
            <span className="text-[9px] text-[var(--text-muted)] truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Heatmap ──────────────────────────────────────────────────────
function Heatmap({ data }: { data: Record<string, number> }) {
  const hoje = new Date();
  const dias: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(hoje.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dias.push({ date: key, count: data[key] || 0 });
  }
  const max = Math.max(...dias.map(d => d.count), 1);
  const semanas: typeof dias[] = [];
  let sem: typeof dias = [];
  // preenche até domingo
  const primeiro = new Date(dias[0].date);
  for (let i = 0; i < primeiro.getDay(); i++) sem.push({ date: "", count: -1 });
  for (const d of dias) {
    sem.push(d);
    if (sem.length === 7) { semanas.push(sem); sem = []; }
  }
  if (sem.length) semanas.push(sem);

  return (
    <div>
      <div className="text-xs text-[var(--text-muted)] mb-2">Atividade — últimos 365 dias</div>
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {semanas.map((sem, si) => (
          <div key={si} className="flex flex-col gap-0.5">
            {sem.map((d, di) => (
              <div key={di}
                title={d.date ? `${d.date}: ${d.count} eventos` : ""}
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: d.count < 0 ? "transparent"
                    : d.count === 0 ? "var(--surface)"
                    : `rgba(16,185,129,${0.15 + 0.85 * (d.count / max)})`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1 text-[9px] text-[var(--text-muted)]">
        <span>Menos</span>
        {[0.1,0.3,0.55,0.8,1].map((o,i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(16,185,129,${o})` }} />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
}

// ── Aba principal ─────────────────────────────────────────────────
export function AbaAuditoria({ isAdmin }: { isAdmin: boolean }) {
  const [subAba, setSubAba] = useState<"dashboard"|"log"|"tempo"|"producao">("dashboard");
  const [periodo, setPeriodo] = useState<"dia"|"semana"|"mes"|"ano">("mes");
  const [analistas, setAnalistas] = useState<{ id: string; nome: string }[]>([]);
  const [analistaSel, setAnalistaSel] = useState("");

  // Dashboard
  const [dash, setDash] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Log
  const [eventos, setEventos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [logLoading, setLogLoading] = useState(false);
  const [filtroModulo, setFiltroModulo] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroProcesso, setFiltroProcesso] = useState("");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  // Tempo
  const [tempo, setTempo] = useState<any[]>([]);
  const [tempoLoading, setTempoLoading] = useState(false);

  // Produção
  const [prod, setProd] = useState<any[]>([]);
  const [prodLoading, setProdLoading] = useState(false);

  // Carrega analistas (admin)
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/usuarios", { credentials: "include" })
      .then(r => r.json())
      .then(j => { if (j.ok) setAnalistas((j.data || []).map((u: any) => ({ id: u.id, nome: u.nome || u.email }))); });
  }, [isAdmin]);

  const qParams = useCallback((extra: Record<string,string> = {}) => {
    const p = new URLSearchParams(extra);
    if (analistaSel) p.set("analista", analistaSel);
    p.set("periodo", periodo);
    return p.toString();
  }, [analistaSel, periodo]);

  // Dashboard
  useEffect(() => {
    if (subAba !== "dashboard") return;
    setDashLoading(true);
    fetch(`/api/auditoria/stats?tipo=dashboard&${qParams()}`, { credentials: "include" })
      .then(r => r.json()).then(j => { if (j.ok) setDash(j); })
      .finally(() => setDashLoading(false));
  }, [subAba, periodo, analistaSel, qParams]);

  // Log
  const carregarLog = useCallback((p = 0) => {
    setLogLoading(true);
    const params = new URLSearchParams();
    if (filtroModulo) params.set("modulo", filtroModulo);
    if (filtroAcao)   params.set("acao", filtroAcao);
    if (filtroProcesso) params.set("processo", filtroProcesso);
    if (filtroDe)     params.set("de", filtroDe);
    if (filtroAte)    params.set("ate", filtroAte);
    if (analistaSel)  params.set("analista", analistaSel);
    params.set("page", String(p));
    fetch(`/api/auditoria/eventos?${params}`, { credentials: "include" })
      .then(r => r.json()).then(j => { if (j.ok) { setEventos(j.data); setTotal(j.total); setPage(p); } })
      .finally(() => setLogLoading(false));
  }, [filtroModulo, filtroAcao, filtroProcesso, filtroDe, filtroAte, analistaSel]);

  useEffect(() => { if (subAba === "log") carregarLog(0); }, [subAba, analistaSel]);

  // Tempo
  useEffect(() => {
    if (subAba !== "tempo") return;
    setTempoLoading(true);
    fetch(`/api/auditoria/stats?tipo=tempo&${qParams()}`, { credentials: "include" })
      .then(r => r.json()).then(j => { if (j.ok) setTempo(j.serie || []); })
      .finally(() => setTempoLoading(false));
  }, [subAba, periodo, analistaSel, qParams]);

  // Produção
  useEffect(() => {
    if (subAba !== "producao") return;
    setProdLoading(true);
    fetch(`/api/auditoria/stats?tipo=producao&${qParams()}`, { credentials: "include" })
      .then(r => r.json()).then(j => { if (j.ok) setProd(j.serie || []); })
      .finally(() => setProdLoading(false));
  }, [subAba, periodo, analistaSel, qParams]);

  // Exportar Excel (CSV por ora)
  function exportarCSV() {
    if (!eventos.length) return;
    const cols = ["criado_em","analista_nome","modulo","acao","processo_codigo","origem","detalhe"];
    const rows = eventos.map(e => cols.map(c =>
      c === "detalhe" ? JSON.stringify(e[c] || {}) : (e[c] ?? "")
    ).join(";"));
    const csv = [cols.join(";"), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `auditoria_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const SUB_ABAS = [
    { key: "dashboard", label: "📊 Dashboard" },
    { key: "log",       label: "📋 Log de Eventos" },
    { key: "tempo",     label: "⏱️ Tempo" },
    { key: "producao",  label: "📈 Produção" },
  ] as const;

  const PERIODOS = [
    { key: "dia", label: "Hoje" },
    { key: "semana", label: "7 dias" },
    { key: "mes", label: "Mês" },
    { key: "ano", label: "Ano" },
  ] as const;

  return (
    <div>
      {/* Filtros globais */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {isAdmin && (
          <select value={analistaSel} onChange={e => setAnalistaSel(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none">
            <option value="">Todos os analistas</option>
            {analistas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1.5 text-sm transition-colors ${periodo === p.key ? "bg-[var(--accent)] text-[var(--text-primary)]" : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)] pb-0">
        {SUB_ABAS.map(s => (
          <button key={s.key} onClick={() => setSubAba(s.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${subAba === s.key ? "border-[var(--accent)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {subAba === "dashboard" && (
        <div>
          {dashLoading ? <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm"><Loader2 size={16} className="animate-spin" /> Carregando…</div> : dash ? (<>
            {/* Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Eventos hoje",     value: dash.eventosHoje, cor: "#3b82f6" },
                { label: "Processos tocados", value: dash.processos,  cor: "#10b981" },
                { label: "Docs gerados",     value: dash.docs,        cor: "#f59e0b" },
                { label: "Tempo líquido",    value: "—",              cor: "#8b5cf6" },
              ].map(c => (
                <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="text-2xl font-bold" style={{ color: c.cor }}>{c.value}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">{c.label}</div>
                </div>
              ))}
            </div>
            {/* Por módulo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <BarChart
                  label="Eventos por módulo"
                  cor="#3b82f6"
                  dados={Object.entries(dash.porModulo || {}).map(([label, value]) => ({ label, value: value as number }))}
                />
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs text-[var(--text-muted)] mb-2">Top ações</div>
                <div className="space-y-1.5">
                  {(dash.topAcoes || []).slice(0,8).map((a: any) => (
                    <div key={a.acao} className="flex items-center gap-2">
                      <div className="text-xs text-[var(--text-secondary)] w-48 truncate">{a.acao}</div>
                      <div className="flex-1 bg-[var(--bg-primary)] rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-[#10b981]"
                          style={{ width: `${(a.total / (dash.topAcoes[0]?.total || 1)) * 100}%` }} />
                      </div>
                      <div className="text-xs text-[var(--text-muted)] w-6 text-right">{a.total}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Heatmap */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <Heatmap data={dash.heatmap || {}} />
            </div>
          </>) : <div className="text-[var(--text-muted)] text-sm">Sem dados.</div>}
        </div>
      )}

      {/* ── LOG ── */}
      {subAba === "log" && (
        <div>
          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none">
              {MODULOS.map(m => <option key={m} value={m}>{m || "Todos os módulos"}</option>)}
            </select>
            <input placeholder="Ação" value={filtroAcao} onChange={e => setFiltroAcao(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] w-36 focus:outline-none" />
            <input placeholder="Processo" value={filtroProcesso} onChange={e => setFiltroProcesso(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] w-40 focus:outline-none" />
            <input type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none" />
            <input type="date" value={filtroAte} onChange={e => setFiltroAte(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none" />
            <button onClick={() => carregarLog(0)}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] px-4 py-1.5 rounded-lg text-sm">
              Filtrar
            </button>
            <button onClick={exportarCSV}
              className="flex items-center gap-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--surface)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg text-sm border border-[var(--border)]">
              <Download size={14} /> Exportar CSV
            </button>
          </div>

          {logLoading ? <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm"><Loader2 size={16} className="animate-spin" /> Carregando…</div> : (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      <th className="px-3 py-3 text-left">Data/Hora</th>
                      {isAdmin && <th className="px-3 py-3 text-left">Analista</th>}
                      <th className="px-3 py-3 text-left">Módulo</th>
                      <th className="px-3 py-3 text-left">Ação</th>
                      <th className="px-3 py-3 text-left">Processo</th>
                      <th className="px-3 py-3 text-left">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-[var(--text-muted)] py-8">Nenhum evento. Ajuste os filtros.</td></tr>
                    ) : eventos.map(e => (
                      <>
                        <tr key={e.id} className="border-b border-[var(--border)] hover:bg-[var(--surface)]/50">
                          <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap text-xs">{fmtData(e.criado_em)}</td>
                          {isAdmin && <td className="px-3 py-2 text-[var(--text-secondary)] text-xs">{e.analista_nome || "—"}</td>}
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium text-white"
                              style={{ backgroundColor: CORES_MODULO[e.modulo] || "#6b7280" }}>
                              {e.modulo}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[var(--text-primary)] text-xs font-mono">{e.acao}</td>
                          <td className="px-3 py-2 text-[var(--text-muted)] text-xs">{e.processo_codigo || "—"}</td>
                          <td className="px-3 py-2">
                            {e.detalhe ? (
                              <button onClick={() => setExpandido(expandido === e.id ? null : e.id)}
                                className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                {expandido === e.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} ver
                              </button>
                            ) : <span className="text-[var(--text-muted)] text-xs">—</span>}
                          </td>
                        </tr>
                        {expandido === e.id && (
                          <tr key={`${e.id}-exp`} className="bg-[var(--surface)]/30">
                            <td colSpan={6} className="px-3 pb-3">
                              <pre className="text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] rounded-lg p-3 overflow-x-auto">
                                {JSON.stringify(e.detalhe, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > 50 && (
                <div className="flex items-center gap-3 mt-4 text-sm">
                  <button disabled={page === 0} onClick={() => carregarLog(page - 1)}
                    className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40 text-[var(--text-primary)] px-3 py-1.5 rounded-lg">← Anterior</button>
                  <span className="text-[var(--text-muted)]">Página {page + 1} de {Math.ceil(total / 50)} · {total} eventos</span>
                  <button disabled={(page + 1) * 50 >= total} onClick={() => carregarLog(page + 1)}
                    className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40 text-[var(--text-primary)] px-3 py-1.5 rounded-lg">Próxima →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TEMPO ── */}
      {subAba === "tempo" && (
        <div>
          {tempoLoading ? <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm"><Loader2 size={16} className="animate-spin" /> Carregando…</div> : (
            <>
              {tempo.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">Sem dados de sessão no período.</div>
              ) : (
                <div className="space-y-4">
                  {/* Totais */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Tempo Bruto",   value: fmtTempo(tempo.reduce((a,b) => a + b.bruto, 0)),   cor: "#3b82f6" },
                      { label: "Tempo Líquido", value: fmtTempo(tempo.reduce((a,b) => a + b.liquido, 0)), cor: "#10b981" },
                      { label: "Tempo Idle",    value: fmtTempo(tempo.reduce((a,b) => a + b.idle, 0)),    cor: "#f43f5e" },
                    ].map(c => (
                      <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="text-2xl font-bold" style={{ color: c.cor }}>{c.value}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">{c.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Gráfico */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="text-xs text-[var(--text-muted)] mb-3">Bruto vs Líquido por {periodo}</div>
                    <div className="flex items-end gap-2 h-36">
                      {tempo.map((t, i) => {
                        const maxVal = Math.max(...tempo.map(x => x.bruto), 1);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                            <div className="w-full flex gap-0.5 items-end" style={{ height: "120px" }}>
                              <div className="flex-1 rounded-t-sm" title={`Bruto: ${fmtTempo(t.bruto)}`}
                                style={{ height: `${Math.max(2, (t.bruto / maxVal) * 116)}px`, backgroundColor: "#3b82f6", opacity: 0.7 }} />
                              <div className="flex-1 rounded-t-sm" title={`Líquido: ${fmtTempo(t.liquido)}`}
                                style={{ height: `${Math.max(2, (t.liquido / maxVal) * 116)}px`, backgroundColor: "#10b981", opacity: 0.9 }} />
                              <div className="flex-1 rounded-t-sm" title={`Idle: ${fmtTempo(t.idle)}`}
                                style={{ height: `${Math.max(2, (t.idle / maxVal) * 116)}px`, backgroundColor: "#f43f5e", opacity: 0.7 }} />
                            </div>
                            <span className="text-[9px] text-[var(--text-muted)] truncate w-full text-center">{t.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-[var(--text-muted)]">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor:"#3b82f6"}} /> Bruto</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor:"#10b981"}} /> Líquido</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor:"#f43f5e"}} /> Idle</span>
                    </div>
                  </div>
                  {/* Tabela detalhada */}
                  <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--text-muted)]">
                        <th className="px-3 py-2 text-left">Período</th>
                        <th className="px-3 py-2 text-right">Bruto</th>
                        <th className="px-3 py-2 text-right">Líquido</th>
                        <th className="px-3 py-2 text-right">Idle</th>
                      </tr></thead>
                      <tbody>
                        {tempo.map((t, i) => (
                          <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]/50">
                            <td className="px-3 py-2 text-[var(--text-primary)]">{t.label}</td>
                            <td className="px-3 py-2 text-right text-[#3b82f6]">{fmtTempo(t.bruto)}</td>
                            <td className="px-3 py-2 text-right text-[#10b981]">{fmtTempo(t.liquido)}</td>
                            <td className="px-3 py-2 text-right text-[#f43f5e]">{fmtTempo(t.idle)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PRODUÇÃO ── */}
      {subAba === "producao" && (
        <div>
          {prodLoading ? <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm"><Loader2 size={16} className="animate-spin" /> Carregando…</div> : (
            <>
              {prod.length === 0 ? (
                <div className="text-[var(--text-muted)] text-sm">Sem dados de produção no período.</div>
              ) : (
                <div className="space-y-6">
                  {/* Totais */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Processos",   value: prod.reduce((a,b) => a + b.processos, 0),  cor: "#3b82f6" },
                      { label: "Itens MAC",   value: prod.reduce((a,b) => a + b.macItens, 0),   cor: "#10b981" },
                      { label: "Campos LIP",  value: prod.reduce((a,b) => a + b.lipCampos, 0),  cor: "#f59e0b" },
                      { label: "Docs gerados",value: prod.reduce((a,b) => a + b.docs, 0),       cor: "#8b5cf6" },
                    ].map(c => (
                      <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="text-2xl font-bold" style={{ color: c.cor }}>{c.value}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">{c.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Gráficos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <BarChart label="Processos por período" cor="#3b82f6"
                        dados={prod.map(p => ({ label: p.label, value: p.processos }))} />
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <BarChart label="Itens MAC marcados" cor="#10b981"
                        dados={prod.map(p => ({ label: p.label, value: p.macItens }))} />
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <BarChart label="Campos LIP preenchidos" cor="#f59e0b"
                        dados={prod.map(p => ({ label: p.label, value: p.lipCampos }))} />
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <BarChart label="Documentos gerados" cor="#8b5cf6"
                        dados={prod.map(p => ({ label: p.label, value: p.docs }))} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
