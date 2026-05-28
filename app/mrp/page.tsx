"use client";

// ============================================================
// /mrp — Página do analista (próprio painel)
// Camada superior: USUÁRIO (todos) | EQUIPE (gerentes + irrestritos)
// Dentro de USUÁRIO: Dashboard | Dossiê do Processo | Listona
// ============================================================
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PainelResposta, StatusMRP } from "@/lib/mrp";
import { isPerfilIrrestrito } from "@/lib/perfis";
import MrpEquipeView from "@/components/MrpEquipeView";

type AbaTopo = "usuario" | "equipe";
type Aba = "dashboard" | "dossie" | "listona";

type FormManual = {
  data_despacho: string;
  assunto: string;
  tipo_despacho: string;
  processo_codigo: string;
  pontos: string;
  observacoes: string;
};

const TIPOS_DESPACHO_MANUAL = [
  ["despacho", "Despacho"],
  ["indeferimento", "Indeferimento"],
  ["arquivamento", "Arquivamento"],
  ["interno", "Interno"],
  ["laudo", "Laudo"],
] as const;

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function MrpPage() {
  // useSearchParams precisa de Suspense boundary no App Router.
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Carregando…</div>}>
      <MrpInner />
    </Suspense>
  );
}

function MrpInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const usuarioIdParam = sp.get("usuario_id") ?? null;
  const somenteLeitura = !!usuarioIdParam;

  const [abaTopo, setAbaTopo] = useState<AbaTopo>("usuario");
  const [aba, setAba] = useState<Aba>("dashboard");
  const [modalAberto, setModalAberto] = useState(false);
  const [assuntos, setAssuntos] = useState<{ id: string; nome: string }[]>([]);
  const [formManual, setFormManual] = useState<FormManual>({
    data_despacho: new Date().toISOString().slice(0, 10),
    assunto: "",
    tipo_despacho: "despacho",
    processo_codigo: "",
    pontos: "2.5",
    observacoes: "",
  });
  const [salvandoManual, setSalvandoManual] = useState(false);
  const [msgManual, setMsgManual] = useState("");
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  // Perfis para gating da aba EQUIPE — mesma regra do botão "MRP — Equipe"
  // da Home antiga: gerentes + irrestritos (Administrador/Diretora).
  const [perfis, setPerfis] = useState<string[]>([]);
  const [perfisProntos, setPerfisProntos] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me");
        const j = await r.json();
        if (j.ok) {
          const arr: string[] = Array.isArray(j.data?.perfis) && j.data.perfis.length > 0
            ? j.data.perfis
            : (j.data?.perfil ? [j.data.perfil] : []);
          setPerfis(arr);
        }
      } catch { /* mantém [] */ }
      finally { setPerfisProntos(true); }
    })();
  }, []);

  const ehIrrestrito = isPerfilIrrestrito(perfis);
  const ehGerente = perfis.some((p) => p.startsWith("Gerência "));
  const podeVerEquipe = ehIrrestrito || ehGerente;

  async function abrirModalManual() {
    if (assuntos.length === 0) {
      try {
        const r = await fetch("/api/admin/assuntos");
        const j = await r.json();
        if (j.ok) {
          const ativos = (j.data as any[]).filter((a) => a.ativo);
          setAssuntos(ativos);
          if (ativos.length > 0 && !formManual.assunto) {
            setFormManual((f) => ({ ...f, assunto: ativos[0].nome }));
          }
        }
      } catch { /* usa lista vazia */ }
    }
    setMsgManual("");
    setModalAberto(true);
  }

  async function salvarManual(e: React.FormEvent) {
    e.preventDefault();
    if (!formManual.processo_codigo.trim()) {
      setMsgManual("Número do processo é obrigatório.");
      return;
    }
    setSalvandoManual(true);
    setMsgManual("");
    try {
      const r = await fetch("/api/mrp/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processo_codigo: formManual.processo_codigo.trim(),
          tipo_despacho: formManual.tipo_despacho,
          assunto: formManual.assunto || null,
          data_despacho: new Date(formManual.data_despacho + "T12:00:00").toISOString(),
          pontos: Number(formManual.pontos) || 2.5,
          observacoes: formManual.observacoes || null,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsgManual("✅ Registro salvo com sucesso.");
        setFormManual({
          data_despacho: new Date().toISOString().slice(0, 10),
          assunto: assuntos.length > 0 ? assuntos[0].nome : "",
          tipo_despacho: "despacho",
          processo_codigo: "",
          pontos: "2.5",
          observacoes: "",
        });
        setTimeout(() => setModalAberto(false), 1200);
      } else {
        setMsgManual(`❌ ${j.erro ?? "Erro ao salvar."}`);
      }
    } catch (err: any) {
      setMsgManual(`❌ ${err?.message ?? "Erro de rede."}`);
    } finally {
      setSalvandoManual(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-950 text-white px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/")}
            className="text-slate-300 hover:text-white text-sm">← Início</button>
          <h1 className="text-xl font-semibold">📊 MRP — Mapa de Resultados e Produtividade</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
            className="bg-slate-800 px-2 py-1 rounded border border-slate-700">
            {MESES_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}
            className="bg-slate-800 px-2 py-1 rounded border border-slate-700">
            {[ano - 1, ano, ano + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      {/* Camada 1 — abas USUÁRIO / EQUIPE (só aparece quando há acesso à equipe) */}
      {perfisProntos && podeVerEquipe && (
        <nav className="bg-slate-100 border-b px-8 flex gap-2">
          {([
            ["usuario", "👤 Usuário"],
            ["equipe", "👥 Equipe"],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAbaTopo(k)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${
                abaTopo === k ? "border-slate-900 text-slate-900" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}>{l}</button>
          ))}
        </nav>
      )}

      {/* Camada 2 — abas internas do painel do usuário (só na aba USUÁRIO) */}
      {abaTopo === "usuario" && (
        <nav className="bg-white border-b px-8 flex items-center justify-between">
          <div className="flex gap-2">
            {([["dashboard", "Dashboard"], ["dossie", "Dossiê do Processo"], ["listona", "Listona"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAba(k)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition ${
                  aba === k ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
                }`}>{l}</button>
            ))}
          </div>
          {!somenteLeitura && (
            <button
              onClick={abrirModalManual}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded transition my-2">
              ✏️ Registrar produção manual
            </button>
          )}
        </nav>
      )}

      <main className="p-8">
        {abaTopo === "usuario" && (
          <>
            {aba === "dashboard" && (
              <Dashboard mes={mes} ano={ano} usuarioId={usuarioIdParam} somenteLeitura={somenteLeitura} />
            )}
            {aba === "dossie" && <Dossie />}
            {aba === "listona" && (
              <Listona mes={mes} ano={ano} usuarioId={usuarioIdParam} />
            )}
          </>
        )}

        {abaTopo === "equipe" && podeVerEquipe && (
          <MrpEquipeView mes={mes} ano={ano} ehAdmin={ehIrrestrito} />
        )}
      </main>

      {/* ── Modal de alimentação manual ── */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-800">✏️ Registrar produção manual</h2>
              <button onClick={() => setModalAberto(false)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={salvarManual} className="px-6 py-5 space-y-4">
              {/* Data */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formManual.data_despacho}
                  onChange={(e) => setFormManual((f) => ({ ...f, data_despacho: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>

              {/* Número do processo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do processo</label>
                <input
                  type="text"
                  value={formManual.processo_codigo}
                  onChange={(e) => setFormManual((f) => ({ ...f, processo_codigo: e.target.value }))}
                  placeholder="Ex.: 25.5.000082553-3"
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>

              {/* Assunto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
                {assuntos.length > 0 ? (
                  <select
                    value={formManual.assunto}
                    onChange={(e) => setFormManual((f) => ({ ...f, assunto: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">— selecionar —</option>
                    {assuntos.map((a) => (
                      <option key={a.id} value={a.nome}>{a.nome}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formManual.assunto}
                    onChange={(e) => setFormManual((f) => ({ ...f, assunto: e.target.value }))}
                    placeholder="Assunto do processo"
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                )}
              </div>

              {/* Tipo de despacho + Pontos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={formManual.tipo_despacho}
                    onChange={(e) => setFormManual((f) => ({ ...f, tipo_despacho: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {TIPOS_DESPACHO_MANUAL.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pontos</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formManual.pontos}
                    onChange={(e) => setFormManual((f) => ({ ...f, pontos: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Observação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observação <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea
                  value={formManual.observacoes}
                  onChange={(e) => setFormManual((f) => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                  placeholder="Informe o motivo do registro manual, ex.: URBIS indisponível"
                  className="w-full border rounded px-3 py-2 text-sm resize-none"
                />
              </div>

              {msgManual && (
                <p className={`text-sm ${msgManual.startsWith("✅") ? "text-emerald-700" : "text-rose-600"}`}>
                  {msgManual}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalAberto(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border rounded">
                  Cancelar
                </button>
                <button type="submit" disabled={salvandoManual}
                  className="px-5 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50">
                  {salvandoManual ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ABA 1 — DASHBOARD
// ════════════════════════════════════════════════════════════
function Dashboard({ mes, ano, usuarioId, somenteLeitura }: {
  mes: number; ano: number; usuarioId: string | null; somenteLeitura: boolean;
}) {
  const [data, setData] = useState<PainelResposta | null>(null);
  const [analista, setAnalista] = useState<{ nome: string; reducao_meta: number; meta_base_legal: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cal, setCal] = useState({ dias_uteis: 22, ferias: 0, atestado: 0, feriados: 0, facultativo: 0 });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    setLoading(true);
    const qs = new URLSearchParams({ mes: String(mes), ano: String(ano) });
    if (usuarioId) qs.set("usuario_id", usuarioId);
    const r = await fetch(`/api/mrp/painel?${qs}`);
    const j = await r.json();
    if (j.ok) {
      setData(j.data);
      setAnalista(j.analista);
      setCal(j.data.calendario);
    }
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [mes, ano, usuarioId]);

  async function salvarCal() {
    setSalvando(true);
    const r = await fetch("/api/mrp/calendario", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cal, mes, ano, usuario_id: usuarioId ?? undefined }),
    });
    const j = await r.json();
    setSalvando(false);
    if (j.ok) {
      setMsg("Calendário salvo.");
      setTimeout(() => setMsg(""), 2500);
      carregar();
    } else {
      setMsg(j.erro ?? "Erro ao salvar.");
    }
  }

  if (loading) return <div className="text-gray-500">Carregando painel…</div>;
  if (!data) return <div className="text-red-600">Sem dados.</div>;

  const cores: Record<StatusMRP, string> = {
    EXCELENTE: "bg-emerald-100 text-emerald-800 border-emerald-300",
    OK: "bg-blue-100 text-blue-800 border-blue-300",
    RUIM: "bg-rose-100 text-rose-800 border-rose-300",
  };
  const barColor: Record<StatusMRP, string> = {
    EXCELENTE: "bg-emerald-500", OK: "bg-blue-500", RUIM: "bg-rose-500",
  };
  const pct = Math.min(100, (data.pontos_acumulados / Math.max(1, data.meta_efetiva)) * 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* COLUNA ESQUERDA — meta, progresso, calendário */}
      <div className="lg:col-span-1 space-y-6">
        {/* Card meta */}
        <div className="bg-white rounded-lg shadow border p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500 tracking-wider">Meta efetiva</div>
              <div className="text-3xl font-bold text-gray-800">{data.meta_efetiva.toFixed(0)} pts</div>
              {analista && analista.reducao_meta > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  Redução: {analista.reducao_meta}% {analista.meta_base_legal && `(${analista.meta_base_legal})`}
                </div>
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cores[data.status]}`}>
              {data.status}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{data.pontos_acumulados.toFixed(1)} pts</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
              <div className={`${barColor[data.status]} h-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-700">
            <p>
              <strong>Projeção:</strong> {data.projecao.toFixed(1)} pts até o fim do mês
            </p>
            {data.status === "RUIM" && data.dias_efetivos_restantes > 0 && (
              <p className="mt-2 text-rose-700">
                Você precisa de <strong>{data.pontos_necessarios_por_dia.toFixed(1)} pts/dia</strong> nos {data.dias_efetivos_restantes} dias efetivos restantes.
              </p>
            )}
          </div>
        </div>

        {/* Cards rápidos */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Despachos" valor={String(data.total_despachos)} />
          <Kpi label="Área m²" valor={data.area_total.toLocaleString("pt-BR")} />
          <Kpi label="Tempo méd." valor={`${data.stats.tempo_medio_analise_dias}d`} />
        </div>

        {/* Calendário editável */}
        <div className="bg-white rounded-lg shadow border p-6">
          <h3 className="font-semibold text-gray-800 mb-1">Calendário operacional</h3>
          <p className="text-xs text-gray-500 mb-4">
            Dias efetivos = úteis − férias − atestado − feriados − facultativo
            <br />
            <strong className="text-gray-700">
              {data.dias_efetivos_passados + data.dias_efetivos_restantes} dias efetivos
            </strong>
            {" "}({data.dias_efetivos_passados} passados / {data.dias_efetivos_restantes} restantes)
          </p>
          {([
            ["dias_uteis", "Dias úteis"],
            ["ferias", "Férias"],
            ["atestado", "Atestado"],
            ["feriados", "Feriados"],
            ["facultativo", "Facultativo"],
          ] as const).map(([k, l]) => (
            <div key={k} className="flex items-center justify-between py-2 border-b last:border-b-0">
              <label className="text-sm text-gray-700">{l}</label>
              <input
                type="number" min={0}
                value={cal[k]}
                disabled={somenteLeitura}
                onChange={(e) => setCal((c) => ({ ...c, [k]: Number(e.target.value) }))}
                className="w-20 border rounded px-2 py-1 text-right text-sm"
              />
            </div>
          ))}
          {!somenteLeitura && (
            <button onClick={salvarCal} disabled={salvando}
              className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50">
              {salvando ? "Salvando…" : "Salvar calendário"}
            </button>
          )}
          {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
        </div>
      </div>

      {/* COLUNA CENTRO + DIREITA — gráficos */}
      <div className="lg:col-span-2 space-y-6">
        {/* Histórico 12 meses */}
        <Card titulo="Histórico — últimos 12 meses">
          <BarChart12m dados={data.historico_mensal} metaEfetiva={data.meta_efetiva} />
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card titulo="Por tipo de despacho">
            <Pie dados={data.stats.por_tipo_despacho.map((x) => ({ label: x.tipo, value: x.count }))} />
          </Card>
          <Card titulo="Por tipo de processo">
            <Pie dados={data.stats.por_tipo_processo.map((x) => ({ label: x.tipo, value: x.count }))} />
          </Card>
          <Card titulo="m² por porte (MP vs GP)">
            <BarH dados={data.stats.por_porte.map((x) => ({ label: x.porte, value: x.area_total }))} sufixo=" m²" />
          </Card>
          <Card titulo="Produção por dia da semana">
            <BarH dados={data.stats.por_dia_semana.map((x) => ({ label: x.dia, value: x.count }))} />
          </Card>
          <Card titulo="Por faixa de área">
            <BarH dados={data.stats.por_faixa_area.map((x) => ({ label: x.faixa, value: x.count }))} />
          </Card>
          <Card titulo="Top bairros">
            <table className="w-full text-sm text-gray-800">
              <thead><tr className="text-gray-500 text-xs uppercase">
                <th className="text-left py-1">Bairro</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">m²</th>
              </tr></thead>
              <tbody>
                {data.stats.por_bairro.slice(0, 8).map((b) => (
                  <tr key={b.bairro} className="border-t">
                    <td className="py-1">{b.bairro}</td>
                    <td className="text-right">{b.count}</td>
                    <td className="text-right">{b.area_total.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* KPIs comportamentais */}
        <div className="grid grid-cols-3 gap-4">
          <Kpi label="Taxa de revisão" valor={`${data.stats.taxa_revisao}%`} />
          <Kpi label="Taxa de indeferimento" valor={`${data.stats.taxa_indeferimento}%`} />
          <Kpi label="Tempo médio de análise" valor={`${data.stats.tempo_medio_analise_dias} dias`} />
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ABA 2 — DOSSIÊ
// ════════════════════════════════════════════════════════════
function Dossie() {
  const [codigo, setCodigo] = useState("");
  const [data, setData] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [carr, setCarr] = useState(false);

  async function buscar() {
    if (!codigo.trim()) return;
    setCarr(true); setErro(""); setData(null);
    const r = await fetch(`/api/mrp/dossie?codigo=${encodeURIComponent(codigo.trim())}`);
    const j = await r.json();
    setCarr(false);
    if (!j.ok) setErro(j.erro ?? "Erro");
    else setData(j.data);
  }

  return (
    <div className="max-w-5xl">
      <div className="bg-white rounded-lg shadow border p-6 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3">Buscar processo</h2>
        <div className="flex gap-2">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)}
            placeholder="Digite o código do processo (ex.: 25.5.000082553-3)"
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            className="flex-1 border rounded px-3 py-2 text-sm" />
          <button onClick={buscar}
            className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition">
            Buscar
          </button>
        </div>
        {erro && <p className="text-rose-600 text-sm mt-2">{erro}</p>}
      </div>

      {carr && <p className="text-gray-500">Carregando dossiê…</p>}

      {data && (
        <div className="space-y-6">
          {/* Dados do processo */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Dados do processo</h3>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 text-sm">
              <Dl k="Código" v={data.processo.codigo} />
              <Dl k="Tipo" v={data.processo.tipo_processo} />
              <Dl k="Analista" v={data.processo.analista_nome} />
              <Dl k="Interessado" v={data.processo.interessado || "—"} />
              <Dl k="Assunto" v={data.processo.assunto || "—"} />
              <Dl k="Área construída" v={`${(data.processo.area || 0).toLocaleString("pt-BR")} m²`} />
              <Dl k="Porte" v={data.processo.porte} />
              <Dl k="Bairro" v={data.processo.bairro || "—"} />
              <Dl k="Setor" v={data.processo.setor || "—"} />
            </dl>
            {data.processo.tags?.length > 0 && (
              <div className="mt-4 flex gap-2 flex-wrap">
                {data.processo.tags.map((t: string) => (
                  <span key={t} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Complexidade + Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow border p-6">
              <h3 className="font-semibold text-gray-800 mb-3">Score de complexidade</h3>
              <div className="text-4xl font-bold text-gray-800">{data.complexidade.score}</div>
              <div className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                data.complexidade.classificacao === "Simples" ? "bg-emerald-100 text-emerald-800"
                : data.complexidade.classificacao === "Moderado" ? "bg-blue-100 text-blue-800"
                : data.complexidade.classificacao === "Complexo" ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
              }`}>{data.complexidade.classificacao}</div>
            </div>
            <div className="bg-white rounded-lg shadow border p-6">
              <h3 className="font-semibold text-gray-800 mb-3">Checklist (última análise)</h3>
              {data.checklist.total > 0 ? (
                <div className="text-sm space-y-1">
                  <p>✅ Conformes: <strong>{data.checklist.conformes}</strong> ({Math.round(data.checklist.conformes / data.checklist.total * 100)}%)</p>
                  <p>❌ Não conformes: <strong>{data.checklist.nao_conformes}</strong> ({Math.round(data.checklist.nao_conformes / data.checklist.total * 100)}%)</p>
                  <p>➖ Não se aplica: <strong>{data.checklist.nao_aplica}</strong> ({Math.round(data.checklist.nao_aplica / data.checklist.total * 100)}%)</p>
                  {data.checklist.nao_respondido > 0 && (
                    <p>⚪ Não respondido: <strong>{data.checklist.nao_respondido}</strong></p>
                  )}
                </div>
              ) : <p className="text-gray-500 text-sm">Sem checklist preenchido.</p>}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Timeline</h3>
            <ol className="relative border-l-2 border-gray-200 ml-3">
              {data.timeline.map((ev: any, i: number) => (
                <li key={i} className="ml-6 mb-5">
                  <span className={`absolute -left-2 w-3 h-3 rounded-full ${
                    ev.tipo === "despacho" ? "bg-blue-500" : "bg-gray-400"
                  }`} />
                  <div className="flex items-baseline gap-2">
                    <strong className="text-gray-800">{ev.titulo}</strong>
                    <span className="text-xs text-gray-500">{new Date(ev.data).toLocaleString("pt-BR")}</span>
                    {ev.duracao_dias ? <span className="text-xs text-amber-600">+{ev.duracao_dias}d</span> : null}
                  </div>
                  <div className="text-sm text-gray-600">{ev.detalhe}</div>
                  <div className="text-xs text-gray-500">por {ev.analista_nome}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ABA 3 — LISTONA
// ════════════════════════════════════════════════════════════
function Listona({ mes, ano, usuarioId }: { mes: number; ano: number; usuarioId: string | null }) {
  const [regs, setRegs] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({
    tipo_processo: "", tipo_despacho: "", porte: "", revisao: "", q: "",
  });
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const qs = new URLSearchParams({ mes: String(mes), ano: String(ano) });
    if (usuarioId) qs.set("usuario_id", usuarioId);
    if (filtros.tipo_processo) qs.set("tipo_processo", filtros.tipo_processo);
    if (filtros.tipo_despacho) qs.set("tipo_despacho", filtros.tipo_despacho);
    if (filtros.porte) qs.set("porte", filtros.porte);
    if (filtros.revisao) qs.set("revisao", filtros.revisao);
    if (filtros.q) qs.set("q", filtros.q);
    const r = await fetch(`/api/mrp/registros?${qs}`);
    const j = await r.json();
    setRegs(j.ok ? j.data : []);
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [mes, ano, usuarioId,
    filtros.tipo_processo, filtros.tipo_despacho, filtros.porte, filtros.revisao]);

  function exportar(formato: "xlsx" | "docx") {
    const qs = new URLSearchParams({ formato, mes: String(mes), ano: String(ano) });
    if (usuarioId) qs.set("usuario_id", usuarioId);
    if (filtros.tipo_processo) qs.set("tipo_processo", filtros.tipo_processo);
    if (filtros.tipo_despacho) qs.set("tipo_despacho", filtros.tipo_despacho);
    window.open(`/api/mrp/exportar?${qs}`, "_blank");
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow border p-4 mb-4 flex flex-wrap items-end gap-3">
        <FiltroSel label="Tipo processo" value={filtros.tipo_processo}
          onChange={(v) => setFiltros((f) => ({ ...f, tipo_processo: v }))}
          options={[["", "Todos"], ["ACEITE", "ACEITE"], ["REGULARIZACAO", "REGULARIZAÇÃO"], ["APROVACAO", "APROVAÇÃO"]]} />
        <FiltroSel label="Tipo despacho" value={filtros.tipo_despacho}
          onChange={(v) => setFiltros((f) => ({ ...f, tipo_despacho: v }))}
          options={[["", "Todos"], ["despacho", "Despacho"], ["aceite", "Aceite"], ["indeferimento", "Indeferimento"], ["arquivamento", "Arquivamento"]]} />
        <FiltroSel label="Porte" value={filtros.porte}
          onChange={(v) => setFiltros((f) => ({ ...f, porte: v }))}
          options={[["", "Todos"], ["PP", "PP"], ["MP", "MP"], ["GP", "GP"]]} />
        <FiltroSel label="Revisão" value={filtros.revisao}
          onChange={(v) => setFiltros((f) => ({ ...f, revisao: v }))}
          options={[["", "Todas"], ["true", "Sim"], ["false", "Não"]]} />
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 block mb-1">Busca</label>
          <input value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && carregar()}
            placeholder="Assunto, interessado, observações…"
            className="w-full border rounded px-3 py-1.5 text-sm" />
        </div>
        <button onClick={carregar}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Filtrar</button>
        <button onClick={() => exportar("xlsx")}
          className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700">📊 Excel</button>
        <button onClick={() => exportar("docx")}
          className="bg-slate-700 text-white px-4 py-1.5 rounded text-sm hover:bg-slate-800">📝 Word (DIRAAP)</button>
      </div>

      <div className="bg-white rounded-lg shadow border overflow-x-auto">
        <table className="w-full text-sm text-gray-800">
          <thead className="bg-slate-100 text-gray-700 text-xs uppercase">
            <tr>
              <Th>Data</Th><Th>Processo</Th><Th>Interessado</Th><Th>Assunto</Th>
              <Th>Porte</Th><Th className="text-right">Área m²</Th>
              <Th>Despacho</Th><Th className="text-right">Pts</Th>
              <Th className="text-right">Tempo</Th><Th>Obs.</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="py-6 text-center text-gray-500">Carregando…</td></tr>}
            {!loading && regs.length === 0 && (
              <tr><td colSpan={10} className="py-6 text-center text-gray-500">Sem registros.</td></tr>
            )}
            {regs.map((r) => {
              const dur = r.data_inicio
                ? Math.round((new Date(r.data_despacho).getTime() - new Date(r.data_inicio).getTime()) / 86400000 * 10) / 10
                : null;
              return (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <Td>{new Date(r.data_despacho).toLocaleDateString("pt-BR")}</Td>
                  <Td className="font-mono text-xs">{r.processo_codigo}</Td>
                  <Td>{r.interessado || "—"}</Td>
                  <Td>{r.assunto || "—"}</Td>
                  <Td>{r.porte}</Td>
                  <Td className="text-right">{Number(r.area_construida).toLocaleString("pt-BR")}</Td>
                  <Td>{r.tipo_despacho}{r.numero_despacho ? ` ${r.numero_despacho}` : ""}{r.revisao ? " (rev)" : ""}</Td>
                  <Td className="text-right font-semibold">{Number(r.pontos).toFixed(1)}</Td>
                  <Td className="text-right">{dur !== null ? `${dur}d` : "—"}</Td>
                  <Td className="text-xs text-gray-500">{r.observacoes || ""}</Td>
                </tr>
              );
            })}
          </tbody>
          {regs.length > 0 && (
            <tfoot className="bg-slate-50 border-t font-semibold">
              <tr>
                <Td colSpan={5} className="text-right">Total ({regs.length} despachos):</Td>
                <Td className="text-right">{regs.reduce((a, r) => a + Number(r.area_construida ?? 0), 0).toLocaleString("pt-BR")} m²</Td>
                <Td></Td>
                <Td className="text-right">{(Math.round(regs.reduce((a, r) => a + Number(r.pontos ?? 0), 0) * 10) / 10).toFixed(1)} pts</Td>
                <Td colSpan={2}></Td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ════════════════════════════════════════════════════════════
function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow border p-5">
      <h3 className="font-semibold text-gray-800 mb-3 text-sm">{titulo}</h3>
      {children}
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-white rounded-lg shadow border p-4 text-center">
      <div className="text-xs uppercase text-gray-500 tracking-wider">{label}</div>
      <div className="text-xl font-bold text-gray-800 mt-1">{valor}</div>
    </div>
  );
}

function Dl({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-gray-500">{k}</dt>
      <dd className="text-gray-800 font-medium">{v}</dd>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left ${className}`}>{children}</th>;
}
function Td({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td className={`px-3 py-2 ${className}`} colSpan={colSpan}>{children}</td>;
}

function FiltroSel({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border rounded px-3 py-1.5 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

// ─── Gráficos em SVG puro ──────────────────────────────────
function BarChart12m({ dados, metaEfetiva }: {
  dados: { mes: number; ano: number; pontos: number; despachos: number; resultado: string }[];
  metaEfetiva: number;
}) {
  const max = Math.max(metaEfetiva, ...dados.map((d) => d.pontos), 1) * 1.1;
  const w = 600, h = 200, padL = 36, padB = 28;
  const innerW = w - padL - 10, innerH = h - padB - 10;
  const bw = innerW / dados.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {/* meta */}
      <line x1={padL} y1={10 + innerH - (metaEfetiva / max) * innerH}
        x2={w - 10} y2={10 + innerH - (metaEfetiva / max) * innerH}
        stroke="#dc2626" strokeDasharray="4 3" />
      <text x={w - 10} y={10 + innerH - (metaEfetiva / max) * innerH - 4}
        textAnchor="end" fontSize="10" fill="#dc2626">meta {metaEfetiva.toFixed(0)}</text>

      {dados.map((d, i) => {
        const bh = (d.pontos / max) * innerH;
        const cor = d.resultado === "EXCELENTE" ? "#10b981" : d.resultado === "OK" ? "#3b82f6" : "#f43f5e";
        return (
          <g key={`${d.ano}-${d.mes}`}>
            <rect x={padL + i * bw + 4} y={10 + innerH - bh}
              width={bw - 8} height={bh} fill={cor} rx={2} />
            <text x={padL + i * bw + bw / 2} y={h - 14} textAnchor="middle" fontSize="10" fill="#475569">
              {String(d.mes).padStart(2, "0")}/{String(d.ano).slice(2)}
            </text>
            <text x={padL + i * bw + bw / 2} y={10 + innerH - bh - 3}
              textAnchor="middle" fontSize="9" fill="#475569">
              {d.pontos.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Pie({ dados }: { dados: { label: string; value: number }[] }) {
  const total = dados.reduce((a, d) => a + d.value, 0);
  if (total === 0) return <p className="text-gray-500 text-sm">Sem dados.</p>;
  const cores = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
  const cx = 70, cy = 70, r = 60;
  // Ângulos cumulativos calculados sem reatribuição (regra do React 19 / hooks).
  const fracs = dados.map((d) => d.value / total);
  const inicios: number[] = [];
  fracs.reduce((acc, f) => { inicios.push(acc); return acc + f * Math.PI * 2; }, -Math.PI / 2);
  const slices = dados.map((d, i) => {
    const ang = inicios[i];
    const frac = fracs[i];
    const a2 = ang + frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...d, path, cor: cores[i % cores.length], frac };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="w-32 h-32 flex-shrink-0">
        {slices.map((s) => <path key={s.label} d={s.path} fill={s.cor} stroke="#fff" strokeWidth={1} />)}
      </svg>
      <ul className="text-sm space-y-1">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: s.cor }} />
            <span className="text-gray-700">{s.label}</span>
            <span className="text-gray-500">{s.value} ({Math.round(s.frac * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarH({ dados, sufixo = "" }: { dados: { label: string; value: number }[]; sufixo?: string }) {
  const max = Math.max(...dados.map((d) => d.value), 1);
  if (dados.every((d) => d.value === 0)) return <p className="text-gray-500 text-sm">Sem dados.</p>;
  return (
    <ul className="space-y-2">
      {dados.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between text-xs text-gray-600 mb-0.5">
            <span>{d.label}</span>
            <span>{d.value.toLocaleString("pt-BR")}{sufixo}</span>
          </div>
          <div className="w-full bg-gray-100 rounded h-2 overflow-hidden">
            <div className="bg-blue-500 h-full" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
