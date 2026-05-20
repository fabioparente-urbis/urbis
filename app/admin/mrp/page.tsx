"use client";

// ============================================================
// /admin/mrp — visão gerencial
//   - Analista: redireciona para /mrp
//   - Gerente: vê só analistas da sua gerência
//   - Admin/Diretora: vê todos + edita meta dos analistas
//
// O conteúdo (KPIs + tabela + modal) vive em components/MrpEquipeView.tsx
// para ser reaproveitado na aba EQUIPE de /mrp.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito } from "@/lib/perfis";
import MrpEquipeView from "@/components/MrpEquipeView";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function AdminMrpPage() {
  const router = useRouter();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [perfis, setPerfis] = useState<string[] | null>(null);

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
      const ehGerente = ps.some((p) => p.startsWith("Gerência "));
      const ehIrrestrito = isPerfilIrrestrito(ps);
      if (!ehGerente && !ehIrrestrito) {
        router.replace("/mrp"); // analista comum → próprio painel
      }
    })();
  }, [router]);

  const ehAdmin = useMemo(() => (perfis ? isPerfilIrrestrito(perfis) : false), [perfis]);

  if (!perfis) return <div className="p-8 text-gray-500">Verificando permissões…</div>;

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

      <main className="p-8">
        <MrpEquipeView mes={mes} ano={ano} ehAdmin={ehAdmin} />
      </main>
    </div>
  );
}
