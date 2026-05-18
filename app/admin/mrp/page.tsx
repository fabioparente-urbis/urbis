"use client";

// ============================================================
// /admin/mrp — visão gerencial
//   - Analista: redireciona para /mrp
//   - Gerente: vê só analistas da sua gerência
//   - Admin/Diretora: vê todos + edita meta dos analistas
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito } from "@/lib/perfis";

type LinhaEquipe = {
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

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function AdminMrpPage() {
  const router = useRouter();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [linhas, setLinhas] = useState<LinhaEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [perfis, setPerfis] = useState<string[] | null>(null);
  const [meuId, setMeuId] = useState<string>("");
  const [editando, setEditando] = useState<LinhaEquipe | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  // ── Gate de acesso ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/auth/me");
      const j = await r.json();
      if (!j.ok) { router.push("/login"); return; }
      const ps: string[] = Array.isArray(j.data?.perfis) && j.data.perfis.length > 0
        ? j.data.perfis
        : (j.data?.perfil ? [j.data.perfil] : []);
      setPerfis(ps);
      setMeuId(j.data?.id ?? "");
      const ehGerente = ps.some((p) => p.startsWith("Gerência "));
      const ehIrrestrito = isPerfilIrrestrito(ps);
      if (!ehGerente && !ehIrrestrito) {
        router.replace("/mrp"); // analista comum → próprio painel
      }
    })();
  }, [router]);

  async function carregar() {
    setLoading(true);
    const r = await fetch(`/api/mrp/equipe?mes=${mes}&ano=${ano}`);
    const j = await r.json();
    if (j.ok) setLinhas(j.data);
    setLoading(false);
  }
  useEffect(() => { if (perfis) carregar(); /* eslint-disable-next-line */ }, [mes, ano, perfis]);

  const ehAdmin = useMemo(() => perfis ? isPerfilIrrestrito(perfis) : false, [perfis]);

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

  if (!perfis) return <div className="p-8 text-gray-500">Verificando permissões…</div>;

  // ── Totais agregados ──────────────────────────────────────
  const totPts = linhas.reduce((a, l) => a + l.pontos_mes, 0);
  const totDesp = linhas.reduce((a, l) => a + l.despachos, 0);
  const totArea = linhas.reduce((a, l) => a + l.area_total, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-950 text-white px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/")} className="text-slate-300 hover:text-white text-sm">← Início</button>
          <h1 className="text-xl font-semibold">👥 MRP — Visão da Equipe</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
            className="bg-slate-800 px-2 py-1 rounded border border-slate-700">
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}
            className="bg-slate-800 px-2 py-1 rounded border border-slate-700">
            {[ano - 1, ano, ano + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => router.push(`/mrp`)}
            className="bg-blue-600 px-3 py-1 rounded hover:bg-blue-700">📊 Meu painel</button>
        </div>
      </header>

      <main className="p-8 space-y-4">
        {/* Totais */}
        <div className="grid grid-cols-4 gap-4">
          <KpiBox titulo="Analistas" valor={String(linhas.length)} />
          <KpiBox titulo="Pontos no mês" valor={(Math.round(totPts * 10) / 10).toFixed(1)} />
          <KpiBox titulo="Despachos" valor={String(totDesp)} />
          <KpiBox titulo="Área total m²" valor={(Math.round(totArea * 100) / 100).toLocaleString("pt-BR")} />
        </div>

        {msg && <div className="bg-emerald-50 text-emerald-800 px-4 py-2 rounded text-sm">{msg}</div>}

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
              {loading && <tr><td colSpan={10} className="py-6 text-center text-gray-500">Carregando…</td></tr>}
              {!loading && linhas.length === 0 && (
                <tr><td colSpan={10} className="py-6 text-center text-gray-500">Sem analistas visíveis.</td></tr>
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
                      l.status === "EXCELENTE" ? "bg-emerald-100 text-emerald-800"
                      : l.status === "OK" ? "bg-blue-100 text-blue-800"
                      : "bg-rose-100 text-rose-800"
                    }`}>{l.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{l.despachos}</td>
                  <td className="px-3 py-2 text-right">{l.area_total.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">
                    {l.reducao_meta > 0 ? `${l.reducao_meta}%` : "—"}
                    {l.meta_base_legal && <div className="text-xs text-gray-500 truncate max-w-[140px]">{l.meta_base_legal}</div>}
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
      </main>

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
                Meta efetiva após redução: <strong>{(100 * (1 - editando.reducao_meta / 100)).toFixed(0)} pts</strong>
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded border text-sm">Cancelar</button>
              <button onClick={() => salvarMeta(editando)} disabled={salvando}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
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
