"use client";
import { useEffect, useState } from "react";
import { montarRelatorioMotor } from "@/lib/urbi/motorProducao";
import { calcularSinaleiro, type EstadoSinaleiro } from "@/lib/urbi/sinaleiro";
import type { Aviso } from "@/lib/bdi/vigia";

/**
 * Sinaleiro do URBI — Fase 1 do plano Assessor Ativo (07/09/2026).
 *
 * Ícone fixo, cor + forma (nunca só cor), que resume os avisos reais de um processo aberto sem
 * gastar nada novo: lê /api/bdi/vigia (já usado por VigiaProcesso) e /api/urbi/dossie (já usado
 * pelo chat) — ambos SQL puro, sem IA. Clicar só abre a lista de itens (motivo + fonte) da cor
 * vencente; nunca aplica nada sozinho, nunca abre o chat.
 *
 * Some por completo quando não há nada a apontar — "processo limpo fica sem cor" é o portão da
 * Fase 1, não um detalhe visual.
 */
export default function SinaleiroUrbi({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<EstadoSinaleiro | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    setEstado(null);
    setAberto(false);
    Promise.all([
      fetch(`/api/bdi/vigia?codigo=${encodeURIComponent(codigo)}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/urbi/dossie?codigo=${encodeURIComponent(codigo)}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([vigiaResp, dossieResp]) => {
      if (!vivo) return;
      const avisos: Aviso[] = vigiaResp?.ok ? (vigiaResp.avisos ?? []) : [];
      const acoes = dossieResp?.ok ? montarRelatorioMotor(dossieResp.data).acoes : [];
      setEstado(calcularSinaleiro(avisos, acoes));
    });
    return () => { vivo = false; };
  }, [codigo]);

  if (!estado || !estado.cor) return null;

  const c = CORES[estado.cor];

  return (
    <div style={{ position: "fixed", top: 16, left: 16, zIndex: 900 }}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        aria-label={`URBI — ${c.rotulo}: ${estado.itens.length} item${estado.itens.length > 1 ? "ns" : ""}. Clique para ver os motivos.`}
        title={`URBI — ${c.rotulo}`}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: c.fundo, border: `2px solid ${c.borda}`, color: c.texto,
          borderRadius: 999, padding: "6px 11px", cursor: "pointer",
          fontSize: 13, fontWeight: 700, boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{c.forma}</span>
        <span>{estado.itens.length}</span>
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label={`URBI — itens de ${c.rotulo}`}
          style={{
            marginTop: 8, width: 300, maxHeight: 340, overflowY: "auto",
            background: "var(--bg-card, #fff)", border: `1px solid ${c.borda}`,
            borderRadius: 10, padding: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: c.texto, marginBottom: 6 }}>
            URBI — {c.rotulo} ({estado.itens.length})
          </div>
          {estado.itens.map((item, i) => (
            <div key={i} style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid var(--border, #e2e8f0)" : "none" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary, #334155)" }}>{item.titulo}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted, #64748b)", marginTop: 2, whiteSpace: "pre-wrap" }}>
                {item.detalhe}
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>fonte: {item.fonte}</div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8 }}>
            Isto não aplica nada sozinho — cada sugestão continua exigindo o seu aceite, no lugar de sempre.
          </div>
        </div>
      )}
    </div>
  );
}

const CORES: Record<"vermelho" | "amarelo" | "verde", { fundo: string; borda: string; texto: string; forma: string; rotulo: string }> = {
  vermelho: { fundo: "#fef2f2", borda: "#dc2626", texto: "#991b1b", forma: "▲", rotulo: "Fiscalizar" },
  amarelo: { fundo: "#fffbeb", borda: "#d97706", texto: "#92400e", forma: "◆", rotulo: "Corrigir/Revisar" },
  verde: { fundo: "#f0fdf4", borda: "#16a34a", texto: "#166534", forma: "●", rotulo: "Sugerir" },
};
