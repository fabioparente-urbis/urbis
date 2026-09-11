"use client";
import { useEffect, useState } from "react";

/**
 * Alerta dentro do processo — Fase 12 do plano de leitura de PDF (§3.4).
 *
 * Mostra tempo parado quando passa do limiar (30 dias) — nunca "onde" no SEI, porque isso não é
 * fato gravado para processo ativo (só o texto do processo arquivado sabe, via Fase 10). Só
 * leitura, custo zero: consome /api/lip/alerta-fluxo. Escopo Slot 1/2 — a rota devolve
 * alerta:null pra qualquer outro slot, então este componente é seguro de renderizar sempre.
 *
 * Mesmo padrão de VigiaProcesso: erro não bloqueia a análise, componente nunca escreve nada.
 */

type Alerta = { classe: "em_analise" | "aguardando_retorno"; dias: number; texto: string } | null;

export default function AlertaFluxo({ codigo, tipoProcesso }: { codigo: string; tipoProcesso: string }) {
  const [alerta, setAlerta] = useState<Alerta>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setAlerta(null);
    setCarregado(false);
    if (tipoProcesso !== "regularizacao" && tipoProcesso !== "aceite_sei") { setCarregado(true); return; }
    fetch(`/api/lip/alerta-fluxo?codigo=${encodeURIComponent(codigo)}`)
      .then((r) => r.json())
      .then((j) => { if (vivo && j.ok) setAlerta(j.alerta ?? null); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregado(true); });
    return () => { vivo = false; };
  }, [codigo, tipoProcesso]);

  if (!carregado || !alerta) return null;

  return (
    <div
      style={{
        border: "1px solid #fde68a",
        background: "#fffbeb",
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 16,
        display: "flex",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>⏱ {alerta.texto}</span>
      <span style={{ fontSize: 11, color: "#a16207" }}>
        Medido pela data de início da análise — faixa, não calendário exato.
      </span>
    </div>
  );
}
