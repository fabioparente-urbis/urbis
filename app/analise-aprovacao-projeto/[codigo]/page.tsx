"use client";

/**
 * Tela do MAC do Slot 5 — Aprovação de Projeto.
 *
 * Isolada do Slot 1: nenhum import de app/analise-regularizacao ou app/analise-aceite-sei; toda
 * a persistência passa por /api/mac/slot-05/analise, que só enxerga tipo_processo = slot_05.
 *
 * O que ela faz de diferente da tela do Slot 1: o botão "PREENCHER DO LIP" lê os campos que a
 * leitura da PASTA já congelou no LIP e marca sozinho os grupos que não se aplicam ao processo,
 * com a justificativa de cada decisão visível antes de aceitar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Status = "conforme" | "nao_conforme" | "nao_aplica";
type Item = { id: string; texto: string; grupo: string; ordem: number; ref?: string | null };
type Analise = {
  id: string; numero_analise: number; status: string;
  itens: Record<string, Status>; fontes: Record<string, string>; observacoes: string;
};
type Proposta = {
  total: number; camposPreenchidos: number;
  itens: Record<string, Status>; fontes: Record<string, string>;
  porGrupo: { grupo: string; qtd: number; regraId: string | null; justificativa: string | null }[];
  aplicaveis: { regraId: string; justificativa: string }[];
  indecisas: { regraId: string; nome: string; camposFaltando: string[] }[];
};

const COR: Record<Status, string> = {
  conforme: "#16A34A", nao_conforme: "#DC2626", nao_aplica: "#64748B",
};
const ROTULO: Record<Status, string> = {
  conforme: "Conforme", nao_conforme: "Não conforme", nao_aplica: "Não se aplica",
};

export default function AnaliseAprovacaoProjeto() {
  const router = useRouter();
  const codigo = decodeURIComponent(String(useParams()?.codigo ?? ""));

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [itensChecklist, setItensChecklist] = useState<Item[]>([]);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [marcas, setMarcas] = useState<Record<string, Status>>({});
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [lendoLip, setLendoLip] = useState(false);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notificar = useCallback((m: string) => {
    setAviso(m);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(""), 4000);
  }, []);

  useEffect(() => {
    if (!codigo) return;
    setCarregando(true);
    fetch(`/api/mac/slot-05/analise?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setErro(d.erro); return; }
        setItensChecklist(d.itens ?? []);
        setProprietario(d.processo?.proprietario ?? null);
        const atual: Analise | undefined = (d.analises ?? [])[0];
        if (atual) {
          setAnalise(atual);
          setMarcas(atual.itens ?? {});
          setFontes(atual.fontes ?? {});
        }
      })
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
  }, [codigo]);

  const grupos = useMemo(() => {
    const ordem = new Map<string, number>();
    for (const i of itensChecklist) {
      if (!ordem.has(i.grupo) || i.ordem < ordem.get(i.grupo)!) ordem.set(i.grupo, i.ordem);
    }
    return [...ordem.entries()].sort((a, b) => a[1] - b[1]).map(([g]) => g);
  }, [itensChecklist]);

  const porGrupo = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of itensChecklist) {
      if (!m.has(i.grupo)) m.set(i.grupo, []);
      m.get(i.grupo)!.push(i);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.ordem - b.ordem);
    return m;
  }, [itensChecklist]);

  const contarGrupo = useCallback((g: string) => {
    const lista = porGrupo.get(g) ?? [];
    let respondidos = 0;
    for (const i of lista) if (marcas[i.id]) respondidos++;
    return { total: lista.length, respondidos };
  }, [porGrupo, marcas]);

  const totais = useMemo(() => {
    const acc = { conforme: 0, nao_conforme: 0, nao_aplica: 0, pendente: 0 };
    for (const i of itensChecklist) {
      const s = marcas[i.id];
      if (s) acc[s]++; else acc.pendente++;
    }
    return acc;
  }, [itensChecklist, marcas]);

  async function garantirAnalise(itensIniciais?: Record<string, Status>, fontesIniciais?: Record<string, string>) {
    if (analise) return analise;
    const r = await fetch("/api/mac/slot-05/analise", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, itens: itensIniciais ?? {}, fontes: fontesIniciais ?? {} }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro ?? "falha ao criar análise");
    setAnalise(d.analise);
    return d.analise as Analise;
  }

  async function salvar(novasMarcas = marcas, novasFontes = fontes) {
    setSalvando(true);
    try {
      const a = await garantirAnalise(novasMarcas, novasFontes);
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, itens: novasMarcas, fontes: novasFontes }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
      notificar("Salvo.");
    } catch (e: any) {
      notificar(`Erro ao salvar: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  }

  function marcar(itemId: string, status: Status) {
    setMarcas((prev) => {
      const novo = { ...prev };
      if (novo[itemId] === status) delete novo[itemId]; else novo[itemId] = status;
      return novo;
    });
  }

  function marcarGrupo(grupo: string, status: Status) {
    const lista = porGrupo.get(grupo) ?? [];
    setMarcas((prev) => {
      const novo = { ...prev };
      for (const i of lista) novo[i.id] = status;
      return novo;
    });
    notificar(`${lista.length} item(ns) marcados como ${ROTULO[status]}.`);
  }

  async function preencherDoLip() {
    setLendoLip(true);
    setProposta(null);
    try {
      const r = await fetch("/api/mac/slot-05/preencher-automatico", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao ler o LIP");
      setProposta(d);
      if (d.total === 0) notificar("O LIP não permitiu decidir nenhum grupo sozinho.");
    } catch (e: any) {
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setLendoLip(false);
    }
  }

  async function aceitarProposta() {
    if (!proposta) return;
    // Nunca sobrescreve o que o analista já respondeu — só preenche o que está em branco.
    const novasMarcas = { ...marcas };
    const novasFontes = { ...fontes };
    let aplicados = 0;
    for (const [id, status] of Object.entries(proposta.itens)) {
      if (novasMarcas[id]) continue;
      novasMarcas[id] = status;
      novasFontes[id] = proposta.fontes?.[id] ?? "LIP";
      aplicados++;
    }
    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setProposta(null);
    await salvar(novasMarcas, novasFontes);
    notificar(`${aplicados} item(ns) preenchidos a partir do LIP.`);
  }

  const gruposFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter((g) =>
      g.toLowerCase().includes(q) ||
      (porGrupo.get(g) ?? []).some((i) => i.texto.toLowerCase().includes(q)));
  }, [grupos, busca, porGrupo]);

  if (carregando) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;
  if (erro) return (
    <div className="p-6">
      <p className="text-sm text-[#DC2626] mb-3">{erro}</p>
      <button onClick={() => router.push("/processos")} className="text-sm underline">← Processos</button>
    </div>
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <button onClick={() => router.push(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`)}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">← LIP</button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          MAC — Aprovação de Projeto
        </h1>
        <span className="text-sm font-mono text-[var(--accent)]">{codigo}</span>
        {analise && (
          <span className="text-xs font-bold text-[var(--accent)]">
            Análise {analise.numero_analise} · {analise.status === "em_andamento" ? "em andamento" : analise.status}
          </span>
        )}
      </div>
      {proprietario && <p className="text-xs text-[var(--text-muted)] mb-4">{proprietario}</p>}

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button onClick={preencherDoLip} disabled={lendoLip}
          className="px-3 py-1.5 rounded text-sm font-bold bg-[#EFF6FF] border border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 transition-colors">
          {lendoLip ? "⏳ Lendo o LIP…" : "📁 PREENCHER DO LIP"}
        </button>
        <button onClick={() => salvar()} disabled={salvando}
          className="px-3 py-1.5 rounded text-sm font-bold bg-[var(--primary)] text-white disabled:opacity-50">
          {salvando ? "salvando…" : "💾 Salvar"}
        </button>
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar grupo ou texto do item…"
          className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-xs text-[var(--text-primary)] min-w-[260px] flex-1" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: COR.conforme, color: COR.conforme }}>
          Conforme: {totais.conforme}
        </span>
        <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: COR.nao_conforme, color: COR.nao_conforme }}>
          Não conforme: {totais.nao_conforme}
        </span>
        <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: COR.nao_aplica, color: COR.nao_aplica }}>
          Não se aplica: {totais.nao_aplica}
        </span>
        <span className="px-2 py-0.5 rounded-full border border-[#EA580C] text-[#EA580C]">
          Pendentes: {totais.pendente}
        </span>
        <span className="text-[var(--text-muted)]">de {itensChecklist.length} itens · {grupos.length} grupos</span>
      </div>

      {aviso && <p className="text-xs text-[var(--accent)] mb-3">{aviso}</p>}

      {proposta && (
        <div className="border border-[#2563EB] rounded-lg p-4 mb-4 bg-[var(--bg-secondary)]">
          <p className="text-sm font-bold text-[var(--text-primary)] mb-1">
            Proposta a partir do LIP — {proposta.total} item(ns) em {proposta.porGrupo.length} grupo(s)
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mb-3">
            Lido de {proposta.camposPreenchidos} campos preenchidos do LIP. Nada é gravado até você aceitar,
            e nenhum item que você já respondeu é sobrescrito.
          </p>
          <div className="space-y-1.5 mb-3">
            {proposta.porGrupo.map((g) => (
              <div key={g.grupo} className="text-xs">
                <span className="font-semibold text-[var(--text-primary)]">{g.qtd}×</span>{" "}
                <span className="text-[var(--text-secondary)]">{g.grupo}</span>
                <p className="text-[10px] text-[var(--text-muted)] ml-6">↳ {g.justificativa}</p>
              </div>
            ))}
          </div>
          {!!proposta.aplicaveis.length && (
            <div className="mb-3">
              <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Confirmado que SE APLICA (fica com você)</p>
              {proposta.aplicaveis.map((a) => (
                <p key={a.regraId} className="text-[10px] text-[var(--text-secondary)]">• {a.justificativa}</p>
              ))}
            </div>
          )}
          {!!proposta.indecisas.length && (
            <div className="mb-3">
              <p className="text-[10px] uppercase font-bold text-[#EA580C]">Sem dado no LIP para decidir</p>
              {proposta.indecisas.map((i) => (
                <p key={i.regraId} className="text-[10px] text-[var(--text-secondary)]">
                  • {i.nome} — falta: {i.camposFaltando.join(", ") || "—"}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={aceitarProposta} disabled={proposta.total === 0}
              className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--primary)] text-white disabled:opacity-50">
              Aceitar e marcar {proposta.total} item(ns)
            </button>
            <button onClick={() => setProposta(null)}
              className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] underline">descartar</button>
          </div>
        </div>
      )}

      {/* Índice de grupos — clicar abre os itens daquele grupo */}
      {grupoAberto === null ? (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <p className="px-3 py-2 bg-[var(--bg-secondary)] text-[10px] font-bold uppercase text-[var(--text-muted)]">
            Índice — {gruposFiltrados.length} grupos
          </p>
          {gruposFiltrados.map((g, idx) => {
            const { total, respondidos } = contarGrupo(g);
            const completo = respondidos === total && total > 0;
            return (
              <button key={g} onClick={() => setGrupoAberto(g)}
                className="w-full grid grid-cols-[40px_1fr_120px] gap-2 px-3 py-2 text-left text-xs border-t border-[var(--border)] hover:bg-[var(--bg-secondary)]">
                <span className="text-[var(--text-muted)] font-mono">{idx + 1}</span>
                <span className="text-[var(--text-primary)] truncate" title={g}>{g}</span>
                <span className={completo ? "text-[#16A34A] font-semibold" : "text-[var(--text-muted)]"}>
                  {respondidos}/{total} {completo ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button onClick={() => setGrupoAberto(null)}
              className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
              ← Índice
            </button>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">{grupoAberto}</h2>
          </div>
          <div className="flex gap-2 mb-3">
            {(["conforme", "nao_conforme", "nao_aplica"] as Status[]).map((s) => (
              <button key={s} onClick={() => marcarGrupo(grupoAberto, s)}
                className="px-2 py-1 rounded text-xs font-semibold border"
                style={{ borderColor: COR[s], color: COR[s] }}>
                Todos {ROTULO[s]}
              </button>
            ))}
          </div>
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            {(porGrupo.get(grupoAberto) ?? []).map((it) => (
              <div key={it.id} className="border-t border-[var(--border)] px-3 py-2 flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{it.texto}</p>
                  {fontes[it.id] && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">🔎 {fontes[it.id]}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {(["conforme", "nao_conforme", "nao_aplica"] as Status[]).map((s) => (
                    <button key={s} onClick={() => marcar(it.id, s)} title={ROTULO[s]}
                      className="w-7 h-7 rounded border text-xs font-bold"
                      style={marcas[it.id] === s
                        ? { background: COR[s], borderColor: COR[s], color: "white" }
                        : { borderColor: "var(--border-strong)", color: "var(--text-muted)" }}>
                      {s === "conforme" ? "✓" : s === "nao_conforme" ? "✗" : "—"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
