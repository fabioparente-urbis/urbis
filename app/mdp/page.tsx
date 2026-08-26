"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

type Registro = {
  id: string;
  processo_codigo: string;
  tipo: "interno" | "despacho" | "indeferimento" | "arquivamento";
  numero: string | null;
  destinatario: string | null;
  data_despacho: string | null;
  conteudo: Record<string, any>;
  criado_em: string;
  usuario: { nome: string; gerencia: string | null } | null;
  assunto_id: string | null;
  assunto: { slug: string; nome: string } | null;
  interessado: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  interno: "Despacho Interno",
  despacho: "Despacho",
  indeferimento: "Indeferimento",
  arquivamento: "Arquivamento",
  laudo: "Laudo",
};
const TIPO_COR: Record<string, string> = {
  interno: "bg-blue-50 text-blue-700 border-blue-200",
  despacho: "bg-[var(--accent-bg,#EEF2FF)] text-[var(--accent,#4F46E5)] border-[var(--accent,#4F46E5)]",
  indeferimento: "bg-red-50 text-red-700 border-red-200",
  arquivamento: "bg-gray-100 text-gray-600 border-gray-300",
  laudo: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function MdpPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  const PAGE_SIZE = 30;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/mdp?${params}`, { credentials: "include" });
      const json = await res.json();
      if (json.ok) { setRegistros(json.data); setTotal(json.total); }
    } finally { setCarregando(false); }
  }, [page, search]);

  useEffect(() => { carregar(); }, [carregar]);

  function buscar() { setPage(0); setSearch(searchInput); }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronLeft size={20} />
        </button>
        <FileText size={20} className="text-[var(--accent)]" />
        <div>
          <h1 className="font-bold text-lg leading-tight">MDP — Módulo de Despachos e Pareceres</h1>
          <p className="text-xs text-[var(--text-muted)]">Histórico de despachos emitidos</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Busca */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && buscar()}
              placeholder="Buscar por interessado ou número do processo..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />
          </div>
          <button onClick={buscar} className="px-4 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors">
            Buscar
          </button>
        </div>

        {/* Lista */}
        {carregando ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Carregando...</div>
        ) : registros.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Nenhum despacho encontrado.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {registros.map(r => (
              <div key={r.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                  className="w-full text-left px-5 py-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIPO_COR[r.tipo] || TIPO_COR.despacho}`}>
                          {TIPO_LABEL[r.tipo] || r.tipo}
                        </span>
                        {r.numero && (
                          <span className="text-sm font-bold text-[var(--text-primary)]">Nº {r.numero}</span>
                        )}
                        {r.data_despacho && (
                          <span className="text-xs text-[var(--text-muted)]">{r.data_despacho}</span>
                        )}
                        {r.assunto && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                            {r.assunto.nome}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] flex-wrap">
                        <span className="font-medium whitespace-nowrap">{r.processo_codigo}</span>
                        {r.interessado && (
                          <><span className="text-[var(--text-muted)]">·</span>
                          <span className="truncate">{r.interessado}</span></>
                        )}
                        {r.destinatario && <><span className="text-[var(--text-muted)]">→</span><span className="truncate">{r.destinatario}</span></>}
                      </div>
                      {r.usuario && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {r.usuario.nome}{r.usuario.gerencia ? ` · ${r.usuario.gerencia}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/mdp/${encodeURIComponent(r.processo_codigo)}`); }}
                        className="p-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Ver todos do processo"
                      >
                        <ExternalLink size={14} />
                      </button>
                      <span className="text-[var(--text-muted)] text-lg">{expandido === r.id ? "−" : "+"}</span>
                    </div>
                  </div>
                </button>

                {expandido === r.id && (
                  <div className="px-5 pb-5 border-t border-[var(--border)] pt-4 flex flex-col gap-4">
                    <ConteudoMdp conteudo={r.conteudo} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-6 text-sm text-[var(--text-muted)]">
            <span>{total} registro(s)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 rounded border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--bg-secondary)] transition-colors">
                <ChevronLeft size={15} />
              </button>
              <span className="px-3 py-1.5">Pág. {page + 1} / {Math.ceil(total / PAGE_SIZE)}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                className="px-3 py-1.5 rounded border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--bg-secondary)] transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConteudoMdp({ conteudo }: { conteudo: Record<string, any> }) {
  const corpo: string = conteudo.corpo || "";
  const pendencias_mac: { grupo?: string; texto: string }[] = conteudo.pendencias_mac || [];
  const pendencias_lip: string[] = conteudo.pendencias_lip || [];
  const observacoes: string = conteudo.observacoes || "";

  return (
    <div className="flex flex-col gap-4 text-sm">
      {corpo && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Conteúdo</p>
          <p className="text-[var(--text-primary)] whitespace-pre-line leading-relaxed">{corpo}</p>
        </div>
      )}
      {pendencias_mac.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Pendências MAC</p>
          <ul className="flex flex-col gap-1">
            {pendencias_mac.map((p, i) => (
              <li key={i} className="flex gap-2 text-[var(--text-secondary)]">
                <span className="text-red-500 mt-0.5 flex-shrink-0">✗</span>
                <span>{p.grupo && <span className="font-medium text-[var(--text-primary)]">[{p.grupo}] </span>}{p.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pendencias_lip.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Campos LIP pendentes</p>
          <ul className="flex flex-col gap-1">
            {pendencias_lip.map((p, i) => (
              <li key={i} className="flex gap-2 text-[var(--text-secondary)]">
                <span className="text-orange-500 mt-0.5 flex-shrink-0">⚠</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {observacoes && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Observações</p>
          <p className="text-[var(--text-secondary)] whitespace-pre-line">{observacoes}</p>
        </div>
      )}
      {!corpo && pendencias_mac.length === 0 && pendencias_lip.length === 0 && !observacoes && (
        <p className="text-[var(--text-muted)] italic">Sem conteúdo registrado.</p>
      )}
    </div>
  );
}
