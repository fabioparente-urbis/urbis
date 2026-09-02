"use client";
import React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, RefreshCw, Search, Users, Scale, Bot, BookOpen, ArrowRight } from "lucide-react";

type Historico = { id: string; usuario_nome: string; linha: string; mensagem_usuario: string; resposta_urbi: string; criado_em: string };
type UsuarioResumo = { id: string; urbi_ativo?: boolean };
type Stats = {
  resumo: { total_processos: number; total_analistas: number; area_total_construida: number; area_media: number; total_retornos: number; total_bairros: number };
  por_assunto: { assunto: string; total_processos: number; area_total: number; area_media: number; total_retornos: number; porte: string; count_porte: number }[];
  por_analista: { analista: string; gerencia: string; total_processos: number; area_total: number; tempo_medio_horas: number }[];
  por_bairro: { bairro: string; total_processos: number; area_total: number; assunto: string }[];
  produtividade: { analista: string; gerencia: string; mes: number; ano: number; tipo_processo: string; total_despachos: number; total_pontos: number }[];
  analistas: { analista: string; gerencia: string; total_processos: number; area_total: number; tempo_medio_horas: number; total_retornos: number; pontos_totais_mrp: number; despachos_mrp: number; assunto: string }[];
  retrabalho: { processo_codigo: string; virou_nao_conforme: number; foi_resolvido: number; trocas_totais: number }[];
  exigencias_contexto: { tipo_processo: string; faixa_area: string; bairro: string | null; exigencia: string; vezes: number; processos: number }[];
  desempenho_referencia: { referencia: string; reprovou: number; passou: number; processos: number; pct_reprova: number }[];
  campos_criticos: { codigo: string; tipo_processo: string; campos_vazios: number; campos_em_x: number; campos_totais: number; area_maior_que_terreno: boolean | null }[];
  numeracao: { tipo: string; ano: number; numero_inicial: number; numero_final: number; proximo: number; restantes: number; situacao: string }[];
  nao_conformidades: { grupo: string; texto: string; ref: string; assunto: string; frequencia: number }[];
};

const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── Casca visual ────────────────────────────────────────────────────────────
// Só apresentação: mesmos tokens de tema do resto do admin
// (ver app/admin/configuracoes/page.tsx). Nenhuma regra de dado mora aqui.

const TH = "px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] whitespace-nowrap";
const TD = "px-3 py-2 text-[var(--text-secondary)] align-top";
const TR = "border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)]";

const BTN_PRIMARIO = "inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)]";
const BTN_SECUNDARIO = "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]";

// Tons semânticos do tema claro, os mesmos usados em /admin/rastreabilidade:
// erro = vermelho, ok = verde, alerta/aviso = laranja/âmbar, neutro = cinza.
const TONS: Record<string, string> = {
  accent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  aviso: "bg-amber-50 text-amber-700 border-amber-200",
  alerta: "bg-orange-50 text-orange-700 border-orange-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  erro: "bg-red-50 text-red-700 border-red-200",
  neutro: "bg-slate-100 text-slate-600 border-slate-200",
};

function Badge({ tom = "neutro", children }: { tom?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONS[tom] ?? TONS.neutro}`}>
      {children}
    </span>
  );
}

function Metrica({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{valor}</div>
    </div>
  );
}

function Secao({ titulo, descricao, acao, children }: { titulo: string; descricao?: React.ReactNode; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</h2>
          {descricao && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">{descricao}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {children}
    </section>
  );
}

function Vazio({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">{children}</td>
    </tr>
  );
}

export default function BDIPage() {
  const router = useRouter();
  const [aba, setAba] = useState<"painel"|"estatisticas"|"capacidades"|"legislacao"|"historico">("painel");
  const [usuarios, setUsuarios] = useState<UsuarioResumo[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [loadingSessoes, setLoadingSessoes] = useState(false);
  const [filtroAssunto, setFiltroAssunto] = useState("Todos");
  const [subAba, setSubAba] = useState<"resumo"|"analistas"|"retrabalho"|"exigencias"|"qualidade"|"conformidade"|"bairros"|"sessoes">("resumo");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (!json.ok || json.data?.perfil !== "Administrador") { router.push("/"); return; }
      carregarTudo();
    })();
  }, []);

  useEffect(() => {
    if (aba === "estatisticas" && !stats) carregarStats();
  }, [aba]);

  async function carregarSessoes() {
    if (loadingSessoes) return;
    setLoadingSessoes(true);
    const res = await fetch("/api/sessao/stats");
    const json = await res.json();
    if (json.ok) setSessoes(json.data ?? []);
    setLoadingSessoes(false);
  }
  async function carregarTudo() {
    const [r1, r2] = await Promise.all([
      fetch("/api/admin/usuarios").then(r => r.json()),
      fetch("/api/urbi/historico?limit=100").then(r => r.json()),
    ]);
    if (r1.ok) setUsuarios(r1.data);
    if (r2.ok) setHistorico(r2.data);
  }

  async function carregarStats() {
    setLoadingStats(true);
    try {
      const r = await fetch("/api/bdi/stats");
      const j = await r.json();
      if (j.ok) setStats(j);
    } finally {
      setLoadingStats(false);
    }
  }

  const totalConversas = historico.length;
  const usuariosComUrbiAtivo = usuarios.filter(u => u.urbi_ativo).length;
  // Stats filtradas por assunto
  const assuntosDisponiveis = ["Todos", ...Array.from(new Set((stats?.por_assunto ?? []).map(x => x.assunto)))];
  const porBairroFiltrado = filtroAssunto === "Todos"
    ? stats?.por_bairro ?? []
    : (stats?.por_bairro ?? []).filter(b => b.assunto === filtroAssunto);
  const porAssuntoAgrupado = (stats?.por_assunto ?? []).reduce((acc, row) => {
    if (!acc[row.assunto]) acc[row.assunto] = { assunto: row.assunto, total_processos: 0, area_total: 0, total_retornos: 0 };
    acc[row.assunto].total_processos += Number(row.total_processos);
    acc[row.assunto].area_total += Number(row.area_total);
    acc[row.assunto].total_retornos += Number(row.total_retornos);
    return acc;
  }, {} as Record<string, { assunto: string; total_processos: number; area_total: number; total_retornos: number }>);

  const selectAssunto = (
    <select
      value={filtroAssunto}
      onChange={e => setFiltroAssunto(e.target.value)}
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      {assuntosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
    </select>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-8 py-4">
        <div className="flex items-center gap-3">
          <img src="/urbi/urbi-botao.jpg" alt="" className="h-9 w-9 rounded-full object-cover" />
          <h1 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
            <Database size={18} /> BDI — Banco de Dados para Inteligência
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">URBI ativo para {usuariosComUrbiAtivo}/{usuarios.length} usuários</span>
          <button onClick={() => router.push("/admin/rastreabilidade")} className={BTN_SECUNDARIO}>
            <Search size={13} /> Rastreabilidade
          </button>
          <button onClick={() => router.push("/")} className={BTN_SECUNDARIO}>← Home</button>
        </div>
      </header>

      <div className="border-b border-[var(--border)] bg-[var(--bg-card)] px-8">
        <div className="flex gap-1 overflow-x-auto pb-3">
          {(["painel","estatisticas","capacidades","legislacao","historico"] as const).map(a => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${aba === a ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {{ painel: "📊 Painel", estatisticas: "🧠 Estatísticas", capacidades: "⚙️ Capacidades", legislacao: "📚 Legislação", historico: "🕘 Histórico" }[a]}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-7xl p-8">

        {aba === "painel" && (
          <div>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Metrica label="Conversas totais" valor={totalConversas} />
              <Metrica label="Usuários com URBI ativo" valor={`${usuariosComUrbiAtivo}/${usuarios.length}`} />
            </div>
            <Secao titulo="Ativação do URBI">
              <div className="px-5 py-5">
                <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                  O URBI é ativado individualmente, por usuário — não existe um interruptor geral. Ligue ou desligue
                  para cada analista, gerência ou diretora em Configurações → Usuários.
                </p>
                <button className={BTN_PRIMARIO} onClick={() => router.push("/admin/usuarios")}>
                  <Users size={14} /> Abrir Usuários <ArrowRight size={13} />
                </button>
              </div>
            </Secao>
          </div>
        )}

        {aba === "estatisticas" && (
          <div>
            {loadingStats && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
                <Loader2 size={16} className="animate-spin" /> Carregando estatísticas…
              </div>
            )}
            {!loadingStats && stats && (
              <>
                {/* Sub-abas de estatísticas */}
                {(() => {
                  const subAbas: [string, string][] = [["resumo","📊 Resumo"],["analistas","👤 Analistas"],["retrabalho","🔁 Retrabalho"],["exigencias","📌 Exigências"],["qualidade","🧭 Qualidade"],["conformidade","⚠️ Conformidade"],["bairros","📍 Bairros"],["sessoes","🕑 Sessões"]];
                  return (
                    <>
                      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-3">
                        {subAbas.map(([k,l]) => (
                          <button key={k} onClick={() => { setSubAba(k as any); if (k === 'sessoes') carregarSessoes(); }}
                            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${subAba===k ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"}`}>
                            {l}
                          </button>
                        ))}
                      </div>

                {subAba === "resumo" && <>
                {/* Resumo geral */}
                <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <Metrica label="Processos" valor={stats.resumo.total_processos ?? 0} />
                  <Metrica label="Analistas" valor={stats.resumo.total_analistas ?? 0} />
                  <Metrica label="Bairros" valor={stats.resumo.total_bairros ?? 0} />
                  <Metrica label="Retornos" valor={stats.resumo.total_retornos ?? 0} />
                  <Metrica label="Área total (m²)" valor={Number(stats.resumo.area_total_construida ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
                  <Metrica label="Área média (m²)" valor={Number(stats.resumo.area_media ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
                </div>

                {/* Por assunto */}
                <Secao titulo="Processos por assunto">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          {["ASSUNTO","PROCESSOS","ÁREA TOTAL (m²)","ÁREA MÉDIA (m²)","RETORNOS"].map(h => <th key={h} className={TH}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(porAssuntoAgrupado).map(row => (
                          <tr key={row.assunto} className={TR}>
                            <td className={TD}><Badge tom="accent">{row.assunto}</Badge></td>
                            <td className={TD}>{row.total_processos}</td>
                            <td className={TD}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                            <td className={TD}>{row.total_processos > 0 ? Number(row.area_total / row.total_processos).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—"}</td>
                            <td className={TD}>{row.total_retornos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                {/* Por analista */}
                <Secao titulo="Produtividade por analista">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          {["ANALISTA","GERÊNCIA","PROCESSOS","ÁREA TOTAL (m²)","T. MÉDIO (h)"].map(h => <th key={h} className={TH}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.por_analista.map(row => (
                          <tr key={row.analista} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{row.analista}</td>
                            <td className={TD}><Badge tom="info">{row.gerencia ?? "—"}</Badge></td>
                            <td className={TD}>{row.total_processos}</td>
                            <td className={TD}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                            <td className={TD}>{Number(row.tempo_medio_horas).toFixed(1)}</td>
                          </tr>
                        ))}
                        {stats.por_analista.length === 0 && <Vazio cols={5}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                {/* Top bairros */}
                <Secao titulo="Top bairros" acao={selectAssunto}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">{["BAIRRO","PROCESSOS","ÁREA TOTAL (m²)","ASSUNTO"].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {porBairroFiltrado.map(row => (
                          <tr key={row.bairro + row.assunto} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{row.bairro}</td>
                            <td className={TD}>{row.total_processos}</td>
                            <td className={TD}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                            <td className={TD}><Badge tom="aviso">{row.assunto}</Badge></td>
                          </tr>
                        ))}
                        {porBairroFiltrado.length === 0 && <Vazio cols={4}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                {/* Produtividade MRP */}
                <Secao
                  titulo="Produtividade MRP (despachos)"
                  acao={<button onClick={carregarStats} className={BTN_SECUNDARIO}><RefreshCw size={13} /> Atualizar</button>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">{["ANALISTA","PERÍODO","TIPO","DESPACHOS","PONTOS"].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {stats.produtividade.slice(0, 30).map((row, i) => (
                          <tr key={i} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{row.analista}</td>
                            <td className={TD}>{MESES[row.mes]}/{row.ano}</td>
                            <td className={TD}><Badge tom="ok">{row.tipo_processo}</Badge></td>
                            <td className={TD}>{row.total_despachos}</td>
                            <td className={TD}>{Number(row.total_pontos).toFixed(1)}</td>
                          </tr>
                        ))}
                        {stats.produtividade.length === 0 && <Vazio cols={5}>Sem dados de MRP ainda</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}

                {subAba === "analistas" && <>
                <Secao titulo="Desempenho por analista">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["ANALISTA","GERÊNCIA","ASSUNTO","PROCESSOS","ÁREA m²","T.MÉDIO(h)","RETORNOS","PTS MRP","DESPACHOS"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.analistas.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{r.analista||"—"}</td>
                            <td className={TD}><Badge tom="info">{r.gerencia||"DIRAAP"}</Badge></td>
                            <td className={TD}><Badge tom="accent">{r.assunto||"—"}</Badge></td>
                            <td className={TD}>{r.total_processos}</td>
                            <td className={TD}>{Number(r.area_total).toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                            <td className={TD}>{Number(r.tempo_medio_horas).toFixed(1)}</td>
                            <td className={TD}>{r.total_retornos}</td>
                            <td className={TD}>{Number(r.pontos_totais_mrp).toFixed(1)}</td>
                            <td className={TD}>{r.despachos_mrp}</td>
                          </tr>
                        ))}
                        {stats.analistas.length===0 && <Vazio cols={9}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}

                {subAba === "retrabalho" && <>
                <Secao
                  titulo="Processos com maior retrabalho"
                  descricao={<>Contado do histórico do MAC: quantas vezes um item mudou de status. &quot;Voltou&quot; é item que estava conforme e virou não conforme; &quot;resolvido&quot; é o caminho contrário.</>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["#","PROCESSO","TROCAS","VOLTOU","RESOLVIDO"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.retrabalho.map((r,i)=>(
                          <tr key={r.processo_codigo} className={TR}>
                            <td className={`${TD} w-8 font-semibold text-[var(--text-muted)]`}>{i+1}</td>
                            <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{r.processo_codigo}</td>
                            <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.trocas_totais}</td>
                            <td className={`${TD} text-center font-semibold text-red-600`}>{r.virou_nao_conforme}</td>
                            <td className={`${TD} text-center font-semibold text-emerald-600`}>{r.foi_resolvido}</td>
                          </tr>
                        ))}
                        {stats.retrabalho.length===0 && <Vazio cols={5}>Sem trocas registradas</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}

                {subAba === "exigencias" && <>
                <Secao
                  titulo="Exigências por assunto, bairro e faixa de área"
                  descricao="O que mais reprova em processo parecido. Vem do histórico do MAC, contando só marcação de não conforme."
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["ASSUNTO","FAIXA DE ÁREA","BAIRRO","EXIGÊNCIA","PROC."].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.exigencias_contexto.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={TD}><Badge tom="accent">{r.tipo_processo}</Badge></td>
                            <td className={`${TD} text-xs`}>{r.faixa_area}</td>
                            <td className={`${TD} text-xs text-[var(--text-muted)]`}>{r.bairro || "—"}</td>
                            <td className={`${TD} text-xs`}>{String(r.exigencia).slice(0,90)}</td>
                            <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.processos}</td>
                          </tr>
                        ))}
                        {stats.exigencias_contexto.length===0 && <Vazio cols={5}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                <Secao
                  titulo="Referências legais que mais reprovam"
                  descricao="A referência é como foi gravada no checklist, às vezes com várias leis juntas — é o desempenho da combinação, não de artigo isolado. Só aparece referência presente em 3 ou mais processos."
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["REFERÊNCIA","REPROVOU","PASSOU","PROC.","% REPROVA"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.desempenho_referencia.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={`${TD} text-xs`}>{r.referencia}</td>
                            <td className={`${TD} text-center font-semibold text-red-600`}>{r.reprovou}</td>
                            <td className={`${TD} text-center font-semibold text-emerald-600`}>{r.passou}</td>
                            <td className={`${TD} text-center`}>{r.processos}</td>
                            <td className={`${TD} text-center`}>{r.pct_reprova}%</td>
                          </tr>
                        ))}
                        {stats.desempenho_referencia.length===0 && <Vazio cols={5}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}

                {subAba === "qualidade" && <>
                <Secao titulo="Numeração" descricao="Faixa esgotada trava a emissão de documento.">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["TIPO","ANO","FAIXA","PRÓXIMO","RESTANTES","SITUAÇÃO"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.numeracao.map((r,i)=>{
                          const tom = r.situacao==="ESGOTADA" ? "erro" : r.situacao==="CRITICO" ? "alerta" : r.situacao==="ATENCAO" ? "aviso" : "ok";
                          return (
                          <tr key={i} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{r.tipo}</td>
                            <td className={`${TD} text-center`}>{r.ano}</td>
                            <td className={`${TD} font-mono text-xs`}>{r.numero_inicial}–{r.numero_final}</td>
                            <td className={`${TD} text-center font-mono`}>{r.proximo}</td>
                            <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.restantes}</td>
                            <td className={TD}><Badge tom={tom}>{r.situacao}</Badge></td>
                          </tr>
                          );
                        })}
                        {stats.numeracao.length===0 && <Vazio cols={6}>Sem faixas cadastradas</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                <Secao
                  titulo="Preenchimento e qualidade dos dados"
                  descricao={<>Campo vazio pode ser falha de leitura. Campo em X afirma que o documento não traz a informação — <b>não é erro</b>. As duas colunas são contadas separadas de propósito.</>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["PROCESSO","ASSUNTO","VAZIOS","EM X","CAMPOS","ÁREA > TERRENO"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.campos_criticos.map((r)=>(
                          <tr key={r.codigo} className={TR}>
                            <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{r.codigo}</td>
                            <td className={`${TD} text-xs`}>{r.tipo_processo}</td>
                            <td className={`${TD} text-center font-semibold ${r.campos_vazios>=10 ? "text-orange-600" : "text-[var(--text-secondary)]"}`}>{r.campos_vazios}</td>
                            <td className={`${TD} text-center text-sky-700`}>{r.campos_em_x}</td>
                            <td className={`${TD} text-center text-[var(--text-muted)]`}>{r.campos_totais}</td>
                            <td className={`${TD} text-center`}>
                              {r.area_maior_que_terreno === true
                                ? <Badge tom="erro">SIM</Badge>
                                : r.area_maior_que_terreno === null
                                  ? <Badge tom="neutro">não deu p/ ler</Badge>
                                  : "—"}
                            </td>
                          </tr>
                        ))}
                        {stats.campos_criticos.length===0 && <Vazio cols={6}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}

                {subAba === "conformidade" && <>
                <Secao titulo="Não conformidades mais frequentes">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["GRUPO","ITEM","REF. LEGAL","ASSUNTO","FREQ."].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.nao_conformidades.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={TD}><Badge tom="aviso">{r.grupo}</Badge></td>
                            <td className={`${TD} max-w-[300px] text-xs`}>{r.texto}</td>
                            <td className={`${TD} font-mono text-[11px]`}>{r.ref||"—"}</td>
                            <td className={TD}><Badge tom="accent">{r.assunto||"—"}</Badge></td>
                            <td className={`${TD} font-semibold text-red-600`}>{r.frequencia}</td>
                          </tr>
                        ))}
                        {stats.nao_conformidades.length===0 && <Vazio cols={5}>Sem dados de MAC ainda</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}

                {subAba === "bairros" && <>
                <Secao titulo="Distribuição por bairro" acao={selectAssunto}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["BAIRRO","PROCESSOS","ÁREA TOTAL (m²)","ASSUNTO"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {porBairroFiltrado.map(row=>(
                          <tr key={row.bairro+row.assunto} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{row.bairro}</td>
                            <td className={TD}>{row.total_processos}</td>
                            <td className={TD}>{Number(row.area_total).toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                            <td className={TD}><Badge tom="aviso">{row.assunto}</Badge></td>
                          </tr>
                        ))}
                        {porBairroFiltrado.length===0 && <Vazio cols={4}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>
                </>}


                {subAba === "sessoes" && <>
                <Secao
                  titulo="Sessões de trabalho"
                  acao={<button onClick={carregarSessoes} className={BTN_SECUNDARIO}><RefreshCw size={13} /> Atualizar</button>}
                >
                  {loadingSessoes && (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-muted)]">
                      <Loader2 size={16} className="animate-spin" /> Carregando…
                    </div>
                  )}
                  {!loadingSessoes && sessoes.length === 0 && (
                    <div className="py-8 text-center text-sm text-[var(--text-muted)]">Nenhuma sessão registrada ainda.</div>
                  )}
                  {!loadingSessoes && sessoes.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            {["ANALISTA","DATA","SESSÕES","BRUTO","LÍQUIDO","ÚLTIMO ACESSO"].map(h=>(
                              <th key={h} className={TH}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sessoes.map((s:any, i:number) => (
                            <tr key={i} className={TR}>
                              <td className={`${TD} font-medium text-[var(--text-primary)]`}>{s.analista || "—"}</td>
                              <td className={`${TD} font-mono text-xs`}>{s.data ? new Date(s.data).toLocaleDateString("pt-BR") : "—"}</td>
                              <td className={`${TD} text-center`}>{s.total_sessoes ?? "—"}</td>
                              <td className={`${TD} text-amber-600`}>{s.minutos_brutos != null ? `${s.minutos_brutos} min` : "—"}</td>
                              <td className={`${TD} text-emerald-600`}>{s.minutos_liquidos != null ? `${s.minutos_liquidos} min` : "—"}</td>
                              <td className={`${TD} font-mono text-xs`}>{s.ultimo_acesso ? new Date(s.ultimo_acesso).toLocaleString("pt-BR") : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Secao>
                </>}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {aba === "capacidades" && (
          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <Scale size={22} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">BIP — Especialista em Legislação</span>
                  <Badge tom="ok">ATIVO</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  Não se liga por aqui — cada analista ativa direto no botão &quot;⚖️ Ativar BIP&quot; dentro do chat do URBI.
                  Quando ativo, o URBI responde só com base no BIP e sempre cita a fonte.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 opacity-60">
              <Bot size={22} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Co-Analista</span>
                  <Badge tom="neutro">AINDA NÃO IMPLEMENTADO</Badge>
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  Apoio de análise consultando dados reais do processo — depende de acesso a ferramentas que o URBI
                  ainda não tem. Não é um recurso que se liga; é trabalho de fase futura.
                </p>
              </div>
            </div>
          </div>
        )}

        {aba === "legislacao" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            <h2 className="mb-3 inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
              <BookOpen size={18} /> O BIP é a fonte jurídica oficial do URBIS
            </h2>
            <p className="mb-5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
              Leis, decretos e normas técnicas ficam indexados e pesquisáveis no BIP — Biblioteca Inteligente
              para Pesquisas. É de lá que o modo BIP do URBI busca fragmento e cita fonte ao responder.
              Este cadastro antigo de legislação (aba que existia aqui) não alimenta mais nada no sistema —
              cadastre e gerencie leis diretamente no BIP.
            </p>
            <button className={BTN_PRIMARIO} onClick={() => router.push("/admin/bdi/leis")}>
              <BookOpen size={14} /> Abrir o BIP — Biblioteca de Leis <ArrowRight size={13} />
            </button>
          </div>
        )}

        {aba === "historico" && (
          <div className="space-y-3">
            {historico.length === 0 && (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">Nenhuma conversa registrada ainda.</div>
            )}
            {historico.map(h => (
              <div key={h.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{h.usuario_nome}</span>
                  <div className="flex items-center gap-2">
                    {h.linha && <Badge tom="info">{h.linha}</Badge>}
                    <span className="text-xs text-[var(--text-muted)]">{new Date(h.criado_em).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                <div className="mb-1.5 text-sm text-[var(--text-secondary)]">👤 {h.mensagem_usuario}</div>
                <div className="text-sm text-[var(--text-muted)]">🤖 {h.resposta_urbi.substring(0, 200)}{h.resposta_urbi.length > 200 ? "..." : ""}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
