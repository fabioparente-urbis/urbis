"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

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
};

const TIPO_LABEL: Record<string, string> = {
  interno: "Despacho Interno",
  despacho: "Despacho",
  indeferimento: "Indeferimento",
  arquivamento: "Arquivamento",
};
const TIPO_COR: Record<string, string> = {
  interno: "bg-blue-50 text-blue-700 border-blue-200",
  despacho: "bg-indigo-50 text-indigo-700 border-indigo-200",
  indeferimento: "bg-red-50 text-red-700 border-red-200",
  arquivamento: "bg-gray-100 text-gray-600 border-gray-300",
};

export default function MdpProcessoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const router = useRouter();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    if (!codigo) return;
    fetch(`/api/mdp?processo=${encodeURIComponent(codigo)}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => { if (j.ok) setRegistros(j.data); })
      .finally(() => setCarregando(false));
  }, [codigo]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => router.push("/")}
            className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">🏠 Home</button>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
            className="bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] font-bold px-3 py-1.5 rounded text-sm transition-colors border border-[var(--error)]">🚪 Sair</button>
          <div>
            <h1 className="font-bold text-lg leading-tight">📕 MDP — Despachos do Processo</h1>
            <p className="text-xs text-[var(--text-muted)] font-mono">{codigo}</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {carregando ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Carregando...</div>
        ) : registros.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] text-sm">Nenhum despacho registrado para este processo.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {registros.map((r, idx) => (
              <div key={r.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                  className="w-full text-left px-5 py-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-[var(--text-muted)] font-medium">#{registros.length - idx}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIPO_COR[r.tipo] || TIPO_COR.despacho}`}>
                          {TIPO_LABEL[r.tipo] || r.tipo}
                        </span>
                        {r.numero && <span className="text-sm font-bold">Nº {r.numero}</span>}
                        {r.data_despacho && <span className="text-xs text-[var(--text-muted)]">{r.data_despacho}</span>}
                      </div>
                      {r.destinatario && (
                        <span className="text-sm text-[var(--text-secondary)]">→ {r.destinatario}</span>
                      )}
                    </div>
                    <span className="text-[var(--text-muted)] text-lg flex-shrink-0">{expandido === r.id ? "−" : "+"}</span>
                  </div>
                </button>

                {expandido === r.id && (
                  <div className="px-5 pb-5 border-t border-[var(--border)] pt-4">
                    <ConteudoMdp conteudo={r.conteudo} />
                  </div>
                )}
              </div>
            ))}
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
  // Observações que o analista escreveu em cada aba do checklist.
  const obsPorAba: [string, string][] = Object.entries(
    (conteudo.observacoes_por_aba || {}) as Record<string, string>
  ).filter(([, v]) => typeof v === "string" && v.trim());

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
      {obsPorAba.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Observações MAC</p>
          <ul className="flex flex-col gap-2">
            {obsPorAba.map(([aba, texto]) => (
              <li key={aba} className="text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">[{aba}] </span>
                <span className="whitespace-pre-line">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!corpo && pendencias_mac.length === 0 && pendencias_lip.length === 0 && !observacoes && obsPorAba.length === 0 && (
        <p className="text-[var(--text-muted)] italic">Sem conteúdo registrado.</p>
      )}
    </div>
  );
}
