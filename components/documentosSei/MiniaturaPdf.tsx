"use client";

/**
 * components/documentosSei/MiniaturaPdf.tsx — pedido do Fábio (14/09/2026), olhando a tela de
 * verdade: "vamos colocar um visualizador em miniatura... só pra ver melhor as folhas que estão
 * sendo cortadas". Ocupa a coluna do meio, entre a lista e o painel de atalhos — fica FIXA (sticky)
 * mesmo quando a lista da esquerda rola, mesmo padrão já usado no painel de atalhos ao lado.
 *
 * Mostra a página CANDIDATA a corte quando o analista está ajustando um corte (←/→), senão a
 * primeira página do item selecionado. Clique amplia no `VisualizadorPdf` (o modal grande).
 *
 * Renderização enxuta de propósito — sem camada de texto/anotação, é só conferência visual rápida,
 * não leitura.
 */

import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function MiniaturaPdf({
  arquivo, pagina, onAmpliar,
}: { arquivo: File | null; pagina: number | null; onAmpliar?: () => void }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-2 h-fit sticky top-4">
      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-2 text-center">
        {pagina ? `pg. ${pagina} do processo` : "prévia"}
      </p>
      {!arquivo || !pagina ? (
        <div className="flex items-center justify-center h-64 text-xs text-[var(--text-muted)] text-center px-2">
          Selecione um item pra ver a página aqui
        </div>
      ) : (
        <div
          onClick={onAmpliar}
          className={onAmpliar ? "cursor-zoom-in" : undefined}
          title={onAmpliar ? "Clique pra ampliar" : undefined}
        >
          <Document
            file={arquivo}
            key={pagina} // troca de página remonta — evita mistura de estado do react-pdf entre páginas
            loading={<div className="flex items-center justify-center h-64 text-xs text-[var(--text-muted)]">Carregando...</div>}
            error={<div className="flex items-center justify-center h-64 text-xs text-[var(--error)]">Não abriu</div>}
          >
            <Page pageNumber={pagina} width={220} renderTextLayer={false} renderAnnotationLayer={false} />
          </Document>
        </div>
      )}
    </div>
  );
}
