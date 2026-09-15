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
 *
 * 14/09/2026: setas ←/→ do teclado navegam página (ignoradas com foco no campo "ir pra página",
 * onde servem pra mover o cursor no número) e Esc fecha, pedido do Fábio olhando a tela ao vivo.
 *
 * 15/09/2026: lupa que segue o mouse — clique ESQUERDO liga, DIREITO desliga (o direito não abre
 * o menu de contexto do navegador enquanto o visualizador está aberto). A lupa não é CSS esticado
 * (`transform: scale`) — captura o canvas já renderizado em `toDataURL()` (que o react-pdf desenha
 * em resolução mais alta que o tamanho exibido, pra ficar nítido em tela retina) e usa como
 * `background-image` com `background-size`/`background-position` calculados pela posição do
 * mouse. Zoom de verdade, não a mesma pixelagem ampliada.
 */

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ZOOM_LUPA = 2.5;
const TAMANHO_LUPA = 220; // px, diâmetro do círculo

export default function VisualizadorPdf({
  arquivo, paginaInicial, paginaIni, paginaFim, onFechar,
}: { arquivo: File; paginaInicial: number; paginaIni: number; paginaFim: number; onFechar: () => void }) {
  const [pagina, setPagina] = useState(paginaInicial);
  const totalDoDocumento = paginaFim - paginaIni + 1;
  const posicaoNoDocumento = pagina - paginaIni + 1;

  const paginaContainerRef = useRef<HTMLDivElement>(null);
  const [lupaAtiva, setLupaAtiva] = useState(false);
  const [posMouse, setPosMouse] = useState<{ x: number; y: number } | null>(null);
  /** Imagem + tamanho exibido do canvas NO MOMENTO em que foi capturado — refeito a cada troca de
   * página, porque cada página pode ter proporção diferente. */
  const [imagemLupa, setImagemLupa] = useState<{ url: string; largura: number; altura: number } | null>(null);

  /** Captura o canvas já desenhado pelo react-pdf assim que ele termina de renderizar a página. */
  function aoRenderizarPagina() {
    const canvas = paginaContainerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setImagemLupa({ url: canvas.toDataURL(), largura: rect.width, altura: rect.height });
  }

  function moverMouseNaPagina(e: React.MouseEvent<HTMLDivElement>) {
    if (!lupaAtiva) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPosMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  /**
   * Ir direto pra página — pedido do Fábio (11/09/2026): "navegar com rapidez entre páginas...
   * digitar a página e ele vai". Campo de rascunho (`indo`) separado de `pagina`: o analista pode
   * apagar o número pra digitar de novo sem o clamp brigando a cada tecla; só ao confirmar
   * (Enter/blur) é que o valor é validado e aplicado.
   */
  const [indo, setIndo] = useState(String(pagina));
  useEffect(() => setIndo(String(pagina)), [pagina]);

  function irParaPagina() {
    const n = parseInt(indo, 10);
    if (Number.isFinite(n)) setPagina(Math.min(paginaFim, Math.max(paginaIni, n)));
    else setIndo(String(pagina));
  }

  /**
   * Setas do teclado e Esc — pedido do Fábio (14/09/2026), apontando pras setas ◀▶ da tela: "quero
   * que essas duas setas... sejam comandadas pelas setas do teclado" + "Esc" pra fechar (o ✕).
   * Listener PRÓPRIO deste modal, não passa pelo hook de atalhos da tela de trás (que fica
   * desligado enquanto o visualizador está aberto, de propósito). ArrowLeft/Right são ignoradas
   * com o foco no campo "ir pra página" — lá elas servem pra mover o cursor dentro do número.
   *
   * 15/09/2026, achado do Fábio: Esc pra fechar e a seta seguinte (pra navegar na tela de trás)
   * podem chegar num intervalo menor que o commit do React que desmonta este modal — o listener
   * VELHO ainda está no `window` e engole essa seta antes do hook da tela de trás voltar a ouvir.
   * `fechandoRef` corta esse listener no instante do Esc (sem esperar o efeito de cleanup rodar),
   * então a seta seguinte não é capturada aqui nem some — sobra pra quem estiver ouvindo depois.
   */
  const fechandoRef = useRef(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (fechandoRef.current) return;
      if (e.key === "Escape") { fechandoRef.current = true; e.preventDefault(); onFechar(); return; }
      const noCampoDePagina = (e.target as HTMLElement)?.tagName === "INPUT";
      if (noCampoDePagina) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setPagina((p) => Math.max(paginaIni, p - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPagina((p) => Math.min(paginaFim, p + 1)); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paginaIni, paginaFim, onFechar]);

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
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            pg.
            <input
              type="number" value={indo} min={paginaIni} max={paginaFim}
              onChange={(e) => setIndo(e.target.value)}
              onBlur={irParaPagina}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); irParaPagina(); } }}
              className="w-14 px-1 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] text-center"
            />
            do processo
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
          <div
            ref={paginaContainerRef}
            className="relative"
            style={{ cursor: lupaAtiva ? "none" : "zoom-in" }}
            onClick={(e) => {
              setLupaAtiva(true);
              const rect = e.currentTarget.getBoundingClientRect();
              setPosMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onContextMenu={(e) => { e.preventDefault(); setLupaAtiva(false); }}
            onMouseMove={moverMouseNaPagina}
            onMouseLeave={() => setPosMouse(null)}
          >
            <Document file={arquivo} loading={<p className="text-[var(--text-muted)]">Carregando...</p>}>
              <Page pageNumber={pagina} width={640} renderTextLayer renderAnnotationLayer={false}
                onRenderSuccess={aoRenderizarPagina} />
            </Document>
            {lupaAtiva && posMouse && imagemLupa && (
              <div
                className="pointer-events-none absolute rounded-full border-2 border-[var(--accent)] shadow-lg"
                style={{
                  width: TAMANHO_LUPA, height: TAMANHO_LUPA,
                  left: posMouse.x - TAMANHO_LUPA / 2, top: posMouse.y - TAMANHO_LUPA / 2,
                  backgroundImage: `url(${imagemLupa.url})`,
                  backgroundSize: `${imagemLupa.largura * ZOOM_LUPA}px ${imagemLupa.altura * ZOOM_LUPA}px`,
                  backgroundPosition: `${-(posMouse.x * ZOOM_LUPA - TAMANHO_LUPA / 2)}px ${-(posMouse.y * ZOOM_LUPA - TAMANHO_LUPA / 2)}px`,
                  backgroundRepeat: "no-repeat",
                }}
              />
            )}
          </div>
        </div>
        {lupaAtiva && (
          <p className="px-3 pb-2 text-[10px] text-[var(--text-muted)] text-center">
            🔍 Lupa ligada — clique direito pra desligar
          </p>
        )}
      </div>
    </div>
  );
}
