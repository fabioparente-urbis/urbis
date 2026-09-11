"use client";

/**
 * components/documentosSei/VisualizadorPdf.tsx — extraído dos dois componentes Organizador
 * (Regularização/Aceite SEI), onde vivia duplicado, para ser reaproveitado também pelo módulo novo
 * do Fatiador (Fase 6, docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md §6). Comportamento idêntico ao
 * original — nenhuma tela existente muda.
 *
 * Restrito AO DOCUMENTO (08/09/2026, pedido do Fábio: "pra poder abri-los dentro do URBIS"): a
 * navegação para nos limites do evento/peça (`paginaIni..paginaFim`), e a contagem é a do
 * documento ("Página 2 de 4"), com a página real dentro do processo mostrada ao lado.
 *
 * O recorte é feito na hora, a partir do PDF original em memória — nunca guarda fatia separada.
 */

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function VisualizadorPdf({
  arquivo, paginaInicial, paginaIni, paginaFim, onFechar,
}: { arquivo: File; paginaInicial: number; paginaIni: number; paginaFim: number; onFechar: () => void }) {
  const [pagina, setPagina] = useState(paginaInicial);
  const totalDoDocumento = paginaFim - paginaIni + 1;
  const posicaoNoDocumento = pagina - paginaIni + 1;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-[var(--bg-card)] rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
          <button onClick={() => setPagina((p) => Math.max(paginaIni, p - 1))} disabled={pagina <= paginaIni}
            className="px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-40">
            ◀
          </button>
          <span className="text-sm text-[var(--text-primary)]">
            Página {posicaoNoDocumento} de {totalDoDocumento}
            <span className="text-xs text-[var(--text-muted)] ml-2">(pg. {pagina} do processo)</span>
          </span>
          <button onClick={() => setPagina((p) => Math.min(paginaFim, p + 1))} disabled={pagina >= paginaFim}
            className="px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-40">
            ▶
          </button>
          <button onClick={onFechar} className="ml-auto px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)]">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto flex justify-center p-4">
          <Document file={arquivo} loading={<p className="text-[var(--text-muted)]">Carregando...</p>}>
            <Page pageNumber={pagina} width={640} renderTextLayer renderAnnotationLayer={false} />
          </Document>
        </div>
      </div>
    </div>
  );
}
