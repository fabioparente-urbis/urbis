"use client";
import { useEffect, useState } from "react";
import type { Aviso, Triagem } from "@/lib/bdi/vigia";

/**
 * Área do vigia na tela do processo.
 *
 * Mostra só fato verificável, cada um com a origem escrita do lado, e a
 * triagem por evidência com os motivos que a produziram. Não escreve nada:
 * não grava observação, não altera o processo, não sugere texto de despacho.
 *
 * Custo zero: consome /api/bdi/vigia, que é SQL puro.
 */

const COR_SEVERIDADE: Record<string, { fundo: string; borda: string; texto: string; rotulo: string }> = {
  alerta:  { fundo: "#fef2f2", borda: "#fecaca", texto: "#991b1b", rotulo: "ALERTA" },
  atencao: { fundo: "#fffbeb", borda: "#fde68a", texto: "#92400e", rotulo: "ATENÇÃO" },
  info:    { fundo: "#f8fafc", borda: "#e2e8f0", texto: "#334155", rotulo: "INFO" },
};

const COR_CLASSE: Record<string, string> = {
  "mais simples para análise": "#059669",
  "exige atenção": "#b45309",
  "maior risco de retrabalho": "#b91c1c",
};

export default function VigiaProcesso({ codigo }: { codigo: string }) {
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [triagem, setTriagem] = useState<Triagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    let vivo = true;
    setAvisos(null); setTriagem(null); setErro(null);
    fetch(`/api/bdi/vigia?codigo=${encodeURIComponent(codigo)}`)
      .then(r => r.json())
      .then(j => {
        if (!vivo) return;
        if (!j.ok) { setErro(j.erro ?? "Não foi possível carregar o vigia."); return; }
        setAvisos(j.avisos ?? []);
        setTriagem(j.triagem ?? null);
      })
      .catch(() => { if (vivo) setErro("Sem conexão para carregar o vigia."); });
    return () => { vivo = false; };
  }, [codigo]);

  // Erro aqui não pode atrapalhar a análise: o vigia é apoio, não obstáculo.
  if (erro) {
    return (
      <div style={{ ...S.caixa, borderColor: "#e2e8f0" }}>
        <div style={S.titulo}>🔎 Vigia do processo</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{erro}</div>
      </div>
    );
  }
  if (avisos === null) {
    return (
      <div style={S.caixa}>
        <div style={S.titulo}>🔎 Vigia do processo</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>Conferindo os dados…</div>
      </div>
    );
  }

  return (
    <div style={S.caixa}>
      <button type="button" onClick={() => setAberto(v => !v)} style={S.cabecalho} aria-expanded={aberto}>
        <span style={S.titulo}>🔎 Vigia do processo</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>{aberto ? "esconder" : "mostrar"}</span>
      </button>

      {aberto && (
        <>
          {triagem && (
            <div style={{ ...S.triagem, borderLeftColor: COR_CLASSE[triagem.classe] ?? "#94a3b8" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COR_CLASSE[triagem.classe] ?? "#334155" }}>
                {triagem.classe}
              </div>
              <ul style={S.motivos}>
                {triagem.motivos.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <div style={S.rodapeTriagem}>
                Classificação por fatos contados, não por previsão. Os critérios estão em <code>lib/bdi/vigia.ts</code>.
              </div>
            </div>
          )}

          {avisos.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748b", padding: "8px 0" }}>
              Nada a apontar neste processo.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {avisos.map(a => {
                const c = COR_SEVERIDADE[a.severidade] ?? COR_SEVERIDADE.info;
                return (
                  <div key={a.id} style={{ ...S.aviso, background: c.fundo, borderColor: c.borda }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: c.texto }}>{a.titulo}</span>
                      <span style={S.etiquetaFonte}>fonte: {a.fonte}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 3, whiteSpace: "pre-wrap" }}>
                      {a.detalhe}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  caixa: {
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 16,
  },
  cabecalho: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer",
  },
  titulo: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" },
  triagem: {
    marginTop: 10, paddingLeft: 12, borderLeft: "3px solid #94a3b8",
  },
  motivos: { margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "#475569", lineHeight: 1.6 },
  rodapeTriagem: { fontSize: 10.5, color: "#94a3b8", marginTop: 6 },
  aviso: { border: "1px solid", borderRadius: 8, padding: "8px 10px" },
  etiquetaFonte: { fontSize: 10, color: "#64748b", whiteSpace: "nowrap" },
};
