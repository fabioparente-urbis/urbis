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

type PromptState = {
  atual: string;
  anterior: string;
  backup: string;
  versao: number;
  editando: boolean;
  salvando: boolean;
};

export default function AdminPrompts() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [adminNome, setAdminNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [p1, setP1] = useState<PromptState>({ atual: "", anterior: "", versao: 0, editando: false, salvando: false, backup: "" });
  const [p2, setP2] = useState<PromptState>({ atual: "", anterior: "", versao: 0, editando: false, salvando: false, backup: "" });

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

      j2.data?.forEach((p: PromptData) => {
        const setter = p.chave === "P1_TRIAGEM" ? setP1 : setP2;
        setter(prev => ({
          ...prev,
          atual: p.conteudo,
          anterior: p.versao_anterior ?? "",
          backup: p.conteudo_backup ?? "",
          versao: p.versao,
        }));
      });

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
    const res = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave, novo_conteudo: state.atual }),
    });
    const json = await res.json();
    if (json.ok) {
      setter(p => ({ ...p, versao: p.versao + 1, editando: false, salvando: false }));
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
  function restaurar(state: PromptState, setter: typeof setP1) {
    if (!state.anterior) return;
    setter(p => ({ ...p, atual: p.backup, editando: true }));
    showToast("Versão anterior restaurada. Clique em Salvar e Ativar para confirmar.", "ok");
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
      setter(p => ({ ...p, atual: texto, editando: true }));
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
    setter(p => ({ ...p, atual: texto, editando: true }));
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
            { label: "P2", sublabel: "EXTRAÇÃO DE DADOS E PARÂMETROS URBANÍSTICOS", chave: "P2_EXTRACAO", state: p2, setter: setP2, cor: "#d946ef" },
            { label: "P1", sublabel: "TRIAGEM E CLASSIFICAÇÃO DE DOCUMENTOS", chave: "P1_TRIAGEM", state: p1, setter: setP1, cor: "#06b6d4" },
          ].map(({ label, sublabel, chave, state, setter, cor }) => (
            <div key={chave}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 3, height: 20, background: cor, borderRadius: 2 }} />
                <span style={{ color: cor, fontSize: 10, letterSpacing: 3, fontWeight: 700 }}>{label}</span>
                <span style={{ color: "#ffffff44", fontSize: 10, letterSpacing: 2 }}>{sublabel}</span>
                <span style={{ color: "#ffffff22", fontSize: 10, marginLeft: "auto" }}>v{state.versao}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: "#ffffff33", fontSize: 10, letterSpacing: 2 }}>BACKUP / HISTÓRICO</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={() => restaurar(state, setter)} disabled={!state.backup} cor={cor}>🔄 Restaurar</Btn>
                      <Btn onClick={() => copiarParaBackup(chave, setter)} cor={cor}>⬅ Copiar Produção → Backup</Btn>
                      <Btn onClick={() => exportar(state.backup, chave + "_backup")} disabled={!state.anterior} cor={cor}>📤 Exportar .txt</Btn>
                    </div>
                  </div>
                  <textarea readOnly value={state.anterior || "(sem versão anterior)"} style={{
                    background: "#0d0d14", border: `1px solid ${cor}22`, borderRadius: 6,
                    color: "#ffffff44", fontSize: 11, lineHeight: 1.6, padding: 14,
                    height: 320, fontFamily: "inherit", outline: "none",
                  }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#ffffff66", fontSize: 10, letterSpacing: 2 }}>PRODUÇÃO</span>
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
                    onChange={e => setter(p => ({ ...p, atual: e.target.value }))}
                    style={{
                      background: state.editando ? "#0d1117" : "#0d0d14",
                      border: `1px solid ${state.editando ? cor : cor + "33"}`,
                      borderRadius: 6,
                      color: state.editando ? "#f0f0f0" : "#ffffff88",
                      fontSize: 11, lineHeight: 1.6, padding: 14,
                      height: 320, fontFamily: "inherit", outline: "none",
                      transition: "all 0.2s ease",
                      boxShadow: state.editando ? `0 0 0 1px ${cor}44` : "none",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
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
