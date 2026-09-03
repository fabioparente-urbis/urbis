"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { aplicarFiltrosLocais, queryParaFiltros, type FiltrosPilha } from "@/lib/urbi/navegacao";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito, PERFIS_GERENCIA } from "@/lib/perfis";

type ProcessoTag = {
  id?: string;
  tipo: "despacho" | "despacho_interno" | "indeferimento" | "arquivamento" | "laudo";
  numero_analise?: number;
  numero_despacho?: string;
  data?: string;
  criado_em?: string;
};

type Processo = {
  id: string;
  codigo: string;
  numero_sei: string;
  tipo_processo: string;
  status: string;
  criado_em: string;
  atualizado_em: string;
  analista_id: string | null;
  dados?: Record<string, any>;
  tags?: ProcessoTag[];
  lip_incompleto?: boolean;
  /** Colunas diretas de `processos`, agora selecionadas por /api/processos. */
  porte?: "PP" | "MP" | "GP" | null;
  area_construida?: number | string | null;
  /** Classe calculada pelo vigia (lib/bdi/vigia.ts) — já vem pronta da API. */
  triagem?: "mais simples para análise" | "exige atenção" | "maior risco de retrabalho";
  /** Situação real (lib/bdi/situacao.ts), substitui o antigo `status` — já vem pronta da API. */
  situacao_geral?: SituacaoGeral;
  /** De onde a situação saiu — mostrado no title do badge, pra poder conferir. */
  situacao_motivo?: string;
  /** LIP e MAC separados (mesma lógica, lib/bdi/situacao.ts) — pro card mostrar os dois lado a lado. */
  situacao_lip?: SituacaoLip;
  situacao_lip_motivo?: string;
  situacao_mac?: SituacaoMac;
  situacao_mac_motivo?: string;
};

type SituacaoGeral =
  | "Arquivado/indeferido"
  | "Aguardando retorno do interessado"
  | "MAC em análise"
  | "LIP pendente"
  | "Em cadastro";

type SituacaoLip = "Não iniciado" | "Incompleto" | "Completo";
type SituacaoMac = "Não iniciado" | "Em análise" | "Aguardando retorno do interessado" | "Arquivado/indeferido";

const SITUACAO_OPCOES: SituacaoGeral[] = [
  "Em cadastro", "LIP pendente", "MAC em análise",
  "Aguardando retorno do interessado", "Arquivado/indeferido",
];

const SITUACAO_COR: Record<SituacaoGeral, string> = {
  "Em cadastro": "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
  "LIP pendente": "bg-[var(--warning-bg)] text-[var(--warning)]",
  "MAC em análise": "bg-[var(--accent)] text-[var(--accent-fg)]",
  "Aguardando retorno do interessado": "bg-[var(--ia-bg)] text-[var(--ia)]",
  "Arquivado/indeferido": "bg-[var(--error-bg)] text-[var(--error)]",
};

const SITUACAO_LIP_COR: Record<SituacaoLip, string> = {
  "Não iniciado": "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
  "Incompleto": "bg-[var(--warning-bg)] text-[var(--warning)]",
  "Completo": "bg-[var(--success-bg)] text-[var(--success)]",
};

const SITUACAO_MAC_COR: Record<SituacaoMac, string> = {
  "Não iniciado": "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
  "Em análise": "bg-[var(--accent)] text-[var(--accent-fg)]",
  "Aguardando retorno do interessado": "bg-[var(--ia-bg)] text-[var(--ia)]",
  "Arquivado/indeferido": "bg-[var(--error-bg)] text-[var(--error)]",
};

const TAG_COR: Record<ProcessoTag["tipo"], string> = {
  despacho: "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent-hover)]",
  despacho_interno: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-strong)]",
  indeferimento: "bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]",
  arquivamento: "bg-[var(--bg-secondary)] text-[var(--text-primary)] border-[var(--border-strong)]",
  laudo: "bg-[var(--success-bg)] text-[var(--success)] border-[var(--border)]",
};

function rotuloTag(t: ProcessoTag): string {
  switch (t.tipo) {
    case "despacho":
      return t.numero_analise && t.numero_despacho
        ? `Análise ${t.numero_analise} — Despacho Nº ${t.numero_despacho}`
        : t.numero_analise
          ? `Análise ${t.numero_analise} — Despacho`
          : "Despacho";
    case "indeferimento":
      return t.numero_despacho
        ? `Indeferimento — Despacho Nº ${t.numero_despacho}`
        : "Indeferimento";
    case "despacho_interno":
      return t.numero_despacho
        ? `Despacho Interno Nº ${t.numero_despacho}`
        : "Despacho Interno";
    case "arquivamento":
      return "Arquivamento";
    case "laudo":
      return "Laudo emitido";
  }
}

type Usuario = {
  id: string;
  nome: string;
  perfil: string;
};


const TIPO_COR: Record<string, string> = {
  regularizacao: "bg-[var(--ia-bg)] text-[var(--ia)]",
  aceite_sei: "bg-[var(--accent)] text-[var(--accent-fg)]",
  aprovacao_pp: "bg-[var(--warning-bg)] text-[var(--warning)]",
  aprovacao_mp: "bg-[var(--warning-bg)] text-[var(--warning)]",
};

const TIPO_ROTULO: Record<string, string> = {
  regularizacao: "Regularização SEI",
  aceite_sei: "Aceite SEI",
  aprovacao_pp: "Aprovação PP",
  aprovacao_mp: "Aprovação MP",
};

// Processos analisados antes de 21/07/2026 22:47 em que as análises antigas
// ficaram invisíveis para o sistema (gravadas com outra grafia de
// tipo_processo). A falha de gravação foi corrigida, mas o registro antigo
// desses processos segue fora da contagem — daí o aviso na lista. Lista
// fechada: nenhum processo novo entra aqui.
const PROCESSOS_ANALISES_OCULTAS = new Set([
  "25.5.000084973-0", "26.5.000011542-3", "24.28.000005986-4",
  "24.5.000050678-0", "25.5.000081077-0", "25.5.000029786-0",
  "25.5.000027562-9",
]);
const AVISO_ANALISES_OCULTAS =
  "Análises anteriores a 21/07/2026 não entram na contagem deste processo. " +
  "Elas foram gravadas com uma grafia que o sistema deixou de reconhecer, " +
  "e por isso a numeração foi reiniciada. O registro antigo continua no banco, " +
  "intacto. A falha de gravação foi corrigida em 21/07/2026, 22:47 — " +
  "processos analisados a partir daí não têm esse problema.";

// Tags antigas de Despacho Interno guardavam a data em ISO; as demais sempre
// gravaram DD/MM/AAAA. Normaliza para exibição sem depender de correção no banco.
function formatarDataTag(data?: string): string | null {
  if (!data) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return data;
  // Lê os componentes da própria string em vez de passar por Date(): a tag
  // ISO foi gravada como meia-noite UTC, que em Brasília cairia no dia anterior.
  const iso = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : data;
}

function formatar(dataStr: string | null) {
  if (!dataStr) return "—";
  return new Date(dataStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// useSearchParams obriga fronteira de Suspense (o Next avisa no build, não em
// tempo de execução). O conteúdo real vive aqui dentro; o export só embrulha.
function ProcessosConteudo() {
  const router = useRouter();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  // Filtros que chegam pela URL — é assim que o URBI entrega o resultado de
  // "processos indeferidos na análise 2" já na tela, sem precisar de estado
  // compartilhado entre o widget e esta página.
  const searchParams = useSearchParams();
  const [filtrosUrl, setFiltrosUrl] = useState<FiltrosPilha>({});
  // Critérios escolhidos diretamente na tela. Eles recortam apenas a lista
  // já autorizada pela API; nunca ampliam o acesso de ninguém.
  const [filtrosTriagem, setFiltrosTriagem] = useState<FiltrosPilha>({});
  // Situação real (lib/bdi/situacao.ts) — substitui o antigo filtro por
  // processos.status, que nunca separou nada (coluna morta, sempre 'CADASTRADO').
  const [situacao, setSituacao] = useState("");
  const [analista, setAnalista] = useState("");
  const [deletando, setDeletando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Processo | null>(null);
  const [novoAnalista, setNovoAnalista] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [perfil, setPerfil] = useState<string | null>(null);
  const [perfisUsuario, setPerfisUsuario] = useState<string[]>([]);
  const irrestrito = isPerfilIrrestrito(perfisUsuario.length > 0 ? perfisUsuario : perfil);
  // Gerente de gerencia tambem pode filtrar por analista (dentro da sua gerencia).
  const ehGerente = perfisUsuario.some((p) => (PERFIS_GERENCIA as readonly string[]).includes(p));
  const podeFiltrarAnalista = irrestrito || ehGerente;
  const souAdmin = perfisUsuario.includes("Administrador");
  const [avisoLipVazio, setAvisoLipVazio] = useState(false);
  // Slots vindos do banco: o filtro e os rótulos acompanham qualquer slot
  // novo sem precisar de deploy.
  const [assuntos, setAssuntos] = useState<{ id: string; slug: string; nome: string; ativo: boolean }[]>([]);
  useEffect(() => {
    fetch("/api/admin/assuntos")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setAssuntos(j.data ?? []); })
      .catch(() => { /* filtro cai no fallback estático */ });
  }, []);
  const rotuloTipo = (slug: string | null | undefined) =>
    assuntos.find((a) => a.slug === slug)?.nome ?? TIPO_ROTULO[slug ?? ""] ?? slug ?? "—";

  async function removerTag(processoId: string, codigo: string, tagId: string) {
    await fetch("/api/processo/tag", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, tagId }),
    });
    setProcessos((prev) =>
      prev.map((p) =>
        p.id === processoId
          ? { ...p, tags: (p.tags ?? []).filter((t) => t.id !== tagId) }
          : p
      )
    );
  }

  async function carregar() {
    try {
      setCarregando(true);
      const params = new URLSearchParams();
      if (busca) params.set("busca", busca);
      if (tipo) params.set("tipo", tipo);
      if (situacao) params.set("situacao", situacao);
      if (analista) params.set("analista", analista);
      const res = await fetch(`/api/processos?${params}`);
      const json = await res.json();
      if (json.ok) setProcessos(json.data);
    } finally {
      setCarregando(false);
    }
  }

  async function carregarUsuarios() {
    const res = await fetch("/api/admin/usuarios");
    const json = await res.json();
    if (json.ok) setUsuarios(json.data);
  }

  async function carregarPerfil() {
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (json.ok) {
        setPerfil(json.data?.perfil ?? null);
        const perfis: string[] = Array.isArray(json.data?.perfis) ? json.data.perfis : [];
        setPerfisUsuario(perfis);
      }
    } catch {
      // mantem perfil=null -> tratado como nao-irrestrito (UX restritiva por padrao)
    }
  }

  useEffect(() => { carregarUsuarios(); carregarPerfil(); }, []);
  useEffect(() => { carregar(); }, [busca, tipo, situacao, analista]);

  // A URL manda nos campos: o que o URBI pediu vira o estado visível dos
  // filtros, então a pessoa vê exatamente por que aquela lista está ali.
  useEffect(() => {
    const f = queryParaFiltros(new URLSearchParams(searchParams?.toString() ?? ""));
    setFiltrosUrl(f);
    setFiltrosTriagem({});
    setBusca(f.busca ?? "");
    setTipo(f.tipo ?? "");
  }, [searchParams]);

  // Recorte de apresentação sobre a lista que a API já devolveu — e a API é
  // quem aplica a permissão. Filtrar aqui não amplia o que a pessoa enxerga.
  const filtrosAtivos: FiltrosPilha = { ...filtrosUrl, ...filtrosTriagem };
  const processosVisiveis = aplicarFiltrosLocais(processos as any[], filtrosAtivos) as typeof processos;

  const rotulosFiltro: string[] = [];
  if (filtrosAtivos.tag) rotulosFiltro.push({ despacho: "despacho", despacho_interno: "despacho interno", indeferimento: "indeferimento", laudo: "laudo" }[filtrosAtivos.tag] ?? filtrosAtivos.tag);
  if (filtrosAtivos.analise !== undefined) rotulosFiltro.push(`análise ${filtrosAtivos.analise}`);
  if (filtrosAtivos.analisesMinimas) rotulosFiltro.push("2 ou mais análises");
  if (filtrosAtivos.triagem === "mais_simples") rotulosFiltro.push("mais simples por critérios");
  if (filtrosAtivos.faixaArea) rotulosFiltro.push({ ate_250: "até 250 m²", de_251_a_1000: "251 a 1.000 m²", acima_1000: "acima de 1.000 m²" }[filtrosAtivos.faixaArea]);
  if (filtrosAtivos.usoSolo) rotulosFiltro.push(filtrosAtivos.usoSolo === "com" ? "com Uso do Solo" : "sem Uso do Solo");
  if (filtrosAtivos.classificacaoVigia) rotulosFiltro.push(filtrosAtivos.classificacaoVigia);
  if (filtrosAtivos.porte) rotulosFiltro.push(`porte ${filtrosAtivos.porte}`);
  if (filtrosAtivos.ordenar) rotulosFiltro.push({ area_desc: "maior área", area_asc: "menor área", data_desc: "mais novos", data_asc: "mais antigos", analises_desc: "mais análises", analises_asc: "menos análises" }[filtrosAtivos.ordenar]);

  function limparTriagem() {
    setFiltrosTriagem({});
    if (filtrosUrl.tag || filtrosUrl.analise !== undefined || filtrosUrl.ordenar || filtrosUrl.triagem || filtrosUrl.faixaArea || filtrosUrl.usoSolo || filtrosUrl.analisesMinimas || filtrosUrl.classificacaoVigia || filtrosUrl.porte) {
      router.push("/processos");
    }
  }

  async function deletar(p: Processo) {
    const num = p.codigo || p.numero_sei;
    if (!confirm(`Apagar o processo ${num}? Esta acao nao pode ser desfeita.`)) return;
    setDeletando(p.id);
    try {
      const res = await fetch("/api/processos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const json = await res.json();
      if (json.ok) await carregar();
      else alert("Erro ao apagar: " + json.erro);
    } finally {
      setDeletando(null);
    }
  }

  function abrirEditar(p: Processo) {
    setEditando(p);
    setNovoAnalista(p.analista_id || "");
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvando(true);
    try {
      const erros: string[] = [];
      // Atualizar analista: rota dedicada, com autenticação e checagem de perfil.
      const novoAnalistaNorm = novoAnalista || null;
      if (novoAnalistaNorm !== (editando.analista_id || null)) {
        const resAtrib = await fetch("/api/processo/atribuir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processo_id: editando.id, analista_id: novoAnalistaNorm }),
        });
        const jsonAtrib = await resAtrib.json().catch(() => ({ ok: false, erro: "Resposta inválida" }));
        if (!jsonAtrib.ok) erros.push(jsonAtrib.erro || "Falha ao atribuir analista");
      }
      if (erros.length) {
        alert("Erro: " + erros.join("; "));
      } else {
        setEditando(null);
        await carregar();
      }
    } finally {
      setSalvando(false);
    }
  }

  function abrirProcesso(p: Processo) {
    const id = p.codigo || p.numero_sei;
    const tipoNorm = p.tipo_processo || "regularizacao";
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const destino = params.get("destino");
    if (destino === "mac") {
      // Verifica se LIP tem algum campo preenchido antes de ir pro MAC
      fetch(`/api/processo/lip-preenchido?codigo=${encodeURIComponent(id)}&tipo=${encodeURIComponent(tipoNorm)}`)
        .then(r => r.json())
        .then(({ preenchido }) => {
          if (preenchido) {
            router.push(`/analise-regularizacao/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipoNorm)}`);
          } else {
            setAvisoLipVazio(true);
          }
        })
        .catch(() => setAvisoLipVazio(true));
    } else {
      router.push(`/processo/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipoNorm)}`);
    }
  }

  function nomeAnalista(id: string | null) {
    if (!id) return "—";
    return usuarios.find((u) => u.id === id)?.nome || "—";
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-6">
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")}
            className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🏠 Home
          </button>
          <div>
            <h1 className="text-2xl font-bold">📋 Pilha de Processo</h1>
            <p className="text-[var(--text-muted)] text-sm">Processos cadastrados no URBIS</p>
          </div>
        </div>
        <span className="text-[var(--text-muted)] text-sm">{processosVisiveis.length} processo(s)</span>
      </div>

      {rotulosFiltro.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--bg-secondary)]">
          <span className="text-xs font-bold text-[var(--accent)]">FILTRO DO URBI</span>
          {rotulosFiltro.map((r) => (
            <span key={r} className="text-xs px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)]">{r}</span>
          ))}
          <button onClick={limparTriagem}
            className="ml-auto text-xs px-2 py-1 rounded bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)]">
            Limpar filtros
          </button>
        </div>
      )}

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por SEI, interessado ou nº de despacho..."
          className="flex-1 min-w-[200px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <option value="">Todos os tipos</option>
          {assuntos.filter((a) => a.ativo).map((a) => (
            <option key={a.id} value={a.slug}>{a.nome}</option>
          ))}
        </select>
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)}
          title="Situação calculada a partir de fato real — LIP preenchido, análise em andamento, despacho emitido. Não é o antigo campo de status."
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <option value="">Todas as situações</option>
          {SITUACAO_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {podeFiltrarAnalista && (
          <select value={analista} onChange={(e) => setAnalista(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <option value="">Todos os analistas</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
      </div>

      {/* TRIAGEM — leitura apenas. Não atribui nota, não altera status e não
          decide resultado: deixa explícitos os critérios usados para ordenar. */}
      <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Triagem da Pilha</h2>
            <p className="text-xs text-[var(--text-muted)]">Filtros por fatos registrados. “Mais simples” não é previsão de aprovação.</p>
          </div>
          {(Object.keys(filtrosTriagem).length > 0 || rotulosFiltro.length > 0) && (
            <button onClick={limparTriagem}
              className="text-xs px-2.5 py-1.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
              Limpar critérios
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={filtrosTriagem.triagem ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, triagem: e.target.value === "mais_simples" ? "mais_simples" : undefined }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Triagem: todas</option>
            <option value="mais_simples">Mais simples para começar</option>
          </select>
          <select value={filtrosTriagem.faixaArea ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, faixaArea: (e.target.value || undefined) as FiltrosPilha["faixaArea"] }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Área no LIP: todas</option>
            <option value="ate_250">Até 250 m²</option>
            <option value="de_251_a_1000">De 251 a 1.000 m²</option>
            <option value="acima_1000">Acima de 1.000 m²</option>
          </select>
          <select value={filtrosTriagem.classificacaoVigia ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, classificacaoVigia: (e.target.value || undefined) as FiltrosPilha["classificacaoVigia"] }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">🧭 Classificação: todas</option>
            <option value="mais simples para análise">Mais simples para análise</option>
            <option value="exige atenção">Exige atenção</option>
            <option value="maior risco de retrabalho">Maior risco de retrabalho</option>
          </select>
          <select value={filtrosTriagem.porte ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, porte: (e.target.value || undefined) as FiltrosPilha["porte"] }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Porte: todos</option>
            <option value="PP">PP — até 540 m²</option>
            <option value="MP">MP — até 2.000 m²</option>
            <option value="GP">GP — acima de 2.000 m²</option>
          </select>
          <select value={filtrosTriagem.usoSolo ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, usoSolo: (e.target.value || undefined) as FiltrosPilha["usoSolo"] }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Uso do Solo: todos</option>
            <option value="com">Com documento de Uso do Solo</option>
            <option value="sem">Sem documento de Uso do Solo</option>
          </select>
          <select value={filtrosTriagem.tag ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, tag: e.target.value || undefined }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Documento/resultado: todos</option>
            <option value="laudo">Com laudo</option>
            <option value="despacho">Com despacho</option>
            <option value="despacho_interno">Com despacho interno</option>
            <option value="indeferimento">Com indeferimento</option>
          </select>
          <select value={filtrosTriagem.analise?.toString() ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, analise: e.target.value ? Number(e.target.value) : undefined }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Análise: todas</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}ª análise</option>)}
          </select>
          <select value={filtrosTriagem.analisesMinimas?.toString() ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, analisesMinimas: e.target.value ? 2 : undefined }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Histórico: todos</option>
            <option value="2">2 ou mais análises</option>
          </select>
          <select value={filtrosTriagem.ordenar ?? ""}
            onChange={(e) => setFiltrosTriagem((atual) => ({ ...atual, ordenar: (e.target.value || undefined) as FiltrosPilha["ordenar"] }))}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)]">
            <option value="">Ordenar por padrão</option>
            <option value="area_asc">Menor área</option>
            <option value="area_desc">Maior área</option>
            <option value="analises_desc">Mais análises</option>
            <option value="analises_asc">Menos análises</option>
            <option value="data_desc">Mais novos</option>
            <option value="data_asc">Mais antigos</option>
          </select>
        </div>
      </section>

      {/* LISTA */}
      {carregando ? (
        <div className="text-[var(--text-muted)] text-sm text-center py-12">Carregando...</div>
      ) : processosVisiveis.length === 0 ? (
        <div className="text-[var(--text-muted)] text-sm text-center py-12">Nenhum processo encontrado.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {processosVisiveis.map((p) => {
            const proprietario = p.dados?.proprietario?.valor || "—";
            const numero = p.codigo || p.numero_sei || "—";
            const processoFisico = p.dados?.processoFisico?.valor;
            return (
              <div key={p.id} className={`border hover:border-[var(--border-strong)] rounded-xl p-4 flex items-center gap-4 transition-all ${p.lip_incompleto ? "bg-red-50 border-red-200" : "bg-[var(--card)] border-[var(--card-border)]"}`}>
                {/* Clicavel */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => abrirProcesso(p)}>
                  <p className="font-mono text-[var(--accent)] font-semibold text-sm">
                    {numero}
                    {processoFisico && <span className="text-[var(--text-muted)] font-normal"> · Físico: {processoFisico}</span>}
                  </p>
                  {Array.isArray(p.tags) && p.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(p.tags.filter((t, idx, arr) =>
                        arr.findIndex(x => x.tipo === t.tipo && (x.numero_analise ?? null) === (t.numero_analise ?? null)) === idx
                      )).map((t, i) => (
                        <span
                          key={t.id ?? `${t.tipo}-${i}`}
                          title={t.data ? `Emitido em ${t.data}` : undefined}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${TAG_COR[t.tipo]}`}
                        >
                          {rotuloTag(t)}
                          {formatarDataTag(t.data) && <span className="font-normal opacity-80">· {formatarDataTag(t.data)}</span>}
                          {souAdmin && t.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); removerTag(p.id, p.codigo, t.id!); }}
                              className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                              title="Remover tag">
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[var(--text-secondary)] text-sm mt-0.5 truncate">{proprietario}</p>
                  <div className="flex items-center gap-2 mt-0.5"><p className="text-[var(--text-muted)] text-xs">{nomeAnalista(p.analista_id)}</p></div>
                  {PROCESSOS_ANALISES_OCULTAS.has(numero) && (
                    <p title={AVISO_ANALISES_OCULTAS}
                      className="text-[var(--warning)] text-[11px] mt-1 leading-snug cursor-help">
                      ⚠ Análises anteriores a 21/07/2026 não entram na contagem — falha de gravação corrigida em 21/07/2026, 22:47. Registro antigo preservado no banco.
                    </p>
                  )}
                </div>

                {/* Tipo */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap hidden md:block ${TIPO_COR[p.tipo_processo] || "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                  {rotuloTipo(p.tipo_processo)}
                </span>

                {/* Situação — LIP, MAC e geral separados (lib/bdi/situacao.ts), não o
                    antigo processos.status. LIP/MAC escondidos em telas pequenas —
                    a geral já resume os dois; título de cada um traz o motivo. */}
                <div className="hidden lg:flex items-center gap-1">
                  <span title={p.situacao_lip_motivo ? `LIP: ${p.situacao_lip_motivo}` : undefined}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${p.situacao_lip ? SITUACAO_LIP_COR[p.situacao_lip] : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                    LIP: {p.situacao_lip || "—"}
                  </span>
                  <span title={p.situacao_mac_motivo ? `MAC: ${p.situacao_mac_motivo}` : undefined}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${p.situacao_mac ? SITUACAO_MAC_COR[p.situacao_mac] : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                    MAC: {p.situacao_mac || "—"}
                  </span>
                </div>
                <span
                  title={p.situacao_motivo}
                  className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${p.situacao_geral ? SITUACAO_COR[p.situacao_geral] : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                  {p.situacao_geral || "—"}
                </span>

                {/* Data */}
                <p className="text-[var(--text-muted)] text-xs whitespace-nowrap hidden lg:block">{formatar(p.atualizado_em)}</p>

                {/* Ações */}
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); abrirEditar(p); }}
                    title="Abrir LIP do processo"
                    className="bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] text-xs px-2 py-1 rounded transition-colors">
                    ✏️
                  </button>
                  <button onClick={() => deletar(p)} disabled={deletando === p.id}
                    className="bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-[var(--accent-fg)] disabled:opacity-50 text-[var(--error)] text-xs px-2 py-1 rounded transition-colors">
                    {deletando === p.id ? "..." : "🗑️"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL EDITAR */}
      {editando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">Editar Processo</h2>
              <button onClick={() => setEditando(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <p className="text-[var(--accent)] font-mono text-sm mb-4">{editando.codigo || editando.numero_sei}</p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Atribuir Analista</label>
                <select value={novoAnalista} onChange={(e) => setNovoAnalista(e.target.value)}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="">Sem analista</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome} — {u.perfil}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={salvarEdicao} disabled={salvando}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {salvando ? "Salvando..." : "💾 Salvar"}
              </button>
              <button onClick={() => setEditando(null)}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* AVISO LIP NÃO PREENCHIDO */}
      {avisoLipVazio && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-[var(--text-primary)] font-bold text-lg mb-2">LIP não preenchido</h2>
            <p className="text-[var(--text-muted)] text-sm mb-5">
              O LIP deste processo ainda não foi preenchido. Preencha o LIP antes de acessar o MAC.
            </p>
            <button
              onClick={() => setAvisoLipVazio(false)}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-bold px-6 py-2 rounded-lg text-sm transition-colors w-full">
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* AVISO LIP NÃO PREENCHIDO */}
      {avisoLipVazio && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-[var(--text-primary)] font-bold text-lg mb-2">LIP não preenchido</h2>
            <p className="text-[var(--text-muted)] text-sm mb-5">
              O LIP deste processo ainda não foi preenchido. Preencha o LIP antes de acessar o MAC.
            </p>
            <button
              onClick={() => setAvisoLipVazio(false)}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-bold px-6 py-2 rounded-lg text-sm transition-colors w-full">
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );

}

export default function ProcessosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-muted)]">Carregando...</div>}>
      <ProcessosConteudo />
    </Suspense>
  );
}
