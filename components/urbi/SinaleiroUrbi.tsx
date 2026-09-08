"use client";
import { useEffect, useRef, useState } from "react";
import { montarRelatorioMotor } from "@/lib/urbi/motorProducao";
import { calcularSinaleiro, type EstadoSinaleiro } from "@/lib/urbi/sinaleiro";
import type { Aviso } from "@/lib/bdi/vigia";

const POS_PADRAO = { top: 16, left: 16 };
const LIMITE_ARRASTO = 4; // px — abaixo disso, o mouseup ainda conta como clique

// Mesmo padrão de arraste do UrbiChat (cornerPos): posição em sessionStorage, própria
// (não sobrevive entre sessões/abas), inicializador preguiçoso pra evitar mismatch de
// hidratação (primeira pintura client-side sempre roda depois do fetch de `usuario`).
function lerPosSalva(): { top: number; left: number } {
  if (typeof window === "undefined") return POS_PADRAO;
  try {
    const salvo = sessionStorage.getItem("urbi:sinaleiroPos");
    if (salvo) {
      const pos = JSON.parse(salvo);
      if (typeof pos?.top === "number" && typeof pos?.left === "number") return pos;
    }
  } catch {}
  return POS_PADRAO;
}

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
  const [pos, setPos] = useState(lerPosSalva);
  const dragStart = useRef<{ mouseX: number; mouseY: number; top: number; left: number } | null>(null);
  const arrastouRef = useRef(false);

  useEffect(() => {
    try { sessionStorage.setItem("urbi:sinaleiroPos", JSON.stringify(pos)); } catch {}
  }, [pos]);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    arrastouRef.current = false;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, top: pos.top, left: pos.left };

    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      if (Math.abs(dx) > LIMITE_ARRASTO || Math.abs(dy) > LIMITE_ARRASTO) arrastouRef.current = true;
      setPos({
        top: Math.max(0, dragStart.current.top + dy),
        left: Math.max(0, dragStart.current.left + dx),
      });
    }

    function onUp() {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

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
    <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 900 }}>
      <button
        type="button"
        onMouseDown={onMouseDown}
        onClick={() => { if (arrastouRef.current) { arrastouRef.current = false; return; } setAberto(v => !v); }}
        aria-expanded={aberto}
        aria-label={`URBI — ${c.rotulo}: ${estado.itens.length} item${estado.itens.length > 1 ? "ns" : ""}. Clique para ver os motivos, arraste para reposicionar.`}
        title={`URBI — ${c.rotulo} (arraste para mover)`}
        style={{
          position: "relative",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          background: "#1e293b", border: "1px solid #0f172a", borderRadius: 8,
          padding: "7px 6px", cursor: "grab",
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
        }}
      >
        {(["vermelho", "amarelo", "verde"] as const).map(cor => {
          const acesa = cor === estado.cor;
          const acesoBg = CORES[cor].borda;
          return (
            <span
              key={cor}
              aria-hidden="true"
              style={{
                width: 14, height: 14, borderRadius: "50%",
                background: acesa ? acesoBg : "#334155",
                boxShadow: acesa ? `0 0 8px 2px ${acesoBg}` : "inset 0 1px 2px rgba(0,0,0,0.4)",
                opacity: acesa ? 1 : 0.45,
              }}
            />
          );
        })}
        <span
          aria-hidden="true"
          style={{
            position: "absolute", top: -6, right: -6,
            background: c.borda, color: "#fff", fontSize: 11, fontWeight: 700,
            borderRadius: 999, minWidth: 17, height: 17, lineHeight: "17px",
            textAlign: "center", padding: "0 4px", border: "2px solid #1e293b",
          }}
        >
          {estado.itens.length}
        </span>
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
