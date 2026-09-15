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
 *
 * 15/09/2026 (duas rodadas, mesmo dia): primeiro a largura dobrou (220px → 440px, fixo). Depois o
 * Fábio pediu "do mesmo tamanho da grade de linhas" — a lista à esquerda usa `max-h-[70vh]`, uma
 * altura RELATIVA à tela, então um número fixo de largura nunca acompanharia em todo monitor.
 * Passa a medir a própria caixa (ResizeObserver) e renderizar por ALTURA, não largura — mesma
 * classe `max-h-[70vh]` da lista, imagem cresce/encolhe junto em qualquer tela.
 */

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function MiniaturaPdf({
  arquivo, pagina, onAmpliar,
}: { arquivo: File | null; pagina: number | null; onAmpliar?: () => void }) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(0);

  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const medir = () => setAltura(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-2 sticky top-4 h-[70vh] flex flex-col">
      <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] mb-2 text-center shrink-0">
        {pagina ? `pg. ${pagina} do processo` : "prévia"}
      </p>
      {/* overflow-x-auto é rede de segurança: em monitor MUITO alto, 70vh pode gerar uma imagem
          mais larga que a coluna do grid comporta — melhor rolar horizontalmente que estourar
          layout ou cortar a imagem sem aviso. */}
      <div ref={caixaRef} className="flex-1 min-h-0 flex items-start justify-center overflow-hidden overflow-x-auto">
        {!arquivo || !pagina ? (
          <div className="flex items-center justify-center h-full w-full text-xs text-[var(--text-muted)] text-center px-2">
            Selecione um item pra ver a página aqui
          </div>
        ) : altura === 0 ? (
          // primeira medição da caixa ainda não chegou — sem isso o react-pdf recebe height=0 e não desenha nada
          <div className="h-64" />
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
              <Page pageNumber={pagina} height={altura} renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
