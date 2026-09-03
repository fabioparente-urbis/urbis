"use client";
import React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2, RefreshCw, Search, Users, Scale, Bot, BookOpen, ArrowRight } from "lucide-react";

type Historico = { id: string; usuario_nome: string; linha: string; mensagem_usuario: string; resposta_urbi: string; criado_em: string };
type UsuarioResumo = { id: string; urbi_ativo?: boolean };
type Assunto = { id: string; slug: string; nome: string; ativo: boolean };
type Stats = {
  assunto_filtrado: { slug: string; nome: string } | null;
  nao_filtraveis: string[];
  analises_em_andamento: { tipo_processo: string; processos_em_andamento: number; dias_media_em_aberto: number; dias_mais_antigo: number }[];
  analises_em_andamento_pendente: boolean;
  aguardando_retorno: { processo_codigo: string; tipo_processo: string; analise_que_gerou_despacho: number | null; despacho_emitido_em: string; proxima_analise: number | null; proxima_analise_iniciada_em: string | null; dias_aguardando_retorno: number | null; situacao: "retornou" | "ainda aguardando" | "base insuficiente" }[];
  aguardando_retorno_pendente: boolean;
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
  tempo_etapas: { codigo: string; tipo_processo: string; analise_iniciada_em: string; analise_concluida_em: string; dias: number; marcacoes_no_mac: number }[];
  retorno_por_slot: { tipo_processo: string; faixa_area: string; processos: number; processos_com_retorno: number; pct_retorno: number; media_passadas_quando_retorna: number | null; passadas_extras_total: number }[];
  cobertura_satelite: { tipo_processo: string; tipo_documento: string; emitidos: number; com_mdp: number; com_mrp: number; faltando_mdp: number; faltando_mrp: number; pct_mdp: number; pct_mrp: number }[];
  retrabalho_por_passada: { processo_codigo: string; exigencia: string; aba: string | null; referencia_legal: string | null; passada_anterior: number; status_na_passada_anterior: string; passada_atual: number; status_antes_da_volta: string; status_depois_da_volta: string; voltou_em: string }[];
};

// "BDI — Co-Analista por evidência": um processo por linha, o motivo de
// cada fato junto — nunca um número de chance, nunca um prazo estimado.
type Prioridade = {
  codigo: string;
  tipo_processo: string;
  situacao_geral: string; situacao_geral_motivo: string;
  situacao_lip: string; situacao_lip_motivo: string;
  situacao_mac: string; situacao_mac_motivo: string;
  numero_analises: number;
  campos_vazios: string[];
  campos_em_x: string[];
  campos_totais: number;
  retrabalho_comprovado: { exigencia: string; aba: string | null; passada_anterior: number; passada_atual: number; voltou_em: string }[];
  /** Todo documento de toda passada — não só o mais recente. */
  satelite: { numero_analise: number; tipo_documento: string; numero: string; tem_mdp: boolean; tem_mrp: boolean }[];
  exigencias_recorrentes: { exigencia: string; vezes: number; processos: number }[];
  exigencias_recorrentes_info: { categoria: "fato" | "base_insuficiente"; motivo: string };
  vinculos_legais: { referencia: string; confianca: string }[];
  vinculos_legais_info: { categoria: "fato" | "base_insuficiente"; motivo: string };
  avisos: { id: string; titulo: string; detalhe: string; fonte: string; severidade: "info" | "atencao" | "alerta" }[];
  triagem: string;
  triagem_motivos: string[];
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

// Rótulo do slot para exibição — os slugs internos de tipo_processo (não o
// nome de `assuntos`, que essas views não trazem) só existem em 3 slots hoje.
// Ver lib/assuntos.ts (resolverSlot) para a fonte de verdade dos slugs;
// mapeamento repetido aqui de propósito porque é só apresentação síncrona,
// não decisão de dado.
const NOME_TIPO_PROCESSO: Record<string, string> = {
  regularizacao: "Regularização SEI",
  aceite_sei: "Aceite SEI",
  slot_05: "Aprovação de Projeto",
};
function nomeTipoProcesso(tp: string): string {
  return NOME_TIPO_PROCESSO[tp] ?? tp;
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
  const [subAba, setSubAba] = useState<"resumo"|"prioridades"|"eventos"|"analistas"|"retrabalho"|"exigencias"|"qualidade"|"conformidade"|"bairros"|"sessoes">("resumo");
  // Filtro global de Assunto — dinâmico, sem hardcode de slot: vem da mesma
  // tabela `assuntos` que já alimenta o dropdown "ABRIR PROCESSO" da Home e
  // o filtro de tipo da Pilha. "" = Tudo.
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [assuntoSelecionado, setAssuntoSelecionado] = useState("");
  // Prioridades (recorte "Co-Analista por evidência") — carrega à parte de
  // stats: é outra rota, outro payload, e só vale a pena buscar quando a
  // aba é aberta de verdade.
  const [prioridades, setPrioridades] = useState<Prioridade[] | null>(null);
  const [loadingPrioridades, setLoadingPrioridades] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [paginacaoPrioridades, setPaginacaoPrioridades] = useState<{ limite: number; offset: number; total_disponivel: number; mostrando: number } | null>(null);
  const [offsetPrioridades, setOffsetPrioridades] = useState(0);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (!json.ok || json.data?.perfil !== "Administrador") { router.push("/"); return; }
      carregarTudo();
    })();
    fetch("/api/admin/assuntos").then(r => r.json()).then(j => { if (j.ok) setAssuntos(j.data ?? []); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (aba === "estatisticas") carregarStats();
  }, [aba, assuntoSelecionado]);

  // Troca de assunto reseta a página — senão um offset de uma lista maior
  // pode cair fora do alcance da lista filtrada, menor.
  useEffect(() => { setOffsetPrioridades(0); }, [assuntoSelecionado]);

  useEffect(() => {
    if (aba === "estatisticas" && subAba === "prioridades") carregarPrioridades();
  }, [aba, subAba, assuntoSelecionado, offsetPrioridades]);

  async function carregarPrioridades() {
    setLoadingPrioridades(true);
    try {
      const params = new URLSearchParams();
      if (assuntoSelecionado) params.set("assunto", assuntoSelecionado);
      params.set("offset", String(offsetPrioridades));
      const r = await fetch(`/api/bdi/prioridades?${params}`);
      const j = await r.json();
      if (j.ok) { setPrioridades(j.data); setPaginacaoPrioridades(j.paginacao ?? null); }
    } finally {
      setLoadingPrioridades(false);
    }
  }

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
      const qs = assuntoSelecionado ? `?assunto=${encodeURIComponent(assuntoSelecionado)}` : "";
      const r = await fetch(`/api/bdi/stats${qs}`);
      const j = await r.json();
      if (j.ok) setStats(j);
    } finally {
      setLoadingStats(false);
    }
  }

  const totalConversas = historico.length;
  const usuariosComUrbiAtivo = usuarios.filter(u => u.urbi_ativo).length;
  // Por assunto já vem filtrada pelo servidor quando um assunto está
  // selecionado (?assunto= na API) — só agrupa por porte aqui, não filtra de
  // novo no client (antes havia um segundo filtro local, redundante).
  const porAssuntoAgrupado = (stats?.por_assunto ?? []).reduce((acc, row) => {
    if (!acc[row.assunto]) acc[row.assunto] = { assunto: row.assunto, total_processos: 0, area_total: 0, total_retornos: 0 };
    acc[row.assunto].total_processos += Number(row.total_processos);
    acc[row.assunto].area_total += Number(row.area_total);
    acc[row.assunto].total_retornos += Number(row.total_retornos);
    return acc;
  }, {} as Record<string, { assunto: string; total_processos: number; area_total: number; total_retornos: number }>);

  const seletorAssuntoGlobal = (
    <select
      value={assuntoSelecionado}
      onChange={e => setAssuntoSelecionado(e.target.value)}
      title="Filtra TODAS as estatísticas, tabelas e abas por um assunto (slot) só. Vazio = Tudo."
      className="rounded-lg border border-[var(--accent)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      <option value="">🗂 Tudo</option>
      {assuntos.filter(a => a.ativo).map(a => <option key={a.id} value={a.slug}>{a.nome}</option>)}
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
            {/* Filtro global de Assunto — vale pra TODAS as sub-abas abaixo, refaz a
                consulta no servidor (não é filtro de apresentação). */}
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
              <span className="text-xs font-bold text-[var(--text-secondary)]">FILTRAR POR ASSUNTO</span>
              {seletorAssuntoGlobal}
              {stats?.assunto_filtrado && (
                <span className="text-xs text-[var(--text-muted)]">
                  Mostrando só <b className="text-[var(--text-primary)]">{stats.assunto_filtrado.nome}</b>. Duas seções continuam com o total de todos os assuntos — numeração (não pertence a um assunto) e desempenho por referência legal (a view não guarda o assunto de cada linha ainda).
                </span>
              )}
            </div>

            {loadingStats && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
                <Loader2 size={16} className="animate-spin" /> Carregando estatísticas…
              </div>
            )}
            {!loadingStats && stats && (
              <>
                {/* Sub-abas de estatísticas */}
                {(() => {
                  const subAbas: [string, string][] = [["resumo","📊 Resumo"],["prioridades","🎯 Prioridades"],["eventos","🕒 Eventos"],["analistas","👤 Analistas"],["retrabalho","🔁 Retrabalho"],["exigencias","📌 Exigências"],["qualidade","🧭 Qualidade"],["conformidade","⚠️ Conformidade"],["bairros","📍 Bairros"],["sessoes","🕑 Sessões"]];
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
                <Secao titulo="Top bairros">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">{["BAIRRO","PROCESSOS","ÁREA TOTAL (m²)","ASSUNTO"].map(h => <th key={h} className={TH}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {(stats.por_bairro ?? []).map(row => (
                          <tr key={row.bairro + row.assunto} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{row.bairro}</td>
                            <td className={TD}>{row.total_processos}</td>
                            <td className={TD}>{Number(row.area_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                            <td className={TD}><Badge tom="aviso">{row.assunto}</Badge></td>
                          </tr>
                        ))}
                        {(stats.por_bairro ?? []).length === 0 && <Vazio cols={4}>Sem dados</Vazio>}
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
                            <td className={TD}><Badge tom="ok">{nomeTipoProcesso(row.tipo_processo)}</Badge></td>
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

                {subAba === "prioridades" && <>
                <Secao
                  titulo="Prioridades — onde olhar primeiro"
                  descricao={<>Um processo por linha, ordenado por quantidade de fato objetivo (alerta, retrabalho comprovado, documento sem satélite) — não é chance nem nota, é contagem. Nenhum nome de interessado aparece aqui, só o código do processo. Clique numa linha pra ver o motivo de cada coluna.</>}
                  acao={
                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1"><Badge tom="ok">fato</Badge> confirmado no banco</span>
                      <span className="inline-flex items-center gap-1"><Badge tom="erro">alerta</Badge> merece olhar</span>
                      <span className="inline-flex items-center gap-1"><Badge tom="neutro">base insuficiente</Badge> sem dado pra concluir</span>
                    </div>
                  }
                >
                  {loadingPrioridades && (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
                      <Loader2 size={16} className="animate-spin" /> Calculando prioridades…
                    </div>
                  )}
                  {!loadingPrioridades && (
                    <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-[var(--border)]">{["PROCESSO","ASSUNTO","SITUAÇÃO","TRIAGEM","ANÁLISES","LIP VAZIO","RETRABALHO","SATÉLITE"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                        <tbody>
                          {(prioridades ?? []).map((p) => {
                            const tomTriagem = p.triagem === "maior risco de retrabalho" ? "erro" : p.triagem === "exige atenção" ? "aviso" : "ok";
                            const documentosFaltando = p.satelite.filter(d => !d.tem_mdp || !d.tem_mrp).length;
                            const aberto = expandido === p.codigo;
                            return (
                              <React.Fragment key={p.codigo}>
                                <tr className={`${TR} cursor-pointer`} onClick={() => setExpandido(aberto ? null : p.codigo)}>
                                  <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{aberto ? "▾" : "▸"} {p.codigo}</td>
                                  <td className={TD}><Badge tom="accent">{nomeTipoProcesso(p.tipo_processo)}</Badge></td>
                                  <td className={TD} title={p.situacao_geral_motivo}>{p.situacao_geral}</td>
                                  <td className={TD}><Badge tom={tomTriagem}>{p.triagem}</Badge></td>
                                  <td className={`${TD} text-center`}>{p.numero_analises || "—"}</td>
                                  <td className={`${TD} text-center ${p.campos_vazios.length>0 ? "font-semibold text-orange-600" : "text-[var(--text-muted)]"}`}>{p.campos_vazios.length}</td>
                                  <td className={`${TD} text-center ${p.retrabalho_comprovado.length>0 ? "font-semibold text-red-600" : "text-[var(--text-muted)]"}`}>{p.retrabalho_comprovado.length || "—"}</td>
                                  <td className={TD}>
                                    {p.satelite.length === 0 ? <span className="text-[var(--text-muted)]">—</span>
                                      : documentosFaltando > 0 ? <Badge tom="erro">{documentosFaltando} faltando</Badge>
                                      : <Badge tom="ok">completo ({p.satelite.length})</Badge>}
                                  </td>
                                </tr>
                                {aberto && (
                                  <tr className="border-b border-[var(--border)]">
                                    <td colSpan={8} className="bg-[var(--bg-secondary)] px-5 py-4 text-xs">
                                      <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                          <p className="mb-1 font-semibold text-[var(--text-primary)]">Situação <Badge tom="ok">fato</Badge></p>
                                          <p className="text-[var(--text-secondary)]">LIP: {p.situacao_lip} — {p.situacao_lip_motivo}</p>
                                          <p className="text-[var(--text-secondary)]">MAC: {p.situacao_mac} — {p.situacao_mac_motivo}</p>
                                          {p.campos_vazios.length > 0 && (
                                            <p className="mt-1 text-[var(--text-muted)]">Campos vazios: {p.campos_vazios.slice(0,15).join(", ")}{p.campos_vazios.length>15?"…":""}</p>
                                          )}
                                          {p.satelite.length > 0 && (
                                            <div className="mt-1">
                                              {p.satelite.map((d, i) => (
                                                <p key={i} className="text-[var(--text-muted)]">{d.tipo_documento} nº {d.numero} (análise {d.numero_analise}) — MDP {d.tem_mdp?"✓":"✕ faltando"}, MRP {d.tem_mrp?"✓":"✕ faltando"}.</p>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <div>
                                          <p className="mb-1 font-semibold text-[var(--text-primary)]">Retrabalho comprovado entre análises <Badge tom={p.retrabalho_comprovado.length>0?"erro":"ok"}>{p.retrabalho_comprovado.length>0?"alerta":"fato"}</Badge></p>
                                          {p.retrabalho_comprovado.length === 0
                                            ? <p className="text-[var(--text-muted)]">Nenhum.</p>
                                            : p.retrabalho_comprovado.map((r, i) => (
                                                <p key={i} className="text-[var(--text-secondary)]">Análise {r.passada_anterior}→{r.passada_atual} ({r.aba || "—"}): {r.exigencia.slice(0,90)}</p>
                                              ))}
                                        </div>
                                        <div>
                                          <p className="mb-1 font-semibold text-[var(--text-primary)]">Avisos (fato + fonte)</p>
                                          {p.avisos.length === 0
                                            ? <p className="text-[var(--text-muted)]"><Badge tom="ok">fato</Badge> Nenhum sinal de retrabalho ou inconsistência encontrado.</p>
                                            : p.avisos.map((a) => (
                                                <p key={a.id} className="text-[var(--text-secondary)]">
                                                  <Badge tom={a.severidade === "alerta" ? "erro" : a.severidade === "atencao" ? "aviso" : "ok"}>{a.severidade === "info" ? "fato" : a.severidade}</Badge>{" "}
                                                  <b>{a.titulo}</b>{" "}
                                                  <span className="text-[var(--text-muted)]">— {a.detalhe} ({a.fonte})</span>
                                                </p>
                                              ))}
                                        </div>
                                        <div>
                                          <p className="mb-1 font-semibold text-[var(--text-primary)]">
                                            Exigências recorrentes neste assunto{" "}
                                            <Badge tom={p.exigencias_recorrentes_info.categoria === "fato" ? "ok" : "neutro"}>{p.exigencias_recorrentes_info.categoria === "fato" ? "fato" : "base insuficiente"}</Badge>
                                          </p>
                                          <p className="text-[var(--text-muted)]">{p.exigencias_recorrentes_info.motivo}</p>
                                          {p.exigencias_recorrentes.slice(0,5).map((e, i) => (
                                            <p key={i} className="text-[var(--text-secondary)]">{e.exigencia.slice(0,80)} — {e.processos} processo(s)</p>
                                          ))}
                                          <p className="mt-2 font-semibold text-[var(--text-primary)]">
                                            Referência legal (BIP){" "}
                                            <Badge tom={p.vinculos_legais_info.categoria === "fato" ? "ok" : "neutro"}>{p.vinculos_legais_info.categoria === "fato" ? "fato" : "base insuficiente"}</Badge>
                                          </p>
                                          <p className="text-[var(--text-muted)]">{p.vinculos_legais_info.motivo}</p>
                                          {p.vinculos_legais.length > 0 && (
                                            <p className="text-[var(--text-secondary)]">{p.vinculos_legais.map(v=>v.referencia).join(", ")}</p>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {(prioridades ?? []).length === 0 && <Vazio cols={8}>Sem processos nesta seleção</Vazio>}
                        </tbody>
                      </table>
                    </div>
                    {paginacaoPrioridades && (
                      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]">
                        <span>
                          Mostrando {paginacaoPrioridades.mostrando} de {paginacaoPrioridades.total_disponivel} processo(s)
                          {paginacaoPrioridades.total_disponivel > paginacaoPrioridades.mostrando && " — refine o filtro de Assunto pra ver o resto, ou navegue pela página"}.
                        </span>
                        <div className="flex gap-2">
                          <button disabled={offsetPrioridades === 0} onClick={() => setOffsetPrioridades(Math.max(0, offsetPrioridades - paginacaoPrioridades.limite))}
                            className={`${BTN_SECUNDARIO} disabled:opacity-40`}>← Anterior</button>
                          <button disabled={offsetPrioridades + paginacaoPrioridades.mostrando >= paginacaoPrioridades.total_disponivel} onClick={() => setOffsetPrioridades(offsetPrioridades + paginacaoPrioridades.limite)}
                            className={`${BTN_SECUNDARIO} disabled:opacity-40`}>Próxima →</button>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                </Secao>
                </>}

                {subAba === "eventos" && <>
                <Secao
                  titulo="Processos sem registro de MDP/MRP após emissão"
                  descricao={<>Fato contado, não previsão: cruza o número do despacho já gravado em <code>analises_mac</code> com o que existe em <code>mdp_registros</code> e <code>mrp_registros</code> pelo mesmo número. Linha com % abaixo de 100 é emissão que saiu sem o satélite correspondente ter sido gravado — não diz por quê, só que falta.</>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["ASSUNTO","DOCUMENTO","EMITIDOS","COM MDP","FALTANDO MDP","% MDP","COM MRP","FALTANDO MRP","% MRP"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.cobertura_satelite.map((r,i)=>{
                          const tomPct = (p: number) => p >= 100 ? "ok" : p >= 80 ? "aviso" : "erro";
                          return (
                          <tr key={i} className={TR}>
                            <td className={TD}><Badge tom="accent">{nomeTipoProcesso(r.tipo_processo)}</Badge></td>
                            <td className={`${TD} text-xs`}>{r.tipo_documento}</td>
                            <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.emitidos}</td>
                            <td className={`${TD} text-center`}>{r.com_mdp}</td>
                            <td className={`${TD} text-center ${r.faltando_mdp>0 ? "font-semibold text-red-600" : "text-[var(--text-muted)]"}`}>{r.faltando_mdp}</td>
                            <td className={TD}><Badge tom={tomPct(r.pct_mdp)}>{r.pct_mdp}%</Badge></td>
                            <td className={`${TD} text-center`}>{r.com_mrp}</td>
                            <td className={`${TD} text-center ${r.faltando_mrp>0 ? "font-semibold text-red-600" : "text-[var(--text-muted)]"}`}>{r.faltando_mrp}</td>
                            <td className={TD}><Badge tom={tomPct(r.pct_mrp)}>{r.pct_mrp}%</Badge></td>
                          </tr>
                          );
                        })}
                        {stats.cobertura_satelite.length===0 && <Vazio cols={9}>Sem dados</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                <Secao
                  titulo="Análises iniciadas e ainda sem conclusão"
                  descricao={<>Conta processo com <code>analise_iniciada_em</code> gravado, <code>analise_concluida_em</code> ainda nulo, <b>e a passada mais recente sem despacho/parecer commitado</b> — sem essa terceira condição, um processo que já teve despacho emitido (só não foi indeferido/arquivado) contava como &quot;em andamento&quot; por engano; corrigido depois de testar contra produção (achado: 15 dos 18 processos originais já estavam com despacho pronto). Não estima quando vai fechar.</>}
                >
                  {stats.analises_em_andamento_pendente ? (
                    <div className="px-5 py-4 text-xs text-[var(--text-muted)]">
                      Depende da migration <code>2026_09_02_bdi_analises_em_andamento.sql</code>, ainda não aplicada — esta seção fica vazia até isso acontecer. Prévia do dado real corrigido (lido direto do banco em 02/09/2026, fora desta tela): Regularização SEI tinha 3 processos realmente em análise (não 17 — os outros 15 já tinham despacho), média de 22,7 dias em aberto, o mais antigo com 41,0 dias.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-[var(--border)]">{["ASSUNTO","PROCESSOS","MÉDIA DE DIAS EM ABERTO","MAIS ANTIGO (DIAS)"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                        <tbody>
                          {stats.analises_em_andamento.map((r,i)=>(
                            <tr key={i} className={TR}>
                              <td className={TD}><Badge tom="accent">{nomeTipoProcesso(r.tipo_processo)}</Badge></td>
                              <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.processos_em_andamento}</td>
                              <td className={`${TD} text-center`}>{r.dias_media_em_aberto}</td>
                              <td className={`${TD} text-center`}>{r.dias_mais_antigo}</td>
                            </tr>
                          ))}
                          {stats.analises_em_andamento.length===0 && <Vazio cols={4}>Nenhum processo em análise sem documento agora</Vazio>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Secao>

                <Secao
                  titulo="Tempo aguardando retorno do interessado"
                  descricao={<>Só conta a partir de quando o despacho JÁ SAIU — <code>urbis_numeracao_uso.emitido_em</code> — até a passada seguinte começar (<code>analises_mac.criado_em</code>). Não é tempo de análise do analista, é o relógio depois que a decisão já foi tomada. Confirma que o número é do despacho AO INTERESSADO (não despacho interno) cruzando com <code>analises_mac.numero_despacho</code> — os dois saem da mesma série de numeração, então não dá pra confiar só no tipo do documento.</>}
                >
                  {stats.aguardando_retorno_pendente ? (
                    <div className="px-5 py-4 text-xs text-[var(--text-muted)]">
                      Depende da migration <code>2026_09_03_bdi_aguardando_retorno.sql</code>, ainda não aplicada — esta seção fica vazia até isso acontecer. Prévia do dado real (lido direto do banco em 03/09/2026, fora desta tela): de 69 despachos ao interessado, 35 ainda aguardando (o mais antigo há 42,5 dias), 5 já retornaram (2,5 a 23,5 dias de espera), 29 com base insuficiente (sem número de análise registrado, ou não bateu com o despacho ao interessado).
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-[var(--border)]">{["PROCESSO","ASSUNTO","PASSADA","DESPACHO EM","SITUAÇÃO","DIAS"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                        <tbody>
                          {stats.aguardando_retorno.map((r,i)=>{
                            const tom = r.situacao === "ainda aguardando" ? "aviso" : r.situacao === "retornou" ? "ok" : "neutro";
                            return (
                            <tr key={i} className={TR}>
                              <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{r.processo_codigo}</td>
                              <td className={TD}><Badge tom="accent">{nomeTipoProcesso(r.tipo_processo)}</Badge></td>
                              <td className={`${TD} text-center`}>{r.analise_que_gerou_despacho ?? "—"}</td>
                              <td className={`${TD} text-xs`}>{new Date(r.despacho_emitido_em).toLocaleDateString("pt-BR")}</td>
                              <td className={TD}><Badge tom={tom}>{r.situacao}</Badge></td>
                              <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.dias_aguardando_retorno ?? "—"}</td>
                            </tr>
                            );
                          })}
                          {stats.aguardando_retorno.length===0 && <Vazio cols={6}>Sem dados</Vazio>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Secao>

                <Secao
                  titulo="Tempo entre início e conclusão da análise"
                  descricao={<>Só processo com início E fim gravados. <b>Ressalva importante</b>: hoje a maioria fecha em 0,0 dia porque a conclusão é carimbada na hora que o documento sai, e o analista costuma fazer tudo numa sentada — isto mede &quot;quando saiu o documento&quot;, não &quot;quanto tempo a análise levou&quot;. Não é métrica de desempenho do analista.</>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["PROCESSO","ASSUNTO","INICIOU","CONCLUIU","DIAS","MARCAÇÕES MAC"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.tempo_etapas.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{r.codigo}</td>
                            <td className={TD}><Badge tom="accent">{nomeTipoProcesso(r.tipo_processo)}</Badge></td>
                            <td className={`${TD} text-xs`}>{r.analise_iniciada_em ? new Date(r.analise_iniciada_em).toLocaleDateString("pt-BR") : "—"}</td>
                            <td className={`${TD} text-xs`}>{r.analise_concluida_em ? new Date(r.analise_concluida_em).toLocaleDateString("pt-BR") : "—"}</td>
                            <td className={`${TD} text-center font-semibold ${Number(r.dias) > 1 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{r.dias}</td>
                            <td className={`${TD} text-center`}>{r.marcacoes_no_mac}</td>
                          </tr>
                        ))}
                        {stats.tempo_etapas.length===0 && <Vazio cols={6}>Nenhum processo com início e conclusão gravados ainda</Vazio>}
                      </tbody>
                    </table>
                  </div>
                </Secao>

                <Secao
                  titulo="Retorno por slot e faixa de área"
                  descricao={<>Fato contado: processo com mais de uma passada em <code>analises_mac</code>. Não distingue &quot;voltou do SEI&quot; de &quot;analista abriu de novo&quot; — é a única coisa que o banco hoje consegue provar. Linha com &quot;amostra baixa&quot; tem menos de 5 processos: percentual ali não é conclusivo, só está aqui pra não esconder o dado.</>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["ASSUNTO","FAIXA DE ÁREA","PROCESSOS","COM RETORNO","% RETORNO","MÉDIA PASSADAS"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.retorno_por_slot.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={TD}><Badge tom="accent">{nomeTipoProcesso(r.tipo_processo)}</Badge></td>
                            <td className={`${TD} text-xs`}>{r.faixa_area}</td>
                            <td className={`${TD} text-center`}>{r.processos}{r.processos < 5 && <span className="ml-1"><Badge tom="neutro">amostra baixa</Badge></span>}</td>
                            <td className={`${TD} text-center font-semibold text-[var(--text-primary)]`}>{r.processos_com_retorno}</td>
                            <td className={TD}>{r.processos >= 5 ? <Badge tom={r.pct_retorno >= 30 ? "aviso" : "ok"}>{r.pct_retorno}%</Badge> : <span className="text-[var(--text-muted)]">{r.pct_retorno}%</span>}</td>
                            <td className={`${TD} text-center`}>{r.media_passadas_quando_retorna ?? "—"}</td>
                          </tr>
                        ))}
                        {stats.retorno_por_slot.length===0 && <Vazio cols={6}>Sem dados</Vazio>}
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

                <Secao
                  titulo="Retrabalho comprovado entre passadas"
                  descricao={<>Só o item que mudou de status DEPOIS que uma passada nova começou — o analista mudando de ideia na mesma passada não entra aqui, é o trabalho normal acontecendo. Não diz se foi o interessado que corrigiu ou o analista que reconsiderou; só que a marca mudou depois do retorno. Cobertura do dado: 98,3% das trocas do histórico ligam a uma análise real (4.439 de 4.518) — o resto fica de fora, não distorce o número.</>}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["PROCESSO","EXIGÊNCIA","ABA","VOLTOU DA PASSADA","STATUS","QUANDO"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {stats.retrabalho_por_passada.map((r,i)=>(
                          <tr key={i} className={TR}>
                            <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{r.processo_codigo}</td>
                            <td className={`${TD} max-w-[320px] text-xs`} title={r.exigencia}>{r.exigencia.slice(0,110)}{r.exigencia.length>110?"…":""}</td>
                            <td className={`${TD} text-xs text-[var(--text-muted)]`}>{r.aba || "—"}</td>
                            <td className={`${TD} text-center`}><Badge tom="aviso">{r.passada_anterior} → {r.passada_atual}</Badge></td>
                            <td className={`${TD} text-xs`}>
                              <span className="text-red-600">{r.status_antes_da_volta}</span> → <span className="text-emerald-600">{r.status_depois_da_volta}</span>
                            </td>
                            <td className={`${TD} text-xs text-[var(--text-muted)]`}>{new Date(r.voltou_em).toLocaleDateString("pt-BR")}</td>
                          </tr>
                        ))}
                        {stats.retrabalho_por_passada.length===0 && <Vazio cols={6}>Sem retrabalho entre passadas registrado</Vazio>}
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
                            <td className={TD}><Badge tom="accent">{nomeTipoProcesso(r.tipo_processo)}</Badge></td>
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
                  {assuntoSelecionado && (
                    <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      ⚠ Mostrando <b>todos os assuntos</b>, não só {stats.assunto_filtrado?.nome ?? assuntoSelecionado} — esta tabela ainda não guarda de qual assunto cada linha veio, não dá pra filtrar sem alterar a view.
                    </div>
                  )}
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
                  {assuntoSelecionado && (
                    <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      ⚠ Mostrando <b>todos os assuntos</b>, não só {stats.assunto_filtrado?.nome ?? assuntoSelecionado} — numeração é compartilhada entre os slots por desenho do sistema (CLAUDE.md), não pertence a um assunto.
                    </div>
                  )}
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
                            <td className={`${TD} text-xs`}>{nomeTipoProcesso(r.tipo_processo)}</td>
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
                <Secao titulo="Distribuição por bairro">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-[var(--border)]">{["BAIRRO","PROCESSOS","ÁREA TOTAL (m²)","ASSUNTO"].map(h=><th key={h} className={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {(stats.por_bairro ?? []).map(row=>(
                          <tr key={row.bairro+row.assunto} className={TR}>
                            <td className={`${TD} font-medium text-[var(--text-primary)]`}>{row.bairro}</td>
                            <td className={TD}>{row.total_processos}</td>
                            <td className={TD}>{Number(row.area_total).toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                            <td className={TD}><Badge tom="aviso">{row.assunto}</Badge></td>
                          </tr>
                        ))}
                        {(stats.por_bairro ?? []).length===0 && <Vazio cols={4}>Sem dados</Vazio>}
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
