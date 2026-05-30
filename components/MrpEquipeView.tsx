"use client";

// ============================================================
// MrpEquipeView — visão gerencial da equipe MRP
//
// Componente compartilhado entre /admin/mrp (página dedicada) e a
// aba EQUIPE de /mrp. Recebe mês/ano e flag ehAdmin via props para
// não duplicar header nem seletores nos dois contextos.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type LinhaEquipe = {
  usuario_id: string;
  usuario_nome: string;
  gerencia: string | null;
  pontos_mes: number;
  meta_efetiva: number;
  projecao: number;
  status: "EXCELENTE" | "OK" | "RUIM";
  despachos: number;
  area_total: number;
  reducao_meta: number;
  meta_base_legal: string | null;
};

export default function MrpEquipeView({
  mes,
  ano,
  ehAdmin,
}: {
  mes: number;
  ano: number;
  ehAdmin: boolean;
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<LinhaEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<LinhaEquipe | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    setLoading(true);
    const r = await fetch(`/api/mrp/equipe?mes=${mes}&ano=${ano}`);
    const j = await r.json();
    if (j.ok) setLinhas(j.data);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    /* eslint-disable-next-line */
  }, [mes, ano]);

  async function salvarMeta(l: LinhaEquipe) {
    setSalvando(true);
    const r = await fetch("/api/mrp/equipe", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario_id: l.usuario_id,
        reducao_meta: l.reducao_meta,
        meta_base_legal: l.meta_base_legal,
      }),
    });
    const j = await r.json();
    setSalvando(false);
    if (j.ok) {
      setMsg("Meta atualizada.");
      setTimeout(() => setMsg(""), 2500);
      setEditando(null);
      carregar();
    } else setMsg(j.erro ?? "Erro.");
  }

  // ── Totais agregados ──────────────────────────────────────
  const totPts = useMemo(() => linhas.reduce((a, l) => a + l.pontos_mes, 0), [linhas]);
  const totDesp = useMemo(() => linhas.reduce((a, l) => a + l.despachos, 0), [linhas]);
  const totArea = useMemo(() => linhas.reduce((a, l) => a + l.area_total, 0), [linhas]);

  return (
    <div className="space-y-4">
      {/* Totais */}
      <div className="grid grid-cols-4 gap-4">
        <KpiBox titulo="Analistas" valor={String(linhas.length)} />
        <KpiBox titulo="Pontos no mês" valor={(Math.round(totPts * 10) / 10).toFixed(1)} />
        <KpiBox titulo="Despachos" valor={String(totDesp)} />
        <KpiBox titulo="Área total m²" valor={(Math.round(totArea * 100) / 100).toLocaleString("pt-BR")} />
      </div>

      {msg && <div className="bg-[var(--success-bg)] text-[var(--success)] px-4 py-2 rounded text-sm">{msg}</div>}

      {/* Tabela equipe */}
      <div className="bg-white rounded-lg shadow border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Analista</th>
              <th className="px-3 py-2 text-left">Gerência</th>
              <th className="px-3 py-2 text-right">Pts mês</th>
              <th className="px-3 py-2 text-right">Meta</th>
              <th className="px-3 py-2 text-right">Projeção</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Desp.</th>
              <th className="px-3 py-2 text-right">Área m²</th>
              <th className="px-3 py-2 text-right">Redução</th>
              <th className="px-3 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-gray-500">Carregando…</td>
              </tr>
            )}
            {!loading && linhas.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-gray-500">Sem analistas visíveis.</td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.usuario_id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{l.usuario_nome}</td>
                <td className="px-3 py-2">{l.gerencia ?? "DIRAAP"}</td>
                <td className="px-3 py-2 text-right font-semibold">{l.pontos_mes.toFixed(1)}</td>
                <td className="px-3 py-2 text-right">{l.meta_efetiva.toFixed(0)}</td>
                <td className="px-3 py-2 text-right">{l.projecao.toFixed(1)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    l.status === "EXCELENTE" ? "bg-[var(--success-bg)] text-[var(--success)]"
                    : l.status === "OK" ? "bg-[var(--info-bg)] text-[var(--accent)]"
                    : "bg-rose-100 text-rose-800"
                  }`}>{l.status}</span>
                </td>
                <td className="px-3 py-2 text-right">{l.despachos}</td>
                <td className="px-3 py-2 text-right">{l.area_total.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right">
                  {l.reducao_meta > 0 ? `${l.reducao_meta}%` : "—"}
                  {l.meta_base_legal && (
                    <div className="text-xs text-gray-500 truncate max-w-[140px]">{l.meta_base_legal}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => router.push(`/mrp?usuario_id=${l.usuario_id}`)}
                    className="text-blue-600 hover:underline mr-3">Ver painel</button>
                  {ehAdmin && (
                    <button onClick={() => setEditando(l)}
                      className="text-amber-600 hover:underline">Editar meta</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal edição meta */}
      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">Editar meta — {editando.usuario_nome}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Redução de meta (%)</label>
                <input type="number" min={0} max={100}
                  value={editando.reducao_meta}
                  onChange={(e) => setEditando({ ...editando, reducao_meta: Number(e.target.value) })}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Base legal/justificativa</label>
                <textarea rows={3}
                  value={editando.meta_base_legal ?? ""}
                  onChange={(e) => setEditando({ ...editando, meta_base_legal: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <p className="text-xs text-gray-500">
                Meta efetiva após redução:{" "}
                <strong>{(100 * (1 - editando.reducao_meta / 100)).toFixed(0)} pts</strong>
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded border text-sm">
                Cancelar
              </button>
              <button onClick={() => salvarMeta(editando)} disabled={salvando}
                className="px-4 py-2 rounded bg-[var(--accent)] text-[var(--primary-text)] text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50">
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiBox({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-white rounded-lg shadow border p-4">
      <div className="text-xs uppercase text-gray-500 tracking-wider">{titulo}</div>
      <div className="text-2xl font-bold text-gray-800 mt-1">{valor}</div>
    </div>
  );
}
