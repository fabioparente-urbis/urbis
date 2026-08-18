"use client";

/**
 * Tela do MAC do Slot 5 — Aprovação de Projeto.
 *
 * Isolada do Slot 1: nenhum import de app/analise-regularizacao ou app/analise-aceite-sei; toda
 * a persistência passa por /api/mac/slot-05/analise, que só enxerga tipo_processo = slot_05.
 * A estrutura visual (cabeçalho, legenda, coluna de ações, índice, atalhos por grupo, aba OBS)
 * segue o padrão da tela do Slot 1 por decisão do usuário — replicada por leitura, nunca
 * importada, para que uma mudança aqui não possa atingir a Regularização/Aceite.
 *
 * O que ela faz de diferente: "PREENCHER DO LIP" lê o que a leitura da PASTA já congelou (campos
 * do LIP + texto dos PDFs guardado no MHD) e marca sozinho os grupos que não se aplicam.
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

const ABA_OBS = "__OBS__";

const ESTILO: Record<Status, { bg: string; borda: string; texto: string; icone: string; rotulo: string }> = {
  conforme: { bg: "#ECFDF5", borda: "#059669", texto: "#059669", icone: "✅", rotulo: "Conforme" },
  nao_conforme: { bg: "#FEF2F2", borda: "#DC2626", texto: "#DC2626", icone: "❌", rotulo: "Não Conforme" },
  nao_aplica: { bg: "#EFF6FF", borda: "#2563EB", texto: "#2563EB", icone: "⬜", rotulo: "Não se Aplica" },
};
const STATUS: Status[] = ["conforme", "nao_conforme", "nao_aplica"];

/** Mesmo vocabulário dos botões de filtro rápido que o analista já usa. */
const ROTULO_FILTRO: Record<string, string> = {
  APROVACAO_NAO_E_MODIFICACAO: "APRO DE PROJ",
  PORTE_NAO_E_GRANDE: "MEDIO PORTE",
  SEM_USO_HABITACIONAL: "COMERCIAL",
  SEM_OUTORGA_ONEROSA: "S/ ONEROSA",
  SEM_POSTO_COMBUSTIVEL: "NÃO É POSTO",
  SEM_QUITINETE_PENSAO: "NÃO É PENSÃO",
  COM_CORREDOR_VIARIO: "S/ CORREDOR",
  SEM_CARGA_DESCARGA: "S/ CARGA E DES",
  SEM_SUBSOLO: "S/ SUBSOLO",
  SEM_EIT_EIV: "S/ EIT E EIV",
  SEM_EMBARQUE_DESEMBARQUE: "S/ EMB E DESE",
  SEM_BAIA_DESACELERACAO: "S/ BAIA DE DES",
  SEM_MARQUISE: "S/ MARQUISE",
  SEM_AOS_ARAU: "FORA AOS/ARAU",
  SEM_ZONA_AEROPORTUARIA: "S/ ZONA AEROP",
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function AnaliseAprovacaoProjeto() {
  const router = useRouter();
  const codigo = decodeURIComponent(String(useParams()?.codigo ?? ""));

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [itensChecklist, setItensChecklist] = useState<Item[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [marcas, setMarcas] = useState<Record<string, Status>>({});
  const [fontes, setFontes] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState("");
  const [abaAtual, setAbaAtual] = useState<string | null>(null); // null = índice
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [lendoLip, setLendoLip] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notificar = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);

  useEffect(() => {
    if (!codigo) return;
    let cancelado = false;
    setCarregando(true);

    // Ordem pedida pelo usuário: ao ENTRAR, primeiro descobrir quais filtros ativar (o que o
    // processo não tem), só depois olhar o que o LIP consegue marcar. As duas coisas saem da
    // mesma chamada — ela não grava nada, só propõe.
    (async () => {
      try {
        const r = await fetch(`/api/mac/slot-05/analise?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" });
        const d = await r.json();
        if (cancelado) return;
        if (!d.ok) { setErro(d.erro); return; }

        setItensChecklist(d.itens ?? []);
        setProprietario(d.processo?.proprietario ?? null);
        setAnalises(d.analises ?? []);
        const atual: Analise | undefined = (d.analises ?? [])[0];
        const marcasAtuais = atual?.itens ?? {};
        if (atual) {
          setAnalise(atual);
          setMarcas(marcasAtuais);
          setFontes(atual.fontes ?? {});
          setObservacoes(atual.observacoes ?? "");
        }
        setCarregando(false);

        // Roda os filtros sozinho. Só propõe o que ainda está em branco — se o analista já
        // respondeu tudo o que a proposta cobriria, ela nem aparece.
        setLendoLip(true);
        const rp = await fetch("/api/mac/slot-05/preencher-automatico", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo }),
        });
        const dp = await rp.json();
        if (cancelado) return;
        if (dp.ok) {
          const inedito = Object.keys(dp.itens ?? {}).filter((id) => !marcasAtuais[id]).length;
          if (inedito > 0) {
            setProposta(dp);
            notificar(`Filtros automáticos: ${inedito} item(ns) podem sair da análise — confira e aceite.`);
          }
        }
      } catch (e) {
        if (!cancelado) setErro(String(e));
      } finally {
        if (!cancelado) { setCarregando(false); setLendoLip(false); }
      }
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const stats = useMemo(() => {
    const m: Record<string, { total: number; respondidos: number; temErro: boolean; busca: string }> = {};
    for (const g of grupos) {
      const lista = porGrupo.get(g) ?? [];
      m[g] = {
        total: lista.length,
        respondidos: lista.filter((i) => marcas[i.id]).length,
        temErro: lista.some((i) => marcas[i.id] === "nao_conforme"),
        busca: semAcento(g + " " + lista.map((i) => i.texto).join(" ")),
      };
    }
    return m;
  }, [grupos, porGrupo, marcas]);

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
    setAnalises((prev) => [d.analise, ...prev]);
    return d.analise as Analise;
  }

  const salvar = useCallback(async (
    novasMarcas = marcas, novasFontes = fontes, novasObs = observacoes, silencioso = false,
  ) => {
    setSalvando(true);
    try {
      const a = await garantirAnalise(novasMarcas, novasFontes);
      const r = await fetch("/api/mac/slot-05/analise", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, itens: novasMarcas, fontes: novasFontes, observacoes: novasObs }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
      if (!silencioso) notificar("✅ Salvo.");
    } catch (e: any) {
      notificar(`Erro ao salvar: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas, fontes, observacoes, analise, codigo, notificar]);

  function marcar(itemId: string, status: Status) {
    setMarcas((prev) => {
      const novo = { ...prev };
      if (novo[itemId] === status) delete novo[itemId]; else novo[itemId] = status;
      return novo;
    });
  }

  function marcarGrupo(grupo: string, status: Status | null) {
    const lista = porGrupo.get(grupo) ?? [];
    setMarcas((prev) => {
      const novo = { ...prev };
      for (const i of lista) { if (status) novo[i.id] = status; else delete novo[i.id]; }
      return novo;
    });
    notificar(status
      ? `${lista.length} item(ns) → ${ESTILO[status].rotulo}.`
      : `${lista.length} item(ns) limpos.`);
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
      setAbaAtual(null);
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
    const linhas = proposta.porGrupo.map((g) => `  • ${g.qtd}× ${g.grupo}\n    ↳ ${g.justificativa ?? ""}`).join("\n");
    const bloco =
      `━━━ PRÉ-PREENCHIMENTO PELO LIP ━━━\n` +
      `${new Date().toLocaleString("pt-BR")} — ${aplicados} item(ns) marcados como Não se Aplica\n` +
      `Lido de ${proposta.camposPreenchidos} campos do LIP e do texto dos documentos da pasta.\n${linhas}`;
    const novasObs = observacoes ? `${observacoes}\n\n${bloco}` : bloco;

    setMarcas(novasMarcas);
    setFontes(novasFontes);
    setObservacoes(novasObs);
    setProposta(null);
    await salvar(novasMarcas, novasFontes, novasObs);
    notificar(`${aplicados} item(ns) preenchidos a partir do LIP.`);
  }

  const gruposFiltrados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return grupos;
    return grupos.filter((g) => (stats[g]?.busca ?? "").includes(q));
  }, [grupos, busca, stats]);

  if (carregando) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;
  if (erro) return (
    <div className="p-6">
      <p className="text-sm text-[var(--error)] mb-3">{erro}</p>
      <button onClick={() => router.push("/processos")} className="text-sm underline">← Processos</button>
    </div>
  );

  const itensDaAba = abaAtual && abaAtual !== ABA_OBS ? (porGrupo.get(abaAtual) ?? []) : [];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="px-6 pt-4">
        {/* ─── Cabeçalho ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push("/"); }}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-red-800 hover:bg-red-700 text-red-200 px-3 py-1.5 rounded text-sm font-medium transition-colors">
              🚪 Sair
            </button>
            <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`); }}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← LIP
            </button>
            <button onClick={() => window.open(`/processo/${encodeURIComponent(codigo)}?tipo=slot_05`, "_blank")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors border border-[var(--border)]">
              🔍 Ver LIP ↗
            </button>
            <button onClick={() => router.push("/admin/checklists")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ⚙️ Gerenciar Checklist
            </button>
          </div>

          <div className="text-right">
            <h1 className="text-lg font-bold">🔍 MAC — Módulo de Análises e Conformidades</h1>
            <p className="text-xs text-[var(--text-muted)]">Aprovação de Projeto</p>
            {salvando
              ? <p className="text-xs text-[var(--warning)] animate-pulse">⏳ Salvando…</p>
              : <p className="text-xs text-[var(--success)]">✓ Salvo automaticamente</p>}
            <p className="text-sm">
              Nº do Alvará (Projeto): <span className="font-mono text-[var(--accent)]">{codigo}</span>
            </p>
            {proprietario && <p className="text-xs text-[var(--text-muted)]">{proprietario}</p>}
            {analise && (
              <p className="text-[var(--accent)] text-xs font-bold mt-0.5">
                Análise {analise.numero_analise} {analise.status === "em_andamento" ? "em andamento" : `— ${analise.status}`}
              </p>
            )}
          </div>
        </div>

        {/* ─── Legenda ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 text-xs mt-3 mb-2">
          {STATUS.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded font-bold border"
                style={{ background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto }}>
                {ESTILO[s].icone}
              </span>
              <span className="text-[var(--text-secondary)]">{ESTILO[s].rotulo}</span>
            </span>
          ))}
          <a href="https://www.ilovepdf.com/pt/comprimir_pdf" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
            🗜️ <span>Comprimir PDF</span>
          </a>
          <span className="text-[var(--text-muted)]">·</span>
          {STATUS.map((s) => (
            <span key={s} className="px-2 py-0.5 rounded-full border"
              style={{ borderColor: ESTILO[s].borda, color: ESTILO[s].texto }}>
              {ESTILO[s].rotulo}: {totais[s]}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded-full border border-[#EA580C] text-[#EA580C]">
            Pendentes: {totais.pendente}
          </span>
          <span className="text-[var(--text-muted)]">de {itensChecklist.length} itens · {grupos.length} grupos</span>
        </div>

        {toast && <p className="text-xs text-[var(--accent)] mb-2">{toast}</p>}
      </div>

      {/* ─── Corpo: conteúdo + coluna de ações ──────────────────────── */}
      <div className="flex gap-4 px-6 pb-8">
        <div className="flex-1 min-w-0">
          {/* Proposta do LIP */}
          {proposta && (
            <div className="border border-[#2563EB] rounded-lg p-4 mb-4 bg-[var(--bg-card)]">
              <p className="text-sm font-bold mb-1">
                Filtros acionados automaticamente — {proposta.total} item(ns) saem da análise
              </p>
              <div className="flex flex-wrap gap-1.5 my-2">
                {[...new Set(proposta.porGrupo.map((g) => g.regraId).filter(Boolean))].map((id) => (
                  <span key={id as string}
                    className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-[var(--primary)] text-white">
                    {ROTULO_FILTRO[id as string] ?? id}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mb-3">
                Lido de {proposta.camposPreenchidos} campos do LIP e do texto dos documentos da pasta.
                Nada é gravado até você aceitar, e nenhum item já respondido é sobrescrito.
              </p>
              <div className="space-y-1.5 mb-3 max-h-72 overflow-y-auto">
                {proposta.porGrupo.map((g) => (
                  <div key={g.grupo} className="text-xs">
                    <span className="font-semibold">{g.qtd}×</span>{" "}
                    <span className="text-[var(--text-secondary)]">{g.grupo}</span>
                    <p className="text-[10px] text-[var(--text-muted)] ml-6">↳ {g.justificativa}</p>
                  </div>
                ))}
              </div>
              {!!proposta.aplicaveis.length && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                    Confirmado que SE APLICA — fica com você
                  </p>
                  {proposta.aplicaveis.map((a) => (
                    <p key={a.regraId} className="text-[10px] text-[var(--text-secondary)]">• {a.justificativa}</p>
                  ))}
                </div>
              )}
              {!!proposta.indecisas.length && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase font-bold text-[#EA580C]">Sem dado para decidir</p>
                  {proposta.indecisas.map((i) => (
                    <p key={i.regraId} className="text-[10px] text-[var(--text-secondary)]">
                      • {i.nome} — falta: {i.camposFaltando.join(", ") || "—"}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={aceitarProposta} disabled={proposta.total === 0}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-50">
                  Aceitar e marcar {proposta.total} item(ns)
                </button>
                <button onClick={() => setProposta(null)}
                  className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] underline">descartar</button>
              </div>
            </div>
          )}

          {/* ÍNDICE */}
          {abaAtual === null && (
            <>
              <div className="flex gap-2 flex-wrap mb-3">
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar no checklist — ex.: recuo, acessibilidade, calçada"
                  className="flex-1 min-w-[260px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                {busca && (
                  <button onClick={() => setBusca("")}
                    className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm">
                    Limpar
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-3">
                Itens do checklist — {gruposFiltrados.length} de {grupos.length} grupos
              </p>
              <div className="flex flex-col gap-1.5">
                {gruposFiltrados.map((grupo) => {
                  const st = stats[grupo] ?? { total: 0, respondidos: 0, temErro: false };
                  const completo = st.respondidos === st.total && st.total > 0;
                  return (
                    <button key={grupo} onClick={() => { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupo); }}
                      className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                      <span className="text-xs text-[var(--text-muted)] font-mono w-7 shrink-0">
                        {grupos.indexOf(grupo) + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium">{grupo}</span>
                      {st.temErro && <span className="w-2.5 h-2.5 bg-[var(--error)] rounded-full shrink-0" />}
                      <span className={`text-xs shrink-0 ${completo ? "text-[#059669]" : "text-[var(--text-muted)]"}`}>
                        {st.respondidos}/{st.total}
                      </span>
                    </button>
                  );
                })}
                <button onClick={() => setAbaAtual(ABA_OBS)}
                  className="flex items-center gap-3 text-left px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent)] transition-colors">
                  <span className="text-xs text-[var(--text-muted)] font-mono w-7 shrink-0">📝</span>
                  <span className="flex-1 text-sm font-medium">OBS</span>
                </button>
              </div>
            </>
          )}

          {/* ABA OBS */}
          {abaAtual === ABA_OBS && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setAbaAtual(null)}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
                  ← Índice
                </button>
                <span className="font-bold">📝 OBS</span>
              </div>
              <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={22}
                placeholder="Observações do MAC — o pré-preenchimento pelo LIP registra aqui o que marcou e por quê."
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-vertical" />
              <button onClick={() => salvar()}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] px-4 py-2 rounded text-sm font-medium w-fit">
                💾 Salvar Observações
              </button>
            </div>
          )}

          {/* ITENS DE UM GRUPO */}
          {abaAtual !== null && abaAtual !== ABA_OBS && (
            <>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <button onClick={() => { void salvar(marcas, fontes, observacoes, true); setAbaAtual(null); }}
                  className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
                  ← Índice
                </button>
                <span className="font-bold truncate">{abaAtual}</span>
              </div>
              <div className="flex flex-wrap gap-2 pb-2">
                {STATUS.map((s) => (
                  <button key={s} onClick={() => marcarGrupo(abaAtual, s)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:text-white"
                    style={{ background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto }}>
                    {ESTILO[s].icone} Todos {ESTILO[s].rotulo}
                  </button>
                ))}
                <button onClick={() => marcarGrupo(abaAtual, null)}
                  className="flex items-center gap-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                  🧹 Limpar Aba
                </button>
                <span className="text-xs text-[var(--text-muted)] self-center">
                  {stats[abaAtual]?.respondidos ?? 0}/{stats[abaAtual]?.total ?? 0} respondidos
                </span>
              </div>

              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-card)]">
                {itensDaAba.map((it) => (
                  <div key={it.id} className="border-t border-[var(--border)] first:border-t-0 px-3 py-2 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs whitespace-pre-wrap">{it.texto}</p>
                      {fontes[it.id] && (
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">🔎 {fontes[it.id]}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {STATUS.map((s) => (
                        <button key={s} onClick={() => marcar(it.id, s)} title={ESTILO[s].rotulo}
                          className="w-8 h-8 rounded border text-sm font-bold transition-colors"
                          style={marcas[it.id] === s
                            ? { background: ESTILO[s].borda, borderColor: ESTILO[s].borda, color: "white" }
                            : { background: ESTILO[s].bg, borderColor: ESTILO[s].borda, color: ESTILO[s].texto, opacity: 0.45 }}>
                          {ESTILO[s].icone}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Navegação entre grupos */}
              <div className="flex justify-between mt-3">
                <button
                  onClick={() => { const i = grupos.indexOf(abaAtual); if (i > 0) { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupos[i - 1]); } }}
                  disabled={grupos.indexOf(abaAtual) === 0}
                  className="px-3 py-1.5 rounded text-sm bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  ← Anterior
                </button>
                <button
                  onClick={() => { const i = grupos.indexOf(abaAtual); if (i < grupos.length - 1) { void salvar(marcas, fontes, observacoes, true); setAbaAtual(grupos[i + 1]); } }}
                  disabled={grupos.indexOf(abaAtual) === grupos.length - 1}
                  className="px-3 py-1.5 rounded text-sm bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40">
                  Próximo →
                </button>
              </div>
            </>
          )}
        </div>

        {/* ─── Coluna de AÇÕES ─────────────────────────────────────── */}
        <aside className="w-56 shrink-0 flex flex-col gap-2">
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Ações</p>

          {[1, 2, 3, 4, 5].map((n) => {
            const existente = analises.find((a) => a.numero_analise === n);
            const ativa = analise?.numero_analise === n;
            return (
              <button key={n}
                onClick={() => {
                  if (!existente) { notificar(`Análise ${n} ainda não existe.`); return; }
                  setAnalise(existente);
                  setMarcas(existente.itens ?? {});
                  setFontes(existente.fontes ?? {});
                  setObservacoes(existente.observacoes ?? "");
                  setAbaAtual(null);
                }}
                className={`w-full py-2 rounded-lg text-sm font-bold border transition-colors ${
                  ativa ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                    : existente ? "bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]"
                      : "bg-[var(--bg-secondary)] text-[var(--text-muted)] border-dashed border-[var(--border)]"}`}>
                📋 Análise {n}
              </button>
            );
          })}

          <button onClick={() => { void salvar(marcas, fontes, observacoes, true); router.push(`/logradouro/${encodeURIComponent(codigo)}`); }}
            className="w-full py-2 rounded-lg text-sm font-bold border bg-[var(--bg-secondary)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] mt-1">
            🗺️ Via / Logradouro
          </button>
          <button onClick={() => router.push("/admin/checklists")}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors">
            📋 Gerenciar MAC
          </button>
          <button onClick={() => router.push("/admin/filtros-slot5")}
            className="w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm transition-colors"
            title="Criar e editar os filtros que tiram itens da análise">
            🎛️ Gerenciar Filtros
          </button>

          <button onClick={preencherDoLip} disabled={lendoLip}
            className="w-full bg-[#EFF6FF] hover:bg-[#2563EB] hover:text-white disabled:opacity-50 border border-[#2563EB] text-[#2563EB] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Lê os campos do LIP e o texto dos documentos da pasta, e marca sozinho os grupos que não se aplicam">
            {lendoLip ? "⏳ Lendo…" : "📁 PREENCHER DO LIP"}
          </button>

          <button onClick={() => salvar()} disabled={salvando}
            className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
            {salvando ? "Salvando…" : "💾 Salvar"}
          </button>

          <button
            onClick={async () => {
              const novas = { ...marcas };
              for (const i of itensChecklist) if (!novas[i.id]) novas[i.id] = "conforme";
              setMarcas(novas);
              await salvar(novas, fontes, observacoes);
              notificar("Itens pendentes marcados como Conforme.");
            }}
            className="w-full bg-[#ECFDF5] hover:bg-[#059669] hover:text-white border border-[#059669] text-[#059669] font-bold py-2.5 rounded-lg text-sm transition-colors"
            title="Marca como Conforme todo item ainda sem resposta">
            ✅ Concluir pendentes
          </button>

          <p className="text-[10px] text-[var(--text-muted)] leading-snug mt-1">
            Despacho e Laudo do Slot 5 ainda não estão ligados nesta tela.
          </p>
        </aside>
      </div>
    </div>
  );
}
