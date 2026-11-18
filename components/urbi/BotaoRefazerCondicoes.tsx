"use client";

/**
 * Botão do Administrador "Refazer análise das condições bloqueantes" (18/11/2026, pedido do
 * Fábio). Aparece só para Administrador, dentro do LIP dos Slots 1-4. Revoga as dispensas deste
 * processo e recarrega a ficha — abrir o LIP já recalcula as condições (`?registrar=lip`), e o
 * URBI volta a chamar se elas continuarem valendo.
 */
import { useEffect, useState } from "react";

export default function BotaoRefazerCondicoes({ codigo }: { codigo: string }) {
  const [admin, setAdmin] = useState(false);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json())
      .then((j) => { if (j?.ok && Array.isArray(j.data?.perfis)) setAdmin(j.data.perfis.includes("Administrador")); })
      .catch(() => {});
  }, []);

  if (!admin || !codigo) return null;

  async function refazer() {
    if (!confirm("Refazer a análise das condições bloqueantes deste processo?\n\nAs dispensas anteriores deixam de valer (ficam registradas) e o URBI analisa tudo de novo.")) return;
    setRodando(true);
    try {
      const r = await fetch("/api/urbi/condicoes/refazer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: codigo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { alert("Não deu para refazer: " + (j.erro ?? "erro")); return; }
      window.location.reload();
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="flex justify-end px-4 md:px-6 mt-2">
      <button type="button" onClick={refazer} disabled={rodando}
        title="Só Administrador: revoga as dispensas e o URBI analisa as condições bloqueantes de novo."
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50">
        <img src="/urbi/poses/urbi-atencao.png" alt="" className="w-5 h-5 object-contain" />
        {rodando ? "Refazendo..." : "Refazer análise das condições bloqueantes"}
      </button>
    </div>
  );
}
