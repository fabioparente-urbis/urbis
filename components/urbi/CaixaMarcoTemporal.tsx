"use client";
import { useEffect, useState } from "react";

/**
 * "Marco Temporal atendido?" no MAC dos Slots 1-4 (Fábio, 18/11/2026). Marcar "Sim" faz o URBI
 * parar de mostrar o aviso "Marco temporal não atendido" neste processo. "Não" (ou sem resposta)
 * mantém o aviso enquanto a divergência existir. Clicar de novo na opção marcada desmarca.
 *
 * `compacto` (opt-in, hoje só o Slot 1 — 24/11/2026): com "Sim" marcado, a caixa vira uma linha
 * pequena "atendido ✔ · alterar", para o analista ver o estado sem esquecer. Sem a opção, nada muda.
 */
export default function CaixaMarcoTemporal({ codigo, compacto = false }: { codigo: string; compacto?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<"sim" | "nao" | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!codigo) return;
    fetch(`/api/processo/marco-temporal?codigo=${encodeURIComponent(codigo)}`, { credentials: "include" })
      .then((r) => r.json()).then((j) => { if (j?.ok) setValor(j.valor); }).catch(() => {});
  }, [codigo]);

  async function marcar(v: "sim" | "nao") {
    const novo = valor === v ? null : v;
    setSalvando(true);
    try {
      const r = await fetch("/api/processo/marco-temporal", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, valor: novo }),
      });
      if ((await r.json())?.ok) {
        setValor(novo);
        setEditando(false);
        window.dispatchEvent(new Event("urbi:revigiar"));
      }
    } finally { setSalvando(false); }
  }

  const botao = (v: "sim" | "nao", rotulo: string, cor: string) => (
    <button type="button" disabled={salvando} onClick={() => marcar(v)}
      className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors disabled:opacity-50 ${
        valor === v ? `${cor} text-white border-transparent` : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
      }`}>{rotulo}</button>
  );

  if (compacto && valor === "sim" && !editando) {
    return (
      <div className="w-full rounded-lg border border-[#059669] bg-[#ECFDF5] px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#047857]">⏳ Marco Temporal: atendido ✔</span>
        <button type="button" onClick={() => setEditando(true)} className="text-[#047857] underline hover:no-underline">alterar</button>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-[var(--border)] p-2.5 bg-[var(--bg-card)]">
      <p className="text-xs font-bold text-[var(--text-primary)] mb-1.5">⏳ Marco Temporal atendido?</p>
      <div className="flex gap-2">
        {botao("sim", "Sim", "bg-[#059669]")}
        {botao("nao", "Não", "bg-[#DC2626]")}
      </div>
      {valor === "sim" && <p className="text-[11px] text-[var(--text-muted)] mt-1.5">O URBI não mostra mais o aviso de marco temporal neste processo.</p>}
    </div>
  );
}
