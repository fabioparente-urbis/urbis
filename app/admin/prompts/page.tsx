"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

// Chaves aceitas pela tela. P2_MAC é ignorada explicitamente.
const CHAVES_VALIDAS = ["P1_TRIAGEM", "P2_EXTRACAO"] as const;
type ChaveValida = (typeof CHAVES_VALIDAS)[number];
const isChaveValida = (c: string): c is ChaveValida =>
  (CHAVES_VALIDAS as readonly string[]).includes(c);

export default function AdminPrompts() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [adminNome, setAdminNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [p1, setP1] = useState<PromptState>({ atual: "", anterior: "", versao: 0, editando: false, salvando: false, backup: "", historico: [], historicoSelId: null, naoSalvo: false });
  const [p2, setP2] = useState<PromptState>({ atual: "", anterior: "", versao: 0, editando: false, salvando: false, backup: "", historico: [], historicoSelId: null, naoSalvo: false });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (!json.ok || json.data?.perfil !== "Administrador") {
        router.push("/");
        return;
      }
      setAdminNome(json.data.nome ?? "Admin");

      const r2 = await fetch("/api/admin/prompts");
      const j2 = await r2.json();
      if (!j2.ok) { showToast("Erro ao carregar prompts.", "erro"); setCarregando(false); return; }

      const prompts: PromptData[] = (j2.data ?? []).filter(
        (p: PromptData) => isChaveValida(p.chave) // ignora P2_MAC e quaisquer outras
      );

      prompts.forEach((p) => {
        const setter = p.chave === "P1_TRIAGEM" ? setP1 : setP2;
        setter(prev => ({
          ...prev,
          atual: p.conteudo,
          anterior: p.versao_anterior ?? "",
          backup: p.conteudo_backup ?? "",
          versao: p.versao,
        }));
      });

      // Coluna esquerda: histórico vivo de lip_prompts_historico (mais recente primeiro).
      await Promise.all(
        prompts.map(async (p) => {
          const r = await fetch(`/api/admin/prompts/historico?chave=${encodeURIComponent(p.chave)}`);
          const j = await r.json();
          if (!j.ok) return;
          const historico: HistoricoEntry[] = j.data ?? [];
          const setter = p.chave === "P1_TRIAGEM" ? setP1 : setP2;
          setter(prev => ({
            ...prev,
            historico,
            historicoSelId: historico[0]?.id ?? null,
          }));
        })
      );

      setCarregando(false);
    })();
  }, []);

  useEffect(() => {
    const bloquearContexto = (e: MouseEvent) => e.preventDefault();
    const bloquearTeclado = (e: KeyboardEvent) => {
      if (e.key === "F12") e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ["3","4","s","S"].includes(e.key)) e.preventDefault();
    };
    const borrar = () => { if (containerRef.current) containerRef.current.style.filter = "blur(20px)"; };
    const restaurar = () => { if (containerRef.current) containerRef.current.style.filter = "none"; };

    document.addEventListener("contextmenu", bloquearContexto);
    document.addEventListener("keydown", bloquearTeclado);
    window.addEventListener("blur", borrar);
    window.addEventListener("focus", restaurar);
    document.addEventListener("visibilitychange", () => { if (document.hidden) borrar(); else restaurar(); });

    return () => {
      document.removeEventListener("contextmenu", bloquearContexto);
      document.removeEventListener("keydown", bloquearTeclado);
      window.removeEventListener("blur", borrar);
      window.removeEventListener("focus", restaurar);
    };
  }, []);

  function showToast(msg: string, tipo: "ok" | "erro") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  async function salvar(chave: string, state: PromptState, setter: typeof setP1) {
    setter(p => ({ ...p, salvando: true }));
    // O backend grava um snapshot em lip_prompts_historico ANTES de sobrescrever lip_prompts.
    const res = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave, novo_conteudo: state.atual, salvo_por: adminNome || null }),
    });
    const json = await res.json();
    if (json.ok) {
      // Recarrega o histórico para refletir o snapshot recém-gravado na coluna esquerda.
      let historico: HistoricoEntry[] = state.historico;
      try {
        const rh = await fetch(`/api/admin/prompts/historico?chave=${encodeURIComponent(chave)}`);
        const jh = await rh.json();
        if (jh.ok) historico = jh.data ?? [];
      } catch { /* mantém histórico anterior em caso de falha de rede */ }

      setter(p => ({
        ...p,
        versao: p.versao + 1,
        editando: false,
        salvando: false,
        naoSalvo: false,
        historico,
        historicoSelId: historico[0]?.id ?? p.historicoSelId,
      }));
      showToast("Prompt salvo e ativado com sucesso.", "ok");
    } else {
      setter(p => ({ ...p, salvando: false }));
      showToast("Erro ao salvar: " + json.erro, "erro");
    }
  }

  async function copiarParaBackup(chave: string, setter: typeof setP1) {
    const res = await fetch("/api/admin/prompts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave }),
    });
    const json = await res.json();
    if (json.ok) {
      setter(p => ({ ...p, backup: p.atual }));
      showToast("Backup atualizado com sucesso.", "ok");
    } else {
      showToast("Erro ao copiar backup: " + json.erro, "erro");
    }
  }
  // Restaurar = copia o snapshot SELECIONADO (coluna esquerda) para o textarea de PRODUÇÃO.
  // NÃO salva — apenas preenche o campo, marca naoSalvo=true e exige Salvar e Ativar para efetivar.
  function restaurar(conteudoSnapshot: string, setter: typeof setP1) {
    if (!conteudoSnapshot) return;
    setter(p => ({ ...p, atual: conteudoSnapshot, editando: true, naoSalvo: true }));
    showToast("Snapshot copiado para PRODUÇÃO. Revise e clique em Salvar e Ativar para efetivar.", "ok");
  }

  function exportar(texto: string, chave: string) {
    const blob = new Blob([texto], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chave}_backup.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importar(setter: typeof setP1) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const texto = await file.text();
      setter(p => ({ ...p, atual: texto, editando: true, naoSalvo: true }));
      showToast("Arquivo importado. Revise e clique em Salvar e Ativar.", "ok");
    };
    input.click();
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto);
    showToast("Copiado para área de transferência.", "ok");
  }

  async function colar(setter: typeof setP1) {
    const texto = await navigator.clipboard.readText();
    setter(p => ({ ...p, atual: texto, editando: true, naoSalvo: true }));
    showToast("Conteúdo colado.", "ok");
  }

  const watermark = (nome: string) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><text transform='rotate(-35, 150, 150)' x='10' y='160' font-size='13' fill='%23d946ef' opacity='0.06' font-family='monospace'>${nome} • URBIS CONFIDENCIAL • </text></svg>`
    )}")`;

  if (carregando) return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#d946ef", fontFamily: "monospace", fontSize: 14, letterSpacing: 2 }}>CARREGANDO SISTEMA...</div>
    </div>
  );

  return (
    <>
      <style>{`
        @media print { body { display: none !important; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #d946ef44; border-radius: 3px; }
      `}</style>

      <div ref={containerRef} style={{
        background: "#0a0a0f", minHeight: "100vh",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        backgroundImage: watermark(adminNome),
        transition: "filter 0.3s ease",
        padding: "0 0 40px 0",
      }}>

        <div style={{
          borderBottom: "1px solid #d946ef33", padding: "16px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#0d0d14",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d946ef", boxShadow: "0 0 8px #d946ef" }} />
            <span style={{ color: "#d946ef", fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>URBIS — GERENCIADOR DE PROMPTS DE IA</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#ffffff33", fontSize: 11, letterSpacing: 1 }}>{adminNome.toUpperCase()}</span>
            <button onClick={() => router.push("/")} style={{
              background: "transparent", border: "1px solid #ffffff22", color: "#ffffff66",
              padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, letterSpacing: 1,
            }}>← HOME</button>
          </div>
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 32 }}>
          {[
            { label: "P2 — MAC", sublabel: "EXTRAÇÃO DE DADOS E PARÂMETROS URBANÍSTICOS", chave: "P2_EXTRACAO", state: p2, setter: setP2, cor: "#d946ef" },
            { label: "P1 — LIP", sublabel: "TRIAGEM E CLASSIFICAÇÃO DE DOCUMENTOS", chave: "P1_TRIAGEM", state: p1, setter: setP1, cor: "#06b6d4" },
          ].map(({ label, sublabel, chave, state, setter, cor }) => {
            const historicoSel = state.historico.find(h => h.id === state.historicoSelId) ?? null;
            const conteudoEsquerda = historicoSel?.conteudo ?? state.anterior ?? "";
            const fmtData = (iso: string) => {
              try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
              catch { return iso; }
            };
            return (
            <div key={chave}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 3, height: 20, background: cor, borderRadius: 2 }} />
                <span style={{
                  color: cor, fontSize: 10, letterSpacing: 3, fontWeight: 700,
                  border: `1px solid ${cor}66`, padding: "3px 8px", borderRadius: 4,
                  background: cor + "11",
                }}>{label}</span>
                <span style={{ color: "#ffffff44", fontSize: 10, letterSpacing: 2 }}>{sublabel}</span>
                <span style={{ color: "#ffffff22", fontSize: 10, marginLeft: "auto" }}>v{state.versao}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{
                    color: "#ffffff88", fontSize: 10, letterSpacing: 2, fontWeight: 700,
                    paddingBottom: 6, borderBottom: `1px solid ${cor}33`,
                  }}>
                    BACKUP / HISTÓRICO — somente leitura
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ color: "#ffffff33", fontSize: 10, letterSpacing: 2 }}>
                      SNAPSHOTS {state.historico.length > 0 && `(${state.historico.length})`}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Btn onClick={() => restaurar(conteudoEsquerda, setter)} disabled={!conteudoEsquerda} cor={cor}>🔄 Restaurar</Btn>
                      <Btn onClick={() => copiarParaBackup(chave, setter)} cor={cor}>⬅ Copiar Produção → Backup</Btn>
                      <Btn onClick={() => exportar(conteudoEsquerda, chave + "_backup")} disabled={!conteudoEsquerda} cor={cor}>📤 Exportar .txt</Btn>
                    </div>
                  </div>
                  {state.historico.length > 0 && (
                    <select
                      value={state.historicoSelId ?? ""}
                      onChange={e => setter(p => ({ ...p, historicoSelId: Number(e.target.value) }))}
                      style={{
                        background: "#0d0d14", border: `1px solid ${cor}44`, borderRadius: 4,
                        color: "#ffffff88", fontSize: 10, padding: "4px 8px",
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
                  <textarea readOnly value={conteudoEsquerda || "(sem versão anterior)"} style={{
                    background: "#0d0d14", border: `1px solid ${cor}22`, borderRadius: 6,
                    color: "#ffffff44", fontSize: 11, lineHeight: 1.6, padding: 14,
                    height: 320, fontFamily: "inherit", outline: "none",
                  }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{
                    color: "#ffffff88", fontSize: 10, letterSpacing: 2, fontWeight: 700,
                    paddingBottom: 6, borderBottom: `1px solid ${cor}33`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span>PRODUÇÃO — versão ativa</span>
                    {state.naoSalvo && (
                      <span style={{
                        color: "#facc15", fontSize: 9, letterSpacing: 2, fontWeight: 700,
                        border: "1px solid #facc1566", padding: "2px 6px", borderRadius: 3,
                        background: "#facc1511",
                      }}>● ALTERADO — NÃO SALVO</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#ffffff66", fontSize: 10, letterSpacing: 2 }}>ESTADO</span>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Btn onClick={() => setter(p => ({ ...p, editando: !p.editando }))} cor={cor}>{state.editando ? "🔒 Bloquear" : "🔓 Editar"}</Btn>
                      <Btn onClick={() => importar(setter)} cor={cor}>📥 Importar .txt</Btn>
                      <Btn onClick={() => copiar(state.atual)} cor={cor}>📋 Copiar</Btn>
                      <Btn onClick={() => colar(setter)} cor={cor}>📋 Colar</Btn>
                      <Btn onClick={() => salvar(chave, state, setter)} disabled={!state.editando || state.salvando} cor="#22c55e" destaque>
                        {state.salvando ? "Salvando..." : "💾 Salvar e Ativar"}
                      </Btn>
                    </div>
                  </div>
                  <textarea
                    readOnly={!state.editando}
                    value={state.atual}
                    onChange={e => setter(p => ({ ...p, atual: e.target.value, naoSalvo: true }))}
                    style={{
                      background: state.editando ? "#0d1117" : "#0d0d14",
                      border: `1px solid ${state.naoSalvo ? "#facc15" : state.editando ? cor : cor + "33"}`,
                      borderRadius: 6,
                      color: state.editando ? "#f0f0f0" : "#ffffff88",
                      fontSize: 11, lineHeight: 1.6, padding: 14,
                      height: 320, fontFamily: "inherit", outline: "none",
                      transition: "all 0.2s ease",
                      boxShadow: state.naoSalvo
                        ? "0 0 0 1px #facc1555"
                        : state.editando ? `0 0 0 1px ${cor}44` : "none",
                    }}
                  />
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {toast && (
          <div style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 999,
            background: toast.tipo === "ok" ? "#052e16" : "#1c0a09",
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

function Btn({ children, onClick, disabled, cor, destaque }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: destaque && !disabled ? cor + "22" : "transparent",
      border: `1px solid ${disabled ? "#ffffff11" : cor + (destaque ? "88" : "44")}`,
      color: disabled ? "#ffffff22" : destaque ? cor : "#ffffff88",
      padding: "4px 10px", borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 10, letterSpacing: 1, fontFamily: "monospace",
      transition: "all 0.15s ease", whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}
