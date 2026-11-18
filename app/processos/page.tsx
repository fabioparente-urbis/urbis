"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { aplicarFiltrosLocais, queryParaFiltros, type FiltrosPilha } from "@/lib/urbi/navegacao";
import CaixaFiltros, { type OpcaoFiltro, type ChipAtivo } from "@/components/pilha/CaixaFiltros";
import { useRouter } from "next/navigation";
import LembreteProcesso, { type Lembrete } from "@/components/pilha/LembreteProcesso";
import { isPerfilIrrestrito, PERFIS_GERENCIA } from "@/lib/perfis";
import { explicarTag } from "@/lib/urbi/explicarTag";
import { BotaoCondicaoUrbi, type CondicaoUrbi } from "@/components/pilha/CondicaoUrbi";

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
  /** Só vem preenchido quando situacao_mac já é "Aguardando retorno do interessado" — dias
   *  corridos desde o documento que abriu o prazo (vw_bdi_aguardando_retorno). */
  dias_aguardando_retorno?: number | null;
  /** Esforço/pendências do retrato mais recente do Radar (urbi_radar_retratos) — Fase 2 do plano
   *  Assessor Ativo, 07/09/2026. Nenhum cálculo novo, mesma fonte do chat do URBI. */
  esforco_provavel?: string | null;
  pendencias_radar?: number | null;
  /** Ação tier 1 do Motor de Produção (a que impede emitir/seguir) e o motivo dela, do mesmo
   *  retrato do Radar — 08/09/2026, pra tag da Pilha poder pedir explicação ao URBI. */
  tem_acao_bloqueante?: boolean;
  acao_bloqueante_texto?: string | null;
  acao_bloqueante_motivo?: string | null;
  /** Números de documento deste processo que existem no MDP (`/api/processos`, 08/09/2026). */
  documentos_mdp?: string[];
  /** Despacho/parecer emitido e ainda não confirmado como enviado ao SEI (Slots 2-5). */
  nao_enviado_sei?: boolean;
  /** "Finalizar LIP" (08/09/2026) — analista decidiu parar por aqui e seguir pro MAC. */
  lip_finalizado?: boolean;
  /** Carimbo "Finalizado" (10/09/2026, lib/bdi/situacao.ts) — laudo emitido ou indeferido/
   *  arquivado há mais de 15 dias. Some dos filtros padrão; só aparece com "Mostrar finalizados". */
  finalizado?: boolean;
  dias_desde_finalizacao?: number | null;
  /** Condições bloqueantes do URBI não dispensadas (18/11/2026, lib/urbi/condicoesProcesso.ts). */
  condicoes_urbi?: CondicaoUrbi[];
};

type SituacaoGeral =
  | "Arquivado/indeferido"
  | "Encerrado"
  | "Aguardando retorno do interessado"
  | "MAC em análise"
  | "LIP pendente"
  | "Em cadastro";

type SituacaoLip = "Não iniciado" | "Incompleto" | "Completo";
type SituacaoMac = "Não iniciado" | "Em análise" | "Aguardando retorno do interessado" | "Encerrado" | "Arquivado/indeferido";

const SITUACAO_OPCOES: SituacaoGeral[] = [
  "Em cadastro", "LIP pendente", "MAC em análise",
  "Aguardando retorno do interessado", "Encerrado", "Arquivado/indeferido",
];

const SITUACAO_COR: Record<SituacaoGeral, string> = {
  "Em cadastro": "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
  "LIP pendente": "bg-[var(--warning-bg)] text-[var(--warning)]",
  "MAC em análise": "bg-[var(--accent)] text-[var(--accent-fg)]",
  "Aguardando retorno do interessado": "bg-[var(--ia-bg)] text-[var(--ia)]",
  "Encerrado": "bg-[var(--success-bg)] text-[var(--success)]",
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
  "Encerrado": "bg-[var(--success-bg)] text-[var(--success)]",
  "Arquivado/indeferido": "bg-[var(--error-bg)] text-[var(--error)]",
};

// Camada 6 da arquitetura mestra do URBI (05/09/2026): alerta de prazo de retorno do
// interessado, sobre o dado que já existe (vw_bdi_aguardando_retorno, via /api/processos) —
// nunca um prazo inventado, só os 2 limiares pedidos. Pulso visual só no âmbar (175–179); o
// vermelho (180+) é alerta forte e estático — "prazo atingido" nunca arquiva sozinho, só sugere.
const LIMIAR_ALERTA_DIAS = 175;
const LIMIAR_PRAZO_ATINGIDO_DIAS = 180;

// A view guarda dias corridos com casa decimal (ex.: 44.5 — a diferença exata em horas desde o
// documento-fonte). Pro badge, dia corrido é sempre inteiro; floor (não round) porque "175 dias"
// só deve acender quando 175 dias JÁ se passaram de verdade, nunca antecipado por arredondamento.
function diasInteiros(dias: number | null | undefined): number | null {
  return dias == null ? null : Math.floor(dias);
}

function corBadgeRetorno(dias: number | null | undefined): string {
  const d = diasInteiros(dias);
  if (d == null) return SITUACAO_MAC_COR["Aguardando retorno do interessado"];
  if (d >= LIMIAR_PRAZO_ATINGIDO_DIAS) return "bg-[var(--error-bg)] text-[var(--error)]";
  if (d >= LIMIAR_ALERTA_DIAS) return "bg-[var(--warning-bg)] text-[var(--warning)] animate-pulse";
  return SITUACAO_MAC_COR["Aguardando retorno do interessado"];
}

/**
 * Padronizado em 08/09/2026 (pedido do Fábio: "tem duas tags muito parecidas... o correto é a
 * primeira") — sem contagem de dias (`dias_aguardando_retorno` não veio, ver
 * vw_bdi_aguardando_retorno em /api/processos), o rótulo curto continua igual, só sem o número.
 * Nunca mais a forma longa "Aguardando retorno do interessado" nesta badge.
 */
function textoBadgeRetorno(dias: number | null | undefined): string {
  const d = diasInteiros(dias);
  return d != null ? `Aguardando retorno · ${d} dia${d === 1 ? "" : "s"}` : "Aguardando retorno";
}

function tituloBadgeRetorno(dias: number | null | undefined, motivo?: string): string | undefined {
  const d = diasInteiros(dias);
  if (d == null) return motivo;
  if (d >= LIMIAR_PRAZO_ATINGIDO_DIAS) return `MAC: prazo atingido (${d} dias) — avaliar arquivamento conforme fluxo aplicável.`;
  if (d >= LIMIAR_ALERTA_DIAS) return `MAC: se aproximando do prazo de avaliação (${d} de ${LIMIAR_PRAZO_ATINGIDO_DIAS} dias).`;
  return motivo;
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


// Cor por slot (18/11/2026): antes só os slugs antigos tinham cor e os Slots 3, 4 e 5 ficavam
// cinza. Só variáveis do tema — claro e escuro iguais.
const TIPO_COR: Record<string, string> = {
  regularizacao: "bg-[var(--ia-bg)] text-[var(--ia)]",
  aceite_sei: "bg-[var(--accent)] text-[var(--accent-fg)]",
  slot_03: "bg-[var(--ia-bg)] text-[var(--ia)] ring-1 ring-inset ring-[var(--ia)]",
  slot_04: "bg-[var(--bg-secondary)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]",
  slot_05: "bg-[var(--warning-bg)] text-[var(--warning)]",
  aprovacao_pp: "bg-[var(--warning-bg)] text-[var(--warning)]",
  aprovacao_mp: "bg-[var(--warning-bg)] text-[var(--warning)]",
};

const TIPO_ROTULO: Record<string, string> = {
  regularizacao: "Regularização SEI",
  aceite_sei: "Aceite SEI",
  slot_03: "Regularização PED",
  slot_04: "Aceite PED",
  slot_05: "Aprovação de Projeto",
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

/**
 * Abas rápidas da Pilha nova (18/11/2026) — resolvem num clique o que antes pedia 2-3 filtros.
 * "Não enviado ao SEI" substitui a caixinha solta (T5); "Finalizados" substitui o filtro
 * "Mostrar finalizados". Recorte sobre a lista que a API já autorizou, nunca amplia acesso.
 */
type Aba = "todos" | "agora" | "aguardando" | "condicao" | "sei" | "finalizados";
const ABAS: { id: Aba; rotulo: string; dica: string }[] = [
  { id: "todos", rotulo: "Todos", dica: "Todos os processos em andamento (sem os finalizados)." },
  { id: "agora", rotulo: "Para fazer agora", dica: "Em cadastro, LIP pendente ou MAC em análise." },
  { id: "aguardando", rotulo: "Aguardando interessado", dica: "Despacho emitido, esperando o retorno do interessado." },
  { id: "condicao", rotulo: "Condição do URBI", dica: "O URBI achou uma condição bloqueante que ainda não foi dispensada." },
  { id: "sei", rotulo: "Não enviado ao SEI", dica: "Documento emitido e ainda não confirmado como enviado ao SEI." },
  { id: "finalizados", rotulo: "Finalizados", dica: "Laudo emitido ou indeferido/arquivado há mais de 15 dias." },
];
const SITUACOES_AGORA = new Set<string>(["Em cadastro", "LIP pendente", "MAC em análise"]);

function naAba(p: Processo, aba: Aba): boolean {
  switch (aba) {
    case "todos": return true;
    case "agora": return !!p.situacao_geral && SITUACOES_AGORA.has(p.situacao_geral);
    case "aguardando": return p.situacao_mac === "Aguardando retorno do interessado";
    case "condicao": return (p.condicoes_urbi?.length ?? 0) > 0;
    case "sei": return !!p.nao_enviado_sei;
    case "finalizados": return !!p.finalizado;
  }
}

/** Faixa colorida à esquerda do card: a urgência bate o olho sem ler nada. */
function urgencia(p: Processo): "alta" | "media" | null {
  const d = p.situacao_mac === "Aguardando retorno do interessado" ? diasInteiros(p.dias_aguardando_retorno) : null;
  if (p.nao_enviado_sei || (p.condicoes_urbi?.length ?? 0) > 0 || (d != null && d >= LIMIAR_PRAZO_ATINGIDO_DIAS)) return "alta";
  if ((d != null && d >= LIMIAR_ALERTA_DIAS) || p.situacao_lip === "Incompleto") return "media";
  return null;
}

/** Selo único (T7): a situação geral; LIP e MAC separados ficam no "passar o mouse". */
function textoSelo(p: Processo): string {
  if (p.situacao_mac === "Aguardando retorno do interessado") return textoBadgeRetorno(p.dias_aguardando_retorno);
  return p.situacao_geral ?? "—";
}
function corSelo(p: Processo): string {
  if (p.situacao_mac === "Aguardando retorno do interessado") return corBadgeRetorno(p.dias_aguardando_retorno);
  return p.situacao_geral ? SITUACAO_COR[p.situacao_geral] : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]";
}
function tituloSelo(p: Processo): string {
  const lip = `LIP: ${p.situacao_lip ?? "—"}${p.lip_finalizado ? " (finalizado)" : ""}${p.situacao_lip_motivo ? ` — ${p.situacao_lip_motivo}` : ""}`;
  const macBase = `MAC: ${p.situacao_mac ?? "—"}${p.situacao_mac_motivo ? ` — ${p.situacao_mac_motivo}` : ""}`;
  const mac = p.situacao_mac === "Aguardando retorno do interessado"
    ? (tituloBadgeRetorno(p.dias_aguardando_retorno, macBase) ?? macBase) : macBase;
  return `${lip}\n${mac}\n\nClique para o URBI explicar.`;
}

const CHAVE_MEMORIA = "urbis:pilha:filtros:v1";
type Memoria = { aba?: Aba; tipo?: string; situacao?: string; analista?: string; triagem?: FiltrosPilha };
function lerMemoria(): Memoria {
  try { return JSON.parse(localStorage.getItem(CHAVE_MEMORIA) ?? "{}") ?? {}; } catch { return {}; }
}
function gravarMemoria(m: Memoria) {
  try { localStorage.setItem(CHAVE_MEMORIA, JSON.stringify(m)); } catch { /* sem memória, sem problema */ }
}

// useSearchParams obriga fronteira de Suspense (o Next avisa no build, não em
// tempo de execução). O conteúdo real vive aqui dentro; o export só embrulha.
function ProcessosConteudo() {
  const router = useRouter();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [cortado, setCortado] = useState<{ limite: number } | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const searchParams = useSearchParams();
  const [filtrosUrl, setFiltrosUrl] = useState<FiltrosPilha>({});
  const [filtrosTriagem, setFiltrosTriagem] = useState<FiltrosPilha>({});
  const [situacao, setSituacao] = useState("");
  const [analista, setAnalista] = useState("");
  const [aba, setAba] = useState<Aba>("todos");
  const [memoriaPronta, setMemoriaPronta] = useState(false);
  const [deletando, setDeletando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Processo | null>(null);
  const [novoAnalista, setNovoAnalista] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [tagsAbertas, setTagsAbertas] = useState<Set<string>>(new Set());
  const [perfil, setPerfil] = useState<string | null>(null);
  const [perfisUsuario, setPerfisUsuario] = useState<string[]>([]);
  const irrestrito = isPerfilIrrestrito(perfisUsuario.length > 0 ? perfisUsuario : perfil);
  const ehGerente = perfisUsuario.some((p) => (PERFIS_GERENCIA as readonly string[]).includes(p));
  const podeFiltrarAnalista = irrestrito || ehGerente;
  const souAdmin = perfisUsuario.includes("Administrador");
  const [avisoLipVazio, setAvisoLipVazio] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const [assuntos, setAssuntos] = useState<{ id: string; slug: string; nome: string; ativo: boolean }[]>([]);
  useEffect(() => {
    fetch("/api/admin/assuntos")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setAssuntos(j.data ?? []); })
      .catch(() => { /* filtro cai no fallback estático */ });
  }, []);
  const rotuloTipo = (slug: string | null | undefined) =>
    assuntos.find((a) => a.slug === slug)?.nome ?? TIPO_ROTULO[slug ?? ""] ?? slug ?? "—";

  async function removerTag(processoId: string, codigo: string, t: ProcessoTag) {
    // Antes: um clique no × apagava a tag na hora (defeito 8 do estudo de 18/11/2026).
    if (!confirm(`Remover a tag "${rotuloTag(t)}" do processo ${codigo}?\n\nO documento não é apagado — só a marcação na Pilha.`)) return;
    await fetch("/api/processo/tag", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, tagId: t.id }),
    });
    setProcessos((prev) =>
      prev.map((p) => p.id === processoId ? { ...p, tags: (p.tags ?? []).filter((x) => x.id !== t.id) } : p)
    );
  }

  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  useEffect(() => {
    fetch("/api/processo/lembrete").then((r) => r.json()).then((j) => { if (j.ok) setLembretes(j.lembretes); }).catch(() => {});
  }, []);
  function lembreteSalvo(codigo: string, texto: string) {
    setLembretes((prev) => {
      const resto = prev.filter((l) => !(l.processo === codigo && l.meu));
      return texto ? [...resto, { id: `meu-${codigo}`, processo: codigo, autor: "", texto, atualizadoEm: new Date().toISOString(), meu: true }] : resto;
    });
  }

  function condicaoDispensada(codigo: string, condicaoId: string) {
    setProcessos((prev) => prev.map((p) => p.codigo === codigo
      ? { ...p, condicoes_urbi: (p.condicoes_urbi ?? []).filter((c) => c.condicao_id !== condicaoId) } : p));
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
      if (json.ok) {
        setProcessos(json.data);
        setCortado(json.cortado ? { limite: json.limite ?? json.data.length } : null);
      }
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
  useEffect(() => { if (memoriaPronta) carregar(); }, [busca, tipo, situacao, analista, memoriaPronta]);

  // A URL manda nos campos (URBI / Briefing da Home). Sem nada na URL, a Pilha volta como a
  // pessoa deixou da última vez (memória por navegador, 18/11/2026).
  useEffect(() => {
    const qs = searchParams?.toString() ?? "";
    const f = queryParaFiltros(new URLSearchParams(qs));
    const temUrl = Object.keys(f).length > 0 && qs.replace(/(^|&)destino=[^&]*/, "").length > 0;
    if (temUrl) {
      setFiltrosUrl(f);
      setFiltrosTriagem({});
      setBusca(f.busca ?? "");
      setTipo(f.tipo ?? "");
      setAba(f.mostrarFinalizados ? "finalizados" : "todos");
    } else {
      const m = lerMemoria();
      setFiltrosUrl({});
      setFiltrosTriagem(m.triagem ?? {});
      setBusca("");
      setTipo(m.tipo ?? "");
      setSituacao(m.situacao ?? "");
      setAnalista(m.analista ?? "");
      setAba(m.aba ?? "todos");
    }
    setMemoriaPronta(true);
  }, [searchParams]);

  useEffect(() => {
    if (!memoriaPronta) return;
    gravarMemoria({ aba, tipo, situacao, analista, triagem: filtrosTriagem });
  }, [aba, tipo, situacao, analista, filtrosTriagem, memoriaPronta]);

  // Atalho "/" foca a busca (fora de campo de texto).
  useEffect(() => {
    function onTecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      if (e.key === "/" && !digitando) {
        e.preventDefault();
        document.getElementById("pilha-busca")?.focus();
      }
    }
    window.addEventListener("keydown", onTecla);
    return () => window.removeEventListener("keydown", onTecla);
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = () => setMenuAberto(null);
    window.addEventListener("click", fechar);
    return () => window.removeEventListener("click", fechar);
  }, [menuAberto]);

  const filtrosAtivos: FiltrosPilha = { ...filtrosUrl, ...filtrosTriagem };
  // Base de todas as abas: os filtros da caixa aplicados, finalizados incluídos — cada aba decide.
  const base = (aplicarFiltrosLocais(processos as any[], { ...filtrosAtivos, mostrarFinalizados: true }) as typeof processos);
  const contagem = useMemo(() => {
    const c = {} as Record<Aba, number>;
    for (const a of ABAS) {
      c[a.id] = base.filter((p) => naAba(p, a.id) && (a.id === "finalizados" || filtrosAtivos.mostrarFinalizados || !p.finalizado)).length;
    }
    return c;
  }, [base, filtrosAtivos.mostrarFinalizados]);
  const processosVisiveis = base.filter((p) =>
    naAba(p, aba) && (aba === "finalizados" || filtrosAtivos.mostrarFinalizados || !p.finalizado));

  function limparTriagem() {
    setFiltrosTriagem({});
    setFiltrosUrl({});
    setBusca(""); setTipo(""); setSituacao(""); setAnalista("");
    setAba("todos");
    if (searchParams && searchParams.toString()) router.push("/processos");
  }

  /**
   * Catálogo da caixa de filtros. Pilha nova (18/11/2026): as opções retiradas com autorização
   * do Fábio (T1 esforço/ação bloqueante/pronto pra despachar — Radar pausado; T2 triagem; T3
   * área no LIP; T4 1ª..5ª análise) ficam `oculto`: não aparecem no painel, mas se o URBI pedir
   * pela conversa viram etiqueta removível — nunca filtro invisível.
   */
  const catalogoFiltros: OpcaoFiltro[] = useMemo(() => {
    const t = (chave: string, valor: unknown, grupo: string, rotulo: string, oculto = false): OpcaoFiltro =>
      ({ id: `triagem:${chave}:${String(valor)}`, grupo, rotulo, alvo: "triagem", chave, valor, oculto });

    return [
      ...SITUACAO_OPCOES.map((s): OpcaoFiltro =>
        ({ id: `situacao::${s}`, grupo: "Situação", rotulo: s, alvo: "situacao", valor: s })),

      t("lipInacabado", true, "Andamento", "Só LIP inacabado"),
      t("macInacabado", true, "Andamento", "Só MAC inacabado"),
      t("mostrarFinalizados", true, "Andamento", "Incluir finalizados"),
      t("acaoBloqueante", true, "Andamento", "Com ação bloqueante (Radar)", true),
      t("prontoParaDespachar", true, "Andamento", "Pronto pra despachar (Radar)", true),

      t("tag", "laudo", "Documento", "Com laudo"),
      t("tag", "despacho", "Documento", "Com despacho"),
      t("tag", "despacho_interno", "Documento", "Com despacho interno"),
      t("tag", "indeferimento", "Documento", "Com indeferimento"),

      t("porte", "PP", "Porte", "PP — até 540 m²"),
      t("porte", "MP", "Porte", "MP — até 2.000 m²"),
      t("porte", "GP", "Porte", "GP — acima de 2.000 m²"),
      t("faixaArea", "ate_250", "Área no LIP", "Até 250 m²", true),
      t("faixaArea", "de_251_a_1000", "Área no LIP", "De 251 a 1.000 m²", true),
      t("faixaArea", "acima_1000", "Área no LIP", "Acima de 1.000 m²", true),

      ...assuntos.filter((a) => a.ativo).map((a): OpcaoFiltro =>
        ({ id: `tipo::${a.slug}`, grupo: "Tipo de processo", rotulo: a.nome, alvo: "tipo", valor: a.slug })),

      t("usoSolo", "com", "Uso do Solo", "Com documento de Uso do Solo"),
      t("usoSolo", "sem", "Uso do Solo", "Sem documento de Uso do Solo"),

      t("classificacaoVigia", "mais simples para análise", "Classificação", "🧭 Mais simples para análise"),
      t("classificacaoVigia", "exige atenção", "Classificação", "🧭 Exige atenção"),
      t("classificacaoVigia", "maior risco de retrabalho", "Classificação", "🧭 Maior risco de retrabalho"),

      t("analisesMinimas", 2, "Análise", "2 ou mais análises"),
      ...[1, 2, 3, 4, 5].map((n) => t("analise", n, "Análise", `${n}ª análise`, true)),
      t("triagem", "mais_simples", "Triagem", "Mais simples para começar", true),

      ...(podeFiltrarAnalista
        ? usuarios.map((u): OpcaoFiltro =>
            ({ id: `analista::${u.id}`, grupo: "Analista", rotulo: u.nome, alvo: "analista", valor: u.id }))
        : []),

      // Ordenar tem botão próprio ao lado da caixa; aqui só para virar etiqueta se vier da URL.
      t("ordenar", "esforco", "Ordenar", "Esforço (Radar)", true),
      ...ORDENS.map((o) => t("ordenar", o.valor, "Ordenar", o.rotulo, true)),
    ];
  }, [assuntos, usuarios, podeFiltrarAnalista]);

  const chipsAtivos: ChipAtivo[] = useMemo(() => {
    const chips: ChipAtivo[] = [];
    if (busca) chips.push({ id: "busca", rotulo: `“${busca}”` });
    for (const opcao of catalogoFiltros) {
      if (opcao.alvo === "tipo" && tipo === opcao.valor) chips.push({ id: opcao.id, rotulo: opcao.rotulo });
      if (opcao.alvo === "situacao" && situacao === opcao.valor) chips.push({ id: opcao.id, rotulo: opcao.rotulo });
      if (opcao.alvo === "analista" && analista === opcao.valor) chips.push({ id: opcao.id, rotulo: opcao.rotulo });
      if (opcao.alvo === "triagem" && opcao.chave) {
        const chave = opcao.chave as keyof FiltrosPilha;
        if (chave === "busca" || chave === "tipo") continue;
        // A ordem escolhida no botão "Ordenar" não vira etiqueta; a que veio do URBI vira.
        if (chave === "ordenar" && filtrosTriagem.ordenar !== undefined) continue;
        if (filtrosAtivos[chave] === opcao.valor) {
          chips.push({
            id: opcao.id,
            rotulo: opcao.rotulo,
            doUrbi: filtrosUrl[chave] !== undefined && filtrosTriagem[chave] === undefined,
          });
        }
      }
    }
    return chips;
  }, [catalogoFiltros, busca, tipo, situacao, analista, filtrosAtivos, filtrosUrl, filtrosTriagem]);

  function aplicarOpcao(opcao: OpcaoFiltro) {
    if (opcao.alvo === "tipo") return setTipo(String(opcao.valor));
    if (opcao.alvo === "situacao") return setSituacao(String(opcao.valor));
    if (opcao.alvo === "analista") return setAnalista(String(opcao.valor));
    setFiltrosTriagem((atual) => ({ ...atual, [opcao.chave!]: opcao.valor }));
  }

  function removerChip(chip: ChipAtivo) {
    if (chip.id === "busca") return setBusca("");
    const opcao = catalogoFiltros.find((o) => o.id === chip.id);
    if (!opcao) return;
    if (opcao.alvo === "tipo") return setTipo("");
    if (opcao.alvo === "situacao") return setSituacao("");
    if (opcao.alvo === "analista") return setAnalista("");
    const chave = opcao.chave!;
    setFiltrosTriagem((atual) => ({ ...atual, [chave]: undefined }));
    setFiltrosUrl((atual) => ({ ...atual, [chave]: undefined }));
  }

  async function deletar(p: Processo) {
    const num = p.codigo || p.numero_sei;
    // Texto corrigido em 18/11/2026: o processo vai para a lixeira, de onde o admin restaura.
    if (!confirm(`Enviar o processo ${num} para a lixeira?\n\nEle some da Pilha, mas o Administrador pode restaurá-lo em Admin → Lixeira.`)) return;
    setDeletando(p.id);
    try {
      const res = await fetch("/api/processos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const json = await res.json();
      if (json.ok) await carregar();
      else alert("Erro ao enviar para a lixeira: " + json.erro);
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
      fetch(`/api/processo/lip-preenchido?codigo=${encodeURIComponent(id)}&tipo=${encodeURIComponent(tipoNorm)}`)
        .then(r => r.json())
        .then(({ preenchido }) => {
          if (preenchido) {
            // Slots 3 e 4 (PED, 16/10/2026) vão para a tela do MAC PRÓPRIA. Os demais seguem
            // exatamente como antes (achado à parte: Slot 2 e 5 também caem aqui na tela da
            // Regularização — defeito 6 do estudo de 18/11/2026, não corrigido sem pedido por slot).
            const telaMac = tipoNorm === "slot_03" ? "/analise-regularizacao-ped"
              : tipoNorm === "slot_04" ? "/analise-aceite-ped"
              : "/analise-regularizacao";
            router.push(`${telaMac}/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipoNorm)}`);
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
    if (!id) return "Sem analista";
    return usuarios.find((u) => u.id === id)?.nome || "—";
  }

  /** Setas ↑/↓ andam entre os cards; Enter abre. */
  function aoTeclarCard(e: React.KeyboardEvent<HTMLDivElement>, p: Processo) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") { e.preventDefault(); abrirProcesso(p); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const cards = Array.from(listaRef.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []);
    const i = cards.indexOf(e.currentTarget);
    cards[e.key === "ArrowDown" ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0)]?.focus();
  }

  function explicar(mensagem: string, acoes?: { rotulo: string; href: string }[]) {
    window.dispatchEvent(new CustomEvent("urbi:explicar", { detail: { mensagem, acoes } }));
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-6">
      {/* CABEÇALHO */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push("/")}
            className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            ← Home
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">Pilha de Processos</h1>
            <p className="text-[var(--text-muted)] text-sm">
              {carregando ? "Carregando..." : `${processosVisiveis.length} de ${processos.length} processo(s)`}
            </p>
          </div>
        </div>
      </div>

      {cortado && (
        <p className="mb-3 text-xs rounded-lg px-3 py-2 bg-[var(--warning-bg)] text-[var(--warning)]">
          A lista mostra os {cortado.limite} processos atualizados mais recentemente. Use a busca ou os filtros para achar os mais antigos.
        </p>
      )}

      {/* ABAS RÁPIDAS */}
      <div role="tablist" aria-label="Recortes da Pilha" className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        {ABAS.map((a) => {
          const ativa = aba === a.id;
          const n = contagem[a.id] ?? 0;
          const alerta = (a.id === "sei" || a.id === "condicao") && n > 0;
          return (
            <button key={a.id} role="tab" aria-selected={ativa} title={a.dica}
              onClick={() => setAba(a.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                ativa
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
              }`}>
              {a.id === "condicao" && <img src="/urbi/poses/urbi-atencao.png" alt="" className="w-4 h-4 object-contain" />}
              {a.rotulo}
              <span className={`text-xs px-1.5 rounded-full ${
                ativa ? "bg-black/15" : alerta ? "bg-[var(--error-bg)] text-[var(--error)] font-bold" : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
              }`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* FILTROS + ORDENAR */}
      <div className="flex flex-col sm:flex-row gap-2 mb-1">
        <CaixaFiltros
          catalogo={catalogoFiltros}
          ativos={chipsAtivos}
          buscaAtual={busca}
          onAplicar={aplicarOpcao}
          onRemover={removerChip}
          onBuscar={setBusca}
          onLimpar={limparTriagem} />
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] shrink-0">
          <span className="sr-only sm:not-sr-only">Ordenar</span>
          <select value={filtrosTriagem.ordenar ?? ""}
            onChange={(e) => setFiltrosTriagem((f) => ({ ...f, ordenar: (e.target.value || undefined) as FiltrosPilha["ordenar"] }))}
            className="h-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <option value="">Últimos atualizados</option>
            {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4 px-1">
        Filtros por fatos registrados. “Mais simples” não é previsão de aprovação. Atalho: <kbd className="px-1 rounded border border-[var(--border)]">/</kbd> busca, <kbd className="px-1 rounded border border-[var(--border)]">↑</kbd><kbd className="px-1 rounded border border-[var(--border)]">↓</kbd> + Enter abre.
      </p>

      {/* LISTA */}
      {carregando ? (
        <div className="text-[var(--text-muted)] text-sm text-center py-12">Carregando...</div>
      ) : processosVisiveis.length === 0 ? (
        <div className="text-[var(--text-muted)] text-sm text-center py-12">Nenhum processo neste recorte.</div>
      ) : (
        <div ref={listaRef} className="flex flex-col gap-2">
          {processosVisiveis.map((p) => {
            const proprietario = p.dados?.proprietario?.valor || "Interessado não informado";
            const numero = p.codigo || p.numero_sei || "—";
            const processoFisico = p.dados?.processoFisico?.valor;
            const urg = urgencia(p);
            const tags = Array.isArray(p.tags)
              ? p.tags.filter((t, idx, arr) =>
                  arr.findIndex(x => x.tipo === t.tipo && (x.numero_analise ?? null) === (t.numero_analise ?? null)) === idx)
              : [];
            const todasTags = tagsAbertas.has(p.id);
            const tagsMostradas = todasTags ? tags : tags.slice(-1);
            const condicoes = p.condicoes_urbi ?? [];
            return (
              <div key={p.id} data-card tabIndex={0}
                onClick={() => abrirProcesso(p)}
                onKeyDown={(e) => aoTeclarCard(e, p)}
                className={`relative cursor-pointer rounded-xl border bg-[var(--card)] border-[var(--card-border)] hover:border-[var(--border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] pl-4 pr-3 py-3 transition-colors overflow-hidden ${p.finalizado ? "opacity-75" : ""}`}>
                {/* Faixa de urgência */}
                <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${
                  urg === "alta" ? "bg-[var(--error)]" : urg === "media" ? "bg-[var(--warning)]" : "bg-transparent"
                }`} />

                {/* Linha 1 — número · tipo · selo · URBI · SEI · data · ⋯ */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[var(--accent)] font-semibold text-sm">{numero}</span>
                  {processoFisico && <span className="text-[var(--text-muted)] text-xs">Físico {processoFisico}</span>}
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); explicar(explicarTag({ familia: "tipo", valor: p.tipo_processo })); }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap hover:ring-2 hover:ring-[var(--accent)] ${TIPO_COR[p.tipo_processo] || "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                    {rotuloTipo(p.tipo_processo)}
                  </button>
                  <button type="button" title={tituloSelo(p)}
                    onClick={(e) => {
                      e.stopPropagation();
                      const macComecou = p.situacao_mac && p.situacao_mac !== "Não iniciado";
                      explicar(macComecou
                        ? explicarTag({ familia: "mac", valor: p.situacao_mac!, motivo: p.situacao_mac_motivo, diasAguardando: p.dias_aguardando_retorno })
                        : explicarTag({ familia: "lip", valor: p.situacao_lip || "—", motivo: p.situacao_lip_motivo, marcadoManualmente: !!p.lip_incompleto, finalizado: !!p.lip_finalizado }));
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap hover:ring-2 hover:ring-[var(--accent)] ${corSelo(p)}`}>
                    {textoSelo(p)}
                  </button>
                  <BotaoCondicaoUrbi codigo={p.codigo} condicoes={condicoes} podeDispensar
                    onDispensada={(id) => condicaoDispensada(p.codigo, id)} />
                  {p.nao_enviado_sei && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[var(--error-bg)] text-[var(--error)] border border-[var(--error)]">
                      NÃO ENVIADO AO SEI
                    </span>
                  )}
                  {p.finalizado && (
                    <span title={`Laudo emitido ou indeferido/arquivado há ${p.dias_desde_finalizacao ?? "15+"} dias.`}
                      className="text-[11px] font-bold px-2 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border)]">
                      🏁 Finalizado
                    </span>
                  )}
                  {PROCESSOS_ANALISES_OCULTAS.has(numero) && (
                    <span title={AVISO_ANALISES_OCULTAS} onClick={(e) => e.stopPropagation()}
                      className="text-[var(--warning)] text-xs cursor-help">ⓘ</span>
                  )}

                  <span className="ml-auto text-[var(--text-muted)] text-xs whitespace-nowrap hidden sm:inline">{formatar(p.atualizado_em)}</span>
                  <div className="relative">
                    <button type="button" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuAberto === p.id}
                      onClick={(e) => { e.stopPropagation(); setMenuAberto((m) => m === p.id ? null : p.id); }}
                      className="w-8 h-8 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] text-lg leading-none">
                      ⋯
                    </button>
                    {menuAberto === p.id && (
                      <div role="menu" onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg p-1">
                        <button role="menuitem" onClick={() => { setMenuAberto(null); abrirProcesso(p); }}
                          className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)]">Abrir LIP</button>
                        {podeFiltrarAnalista && (
                          <button role="menuitem" onClick={() => { setMenuAberto(null); abrirEditar(p); }}
                            className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)]">Trocar analista</button>
                        )}
                        <button role="menuitem" disabled={deletando === p.id}
                          onClick={() => { setMenuAberto(null); deletar(p); }}
                          className="w-full text-left text-sm px-3 py-2 rounded-lg text-[var(--error)] hover:bg-[var(--error-bg)] disabled:opacity-50">
                          {deletando === p.id ? "Enviando..." : "Enviar para a lixeira"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Linha 2 — interessado · analista */}
                <p className="text-sm mt-1 truncate">
                  <span className="text-[var(--text-primary)]">{proprietario}</span>
                  <span className="text-[var(--text-muted)]"> · {nomeAnalista(p.analista_id)}</span>
                </p>

                {/* Linha 3 — documentos · lembrete */}
                {(tags.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {tagsMostradas.map((t, i) => {
                      const noMdp = !!(t.numero_despacho && p.documentos_mdp?.includes(t.numero_despacho));
                      return (
                        <span key={t.id ?? `${t.tipo}-${i}`}
                          title={t.data ? `Emitido em ${formatarDataTag(t.data)}` : undefined}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${TAG_COR[t.tipo]}`}>
                          <button type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              explicar(explicarTag({
                                familia: "documento", tipo: t.tipo, numero: t.numero_despacho ?? null,
                                numeroAnalise: t.numero_analise ?? null, data: formatarDataTag(t.data) ?? t.data ?? null, noMdp,
                              }), noMdp
                                ? [{ rotulo: "Abrir no MDP", href: `/mdp/${encodeURIComponent(p.codigo)}?numero=${encodeURIComponent(t.numero_despacho!)}` }]
                                : undefined);
                            }}
                            className="hover:underline decoration-dotted underline-offset-2">
                            {rotuloTag(t)}
                            {formatarDataTag(t.data) && <span className="font-normal opacity-80"> · {formatarDataTag(t.data)}</span>}
                          </button>
                          {souAdmin && t.id && (
                            <button onClick={(e) => { e.stopPropagation(); removerTag(p.id, p.codigo, t); }}
                              className="ml-0.5 opacity-60 hover:opacity-100" title="Remover tag (pede confirmação)">×</button>
                          )}
                        </span>
                      );
                    })}
                    {tags.length > 1 && (
                      <button type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagsAbertas((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; });
                        }}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">
                        {todasTags ? "menos" : `+${tags.length - 1}`}
                      </button>
                    )}
                  </div>
                )}
                <LembreteProcesso codigo={p.codigo} lembretes={lembretes.filter((l) => l.processo === p.codigo)} onSalvo={lembreteSalvo} />
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL TROCAR ANALISTA */}
      {editando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">Trocar analista</h2>
              <button onClick={() => setEditando(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <p className="text-[var(--accent)] font-mono text-sm mb-4">{editando.codigo || editando.numero_sei}</p>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Analista</label>
              <select value={novoAnalista} onChange={(e) => setNovoAnalista(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <option value="">Sem analista</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome} — {u.perfil}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={salvarEdicao} disabled={salvando}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-fg)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              <button onClick={() => setEditando(null)}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AVISO LIP NÃO PREENCHIDO (antes aparecia duas vezes, uma janela sobre a outra) */}
      {avisoLipVazio && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-[var(--text-primary)] font-bold text-lg mb-2">LIP não preenchido</h2>
            <p className="text-[var(--text-muted)] text-sm mb-5">
              O LIP deste processo ainda não foi preenchido. Preencha o LIP antes de acessar o MAC.
            </p>
            <button onClick={() => setAvisoLipVazio(false)}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-bold px-6 py-2 rounded-lg text-sm transition-colors w-full">
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ORDENS: { valor: NonNullable<FiltrosPilha["ordenar"]>; rotulo: string }[] = [
  { valor: "data_desc", rotulo: "Mais novos" },
  { valor: "data_asc", rotulo: "Mais antigos" },
  { valor: "area_asc", rotulo: "Menor área" },
  { valor: "area_desc", rotulo: "Maior área" },
  { valor: "analises_desc", rotulo: "Mais análises" },
  { valor: "analises_asc", rotulo: "Menos análises" },
];

export default function ProcessosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-muted)]">Carregando...</div>}>
      <ProcessosConteudo />
    </Suspense>
  );
}
