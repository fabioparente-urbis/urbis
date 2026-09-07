"use client";

/**
 * components/aprovacaoProjeto/OrganizadorSlot5.tsx
 *
 * "Organizador de Documentos" do Slot 5 (Aprovação de Projeto) — pedido do Fábio depois do
 * Documentos Vivos dos Slots 1/2, com uma correção importante: aqui **não é fatiador**. O Slot 5
 * recebe os documentos como arquivos JÁ SEPARADOS numa pasta (`lib/lerPastaSlot5.ts`,
 * `/api/lip/ler-pasta`) — não existe PDF único mesclado do SEI pra fatiar em eventos. E o Slot 5
 * já classifica e já versiona de verdade no MHD (`registrarLeitura`, `lib/mhd.ts`) desde antes —
 * o problema que motivou a persistência real dos Slots 1/2 nunca existiu aqui.
 *
 * Este componente é 100% LEITURA sobre o que já está no MHD (`/api/mhd?processo=`, a mesma rota
 * que `ProcessoClient.tsx` já usa em `abrirMHD`) — não faz upload, não reclassifica, não grava
 * documento nem versão. A única escrita é 1 evento de auditoria (`mhd_eventos`, só metadado) toda
 * vez que o Organizador é aberto — mesmo procedimento já usado pelo Organizador de PDF SEI dos
 * Slots 1/2 (aparece na pilha do `/admin/mhd`).
 *
 * "Abrir na íntegra": o arquivo NUNCA fica guardado no servidor — o analista solta a pasta local
 * de novo (mesmo princípio dos Slots 1/2: URBIS só busca o que já classificou, o arquivo em si
 * vive no dispositivo dele). Cada `File` solto é casado por NOME com a linha da tabela vinda do
 * MHD. PDF abre com o mesmo visualizador dos Slots 1/2 (`react-pdf`), documento INTEIRO, nunca
 * recortado. Imagem abre com `<img>`. Qualquer outro tipo (DWG/DXF/RAR/etc. — o Slot 5 aceita
 * todos, `lib/lerPastaSlot5.ts`) não tem visualizador no projeto: só "Baixar".
 */

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type VersaoMhd = {
  versao: number;
  vigente: boolean;
  nome_arquivo: string;
  hash: string;
  rodada: number;
  lido_em: string;
  origem?: string | null;
  data_documento?: string | null;
};
type DocumentoMhd = { papel: string; rotulo: string; escopo: string; versoes: VersaoMhd[] };

const EXT_IMAGEM = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

function extensao(nome: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nome);
  return m ? m[1].toLowerCase() : "";
}

export default function OrganizadorSlot5({ processoCodigo }: { processoCodigo: string }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [documentos, setDocumentos] = useState<DocumentoMhd[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [soVigente, setSoVigente] = useState(true);
  const [arquivosLocais, setArquivosLocais] = useState<Map<string, File>>(new Map());
  const [visualizando, setVisualizando] = useState<{ arquivo: File; nome: string } | null>(null);

  useEffect(() => {
    if (!aberto || documentos || carregando) return;
    setCarregando(true);
    setErro(null);
    fetch(`/api/mhd?processo=${encodeURIComponent(processoCodigo)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setErro(j.erro ?? "Falha ao carregar o histórico do MHD"); return; }
        const docs: DocumentoMhd[] = j.documentos ?? [];
        setDocumentos(docs);
        // registro de auditoria — só metadado, mesmo procedimento do Organizador de PDF SEI
        fetch("/api/mac/slot-05/organizador-evento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ processo_codigo: processoCodigo, documentos: docs.length }),
        }).catch(() => {});
      })
      .catch((e) => setErro(String(e?.message ?? e)))
      .finally(() => setCarregando(false));
  }, [aberto, documentos, carregando, processoCodigo]);

  function aoSoltarArquivos(lista: FileList | File[]) {
    setArquivosLocais((prev) => {
      const mapa = new Map(prev);
      for (const f of Array.from(lista)) mapa.set(f.name, f);
      return mapa;
    });
  }

  function baixar(nome: string) {
    const arquivo = arquivosLocais.get(nome);
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (!processoCodigo) return null;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)]">🗂 Organizador de Documentos</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Documentos já lidos deste processo, organizados por papel — abra cada um na íntegra,
            sem recorte. Recurso novo, só leitura: não reclassifica nem grava nada aqui.
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
          {carregando && <p className="text-sm text-[var(--text-muted)]">⏳ Carregando...</p>}
          {erro && (
            <p className="text-sm text-[var(--error)] bg-[var(--error-bg)] rounded p-2">⚠ {erro}</p>
          )}

          {documentos && documentos.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              Nenhum documento no MHD ainda pra este processo — leia a pasta pelo LIP ou pelo MAC
              primeiro.
            </p>
          )}

          {documentos && documentos.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="text-xs text-[var(--text-muted)]">
                  {documentos.length} documento(s) ·{" "}
                  {arquivosLocais.size > 0
                    ? `${arquivosLocais.size} arquivo(s) soltos nesta sessão, prontos pra abrir/baixar`
                    : "solte a pasta local abaixo pra habilitar abrir/baixar"}
                </p>
                <button
                  onClick={() => setSoVigente((v) => !v)}
                  className={`text-xs px-3 py-1 rounded border ${
                    soVigente
                      ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                      : "bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border-[var(--border-strong)]"
                  }`}
                >
                  {soVigente ? "✓ Só vigente" : "Só vigente"}
                </button>
              </div>

              <label className="block rounded-lg border-2 border-dashed border-[var(--border-strong)] p-4 text-center cursor-pointer mb-3 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]">
                📁 Solte a pasta local aqui (ou clique) pra poder abrir/baixar os documentos —
                nada é enviado ao servidor, fica só na memória do navegador
                <input
                  type="file"
                  className="hidden"
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  onChange={(e) => { if (e.target.files?.length) aoSoltarArquivos(e.target.files); e.target.value = ""; }}
                />
              </label>

              <div className="max-h-[420px] overflow-y-auto pr-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-strong)] sticky top-0 bg-[var(--bg-card)]">
                      <th className="py-1.5 pr-2 font-normal">Papel</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Versão</th>
                      <th className="py-1.5 pr-2 font-normal">Arquivo</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Lido em</th>
                      <th className="py-1.5 font-normal text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.flatMap((doc) => {
                      const versoes = soVigente ? doc.versoes.filter((v) => v.vigente) : doc.versoes;
                      return versoes.map((v) => {
                        const disponivel = arquivosLocais.has(v.nome_arquivo);
                        const ext = extensao(v.nome_arquivo);
                        const podeVisualizar = ext === "pdf" || EXT_IMAGEM.has(ext);
                        return (
                          <tr key={`${doc.papel}-${v.versao}`} className="border-b border-[var(--border)]">
                            <td className="py-1.5 pr-2 text-[var(--text-primary)] align-top">
                              {doc.rotulo || doc.papel}
                              {doc.escopo ? <span className="text-[var(--text-muted)]"> ({doc.escopo})</span> : null}
                            </td>
                            <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                              v{v.versao}{v.vigente ? " (vigente)" : ""}
                            </td>
                            <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] align-top">{v.nome_arquivo}</td>
                            <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                              {v.lido_em ? new Date(v.lido_em).toLocaleString("pt-BR") : ""}
                            </td>
                            <td className="py-1.5 align-top">
                              <span className="flex gap-2 justify-end shrink-0">
                                <button
                                  onClick={() => setVisualizando({ arquivo: arquivosLocais.get(v.nome_arquivo)!, nome: v.nome_arquivo })}
                                  disabled={!disponivel || !podeVisualizar}
                                  title={!disponivel ? "Solte a pasta local pra abrir" : !podeVisualizar ? "Sem visualizador pra este tipo de arquivo — use Baixar" : undefined}
                                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                                >
                                  👁 Abrir
                                </button>
                                <button
                                  onClick={() => baixar(v.nome_arquivo)}
                                  disabled={!disponivel}
                                  title={disponivel ? undefined : "Solte a pasta local pra baixar"}
                                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                                >
                                  ⬇ Baixar
                                </button>
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {visualizando && (
        <VisualizadorArquivo
          arquivo={visualizando.arquivo}
          nome={visualizando.nome}
          onFechar={() => setVisualizando(null)}
        />
      )}
    </div>
  );
}

function VisualizadorArquivo({
  arquivo, nome, onFechar,
}: { arquivo: File; nome: string; onFechar: () => void }) {
  const ext = extensao(nome);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-[var(--bg-card)] rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
          <span className="text-sm text-[var(--text-primary)] truncate">{nome}</span>
          {ext === "pdf" && totalPaginas && (
            <>
              <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1}
                className="ml-auto px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-40">
                ◀
              </button>
              <span className="text-sm text-[var(--text-primary)] whitespace-nowrap">Página {pagina} de {totalPaginas}</span>
              <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
                className="px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] disabled:opacity-40">
                ▶
              </button>
            </>
          )}
          <button onClick={onFechar} className={`${ext === "pdf" ? "" : "ml-auto"} px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)]`}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto flex justify-center p-4">
          {ext === "pdf" ? (
            <Document
              file={arquivo}
              loading={<p className="text-[var(--text-muted)]">Carregando...</p>}
              onLoadSuccess={({ numPages }) => setTotalPaginas(numPages)}
            >
              <Page pageNumber={pagina} width={640} renderTextLayer renderAnnotationLayer={false} />
            </Document>
          ) : EXT_IMAGEM.has(ext) ? (
            // eslint-disable-next-line @next/next/no-img-element -- File em memória, não dá pra usar next/image
            <img src={URL.createObjectURL(arquivo)} alt={nome} className="max-w-full max-h-full object-contain" />
          ) : (
            <p className="text-[var(--text-muted)] text-sm">Sem visualizador pra este tipo de arquivo — use "⬇ Baixar".</p>
          )}
        </div>
      </div>
    </div>
  );
}
