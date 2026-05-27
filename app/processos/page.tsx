"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito, PERFIS_GERENCIA } from "@/lib/perfis";

type ProcessoTag = {
  id?: string;
  tipo: "despacho" | "indeferimento" | "arquivamento" | "laudo";
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
  despacho: "bg-blue-900 text-blue-200 border-blue-700",
  indeferimento: "bg-red-900 text-red-200 border-red-700",
  arquivamento: "bg-slate-700 text-slate-200 border-slate-500",
  laudo: "bg-green-900 text-green-200 border-green-700",
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
  EM_ANALISE: "bg-blue-900 text-blue-300",
  CONCLUIDO: "bg-green-900 text-green-300",
  PENDENTE: "bg-yellow-900 text-yellow-300",
  cancelado: "bg-red-900 text-red-300",
  CADASTRADO: "bg-slate-700 text-slate-300",
  arquivado_duplicado: "bg-orange-900 text-orange-300",
  aguardando_assinaturas: "bg-purple-900 text-purple-300",
};

const TIPO_COR: Record<string, string> = {
  // Regularizacao → roxo, Aceite → azul (item 6).
  Regularizacao: "bg-purple-900 text-purple-300",
  REGULARIZACAO: "bg-purple-900 text-purple-300",
  Aceite: "bg-blue-900 text-blue-300",
  ACEITE: "bg-blue-900 text-blue-300",
  Aprovacao: "bg-orange-900 text-orange-300",
  APROVACAO: "bg-orange-900 text-orange-300",
};

const TIPO_ROTULO: Record<string, string> = {
  REGULARIZACAO: "Regularização",
  Regularizacao: "Regularização",
  ACEITE: "Aceite",
  Aceite: "Aceite",
  APROVACAO: "Aprovação",
  Aprovacao: "Aprovação",
};

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
    // Passa o tipo do processo na URL para que o cadastro/LIP saiba qual
    // dos processos (REG vs ACEITE com mesmo SEI) abrir.
    const tipoNorm = String(p.tipo_processo || "REGULARIZACAO").toUpperCase();
    router.push(`/processo/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipoNorm)}`);
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
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded text-sm font-medium transition-colors">
            🏠 Home
          </button>
          <div>
            <h1 className="text-2xl font-bold">📋 Processos</h1>
            <p className="text-slate-400 text-sm">Todos os processos cadastrados no URBIS</p>
          </div>
        </div>
        <span className="text-slate-500 text-sm">{processos.length} processo(s)</span>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por numero SEI ou codigo..."
          className="flex-1 min-w-[200px] bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os tipos</option>
          <option value="REGULARIZACAO">Regularização</option>
          <option value="ACEITE">Aceite</option>
          <option value="APROVACAO">Aprovação</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        {podeFiltrarAnalista && (
          <select value={analista} onChange={(e) => setAnalista(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos os analistas</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
      </div>

      {/* LISTA */}
      {carregando ? (
        <div className="text-slate-400 text-sm text-center py-12">Carregando...</div>
      ) : processos.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-12">Nenhum processo encontrado.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {processos.map((p) => {
            const proprietario = p.dados?.proprietario?.valor || "—";
            const numero = p.codigo || p.numero_sei || "—";
            return (
              <div key={p.id} className="bg-[var(--card)] border border-[var(--card-border)] hover:border-slate-400 rounded-xl p-4 flex items-center gap-4 transition-all">
                {/* Clicavel */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => abrirProcesso(p)}>
                  <p className="font-mono text-emerald-600 font-semibold text-sm">{numero}</p>
                  {Array.isArray(p.tags) && p.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.tags.map((t, i) => (
                        <span
                          key={t.id ?? `${t.tipo}-${i}`}
                          title={t.data ? `Emitido em ${t.data}` : undefined}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${TAG_COR[t.tipo]}`}
                        >
                          {rotuloTag(t)}
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
                  <p className="text-slate-600 text-sm mt-0.5 truncate">{proprietario}</p>
                  <div className="flex items-center gap-2 mt-0.5"><p className="text-slate-600 text-xs">{nomeAnalista(p.analista_id)}</p>{p.dados?.ultimo_documento && (<span className="text-xs bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded font-semibold">📄 {p.dados.ultimo_documento}</span>)}</div>
                </div>

                {/* Tipo */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap hidden md:block ${TIPO_COR[p.tipo_processo] || "bg-slate-700 text-slate-300"}`}>
                  {TIPO_ROTULO[p.tipo_processo] || p.tipo_processo || "—"}
                </span>

                {/* Status */}
                <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${STATUS_COR[p.status] || "bg-slate-700 text-slate-300"}`}>
                  {p.status?.replace(/_/g, " ") || "—"}
                </span>

                {/* Data */}
                <p className="text-slate-500 text-xs whitespace-nowrap hidden lg:block">{formatar(p.atualizado_em)}</p>

                {/* Ações */}
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); abrirEditar(p); }}
                    title="Abrir LIP do processo"
                    className="bg-slate-600 hover:bg-slate-500 text-white text-xs px-2 py-1 rounded transition-colors">
                    ✏️
                  </button>
                  <button onClick={() => deletar(p)} disabled={deletando === p.id}
                    className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-xs px-2 py-1 rounded transition-colors">
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
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg">Editar Processo</h2>
              <button onClick={() => setEditando(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-emerald-600 font-mono text-sm mb-4">{editando.codigo || editando.numero_sei}</p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Status</label>
                <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Manter atual</option>
                  {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Atribuir Analista</label>
                <select value={novoAnalista} onChange={(e) => setNovoAnalista(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sem analista</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome} — {u.perfil}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={salvarEdicao} disabled={salvando}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {salvando ? "Salvando..." : "💾 Salvar"}
              </button>
              <button onClick={() => setEditando(null)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
