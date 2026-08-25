"use client";

/**
 * Leitor dos manuais de referência do Slot 5 (LIP e MAC). Só leitura na tela — sem link de
 * download, sem rota que sirva o .md cru. Seleção/cópia/menu de contexto ficam desabilitados como
 * dissuasão de tela (não é proteção real contra alguém decidido a extrair o texto — quem tem
 * acesso ao repositório sempre pode ler o arquivo direto).
 */

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LeitorManualSlot5() {
  const router = useRouter();
  const params = useSearchParams();
  const doc = params.get("doc") === "mac" ? "mac" : "lip";
  const voltar = params.get("voltar") || "/";
  const rotuloVoltar = params.get("rotulo") || "← Voltar";

  const [titulo, setTitulo] = useState("");
  const [html, setHtml] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro("");
    fetch(`/api/manuais/slot5?doc=${doc}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((d) => {
        if (cancelado || !d) return;
        if (!d.ok) { setErro(d.erro ?? "falha ao carregar o manual"); return; }
        setTitulo(d.titulo);
        setHtml(d.html);
      })
      .catch((e) => { if (!cancelado) setErro(String(e?.message ?? e)); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [doc, router]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="bg-[var(--bg-card)] border-b border-[var(--border)] px-6 py-3 flex items-center gap-2 sticky top-0 z-10">
        <button onClick={() => router.push(voltar)}
          className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
          {rotuloVoltar}
        </button>
        <button onClick={() => router.push("/")}
          className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
          🏠 Home
        </button>
        <div className="flex-1" />
        <button onClick={() => router.push(`/manuais/slot5?doc=lip&voltar=${encodeURIComponent(voltar)}&rotulo=${encodeURIComponent(rotuloVoltar)}`)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${doc === "lip"
            ? "bg-[#2563EB] text-white"
            : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
          📘 Manual LIP
        </button>
        <button onClick={() => router.push(`/manuais/slot5?doc=mac&voltar=${encodeURIComponent(voltar)}&rotulo=${encodeURIComponent(rotuloVoltar)}`)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${doc === "mac"
            ? "bg-[var(--ia)] text-white"
            : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
          📗 Manual MAC
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wide mb-4 text-center">
          Leitura na tela — sem download, sem exportação
        </p>

        {carregando && <p className="text-[var(--text-muted)] text-sm">Carregando…</p>}
        {erro && <p className="text-[var(--error)] text-sm">{erro}</p>}

        {!carregando && !erro && (
          <>
            <h1 className="text-2xl font-bold mb-6">{titulo}</h1>
            <div
              className="manual-conteudo"
              style={{ userSelect: "none", WebkitUserSelect: "none" }}
              onContextMenu={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </>
        )}
      </div>

      <style jsx global>{`
        .manual-conteudo h1 { font-size: 1.5rem; font-weight: 700; margin: 1.75rem 0 0.75rem; }
        .manual-conteudo h2 { font-size: 1.25rem; font-weight: 700; margin: 1.75rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
        .manual-conteudo h3 { font-size: 1.05rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
        .manual-conteudo p { margin: 0.6rem 0; line-height: 1.6; font-size: 0.9rem; }
        .manual-conteudo ul, .manual-conteudo ol { margin: 0.6rem 0 0.6rem 1.4rem; font-size: 0.9rem; line-height: 1.6; }
        .manual-conteudo li { margin: 0.2rem 0; }
        .manual-conteudo code { background: var(--bg-secondary); border-radius: 3px; padding: 0.1rem 0.35rem; font-size: 0.82em; }
        .manual-conteudo pre { background: var(--bg-secondary); border-radius: 6px; padding: 0.75rem; overflow-x: auto; font-size: 0.8rem; }
        .manual-conteudo pre code { background: none; padding: 0; }
        .manual-conteudo table { border-collapse: collapse; width: 100%; margin: 0.85rem 0; font-size: 0.82rem; }
        .manual-conteudo th, .manual-conteudo td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
        .manual-conteudo th { background: var(--bg-secondary); font-weight: 700; }
        .manual-conteudo blockquote { border-left: 3px solid var(--border-strong); padding-left: 0.85rem; color: var(--text-muted); margin: 0.75rem 0; }
        .manual-conteudo hr { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
        .manual-conteudo a { color: var(--accent); }
        .manual-conteudo strong { font-weight: 700; }
      `}</style>
    </div>
  );
}

export default function ManuaisSlot5Page() {
  return (
    <Suspense fallback={null}>
      <LeitorManualSlot5 />
    </Suspense>
  );
}
