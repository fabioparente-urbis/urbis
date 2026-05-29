"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Assunto = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  ordem: number;
};

type PromptData = {
  chave: string;
  conteudo: string;
  versao_anterior: string | null;
  conteudo_backup?: string | null;
  versao: number;
};

type HistoricoEntry = {
  id: number;
  prompt_chave: string;
  conteudo: string;
  salvo_em: string;
  salvo_por: string | null;
};

type PromptState = {
  atual: string;
  anterior: string;
  backup: string;
  versao: number;
  editando: boolean;
  salvando: boolean;
  historico: HistoricoEntry[];
  historicoSelId: number | null;
  naoSalvo: boolean;
};

type AssuntoEntry = {
  loaded: boolean;
  hasPrompts: boolean;
  inicializando: boolean;
  prompts: Partial<Record<ChaveCanonica, PromptState>>;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const CHAVES = [
  "P1_TRIAGEM",
  "P1_TRIAGEM_BACKUP",
  "P2_EXTRACAO",
  "P2_EXTRACAO_BACKUP",
] as const;
type ChaveCanonica = (typeof CHAVES)[number];

const CHAVE_META: Record<ChaveCanonica, { label: string; sublabel: string; cor: string }> = {
  P1_TRIAGEM:         { label: "P1 — TRIAGEM",  sublabel: "TRIAGEM E CLASSIFICAÇÃO DE DOCUMENTOS",      cor: "#06b6d4" },
  P1_TRIAGEM_BACKUP:  { label: "P1 — BACKUP",   sublabel: "BACKUP DO PROMPT DE TRIAGEM",                cor: "#0891b2" },
  P2_EXTRACAO:        { label: "P2 — MAC",       sublabel: "EXTRAÇÃO DE DADOS E PARÂMETROS URBANÍSTICOS",cor: "#d946ef" },
  P2_EXTRACAO_BACKUP: { label: "P2 — BACKUP",   sublabel: "BACKUP DO PROMPT DE ANÁLISE MAC",            cor: "#a21caf" },
};

function mkPromptState(): PromptState {
  return {
    atual: "", anterior: "", backup: "", versao: 0,
    editando: false, salvando: false,
    historico: [], historicoSelId: null, naoSalvo: false,
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminPrompts() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [adminNome, setAdminNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [abaIdx, setAbaIdx] = useState(0);
  const [assuntosData, setAssuntosData] = useState<Record<string, AssuntoEntry>>({});

  // Ref para evitar double-fetch por re-renders (sem precisar de dependency array complexo)
  const loadedIds = useRef<Set<string>>(new Set());

  // ── Helpers ────────────────────────────────────────────────────────────────

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  function updatePrompt(assuntoId: string, chave: ChaveCanonica, patch: Partial<PromptState>) {
    setAssuntosData((prev) => {
      const entry = prev[assuntoId] ?? { loaded: true, hasPrompts: true, inicializando: false, prompts: {} };
      const existing = entry.prompts[chave] ?? mkPromptState();
      return {
        ...prev,
        [assuntoId]: {
          ...entry,
          prompts: { ...entry.prompts, [chave]: { ...existing, ...patch } },
        },
      };
    });
  }

  // ── Carrega prompts de um assunto (lazy, guarda no ref para não repetir) ────

  async function loadAssunto(id: string) {
    if (loadedIds.current.has(id)) return;
    loadedIds.current.add(id);

    const res = await fetch(`/api/admin/prompts?assunto_id=${id}`);
    const json = await res.json();

    if (!json.ok) {
      showToast("Erro ao carregar prompts.", "erro");
      loadedIds.current.delete(id); // permite retry
      return;
    }

    const dados: PromptData[] = json.data ?? [];
    const prompts: Partial<Record<ChaveCanonica, PromptState>> = {};

    dados.forEach((p) => {
      if ((CHAVES as readonly string[]).includes(p.chave)) {
        prompts[p.chave as ChaveCanonica] = {
          ...mkPromptState(),
          atual: p.conteudo,
          anterior: p.versao_anterior ?? "",
          backup: p.conteudo_backup ?? "",
          versao: p.versao,
        };
      }
    });

    setAssuntosData((prev) => ({
      ...prev,
      [id]: { loaded: true, hasPrompts: dados.length > 0, inicializando: false, prompts },
    }));

    // Carrega histórico para cada prompt em paralelo
    await Promise.all(
      dados.map(async (p) => {
        const r = await fetch(`/api/admin/prompts/historico?chave=${encodeURIComponent(p.chave)}`);
        const j = await r.json();
        if (!j.ok) return;
        const historico: HistoricoEntry[] = j.data ?? [];
        setAssuntosData((prev) => {
          const entry = prev[id];
          if (!entry) return prev;
          const existing = entry.prompts[p.chave as ChaveCanonica] ?? mkPromptState();
          return {
            ...prev,
            [id]: {
              ...entry,
              prompts: {
                ...entry.prompts,
                [p.chave]: { ...existing, historico, historicoSelId: historico[0]?.id ?? null },
              },
            },
          };
        });
      })
    );
  }

  // ── Carga inicial ───────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me.ok || me.data?.perfil !== "Administrador") { router.push("/"); return; }
      setAdminNome(me.data.nome ?? "Admin");

      const ar = await fetch("/api/admin/assuntos").then((r) => r.json());
      if (!ar.ok) { showToast("Erro ao carregar assuntos.", "erro"); setCarregando(false); return; }

      const lista: Assunto[] = ar.data ?? [];
      setAssuntos(lista);
      setCarregando(false);

      if (lista.length > 0) await loadAssunto(lista[0].id);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lazy-load ao trocar aba ─────────────────────────────────────────────────

  useEffect(() => {
    const id = assuntos[abaIdx]?.id;
    if (id) loadAssunto(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaIdx, assuntos]);

  // ── Segurança (blur / anti-screenshot) ─────────────────────────────────────

  useEffect(() => {
    const bloquearContexto = (e: MouseEvent) => e.preventDefault();
    const bloquearTeclado = (e: KeyboardEvent) => {
      if (e.key === "F12") e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ["3", "4", "s", "S"].includes(e.key)) e.preventDefault();
    };
    const borrar = () => { if (containerRef.current) containerRef.current.style.filter = "blur(20px)"; };
    const restaurar = () => { if (containerRef.current) containerRef.current.style.filter = "none"; };
    const onVisibility = () => { if (document.hidden) borrar(); else restaurar(); };

    document.addEventListener("contextmenu", bloquearContexto);
    document.addEventListener("keydown", bloquearTeclado);
    window.addEventListener("blur", borrar);
    window.addEventListener("focus", restaurar);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("contextmenu", bloquearContexto);
      document.removeEventListener("keydown", bloquearTeclado);
      window.removeEventListener("blur", borrar);
      window.removeEventListener("focus", restaurar);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ── Ações ───────────────────────────────────────────────────────────────────

  async function salvar(assuntoId: string, chave: ChaveCanonica) {
    const state = assuntosData[assuntoId]?.prompts[chave];
    if (!state) return;
    updatePrompt(assuntoId, chave, { salvando: true });

    const res = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave, novo_conteudo: state.atual, salvo_por: adminNome || null, assunto_id: assuntoId }),
    });
    const json = await res.json();

    if (json.ok) {
      let historico = state.historico;
      try {
        const rh = await fetch(`/api/admin/prompts/historico?chave=${encodeURIComponent(chave)}`);
        const jh = await rh.json();
        if (jh.ok) historico = jh.data ?? [];
      } catch { /* mantém histórico anterior */ }

      updatePrompt(assuntoId, chave, {
        versao: state.versao + 1,
        editando: false,
        salvando: false,
        naoSalvo: false,
        historico,
        historicoSelId: historico[0]?.id ?? state.historicoSelId,
      });
      showToast("Prompt salvo e ativado com sucesso.", "ok");
    } else {
      updatePrompt(assuntoId, chave, { salvando: false });
      showToast("Erro ao salvar: " + json.erro, "erro");
    }
  }

  async function copiarParaBackup(assuntoId: string, chave: ChaveCanonica) {
    const state = assuntosData[assuntoId]?.prompts[chave];
    if (!state) return;

    const res = await fetch("/api/admin/prompts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave, assunto_id: assuntoId }),
    });
    const json = await res.json();
    if (json.ok) {
      updatePrompt(assuntoId, chave, { backup: state.atual });
      showToast("Backup atualizado com sucesso.", "ok");
    } else {
      showToast("Erro ao copiar backup: " + json.erro, "erro");
    }
  }

  function restaurar(assuntoId: string, chave: ChaveCanonica, conteudo: string) {
    if (!conteudo) return;
    updatePrompt(assuntoId, chave, { atual: conteudo, editando: true, naoSalvo: true });
    showToast("Snapshot copiado para PRODUÇÃO. Revise e clique em Salvar e Ativar para efetivar.", "ok");
  }

  function exportar(texto: string, nomeArquivo: string) {
    const blob = new Blob([texto], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${nomeArquivo}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  function importar(assuntoId: string, chave: ChaveCanonica) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".txt";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const texto = await file.text();
      updatePrompt(assuntoId, chave, { atual: texto, editando: true, naoSalvo: true });
      showToast("Arquivo importado. Revise e clique em Salvar e Ativar.", "ok");
    };
    input.click();
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto);
    showToast("Copiado para área de transferência.", "ok");
  }

  async function colar(assuntoId: string, chave: ChaveCanonica) {
    const texto = await navigator.clipboard.readText();
    updatePrompt(assuntoId, chave, { atual: texto, editando: true, naoSalvo: true });
    showToast("Conteúdo colado.", "ok");
  }

  async function inicializarPrompts(assuntoId: string) {
    setAssuntosData((prev) => ({
      ...prev,
      [assuntoId]: { ...(prev[assuntoId] ?? { loaded: false, hasPrompts: false, prompts: {} }), inicializando: true },
    }));

    const res = await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assunto_id: assuntoId }),
    });
    const json = await res.json();

    if (json.ok) {
      showToast("Prompts inicializados com sucesso.", "ok");
      // Força reload: remove do ref e limpa o estado
      loadedIds.current.delete(assuntoId);
      setAssuntosData((prev) => ({
        ...prev,
        [assuntoId]: { loaded: false, hasPrompts: false, inicializando: false, prompts: {} },
      }));
      await loadAssunto(assuntoId);
    } else {
      setAssuntosData((prev) => ({
        ...prev,
        [assuntoId]: { ...(prev[assuntoId] ?? { loaded: true, hasPrompts: false, prompts: {} }), inicializando: false },
      }));
      showToast("Erro ao inicializar: " + json.erro, "erro");
    }
  }

  // ── Watermark ───────────────────────────────────────────────────────────────

  const watermark = (nome: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><text transform='rotate(-35, 150, 150)' x='10' y='160' font-size='13' fill='%23d946ef' opacity='0.06' font-family='monospace'>${nome} • URBIS CONFIDENCIAL • </text></svg>`
    )}")`;

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (carregando) return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#d946ef", fontFamily: "monospace", fontSize: 14, letterSpacing: 2 }}>CARREGANDO SISTEMA...</div>
    </div>
  );

  const assuntoAtivo = assuntos[abaIdx];
  const entryAtiva: AssuntoEntry | undefined = assuntoAtivo ? assuntosData[assuntoAtivo.id] : undefined;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print { body { display: none !important; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #d946ef44; border-radius: 3px; }
      `}</style>

      <div ref={containerRef} style={{
        background: "#f8fafc", minHeight: "100vh",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        backgroundImage: watermark(adminNome),
        transition: "filter 0.3s ease",
        padding: "0 0 40px 0",
      }}>

        {/* ── CABEÇALHO ── */}
        <div style={{
          borderBottom: "1px solid #d946ef33", padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#ffffff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d946ef", boxShadow: "0 0 8px #d946ef" }} />
            <span style={{ color: "#d946ef", fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              URBIS — GERENCIADOR DE PROMPTS DE IA
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#cbd5e1", fontSize: 11, letterSpacing: 1 }}>{adminNome.toUpperCase()}</span>
            <button onClick={() => router.push("/")} style={{
              background: "transparent", border: "1px solid #e2e8f0", color: "#64748b",
              padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, letterSpacing: 1,
            }}>← HOME</button>
          </div>
        </div>

        {/* ── ABAS DE ASSUNTO ── */}
        <div style={{
          borderBottom: "1px solid #d946ef22",
          background: "#ffffff",
          display: "flex", gap: 0, overflowX: "auto",
          padding: "0 32px",
        }}>
          {assuntos.map((a, idx) => (
            <button key={a.id} onClick={() => setAbaIdx(idx)} style={{
              background: "transparent",
              borderBottom: abaIdx === idx ? "2px solid #d946ef" : "2px solid transparent",
              borderTop: "none", borderLeft: "none", borderRight: "none",
              color: abaIdx === idx ? "#d946ef" : a.ativo ? "#64748b" : "#e2e8f0",
              padding: "10px 16px",
              cursor: "pointer",
              fontSize: 10, letterSpacing: 2, fontFamily: "monospace", whiteSpace: "nowrap",
              transition: "color 0.15s ease",
            }}>
              {a.nome.toUpperCase()}
              {!a.ativo && <span style={{ marginLeft: 5, color: "#ffffff1a", fontSize: 8 }}>○</span>}
            </button>
          ))}
        </div>

        {/* ── CONTEÚDO DA ABA ── */}
        <div style={{ padding: "24px 32px" }}>

          {/* Carregando prompts */}
          {(!entryAtiva || !entryAtiva.loaded) && (
            <div style={{ color: "#d946ef88", fontFamily: "monospace", fontSize: 11, letterSpacing: 2, padding: "40px 0" }}>
              CARREGANDO PROMPTS...
            </div>
          )}

          {/* Sem prompts — botão inicializar */}
          {entryAtiva?.loaded && !entryAtiva.hasPrompts && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "60px 0" }}>
              <span style={{ color: "#cbd5e1", fontSize: 12, letterSpacing: 2 }}>
                Nenhum prompt configurado para{" "}
                <span style={{ color: "#64748b" }}>{assuntoAtivo?.nome?.toUpperCase()}</span>
              </span>
              <button
                disabled={entryAtiva.inicializando}
                onClick={() => assuntoAtivo && inicializarPrompts(assuntoAtivo.id)}
                style={{
                  background: "#d946ef22", border: "1px solid #d946ef88",
                  color: "#d946ef", padding: "12px 28px", borderRadius: 4,
                  cursor: entryAtiva.inicializando ? "not-allowed" : "pointer",
                  fontSize: 11, letterSpacing: 2, fontFamily: "monospace",
                  opacity: entryAtiva.inicializando ? 0.5 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                {entryAtiva.inicializando
                  ? "⏳ INICIALIZANDO..."
                  : "⚡ INICIALIZAR PROMPTS COPIANDO DE REGULARIZAÇÃO"}
              </button>
              <span style={{ color: "#e2e8f0", fontSize: 9, letterSpacing: 1 }}>
                Copia os 4 prompts ativos de Regularização para este assunto.
              </span>
            </div>
          )}

          {/* Prompts carregados */}
          {entryAtiva?.loaded && entryAtiva.hasPrompts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              {CHAVES.map((chave) => {
                const meta = CHAVE_META[chave];
                const state = entryAtiva.prompts[chave] ?? mkPromptState();
                const assuntoId = assuntoAtivo!.id;
                const historicoSel = state.historico.find((h) => h.id === state.historicoSelId) ?? null;
                const conteudoEsquerda = historicoSel?.conteudo ?? state.anterior ?? "";

                const fmtData = (iso: string) => {
                  try {
                    return new Date(iso).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    });
                  } catch { return iso; }
                };

                return (
                  <div key={chave}>
                    {/* Título do prompt */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 3, height: 20, background: meta.cor, borderRadius: 2 }} />
                      <span style={{
                        color: meta.cor, fontSize: 10, letterSpacing: 3, fontWeight: 700,
                        border: `1px solid ${meta.cor}66`, padding: "3px 8px", borderRadius: 4,
                        background: meta.cor + "11",
                      }}>{meta.label}</span>
                      <span style={{ color: "#94a3b8", fontSize: 10, letterSpacing: 2 }}>{meta.sublabel}</span>
                      <span style={{ color: "#e2e8f0", fontSize: 10, marginLeft: "auto" }}>v{state.versao}</span>
                    </div>

                    {/* Grid 2 colunas: histórico | produção */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                      {/* Coluna esquerda — Histórico */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{
                          color: "#475569", fontSize: 10, letterSpacing: 2, fontWeight: 700,
                          paddingBottom: 6, borderBottom: `1px solid ${meta.cor}33`,
                        }}>
                          BACKUP / HISTÓRICO — somente leitura
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                          <span style={{ color: "#cbd5e1", fontSize: 10, letterSpacing: 2 }}>
                            SNAPSHOTS {state.historico.length > 0 && `(${state.historico.length})`}
                          </span>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Btn onClick={() => restaurar(assuntoId, chave, conteudoEsquerda)} disabled={!conteudoEsquerda} cor={meta.cor}>🔄 Restaurar</Btn>
                            <Btn onClick={() => copiarParaBackup(assuntoId, chave)} cor={meta.cor}>⬅ Copiar → Backup</Btn>
                            <Btn onClick={() => exportar(conteudoEsquerda, chave + "_backup")} disabled={!conteudoEsquerda} cor={meta.cor}>📤 Exportar .txt</Btn>
                          </div>
                        </div>
                        {state.historico.length > 0 && (
                          <select
                            value={state.historicoSelId ?? ""}
                            onChange={(e) => updatePrompt(assuntoId, chave, { historicoSelId: Number(e.target.value) })}
                            style={{
                              background: "#ffffff", border: `1px solid ${meta.cor}44`, borderRadius: 4,
                              color: "#475569", fontSize: 10, padding: "4px 8px",
                              fontFamily: "inherit", outline: "none", letterSpacing: 1,
                            }}
                          >
                            {state.historico.map((h, i) => (
                              <option key={h.id} value={h.id}>
                                {i === 0 ? "★ " : ""}{fmtData(h.salvo_em)}{h.salvo_por ? ` — ${h.salvo_por}` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                        <textarea
                          readOnly
                          value={conteudoEsquerda || "(sem versão anterior)"}
                          style={{
                            background: "#ffffff", border: `1px solid ${meta.cor}22`, borderRadius: 6,
                            color: "#94a3b8", fontSize: 11, lineHeight: 1.6, padding: 14,
                            height: 320, fontFamily: "inherit", outline: "none", resize: "vertical",
                          }}
                        />
                      </div>

                      {/* Coluna direita — Produção */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{
                          color: "#475569", fontSize: 10, letterSpacing: 2, fontWeight: 700,
                          paddingBottom: 6, borderBottom: `1px solid ${meta.cor}33`,
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <span>PRODUÇÃO — versão ativa</span>
                          {state.naoSalvo && (
                            <span style={{
                              color: "#92400e", fontSize: 9, letterSpacing: 2, fontWeight: 700,
                              border: "1px solid #d9770666", padding: "2px 6px", borderRadius: 3,
                              background: "#fef3c7",
                            }}>● ALTERADO — NÃO SALVO</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#64748b", fontSize: 10, letterSpacing: 2 }}>ESTADO</span>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Btn onClick={() => updatePrompt(assuntoId, chave, { editando: !state.editando })} cor={meta.cor}>
                              {state.editando ? "🔒 Bloquear" : "🔓 Editar"}
                            </Btn>
                            <Btn onClick={() => importar(assuntoId, chave)} cor={meta.cor}>📥 Importar .txt</Btn>
                            <Btn onClick={() => copiar(state.atual)} cor={meta.cor}>📋 Copiar</Btn>
                            <Btn onClick={() => colar(assuntoId, chave)} cor={meta.cor}>📋 Colar</Btn>
                            <Btn
                              onClick={() => salvar(assuntoId, chave)}
                              disabled={!state.editando || state.salvando}
                              cor="#22c55e"
                              destaque
                            >
                              {state.salvando ? "Salvando..." : "💾 Salvar e Ativar"}
                            </Btn>
                          </div>
                        </div>
                        <textarea
                          readOnly={!state.editando}
                          value={state.atual}
                          onChange={(e) => updatePrompt(assuntoId, chave, { atual: e.target.value, naoSalvo: true })}
                          style={{
                            background: state.editando ? "#f1f5f9" : "#ffffff",
                            border: `1px solid ${state.naoSalvo ? "#d97706" : state.editando ? meta.cor : meta.cor + "33"}`,
                            borderRadius: 6,
                            color: state.editando ? "#1e293b" : "#475569",
                            fontSize: 11, lineHeight: 1.6, padding: 14,
                            height: 320, fontFamily: "inherit", outline: "none",
                            transition: "all 0.2s ease", resize: "vertical",
                            boxShadow: state.naoSalvo
                              ? "0 0 0 1px #d9770655"
                              : state.editando ? `0 0 0 1px ${meta.cor}44` : "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── TOAST ── */}
        {toast && (
          <div style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 999,
            background: toast.tipo === "ok" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${toast.tipo === "ok" ? "#22c55e55" : "#ef444455"}`,
            color: toast.tipo === "ok" ? "#22c55e" : "#ef4444",
            padding: "10px 18px", borderRadius: 6, fontSize: 12,
            fontFamily: "monospace", letterSpacing: 1,
            boxShadow: "0 4px 24px #00000088",
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Btn helper ───────────────────────────────────────────────────────────────

function Btn({
  children, onClick, disabled, cor, destaque,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: destaque && !disabled ? cor + "22" : "transparent",
        border: `1px solid ${disabled ? "#f1f5f9" : cor + (destaque ? "88" : "44")}`,
        color: disabled ? "#e2e8f0" : destaque ? cor : "#475569",
        padding: "4px 10px", borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 10, letterSpacing: 1, fontFamily: "monospace",
        transition: "all 0.15s ease", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
