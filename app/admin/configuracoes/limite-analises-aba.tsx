"use client";
// Análises por slot — quantas análises o MAC de cada slot permite (1 a 10).
//
// O corte é sempre do fim: com limite N, a N-ésima é a ÚLTIMA* (liberação de taxa ou
// indeferimento) e a anterior leva o aviso de penúltimo despacho. Ver lib/macLimiteAnalises.ts.
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { SLOTS_LIMITE_ANALISES, LIMITE_ANALISES_MAXIMO } from "@/lib/macLimiteAnalisesSlots";

export function AbaLimiteAnalises() {
  const [limites, setLimites] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/mac/limite-analises", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j?.ok) setLimites(j.data); else setMsg(j?.erro || "Erro ao carregar."); })
      .catch(() => setMsg("Erro ao carregar."))
      .finally(() => setCarregando(false));
  }, []);

  async function salvar() {
    setSalvando(true); setMsg("");
    try {
      const r = await fetch("/api/mac/limite-analises", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limites }),
      });
      const j = await r.json();
      if (j?.ok) { setLimites(j.data); setMsg("✅ Salvo."); } else setMsg(j?.erro || "Erro ao salvar.");
    } catch { setMsg("Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  if (carregando) return <div className="p-6 text-[var(--text-muted)] inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando…</div>;

  const opcoes = Array.from({ length: LIMITE_ANALISES_MAXIMO }, (_, i) => i + 1);

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Quantidade de análises por slot</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          O MAC corta do fim: com limite 3, ficam as Análises 1, 2 e 3. A última sai como
          <b> ÚLTIMA* — liberação de taxa ou indeferimento</b>, e a penúltima leva o aviso
          <i> &quot;penúltimo despacho, sendo que a última análise vai acompanhada do indeferimento&quot;</i>.
          Análises que o processo já tiver acima do limite continuam visíveis; só não se cria nova.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
            <th className="py-2">Slot</th><th className="py-2">Análises</th><th className="py-2">Penúltima (aviso)</th><th className="py-2">Última (indeferimento)</th>
          </tr>
        </thead>
        <tbody>
          {SLOTS_LIMITE_ANALISES.map((s) => {
            const n = limites[s.slug] ?? LIMITE_ANALISES_MAXIMO;
            return (
              <tr key={s.slug} className="border-b border-[var(--border)]">
                <td className="py-2 text-[var(--text-primary)]">{s.nome}</td>
                <td className="py-2">
                  <select value={n} onChange={(e) => setLimites((p) => ({ ...p, [s.slug]: Number(e.target.value) }))}
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)]">
                    {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="py-2 text-[var(--text-secondary)]">{n > 1 ? `${n - 1}ª análise` : "—"}</td>
                <td className="py-2 text-[var(--text-secondary)]">{n}ª análise</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button onClick={salvar} disabled={salvando}
          className="bg-[var(--accent)] text-white px-4 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
        </button>
        {msg && <span className="text-sm text-[var(--text-secondary)]">{msg}</span>}
      </div>
    </div>
  );
}
