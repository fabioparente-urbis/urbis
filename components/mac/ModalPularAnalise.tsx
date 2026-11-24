"use client";
import { useState } from "react";
import type { AnalisePulada, DadosPulo } from "./usePularAnalise";

/**
 * Janela do botão ⏭️ "Pular análise": pede o nº do despacho/parecer e a data da análise feita em
 * outro ambiente (obrigatórios — despachos e pareceres passam a mostrá-los). Se a análise já está
 * pulada, a janela edita os dados ou desfaz o pulo (só enquanto não saiu do MAC).
 */
export default function ModalPularAnalise({ numero, atual, salvando, onSalvar, onDesfazer, onFechar }: {
  numero: number;
  atual?: AnalisePulada;
  salvando: boolean;
  onSalvar: (dados: DadosPulo) => Promise<boolean>;
  onDesfazer: () => Promise<boolean>;
  onFechar: () => void;
}) {
  const [numeroDoc, setNumeroDoc] = useState(atual?.numeroDocumento ?? "");
  const [data, setData] = useState((atual?.data ?? "").slice(0, 10));
  const hoje = new Date().toISOString().slice(0, 10);
  const pronto = numeroDoc.trim() !== "" && data !== "" && data <= hoje;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onFechar}>
      <div className="w-96 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">⏭️ Pular a Análise {numero}</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Análise feita por outro analista ou em outro ambiente (ex.: Excel). Informe os dados dela: os despachos e pareceres vão mostrá-los.
          Ao sair do MAC a marca fica fixa.
        </p>
        <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">Nº do despacho/parecer da Análise {numero} *</label>
        <input value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} maxLength={40} autoFocus
          className="w-full mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]" placeholder="ex.: 1692" />
        <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">Data da Análise {numero} *</label>
        <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)}
          className="w-full mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
        <div className="flex gap-2 justify-end">
          {atual && !atual.fixada && (
            <button disabled={salvando} onClick={async () => { if (await onDesfazer()) onFechar(); }}
              className="mr-auto px-3 py-1.5 rounded-lg text-sm border border-red-400 text-red-500 hover:bg-red-600 hover:text-white disabled:opacity-50">Desfazer pulo</button>
          )}
          <button onClick={onFechar} className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] text-[var(--text-secondary)]">Cancelar</button>
          <button disabled={!pronto || salvando} onClick={async () => { if (await onSalvar({ numeroDocumento: numeroDoc.trim(), data })) onFechar(); }}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-40">Salvar</button>
        </div>
      </div>
    </div>
  );
}
