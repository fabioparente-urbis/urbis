"use client";
import { useState } from "react";

export type Lembrete = { id: string; processo: string; autor: string; texto: string; atualizadoEm: string; meu: boolean };

// Lembrete escrito precisa saltar aos olhos na Pilha (Fábio, 25/11/2026): fundo amarelo, texto
// vermelho, inteiro (sem cortar). Cores fixas de propósito, iguais em qualquer tema.
const DESTAQUE = "text-xs font-bold bg-[#FEF08A] text-[#B91C1C] rounded px-1.5 py-0.5 max-w-full break-words whitespace-pre-wrap";

/** Quadradinho de lembrete do card da Pilha. Edita só o próprio; os de outros aparecem só para leitura. */
export default function LembreteProcesso({ codigo, lembretes, onSalvo }: {
  codigo: string; lembretes: Lembrete[]; onSalvo: (codigo: string, texto: string) => void;
}) {
  const meu = lembretes.find((l) => l.meu);
  const outros = lembretes.filter((l) => !l.meu);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(meu?.texto ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const novo = texto.trim();
    if (novo === (meu?.texto ?? "")) { setAberto(false); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/processo/lembrete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: codigo, texto: novo }),
      });
      if ((await r.json()).ok) onSalvo(codigo, novo);
    } finally { setSalvando(false); setAberto(false); }
  }

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      {aberto ? (
        <textarea
          autoFocus value={texto} maxLength={1000} rows={2} disabled={salvando}
          onChange={(e) => setTexto(e.target.value)} onBlur={salvar}
          placeholder="Lembrete (só você, gerente, diretor e administrador veem)"
          className="w-full text-xs rounded border border-[var(--card-border)] bg-[var(--bg-secondary)] p-1.5 text-[var(--text-primary)]" />
      ) : (
        <button type="button" onClick={() => { setTexto(meu?.texto ?? ""); setAberto(true); }}
          className={meu
            ? `${DESTAQUE} text-left`
            : "text-[11px] text-left text-[var(--text-muted)] hover:text-[var(--accent)] max-w-full truncate"}>
          📝 {meu ? meu.texto : "Lembrete"}
        </button>
      )}
      {outros.map((l) => (
        <p key={l.id} className={`${DESTAQUE} mt-0.5 w-fit`}>
          📝 <b>{l.autor}:</b> {l.texto}
        </p>
      ))}
    </div>
  );
}
