"use client";

/**
 * components/regularizacao/OrganizadorSeiRegularizacao.tsx
 *
 * Fase 2 do plano Documentos Vivos (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md): aba "Documentos" da
 * Regularização (Slot 1). O analista arrasta o PDF único do SEI e vê a linha do tempo de eventos
 * (fatiada por lib/documentosSei/fatiar.ts, zero IA) em vez de rolar o PDF inteiro.
 *
 * Componente NOVO E ISOLADO, de propósito: em vez de crescer ainda mais o
 * `app/processo/ProcessoClient.tsx` (já com milhares de linhas) ou reaproveitar código do Slot 5,
 * toda a Fase 2 mora aqui, renderizada por um único `{tipoUrl === "regularizacao" && ...}` no
 * arquivo do processo — regra de isolamento entre slots do CLAUDE.md.
 *
 * O PDF original NUNCA é enviado ao servidor de novo depois da leitura: fica só na memória do
 * navegador (o `File` que o analista soltou), e "abrir na página N" / "baixar recorte" usam esse
 * mesmo arquivo, no cliente — react-pdf para abrir, pdf-lib para recortar. Sem isso, MHD teria
 * que guardar o PDF inteiro, contrariando o princípio do módulo (nunca guarda arquivo pesado).
 *
 * ZERO gravação: esta tela não grava nada em LIP, MAC nem MHD. É só leitura e organização.
 */

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { PDFDocument } from "pdf-lib";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type EventoSei = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  setor?: string;
  data?: string;
};
type PaginaRevisao = { pagina: number; motivo: string };
type ResultadoFatiamento = {
  numeroProcesso: string;
  totalPaginas: number;
  eventos: EventoSei[];
  paginasRevisao: PaginaRevisao[];
};

const ROTULO_MOTIVO: Record<string, string> = {
  sem_rodape_sem_continuidade: "sem rodapé legível (provável imagem/desenho técnico)",
  processo_divergente: "rodapé de outro processo",
  pagina_rodape_diverge: "número de página do rodapé não bate com a posição real",
};

export default function OrganizadorSeiRegularizacao({ processoCodigo }: { processoCodigo: string }) {
  const [ativo, setAtivo] = useState<boolean | null>(null); // null = ainda não sabe
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<ResultadoFatiamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<{ pagina: number; totalDoPdf: number } | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((j) => { if (!cancelado) setAtivo(!!j?.data?.documentos_vivos_regularizacao_ativo); })
      .catch(() => { if (!cancelado) setAtivo(false); });
    return () => { cancelado = true; };
  }, []);

  if (!ativo) return null;

  async function processar(f: File) {
    setArquivo(f);
    setResultado(null);
    setErro(null);
    setProcessando(true);
    setProgresso(0);
    try {
      const fd = new FormData();
      fd.append("arquivo", f, f.name);
      fd.append("processo_codigo", processoCodigo);
      const r = await fetch("/api/analise-regularizacao/documentos-sei", { method: "POST", body: fd });
      if (!r.body) throw new Error(`o servidor respondeu HTTP ${r.status} sem corpo`);

      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      let dados: ResultadoFatiamento | null = null;
      let erroFluxo: string | null = null;

      const processarLinha = (bruta: string) => {
        const l = bruta.trim();
        if (!l) return;
        let ev: any;
        try { ev = JSON.parse(l); } catch { return; }
        if (ev.tipo === "progresso") {
          setProgresso(ev.total > 0 ? Math.round((ev.atual / ev.total) * 100) : 0);
        } else if (ev.tipo === "erro") {
          erroFluxo = ev.erro || "Falha ao organizar o PDF";
        } else if (ev.tipo === "resultado") {
          dados = ev as ResultadoFatiamento;
        }
      };

      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        linhas.forEach(processarLinha);
      }
      processarLinha(resto);

      if (erroFluxo) throw new Error(erroFluxo);
      if (!dados) throw new Error(`a leitura terminou sem resultado (HTTP ${r.status})`);
      setResultado(dados);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setProcessando(false);
    }
  }

  async function baixarRecorte(ev: EventoSei) {
    if (!arquivo) return;
    setBaixando(ev.idSei);
    try {
      const bytesOriginal = await arquivo.arrayBuffer();
      const origem = await PDFDocument.load(bytesOriginal);
      const novo = await PDFDocument.create();
      const indices: number[] = [];
      for (let p = ev.paginaIni; p <= ev.paginaFim; p++) indices.push(p - 1);
      const copiadas = await novo.copyPages(origem, indices);
      copiadas.forEach((p) => novo.addPage(p));
      const bytesNovo = await novo.save();
      const blob = new Blob([bytesNovo as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resultado?.numeroProcesso ?? processoCodigo} - ${ev.titulo} (${ev.idSei}).pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) {
      setErro(`Falha ao gerar o recorte: ${e?.message ?? e}`);
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">🗂 Documentos — organizar PDF do SEI</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Arraste o PDF único mesclado do SEI para ver a linha do tempo de eventos, em vez de rolar o
            processo inteiro. Recurso novo — zero IA, não grava nada aqui.
          </p>
        </div>
        <button
          onClick={() => setAberto((v) => !v)}
          className="ml-auto px-4 py-2 rounded font-bold text-sm transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
        >
          {aberto ? "Fechar" : "Abrir"}
        </button>
      </div>

      {aberto && (
        <div className="mt-4">
          {!resultado && (
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) processar(f);
              }}
              onClick={() => !processando && inputRef.current?.click()}
              className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                arrastando ? "border-[var(--accent)] bg-[var(--bg-secondary)]" : "border-[var(--border-strong)]"
              }`}
            >
              {processando ? (
                <div>
                  <p className="text-sm text-[var(--text-primary)] mb-2">⏳ Lendo o PDF... {progresso}%</p>
                  <div className="w-full max-w-sm mx-auto h-2 rounded bg-[var(--bg-secondary)] overflow-hidden">
                    <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progresso}%` }} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  📑 Solte o PDF do SEI aqui, ou clique para escolher o arquivo
                </p>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={processando}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processar(f); e.target.value = ""; }}
              />
            </div>
          )}

          {erro && (
            <p className="mt-3 text-sm text-[var(--error)] bg-[var(--error-bg)] rounded p-2">
              ⚠ {erro}
            </p>
          )}

          {resultado && (
            <div className="mt-2">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Processo {resultado.numeroProcesso} · {resultado.totalPaginas} páginas ·{" "}
                  {resultado.eventos.length} eventos
                  {resultado.paginasRevisao.length > 0 && (
                    <> · {resultado.paginasRevisao.length} página(s) sem rodapé legível</>
                  )}
                </p>
                <button
                  onClick={() => { setResultado(null); setArquivo(null); setErro(null); }}
                  className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                >
                  Organizar outro PDF
                </button>
              </div>

              <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                {resultado.eventos.map((ev) => (
                  <div
                    key={`${ev.idSei}-${ev.paginaIni}`}
                    className="flex items-center gap-3 flex-wrap text-sm border-b border-[var(--border)] py-1.5"
                  >
                    <span className="text-[var(--text-muted)] text-xs whitespace-nowrap">
                      pg. {ev.paginaIni}
                      {ev.paginaFim !== ev.paginaIni ? `–${ev.paginaFim}` : ""}
                    </span>
                    <span className="text-[var(--text-primary)]">{ev.titulo}</span>
                    {ev.data && <span className="text-xs text-[var(--text-muted)]">· {ev.data}</span>}
                    {ev.setor && <span className="text-xs text-[var(--text-muted)]">· {ev.setor}</span>}
                    <span className="ml-auto flex gap-2 shrink-0">
                      <button
                        onClick={() => setVisualizando({ pagina: ev.paginaIni, totalDoPdf: resultado.totalPaginas })}
                        className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                      >
                        👁 Abrir
                      </button>
                      <button
                        onClick={() => baixarRecorte(ev)}
                        disabled={baixando === ev.idSei}
                        className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-50"
                      >
                        {baixando === ev.idSei ? "⏳" : "⬇ Baixar"}
                      </button>
                    </span>
                  </div>
                ))}

                {resultado.paginasRevisao.length > 0 && (
                  <div className="mt-3 text-xs text-[var(--text-muted)]">
                    <p className="font-bold mb-1">Páginas sem rodapé legível (revisão):</p>
                    <p>
                      {resultado.paginasRevisao
                        .map((p) => `pg. ${p.pagina} (${ROTULO_MOTIVO[p.motivo] ?? p.motivo})`)
                        .join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {visualizando && arquivo && (
        <VisualizadorPdf
          arquivo={arquivo}
          paginaInicial={visualizando.pagina}
          totalDoPdf={visualizando.totalDoPdf}
          onFechar={() => setVisualizando(null)}
        />
      )}
    </div>
  );
}

function VisualizadorPdf({
  arquivo, paginaInicial, totalDoPdf, onFechar,
}: { arquivo: File; paginaInicial: number; totalDoPdf: number; onFechar: () => void }) {
  const [pagina, setPagina] = useState(paginaInicial);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-[var(--bg-card)] rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
          <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1}
            className="px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-40">
            ◀
          </button>
          <span className="text-sm text-[var(--text-primary)]">Página {pagina} de {totalDoPdf}</span>
          <button onClick={() => setPagina((p) => Math.min(totalDoPdf, p + 1))} disabled={pagina >= totalDoPdf}
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
