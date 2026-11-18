"use client";

/**
 * Ícone do URBI no card da Pilha + janela da condição bloqueante (18/11/2026, pedido do Fábio).
 *
 * Molde visual: o aviso "MARCO TEMPORAL NÃO ATENDIDO" do LIP (título vermelho, texto, quadro de
 * evidência, botão grande) MAIS o desenho do URBI, "pra mostrar que é ele que tá trabalhando".
 * Entendi = fecha, a condição continua. Dispensar = pede motivo, grava, e ela deixa de existir
 * (até a evidência mudar — ver lib/urbi/condicoesProcesso.ts).
 * `podeDispensar=false` (celular, ou sem permissão) mostra só a leitura.
 */
import { useState } from "react";

export type CondicaoUrbi = { condicao_id: string; titulo: string; detalhe: string; origem: string; visto_em: string };

const ORIGEM: Record<string, string> = { lip: "ao abrir o LIP", mac: "ao abrir o MAC", admin: "refeita pelo Administrador" };

function quando(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export function BotaoCondicaoUrbi({ codigo, condicoes, podeDispensar, onDispensada }: {
  codigo: string; condicoes: CondicaoUrbi[]; podeDispensar: boolean; onDispensada: (condicaoId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (condicoes.length === 0) return null;
  return (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}
        title={`URBI: ${condicoes.length} condição(ões) bloqueante(s) — clique para ver`}
        aria-label={`URBI encontrou ${condicoes.length} condição bloqueante`}
        className="relative inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full border border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)] text-[10px] font-bold hover:ring-2 hover:ring-[var(--error)] shrink-0">
        <img src="/urbi/poses/urbi-atencao.png" alt="" className="w-5 h-5 object-contain" />
        {condicoes.length > 1 ? condicoes.length : "!"}
      </button>
      {aberto && (
        <JanelaCondicao codigo={codigo} condicoes={condicoes} podeDispensar={podeDispensar}
          onFechar={() => setAberto(false)} onDispensada={onDispensada} />
      )}
    </>
  );
}

function JanelaCondicao({ codigo, condicoes, podeDispensar, onFechar, onDispensada }: {
  codigo: string; condicoes: CondicaoUrbi[]; podeDispensar: boolean;
  onFechar: () => void; onDispensada: (condicaoId: string) => void;
}) {
  const [indice, setIndice] = useState(0);
  const [dispensando, setDispensando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const c = condicoes[Math.min(indice, condicoes.length - 1)];
  if (!c) return null;

  async function confirmarDispensa() {
    if (motivo.trim().length < 5) { setErro("Escreva o motivo (pelo menos algumas palavras)."); return; }
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/urbi/condicoes/dispensar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo: codigo, condicao_id: c.condicao_id, motivo: motivo.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setErro(j.erro ?? "Não foi possível dispensar."); return; }
      onDispensada(c.condicao_id);
      setDispensando(false); setMotivo("");
      if (condicoes.length <= 1) onFechar(); else setIndice(0);
    } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => { e.stopPropagation(); onFechar(); }}>
      <div role="dialog" aria-modal="true"
        className="bg-[var(--bg-card)] border-2 border-[var(--error)] rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          <img src="/urbi/poses/urbi-atencao.png" alt="URBI" className="w-16 h-16 object-contain shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">URBI · condição bloqueante{condicoes.length > 1 ? ` ${indice + 1} de ${condicoes.length}` : ""}</p>
            <h2 className="text-lg font-bold text-[var(--error)] leading-tight">⛔ {c.titulo.toUpperCase()}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Processo {codigo}</p>
          </div>
        </div>

        <p className="text-sm text-[var(--text-primary)] mb-4">
          Encontrei esta condição que impede seguir com a análise. Esta é a evidência:
        </p>

        <div className="bg-[var(--bg-secondary)] rounded-lg p-3 mb-4 text-xs space-y-1">
          <p className="text-[var(--text-primary)] whitespace-pre-line leading-relaxed">{c.detalhe}</p>
          <p className="text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
            Verificado {ORIGEM[c.origem] ?? c.origem} em {quando(c.visto_em)}.
          </p>
        </div>

        <p className="text-xs text-[var(--text-muted)] mb-4">
          Confira antes de decidir — o URBI só repassa o que está registrado. Se a evidência mudar, eu analiso de novo.
        </p>

        {dispensando ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--text-secondary)]" htmlFor="motivo-dispensa">Por que dispensar?</label>
            <textarea id="motivo-dispensa" autoFocus rows={3} maxLength={500} value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-[var(--text-primary)]" />
            {erro && <p className="text-xs text-[var(--error)]">{erro}</p>}
            <div className="flex gap-2">
              <button onClick={confirmarDispensa} disabled={salvando}
                className="flex-1 bg-[var(--error)] hover:opacity-90 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm">
                {salvando ? "Dispensando..." : "Confirmar dispensa"}
              </button>
              <button onClick={() => { setDispensando(false); setErro(null); }}
                className="px-4 bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">Voltar</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {podeDispensar && (
              <button onClick={() => setDispensando(true)}
                className="px-4 border border-[var(--error)] text-[var(--error)] hover:bg-[var(--error-bg)] font-bold py-2 rounded-lg text-sm">
                Dispensar
              </button>
            )}
            {condicoes.length > 1 && (
              <button onClick={() => setIndice((i) => (i + 1) % condicoes.length)}
                className="px-4 bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold py-2 rounded-lg text-sm">
                Próxima
              </button>
            )}
            <button onClick={onFechar}
              className="flex-1 bg-[var(--error)] hover:opacity-90 text-white font-bold py-2 rounded-lg text-sm">
              Entendi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
