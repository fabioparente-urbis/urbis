"use client";

/**
 * components/aceiteSei/OrganizadorSeiAceite.tsx
 *
 * Fase 2 do plano Documentos Vivos (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md), agora no Aceite SEI
 * (Slot 2) — o analista arrasta o PDF único do SEI e vê a linha do tempo de eventos (fatiada por
 * lib/documentosSei/fatiar.ts, zero IA) em vez de rolar o PDF inteiro.
 *
 * REPRODUZIDO por leitura a partir de
 * `components/regularizacao/OrganizadorSeiRegularizacao.tsx` (Slot 1) — pedido explícito do
 * Fábio de ter um idêntico no Aceite SEI (06/09/2026). Isolamento entre slots é regra do
 * CLAUDE.md: os dois componentes são cópias deliberadas, não uma abstração compartilhada — um
 * ajuste num não pode mudar o outro em silêncio. Só o fatiador (`lib/documentosSei/fatiar.ts`) é
 * de fato compartilhado, porque é puro e não conhece slot nenhum: lê PDF do SEI e devolve
 * eventos, igual pros dois.
 *
 * O PDF original NUNCA é enviado ao servidor de novo depois da leitura: fica só na memória do
 * navegador (o `File` que o analista soltou), e "abrir na página N" / "baixar recorte" usam esse
 * mesmo arquivo, no cliente — react-pdf para abrir, pdf-lib para recortar.
 *
 * ZERO gravação automática: a única escrita sozinha é histórico no MHD (dados/metadados, nunca o
 * PDF). Desde 06/09/2026 também PROPÕE valores para os 11 campos do LIP que hoje o Gemini
 * adivinha numa passada só (ver `lib/documentosSei/compararLip.ts`, compartilhado com o Slot 1 —
 * é mapeamento puro, não lógica de negócio de slot), mas só grava depois do ACEITE do analista,
 * campo por campo. Quando o campo já tem valor de outra fonte, mostra os dois lado a lado — "deve
 * haver uma ponderação de cada dado conflitante" (Fábio, 06/09/2026).
 */

import { Fragment, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { PDFDocument } from "pdf-lib";
import "react-pdf/dist/Page/TextLayer.css";
import { sugerirCamposLip, ROTULO_CAMPO_LIP, type SugestaoCampo } from "@/lib/documentosSei/compararLip";
import { ROTULO_PAPEL_PECA, type PecaSei } from "@/lib/documentosSei/pecas";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type EventoSei = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  setor?: string;
  data?: string;
  assinante?: string;
  /** Fase 3: peças separadas de dentro de um contêiner genérico ("Documentação"), quando houver. */
  pecas?: PecaSei[];
};
type PaginaRevisao = { pagina: number; motivo: string };
type CoberturaPecas = { totalPaginasContainer: number; classificadas: number; pendentes: number };
type ResultadoFatiamento = {
  numeroProcesso: string;
  totalPaginas: number;
  eventos: EventoSei[];
  paginasRevisao: PaginaRevisao[];
  coberturaPecas?: CoberturaPecas;
};

const ROTULO_MOTIVO: Record<string, string> = {
  sem_rodape_sem_continuidade: "sem rodapé legível (provável imagem/desenho técnico)",
  processo_divergente: "rodapé de outro processo",
  pagina_rodape_diverge: "número de página do rodapé não bate com a posição real",
};

/**
 * SECGER é o protocolo geral — quem manda pro analista quando o interessado protocola, e quem
 * entrega ao interessado quando o URBIS despacha pra fora. Não é quem EMITIU o documento, então
 * mostrar "SECGER" na coluna Departamento confunde mais do que ajuda.
 */
function departamento(ev: EventoSei): string | undefined {
  if (ev.setor && /secger|secretaria\s+geral/i.test(ev.setor)) return "Interessado";
  return ev.setor;
}

/**
 * Filtro "só a última versão" — HEURÍSTICA SIMPLES, não é o motor de versões da Fase 4 do plano
 * (que ainda não existe: não lê "SEM EFEITO"/"substitui", não tem hierarquia de confiança).
 * Agrupa por título normalizado (número removido) e mantém só a página mais recente de cada
 * grupo. Despacho/Parecer PASSARAM a agrupar também (06/09/2026, pedido do Fábio — antes ficavam
 * de fora e "Despacho 607/1152/1450 - CHEADV - Pendência Documentação" apareciam os três, quando
 * ele queria só o último): como o número do despacho é removido na normalização, só colapsa
 * despachos com o MESMO texto residual — "Pendência Documentação" (3 ocorrências) vira 1,
 * "Documentação conforme" (texto diferente) continua separado. É só filtro de tela: a lista
 * completa (sem o filtro) nunca deixa de existir.
 */
function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d+([./-]\d+)*\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** e-mail é ruído nesta visão resumida — nem o último aparece (pedido do Fábio, 06/09/2026) */
function ehEmail(titulo: string): boolean {
  return /^e-?mail\b/i.test(titulo.trim());
}
function filtrarUltimaVersao(eventos: EventoSei[]): EventoSei[] {
  const semEmail = eventos.filter((ev) => !ehEmail(ev.titulo));
  const ultimoPorGrupo = new Map<string, EventoSei>();
  for (const ev of semEmail) {
    const chave = normalizarTitulo(ev.titulo);
    const atual = ultimoPorGrupo.get(chave);
    if (!atual || ev.paginaFim > atual.paginaFim) ultimoPorGrupo.set(chave, ev);
  }
  const mantidos = new Set([...ultimoPorGrupo.values()]);
  return semEmail.filter((ev) => mantidos.has(ev));
}

type CampoLip = { valor: string; fonte?: string };

export default function OrganizadorSeiAceite({
  processoCodigo, camposLipAtuais, onAceitarCampos,
}: {
  processoCodigo: string;
  /** valores atuais do LIP, passados pelo ProcessoClient — só pra COMPARAR, nunca gravados daqui */
  camposLipAtuais?: Record<string, CampoLip>;
  /** quando fornecido, habilita "Comparar com o LIP"; quem grava de fato é o ProcessoClient */
  onAceitarCampos?: (campos: Record<string, { valor: string; fonte: string }>) => void;
}) {
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
  const [soUltimaVersao, setSoUltimaVersao] = useState(false);
  const [recuperadoDoHistorico, setRecuperadoDoHistorico] = useState(false);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((j) => { if (!cancelado) setAtivo(!!j?.data?.documentos_vivos_aceite_sei_ativo); })
      .catch(() => { if (!cancelado) setAtivo(false); });
    return () => { cancelado = true; };
  }, []);

  /**
   * Sair do processo e voltar perdia o índice já organizado — o PDF nunca ficou no servidor
   * (de propósito), mas os DADOS/METADADOS já ficam no MHD desde 06/09/2026 (ver
   * docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §16.3). Recupera a última organização daqui, se houver.
   * O PDF em si continua não voltando: "Abrir"/"Baixar" ficam desabilitados até o analista soltar
   * o arquivo de novo (aviso na tela, nunca finge que o arquivo está disponível).
   */
  useEffect(() => {
    if (ativo !== true) return;
    let cancelado = false;
    fetch(`/api/mhd?processo=${encodeURIComponent(processoCodigo)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelado || !j?.ok || !j.ativo) return;
        const ultimo = (j.eventos ?? []).find((e: any) => e.tipo === "documentos_sei_organizado");
        if (ultimo?.detalhe) {
          setResultado(ultimo.detalhe as ResultadoFatiamento);
          setRecuperadoDoHistorico(true);
          // NUNCA abre sozinho — pedido explícito do Fábio (06/09/2026): a aba sempre começa
          // fechada em todo LIP, mesmo quando já existe índice recuperado do MHD.
        }
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [ativo, processoCodigo]);

  /**
   * Pré-marca só o que está VAZIO no LIP — quando já existe valor de outra fonte, o Fábio pediu
   * pra nunca decidir sozinho ("deve haver uma ponderação de cada dado conflitante", 06/09/2026):
   * o analista vê os dois lado a lado e marca por conta própria.
   */
  useEffect(() => {
    if (!resultado) { setSelecionados({}); return; }
    const sugestoes = sugerirCamposLip(resultado.eventos);
    const iniciais: Record<string, boolean> = {};
    for (const chave of Object.keys(sugestoes)) iniciais[chave] = !camposLipAtuais?.[chave]?.valor;
    setSelecionados(iniciais);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a NOVO resultado, não a
    // toda mudança de camposLipAtuais (senão desmarcaria seleção do analista a cada autosave)
  }, [resultado]);

  if (!ativo) return null;

  function aceitarSelecionados() {
    if (!resultado || !onAceitarCampos) return;
    const sugestoes = sugerirCamposLip(resultado.eventos);
    const campos: Record<string, { valor: string; fonte: string }> = {};
    for (const [chave, marcado] of Object.entries(selecionados)) {
      if (!marcado) continue;
      const s = sugestoes[chave];
      if (!s) continue;
      campos[chave] = { valor: s.idSei, fonte: `Organizador de PDF SEI — ${s.titulo}, pg. ${s.pagina}` };
    }
    if (!Object.keys(campos).length) return;
    onAceitarCampos(campos);
  }

  async function processar(f: File) {
    setArquivo(f);
    setResultado(null);
    setErro(null);
    setRecuperadoDoHistorico(false);
    setProcessando(true);
    setProgresso(0);
    try {
      const fd = new FormData();
      fd.append("arquivo", f, f.name);
      fd.append("processo_codigo", processoCodigo);
      const r = await fetch("/api/analise-aceite-sei/documentos-sei", { method: "POST", body: fd });
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

  /**
   * Generalizado na Fase 3 para aceitar qualquer intervalo de páginas — não só o evento inteiro,
   * também uma peça de dentro de um contêiner. `chave` identifica o alvo no estado `baixando`.
   */
  async function baixarRecorte(alvo: { chave: string; paginaIni: number; paginaFim: number; titulo: string }) {
    if (!arquivo) return;
    setBaixando(alvo.chave);
    try {
      const bytesOriginal = await arquivo.arrayBuffer();
      const origem = await PDFDocument.load(bytesOriginal);
      const novo = await PDFDocument.create();
      const indices: number[] = [];
      for (let p = alvo.paginaIni; p <= alvo.paginaFim; p++) indices.push(p - 1);
      const copiadas = await novo.copyPages(origem, indices);
      copiadas.forEach((p) => novo.addPage(p));
      const bytesNovo = await novo.save();
      const blob = new Blob([bytesNovo as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resultado?.numeroProcesso ?? processoCodigo} - ${alvo.titulo}.pdf`;
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
          <p className="text-sm font-bold text-[var(--text-primary)]">🗂 Organizador de PDF SEI</p>
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
              {recuperadoDoHistorico && !arquivo && (
                <p className="text-xs text-[var(--warning)] bg-[var(--warning-bg)] rounded p-2 mb-3">
                  📋 Índice recuperado do histórico (MHD), de uma leitura anterior — pode estar
                  DESATUALIZADO se o Organizador melhorou depois dessa leitura (ex.: departamento
                  em branco que hoje seria encontrado). O PDF em si não fica guardado no servidor:
                  solte o PDF de novo pra reprocessar com a versão atual e também pra poder abrir
                  página ou baixar recorte.
                </p>
              )}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Processo {resultado.numeroProcesso} · {resultado.totalPaginas} páginas ·{" "}
                  {resultado.eventos.length} eventos
                  {resultado.paginasRevisao.length > 0 && (
                    <> · {resultado.paginasRevisao.length} página(s) sem rodapé legível</>
                  )}
                  {resultado.coberturaPecas && resultado.coberturaPecas.totalPaginasContainer > 0 && (
                    <> · peças de contêiner: {resultado.coberturaPecas.classificadas}/
                      {resultado.coberturaPecas.totalPaginasContainer} páginas classificadas</>
                  )}
                </p>
                <span className="flex gap-2">
                  <button
                    onClick={() => setSoUltimaVersao((v) => !v)}
                    title="Agrupa por tipo de documento e mostra só a última página de cada um — despacho e parecer nunca são agrupados, cada um continua aparecendo"
                    className={`text-xs px-3 py-1 rounded border ${
                      soUltimaVersao
                        ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                        : "bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border-[var(--border-strong)]"
                    }`}
                  >
                    {soUltimaVersao ? "✓ Só última versão de cada tipo" : "Só última versão de cada tipo"}
                  </button>
                  <button
                    onClick={() => { setResultado(null); setArquivo(null); setErro(null); setRecuperadoDoHistorico(false); }}
                    className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                  >
                    Organizar outro PDF
                  </button>
                </span>
              </div>

              <div className="max-h-[480px] overflow-y-auto pr-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-strong)] sticky top-0 bg-[var(--bg-card)]">
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Nº SEI</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Páginas</th>
                      <th className="py-1.5 pr-2 font-normal">Documento</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Departamento</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Assinado por</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Data</th>
                      <th className="py-1.5 font-normal text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(soUltimaVersao ? filtrarUltimaVersao(resultado.eventos) : resultado.eventos).map((ev) => {
                      const temPecas = !!ev.pecas?.length;
                      const aberto2 = !!expandido[ev.idSei];
                      return (
                      <Fragment key={`${ev.idSei}-${ev.paginaIni}`}>
                      <tr className="border-b border-[var(--border)]">
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                          {temPecas && (
                            <button
                              onClick={() => setExpandido((prev) => ({ ...prev, [ev.idSei]: !prev[ev.idSei] }))}
                              className="mr-1 text-[var(--text-muted)]"
                              title={aberto2 ? "Recolher peças" : `Ver ${ev.pecas!.length} peça(s) dentro deste contêiner`}
                            >
                              {aberto2 ? "▼" : "▶"}
                            </button>
                          )}
                          {ev.idSei}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                          pg. {ev.paginaIni}
                          {ev.paginaFim !== ev.paginaIni ? `–${ev.paginaFim}` : ""}
                        </td>
                        <td className="py-1.5 pr-2 text-[var(--text-primary)] align-top">{ev.titulo}</td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] align-top">
                          {departamento(ev) ?? ""}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] align-top">
                          {ev.assinante ?? ""}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                          {ev.data ?? ""}
                        </td>
                        <td className="py-1.5 align-top">
                          <span className="flex gap-2 justify-end shrink-0">
                            <button
                              onClick={() => setVisualizando({ pagina: ev.paginaIni, totalDoPdf: resultado.totalPaginas })}
                              disabled={!arquivo}
                              title={arquivo ? undefined : "Solte o PDF de novo pra abrir a página"}
                              className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                            >
                              👁 Abrir
                            </button>
                            <button
                              onClick={() => baixarRecorte({ chave: ev.idSei, paginaIni: ev.paginaIni, paginaFim: ev.paginaFim, titulo: `${ev.titulo} (${ev.idSei})` })}
                              disabled={!arquivo || baixando === ev.idSei}
                              title={arquivo ? undefined : "Solte o PDF de novo pra baixar o recorte"}
                              className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                            >
                              {baixando === ev.idSei ? "⏳" : "⬇ Baixar"}
                            </button>
                          </span>
                        </td>
                      </tr>
                      {temPecas && aberto2 && ev.pecas!.map((peca, i) => {
                        const chavePeca = `${ev.idSei}-peca-${i}`;
                        return (
                          <tr key={chavePeca} className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/40">
                            <td className="py-1 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top pl-5">↳</td>
                            <td className="py-1 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                              pg. {peca.paginaIni}{peca.paginaFim !== peca.paginaIni ? `–${peca.paginaFim}` : ""}
                            </td>
                            <td className="py-1 pr-2 text-[var(--text-primary)] align-top" colSpan={3}>
                              {ROTULO_PAPEL_PECA[peca.papel]}
                              {peca.confianca === "baixa" && (
                                <span className="text-[var(--warning)] ml-1">(confiança baixa)</span>
                              )}
                            </td>
                            <td className="py-1 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top" />
                            <td className="py-1 align-top">
                              <span className="flex gap-2 justify-end shrink-0">
                                <button
                                  onClick={() => setVisualizando({ pagina: peca.paginaIni, totalDoPdf: resultado.totalPaginas })}
                                  disabled={!arquivo}
                                  title={arquivo ? undefined : "Solte o PDF de novo pra abrir a página"}
                                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                                >
                                  👁 Abrir
                                </button>
                                <button
                                  onClick={() => baixarRecorte({ chave: chavePeca, paginaIni: peca.paginaIni, paginaFim: peca.paginaFim, titulo: `${ev.titulo} (${ev.idSei}) - ${ROTULO_PAPEL_PECA[peca.papel]}` })}
                                  disabled={!arquivo || baixando === chavePeca}
                                  title={arquivo ? undefined : "Solte o PDF de novo pra baixar o recorte"}
                                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                                >
                                  {baixando === chavePeca ? "⏳" : "⬇ Baixar"}
                                </button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>

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

              {onAceitarCampos && (
                <PainelComparacaoLip
                  eventos={resultado.eventos}
                  camposLipAtuais={camposLipAtuais}
                  selecionados={selecionados}
                  setSelecionados={setSelecionados}
                  onAceitar={aceitarSelecionados}
                />
              )}
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

/**
 * "Comparar com o LIP" — só sugere, nunca grava. Reproduzido por leitura a partir do componente
 * irmão do Slot 1 (mesma regra de isolamento entre slots).
 */
function PainelComparacaoLip({
  eventos, camposLipAtuais, selecionados, setSelecionados, onAceitar,
}: {
  eventos: EventoSei[];
  camposLipAtuais?: Record<string, { valor: string; fonte?: string }>;
  selecionados: Record<string, boolean>;
  setSelecionados: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  onAceitar: () => void;
}) {
  const sugestoes = sugerirCamposLip(eventos);
  const chaves = Object.keys(sugestoes);
  if (!chaves.length) return null;
  const totalMarcados = chaves.filter((c) => selecionados[c]).length;

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Comparar com o LIP</p>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        Sugestão determinística (Nº SEI do documento encontrado), zero IA. Quando o campo já tem
        valor de outra fonte, os dois aparecem lado a lado — decida você qual vale.
      </p>
      <div className="space-y-1">
        {chaves.map((chave) => {
          const sugestao: SugestaoCampo = sugestoes[chave];
          const atual = camposLipAtuais?.[chave];
          const conflito = !!atual?.valor && atual.valor !== sugestao.idSei;
          return (
            <label
              key={chave}
              className={`flex items-center gap-3 text-xs rounded p-2 cursor-pointer ${
                conflito ? "bg-[var(--warning-bg)]" : "bg-[var(--bg-secondary)]"
              }`}
            >
              <input
                type="checkbox"
                checked={!!selecionados[chave]}
                onChange={(e) => setSelecionados((prev) => ({ ...prev, [chave]: e.target.checked }))}
              />
              <span className="font-semibold text-[var(--text-primary)] w-32 shrink-0">
                {ROTULO_CAMPO_LIP[chave] ?? chave}
              </span>
              <span className="text-[var(--text-muted)] flex-1">
                atual: {atual?.valor ? <b className="text-[var(--text-primary)]">{atual.valor}</b> : "(vazio)"}
                {atual?.fonte ? ` · ${atual.fonte}` : ""}
              </span>
              <span className="text-[var(--text-muted)] flex-1">
                sugestão: <b className="text-[var(--text-primary)]">{sugestao.idSei}</b> — {sugestao.titulo}, pg. {sugestao.pagina}
              </span>
            </label>
          );
        })}
      </div>
      <button
        onClick={onAceitar}
        disabled={totalMarcados === 0}
        className="mt-3 text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
      >
        Aceitar {totalMarcados || ""} selecionado(s) para o LIP
      </button>
    </div>
  );
}
