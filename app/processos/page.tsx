"use client";

import { useEffect, useState } from "react";
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

const STATUS_OPCOES = [
  "CADASTRADO", "EM_ANALISE", "CONCLUIDO", "PENDENTE",
  "cancelado", "arquivado_duplicado", "aguardando_assinaturas"
];

const STATUS_COR: Record<string, string> = {
  EM_ANALISE: "bg-[var(--accent)] text-[var(--accent-fg)]",
  CONCLUIDO: "bg-[var(--success-bg)] text-[var(--success)]",
  PENDENTE: "bg-[var(--warning-bg)] text-[var(--warning)]",
  cancelado: "bg-[var(--error-bg)] text-[var(--error)]",
  CADASTRADO: "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
  arquivado_duplicado: "bg-[var(--warning-bg)] text-[var(--warning)]",
  aguardando_assinaturas: "bg-[var(--ia-bg)] text-[var(--ia)]",
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

export default function ProcessosPage() {
  const router = useRouter();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [status, setStatus] = useState("");
  const [analista, setAnalista] = useState("");
  const [deletando, setDeletando] = useState<string | null>(null);
  const [editando, setEditando] = useState<Processo | null>(null);
  const [novoStatus, setNovoStatus] = useState("");
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
      if (status) params.set("status", status);
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
  useEffect(() => { carregar(); }, [busca, tipo, status, analista]);

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
    setNovoStatus(p.status || "");
    setNovoAnalista(p.analista_id || "");
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvando(true);
    try {
      const erros: string[] = [];
      // Atualizar status: PUT genérico em /api/processos (somente quando mudou).
      if (novoStatus && novoStatus !== editando.status) {
        const resStatus = await fetch("/api/processos", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editando.id, status: novoStatus }),
        });
        const jsonStatus = await resStatus.json().catch(() => ({ ok: false, erro: "Resposta inválida" }));
        if (!jsonStatus.ok) erros.push(jsonStatus.erro || "Falha ao atualizar status");
      }
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
            <h1 className="text-2xl font-bold">📋 Processos</h1>
            <p className="text-[var(--text-muted)] text-sm">Todos os processos cadastrados no URBIS</p>
          </div>
        </div>
        <span className="text-[var(--text-muted)] text-sm">{processos.length} processo(s)</span>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por SEI, interessado ou nº de despacho..."
          className="flex-1 min-w-[200px] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <option value="">Todos os tipos</option>
          <option value="regularizacao">Regularização SEI</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <option value="">Todos os status</option>
          {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        {podeFiltrarAnalista && (
          <select value={analista} onChange={(e) => setAnalista(e.target.value)}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <option value="">Todos os analistas</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
      </div>

      {/* LISTA */}
      {carregando ? (
        <div className="text-[var(--text-muted)] text-sm text-center py-12">Carregando...</div>
      ) : processos.length === 0 ? (
        <div className="text-[var(--text-muted)] text-sm text-center py-12">Nenhum processo encontrado.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {processos.map((p) => {
            const proprietario = p.dados?.proprietario?.valor || "—";
            const numero = p.codigo || p.numero_sei || "—";
            const processoFisico = p.dados?.processoFisico?.valor;
            return (
              <div key={p.id} className="bg-[var(--card)] border border-[var(--card-border)] hover:border-[var(--border-strong)] rounded-xl p-4 flex items-center gap-4 transition-all">
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
                  {TIPO_ROTULO[p.tipo_processo] || p.tipo_processo || "—"}
                </span>

                {/* Status */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${STATUS_COR[p.status] || "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                  {p.status?.replace(/_/g, " ") || "—"}
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
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Status</label>
                <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="">Manter atual</option>
                  {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>

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
