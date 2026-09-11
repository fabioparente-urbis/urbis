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

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { AVISO_IA_DESLIGADA } from "@/lib/constants";
import VisualizadorPdf from "@/components/documentosSei/VisualizadorPdf";
import { sugerirCamposLip, ROTULO_CAMPO_LIP, type SugestaoCampo } from "@/lib/documentosSei/compararLip";
import { ROTULO_PAPEL_PECA, ehContainerGenerico, aplicarClassificacaoVisao, type PecaSei } from "@/lib/documentosSei/pecas";
import { resolverEstados, type EstadoVersao } from "@/lib/documentosSei/motorVersoes";
import { gerarPacoteVigente, baixarBlob } from "@/lib/documentosSei/pacoteVigenteClient";
import { salvarPdfNavegador, carregarPdfNavegador } from "@/lib/documentosSei/cachePdfNavegador";
import { rotuloDoEvento, rotuloDoPapelPeca, montarListaDaAnalise, TIPOS_DA_ANALISE_ACEITE } from "@/lib/documentosSei/rotuloAnalista";
import { hashCurtoOrigem, dataParaNomeArquivo } from "@/lib/documentosSei/hashOrigem";

const ROTULO_ESTADO: Record<EstadoVersao, string> = {
  vigente: "🟢 Vigente",
  substituido: "⚫ Substituído",
  complementar: "🔵 Complementar",
  sem_efeito: "🔴 Sem efeito",
  historico: "🕘 Histórico",
  duplicado: "🕘 Duplicado",
  pendente: "🟡 Pendente",
};

type EventoSei = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  setor?: string;
  data?: string;
  assinante?: string;
  /** o que o CORPO do documento afirma, quando o título do SEI não diz (ver fatiar.ts) */
  papelPorConteudo?: "busca" | "vistoria" | "foto";
  /** Fase 3: peças separadas de dentro de um contêiner genérico ("Documentação"), quando houver. */
  pecas?: PecaSei[];
};
type PaginaRevisao = { pagina: number; motivo: string };
type CoberturaPecas = { totalPaginasContainer: number; classificadas: number; pendentes: number };
type ResumoPersistencia = {
  documentosNovos: number;
  versoesNovas: number;
  inalterados: number;
  alertasIntegridade: { idSei: string; papel: string; motivo: string }[];
  problemas: string[];
};
type ResultadoFatiamento = {
  numeroProcesso: string;
  totalPaginas: number;
  eventos: EventoSei[];
  paginasRevisao: PaginaRevisao[];
  coberturaPecas?: CoberturaPecas;
  /** Passo 0 das Fases 6/7 — o que foi gravado de verdade no MHD nesta leitura. */
  persistencia?: ResumoPersistencia | null;
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
/**
 * Título que NÃO carrega informação suficiente pra afirmar que dois documentos são versões um do
 * outro — nesse caso o filtro nunca agrupa, mantém todos. Cópia isolada da mesma regra do Slot 1
 * (`components/regularizacao/OrganizadorSeiRegularizacao.tsx`), nunca compartilhada entre os dois.
 *
 * ACHADO REAL (08/09/2026, medido em processo real do Slot 1): o filtro colapsava todas as
 * "Documentação" do processo numa só — e cada uma é um LOTE DIFERENTE de documentos, entregue em
 * data diferente, com conteúdo diferente (uma traz ART/certidão/embargo, outra traz o laudo).
 * Mesmo problema com "Processo" e "Relatório". Dois casos, o mesmo motivo (título genérico demais
 * pra sustentar "é a mesma coisa"): contêiner genérico, ou título que sobra 1 palavra só depois de
 * tirar os números. O caso que motivou o agrupamento (despachos CHEADV de pendência com texto
 * residual idêntico) continua agrupando normalmente.
 */
function tituloGenericoDemaisParaAgrupar(titulo: string): boolean {
  if (ehContainerGenerico(titulo)) return true;
  return normalizarTitulo(titulo).split(/\s+/).filter(Boolean).length < 2;
}

function filtrarUltimaVersao(eventos: EventoSei[]): EventoSei[] {
  const semEmail = eventos.filter((ev) => !ehEmail(ev.titulo));
  const ultimoPorGrupo = new Map<string, EventoSei>();
  for (const ev of semEmail) {
    if (tituloGenericoDemaisParaAgrupar(ev.titulo)) continue; // nunca agrupa — todos ficam
    const chave = normalizarTitulo(ev.titulo);
    const atual = ultimoPorGrupo.get(chave);
    if (!atual || ev.paginaFim > atual.paginaFim) ultimoPorGrupo.set(chave, ev);
  }
  const mantidos = new Set([...ultimoPorGrupo.values()]);
  return semEmail.filter((ev) => tituloGenericoDemaisParaAgrupar(ev.titulo) || mantidos.has(ev));
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
  const [visualizando, setVisualizando] = useState<{ pagina: number; paginaIni: number; paginaFim: number } | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [soUltimaVersao, setSoUltimaVersao] = useState(false);
  const [recuperadoDoHistorico, setRecuperadoDoHistorico] = useState(false);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [gerandoPacote, setGerandoPacote] = useState(false);
  const [analisandoPendentes, setAnalisandoPendentes] = useState(false);
  const [sugestoesGemini, setSugestoesGemini] = useState<Record<number, string | null> | null>(null);
  const [geminiAtivo, setGeminiAtivo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then((j) => {
        if (cancelado) return;
        setAtivo(!!j?.data?.documentos_vivos_aceite_sei_ativo);
        // Fase 8: aviso recorrente enquanto o Gemini estiver ligado (gasta dinheiro real por
        // página) — pedido explícito do Fábio (06/09/2026). Reaparece toda vez que a tela abre.
        setGeminiAtivo(!!j?.data?.documentos_vivos_gemini_ativo);
      })
      .catch(() => { if (!cancelado) setAtivo(false); });
    return () => { cancelado = true; };
  }, []);

  /**
   * Sair do processo e voltar perdia o índice já organizado — o PDF nunca ficou no SERVIDOR (de
   * propósito), mas os DADOS/METADADOS já ficam no MHD desde 06/09/2026 (ver
   * docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §16.3). Recupera a última organização daqui, se houver.
   *
   * O PDF em si, a partir de 08/09/2026 (pedido do Fábio), tenta voltar do cache do NAVEGADOR
   * (IndexedDB, válido por 180 dias — ver lib/documentosSei/cachePdfNavegador.ts): se achar,
   * "Abrir"/"Baixar" voltam a funcionar sem precisar soltar o PDF de novo. Só quando o cache
   * também não tem (outro navegador/dispositivo, cache expirado, ou nunca foi salvo) é que o
   * aviso pedindo pra soltar o PDF de novo aparece.
   */
  useEffect(() => {
    if (ativo !== true) return;
    let cancelado = false;
    fetch(`/api/mhd?processo=${encodeURIComponent(processoCodigo)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (j) => {
        if (cancelado || !j?.ok || !j.ativo) return;
        const ultimo = (j.eventos ?? []).find((e: any) => e.tipo === "documentos_sei_organizado");
        if (ultimo?.detalhe) {
          setResultado(ultimo.detalhe as ResultadoFatiamento);
          setRecuperadoDoHistorico(true);
          // NUNCA abre sozinho — pedido explícito do Fábio (06/09/2026): a aba sempre começa
          // fechada em todo LIP, mesmo quando já existe índice recuperado do MHD.
          const cache = await carregarPdfNavegador(processoCodigo);
          if (!cancelado && cache) {
            setArquivo(cache.arquivo);
            // O índice guardado corresponde ao PDF ENXUTO (só o que ainda vale) — usar o do MHD
            // aqui abriria a página errada, porque a numeração mudou ao descartar o superado.
            if (cache.indice) setResultado(cache.indice as ResultadoFatiamento);
          }
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

  /**
   * Fase 4 (motor de versões) — resolve vigente/substituído/sem efeito DENTRO deste fatiamento
   * (um PDF, uma sessão). Só informativo por enquanto: o Organizador ainda não cria documento/
   * versão persistente por peça no MHD (ver cabeçalho de motorVersoes.ts), então não há onde
   * "aceitar" gravar — a tela só mostra a proposta, junto do motivo e da confiança.
   */
  const estadosPorIdSei = useMemo(() => {
    if (!resultado) return new Map<string, ReturnType<typeof resolverEstados>[number]>();
    return new Map(resolverEstados(resultado.eventos).map((r) => [r.idSei, r]));
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
      // processo_codigo também na query string: deixa o servidor autorizar ANTES de ler o PDF
      // inteiro (§23.6 da auditoria). O corpo continua mandando o mesmo valor.
      const r = await fetch(`/api/analise-aceite-sei/documentos-sei?processo_codigo=${encodeURIComponent(processoCodigo)}`, { method: "POST", body: fd });
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
        } else if (ev.tipo === "persistencia") {
          // linha separada de propósito: o índice chega antes da gravação, então uma gravação
          // lenta (ou que falhe) nunca custa o resultado na tela. Ver §23.6 do plano.
          if (dados) dados.persistencia = ev.persistencia ?? null;
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
      guardarNoCache(f, dados);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setProcessando(false);
    }
  }

  /**
   * Guarda no navegador SÓ o que ainda vale (pedido do Fábio, 08/09/2026: "besteira guardar
   * partes do PDF substituídas... sempre manter apenas a última versão de cada um").
   *
   * Monta um PDF novo, enxuto, com as páginas dos documentos que o motor de versões (Fase 4) não
   * marcou como superados, e guarda junto o índice REMAPEADO — a numeração de página muda quando
   * se descarta metade do arquivo, e sem o índice novo "Abrir pg. 130" abriria a página errada.
   *
   * O que é descartado do cache continua existindo no MHD (o índice completo, com o que foi
   * substituído) e no PDF original que o analista tem em mãos — o navegador é só um atalho pra
   * não precisar soltar o arquivo de novo, nunca a fonte da verdade.
   */
  async function guardarNoCache(f: File, dados: ResultadoFatiamento) {
    try {
      const SUPERADOS = new Set<EstadoVersao>(["substituido", "duplicado", "historico", "sem_efeito"]);
      const estadoPorId = new Map(resolverEstados(dados.eventos).map((r) => [r.idSei, r.estado]));
      const manter = dados.eventos.filter((ev) => !SUPERADOS.has(estadoPorId.get(ev.idSei) as EstadoVersao));
      if (!manter.length) return;

      const origem = await PDFDocument.load(await f.arrayBuffer());
      const enxuto = await PDFDocument.create();
      const eventosRemapeados: EventoSei[] = [];
      let cursor = 0;
      for (const ev of manter) {
        const indices: number[] = [];
        for (let p = ev.paginaIni; p <= ev.paginaFim; p++) indices.push(p - 1);
        const copiadas = await enxuto.copyPages(origem, indices);
        copiadas.forEach((p) => enxuto.addPage(p));
        const novoIni = cursor + 1;
        cursor += indices.length;
        const deslocamento = novoIni - ev.paginaIni;
        eventosRemapeados.push({
          ...ev,
          paginaIni: novoIni,
          paginaFim: cursor,
          pecas: ev.pecas?.map((pc) => ({
            ...pc,
            paginaIni: pc.paginaIni + deslocamento,
            paginaFim: pc.paginaFim + deslocamento,
          })),
        });
      }

      const bytes = await enxuto.save();
      const arquivoEnxuto = new File([bytes as BlobPart], f.name, { type: "application/pdf" });
      await salvarPdfNavegador(processoCodigo, arquivoEnxuto, {
        ...dados,
        totalPaginas: cursor,
        eventos: eventosRemapeados,
        // páginas em revisão são numeradas pelo PDF ORIGINAL — não sobrevivem ao recorte, e
        // manter números errados seria pior que não mostrar.
        paginasRevisao: [],
      } satisfies ResultadoFatiamento);
    } catch {
      // cache é conveniência: falhar aqui (cota, PDF protegido) nunca pode custar a leitura.
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
      // Data + hash curto do PDF de ORIGEM no nome (07/09/2026, ver hashOrigem.ts): sem isso, o
      // recorte avulso é o pior caso do princípio §5.7 ("todo documento derivado nasce
      // rastreável") — nenhum manifesto o acompanha, e dois recortes com o mesmo título baixados
      // dias depois, de um PDF do SEI diferente, ficavam com o MESMO nome de arquivo.
      const hashOrigem = await hashCurtoOrigem(bytesOriginal);
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
      a.download = `${resultado?.numeroProcesso ?? processoCodigo} - ${alvo.titulo} - ${dataParaNomeArquivo()} - ${hashOrigem}.pdf`;
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

  /**
   * Exporta a lista de documentos em .txt (pedido do Fábio, 08/09/2026) — pra ele preencher o
   * LIP olhando a lista, fora da tela. Respeita o filtro "Só última versão de cada tipo" já
   * aplicado na tabela. Não depende de `arquivo` (só do índice, `resultado`) — funciona mesmo
   * num processo recuperado do histórico, sem precisar soltar o PDF de novo.
   */
  function exportarListaTxt() {
    if (!resultado) return;
    const linhas: string[] = [];
    let titulo: string;
    let sufixoArquivo: string;

    if (soUltimaVersao) {
      // Modo "documentos da análise": sai exatamente a lista que o analista monta à mão, no
      // padrão `TIPO SEI`, e o que faltou sai marcado — a ausência é parte da informação.
      const itens = montarListaDaAnalise(resultado.eventos, TIPOS_DA_ANALISE_ACEITE);
      for (const item of itens) {
        if (!item.idSei) {
          linhas.push(`${item.tipo} — NÃO ENCONTRADO neste processo`);
          continue;
        }
        const paginas = item.paginaIni === item.paginaFim
          ? `pg. ${item.paginaIni}`
          : `pg. ${item.paginaIni}-${item.paginaFim}`;
        const partes = [`${item.tipo} ${item.idSei}`, item.titulo ?? "", paginas];
        if (item.setor) partes.push(item.setor);
        if (item.data) partes.push(item.data);
        linhas.push(partes.filter(Boolean).join(" — "));
      }
      const achados = itens.filter((i) => i.idSei).length;
      titulo = `Processo ${resultado.numeroProcesso} — documentos da análise: ${achados} de ${itens.length} encontrados`;
      sufixoArquivo = " (documentos da analise)";
    } else {
      for (const ev of resultado.eventos) {
        const paginas = ev.paginaIni === ev.paginaFim ? `pg. ${ev.paginaIni}` : `pg. ${ev.paginaIni}-${ev.paginaFim}`;
        const dep = departamento(ev);
        const rotulo = rotuloDoEvento(ev);
        const partes = [rotulo ? `${rotulo} ${ev.idSei}` : ev.idSei, ev.titulo, paginas];
        if (dep) partes.push(dep);
        if (ev.data) partes.push(ev.data);
        linhas.push(partes.join(" — "));
        for (const peca of ev.pecas ?? []) {
          const rotuloPeca = rotuloDoPapelPeca(peca.papel);
          if (!rotuloPeca) continue;
          const pgPeca = peca.paginaIni === peca.paginaFim ? `pg. ${peca.paginaIni}` : `pg. ${peca.paginaIni}-${peca.paginaFim}`;
          linhas.push(`  ${rotuloPeca} ${ev.idSei} — dentro de "${ev.titulo}" — ${pgPeca}`);
        }
      }
      titulo = `Processo ${resultado.numeroProcesso} — ${resultado.eventos.length} documento(s)`;
      sufixoArquivo = " (lista completa)";
    }

    const texto = `${titulo}\n\n${linhas.join("\n")}\n`;
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    baixarBlob(blob, `${resultado.numeroProcesso} - documentos${sufixoArquivo}.txt`);
  }

  /**
   * Fase 5 — pacote vigente + manifesto. Opera só sobre os EVENTOS (nível 1), não sobre as peças
   * de dentro dos contêineres (Fase 4 ainda não resolve estado por peça — ver §18 do plano).
   */
  async function baixarPacoteVigente() {
    if (!arquivo || !resultado) return;
    setGerandoPacote(true);
    try {
      const estados = resolverEstados(resultado.eventos);
      const { blob, nomeArquivo } = await gerarPacoteVigente({
        arquivo, numeroProcesso: resultado.numeroProcesso, eventos: resultado.eventos, estados,
      });
      baixarBlob(blob, nomeArquivo);
    } catch (e: any) {
      setErro(`Falha ao gerar o pacote vigente: ${e?.message ?? e}`);
    } finally {
      setGerandoPacote(false);
    }
  }

  /**
   * Fase 8 — "Analisar páginas ambíguas (Gemini)". Só sob clique explícito (com confirmação de
   * custo estimado), nunca automático. Estimativa duplicada aqui (não importa
   * lib/documentosSei/visaoAmbiguas.ts, que carrega lib/visao/rasterizar no topo — módulo
   * server-only, mupdf/WASM — pra não arriscar entrar no bundle do cliente).
   */
  function paginasPendentes(): number[] {
    const out: number[] = [];
    for (const ev of resultado?.eventos ?? []) {
      for (const peca of ev.pecas ?? []) {
        if (peca.papel !== "classificacao_pendente") continue;
        for (let p = peca.paginaIni; p <= peca.paginaFim; p++) out.push(p);
      }
    }
    return out;
  }
  function estimarCustoUsd(nPaginas: number): number {
    return nPaginas * (1100 * (0.3 / 1_000_000) + 200 * (2.5 / 1_000_000));
  }
  async function analisarPendentes() {
    if (!arquivo || !resultado) return;
    const paginas = paginasPendentes();
    if (!paginas.length) return;
    /**
     * Interruptor conferido ANTES de perguntar do custo (regra do Fábio, 07/09/2026 —
     * `docs/URBIS_PLANO_GOVERNANCA_IA.md` §5). Perguntar "confirma US$ 0,004?" e só então dizer
     * que está desligado faz o analista aprovar um gasto que nunca poderia acontecer, e não
     * ensina nada. O servidor recusa de novo de qualquer jeito — isto aqui é para o analista,
     * não para a segurança.
     */
    if (!geminiAtivo) { setErro(AVISO_IA_DESLIGADA); return; }
    const custo = estimarCustoUsd(paginas.length);
    if (!window.confirm(`Mandar ${paginas.length} página(s) pro Gemini? Custo estimado: US$ ${custo.toFixed(4)}.`)) return;
    setAnalisandoPendentes(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo, arquivo.name);
      fd.append("processo_codigo", processoCodigo);
      fd.append("paginas", JSON.stringify(paginas));
      const r = await fetch("/api/analise-aceite-sei/documentos-sei/analisar-pendentes", { method: "POST", body: fd });
      const j = await r.json();
      // "IA desligada" é instrução, não falha: vai limpo, sem o prefixo "Falha ao..." que faria
      // o analista ler como defeito do sistema em vez de algo que ele resolve pedindo liberação.
      if (!j.ok && j.iaDesligada) { setErro(j.erro ?? AVISO_IA_DESLIGADA); return; }
      if (!j.ok) throw new Error(j.erro ?? "Falha ao analisar páginas ambíguas");
      const mapa: Record<number, string | null> = {};
      for (const item of j.resultados) mapa[item.pagina] = item.papel;
      setSugestoesGemini(mapa);
      /**
       * Aplica a classificação da visão ao índice — sem isso o resultado ficava só num aviso
       * solto na tela, e a lista da análise continuava dizendo "ART não encontrada" mesmo depois
       * de o analista ter pagado pra descobrir onde ela está. Só mexe em página que estava
       * `classificacao_pendente` (ver aplicarClassificacaoVisao): regra determinística nunca é
       * sobrescrita por palpite de visão.
       */
      setResultado((prev) =>
        prev
          ? {
              ...prev,
              eventos: prev.eventos.map((ev) =>
                ev.pecas?.length ? { ...ev, pecas: aplicarClassificacaoVisao(ev.pecas, mapa) } : ev,
              ),
            }
          : prev,
      );
    } catch (e: any) {
      setErro(`Falha ao analisar páginas ambíguas: ${e?.message ?? e}`);
    } finally {
      setAnalisandoPendentes(false);
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

      {geminiAtivo && (
        <p className="mt-3 text-xs text-[var(--warning)] bg-[var(--warning-bg)] rounded p-2">
          💰 "Analisar páginas ambíguas (Gemini)" está LIGADO — cada clique gasta dinheiro real
          (cobrado por token/página). Desligue em <code>urbis_config.documentos_vivos_gemini_ativo</code>{" "}
          quando não precisar mais.
        </p>
      )}

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
                    title="Mostra só os documentos que a análise precisa (uso do solo, CHEADV conforme, vistoria, físico, projeto, laudo, ART/RRT, certidão, procuração, embargo, busca), o mais recente de cada — inclusive os que estão dentro de 'Documentação'. Tipo que não existir no processo aparece marcado como não encontrado."
                    className={`text-xs px-3 py-1 rounded border ${
                      soUltimaVersao
                        ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                        : "bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border-[var(--border-strong)]"
                    }`}
                  >
                    {soUltimaVersao ? "✓ Só os documentos da análise" : "Só os documentos da análise"}
                  </button>
                  <button
                    onClick={exportarListaTxt}
                    title="Exporta a lista de documentos (nº SEI, título, páginas) em .txt — respeita o filtro de versão acima, funciona mesmo sem o PDF solto de novo"
                    className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                  >
                    📄 Exportar lista (.txt)
                  </button>
                  <button
                    onClick={baixarPacoteVigente}
                    disabled={!arquivo || gerandoPacote}
                    title={arquivo ? "Zip com o manifesto + um PDF recortado por documento, separado em Vigentes/Histórico" : "Solte o PDF de novo pra gerar o pacote"}
                    className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40"
                  >
                    {gerandoPacote ? "⏳ Gerando..." : "📦 Baixar pacote vigente"}
                  </button>
                  {paginasPendentes().length > 0 && (
                    <button
                      onClick={analisarPendentes}
                      disabled={!arquivo || analisandoPendentes}
                      title="Manda as páginas não classificadas pro Gemini — mostra o custo estimado antes, nunca automático"
                      className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40"
                    >
                      {analisandoPendentes ? "⏳ Analisando..." : `🔎 Analisar ${paginasPendentes().length} página(s) ambígua(s) (Gemini)`}
                    </button>
                  )}
                  <button
                    onClick={() => { setResultado(null); setArquivo(null); setErro(null); setRecuperadoDoHistorico(false); }}
                    className="text-xs px-3 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                  >
                    Organizar outro PDF
                  </button>
                </span>
              </div>

              {resultado.persistencia && (
                <div className="mb-3 text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded p-2">
                  <p>
                    <b className="text-[var(--text-primary)]">O que mudou nesta leitura (MHD):</b>{" "}
                    {resultado.persistencia.documentosNovos} documento(s) novo(s),{" "}
                    {resultado.persistencia.versoesNovas} versão(ões) nova(s),{" "}
                    {resultado.persistencia.inalterados} sem mudança.
                  </p>
                  {resultado.persistencia.alertasIntegridade.length > 0 && (
                    <p className="text-[var(--warning)] mt-1">
                      ⚠ {resultado.persistencia.alertasIntegridade.map((a) => a.motivo).join(" · ")}
                    </p>
                  )}
                </div>
              )}

              {sugestoesGemini && (
                <div className="mb-3 text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded p-2">
                  <p className="font-bold text-[var(--text-primary)] mb-1">
                    Sugestão do Gemini pras páginas ambíguas (proposta — nada foi aplicado sozinho):
                  </p>
                  {Object.entries(sugestoesGemini).map(([pagina, papel]) => (
                    <p key={pagina}>
                      pg. {pagina}: {papel ? (ROTULO_PAPEL_PECA as any)[papel] ?? papel : "não reconhecida"}
                    </p>
                  ))}
                </div>
              )}

              <div className="max-h-[480px] overflow-y-auto pr-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-strong)] sticky top-0 bg-[var(--bg-card)]">
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Nº SEI</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Páginas</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap" title="Tipo no vocabulário da análise, deduzido do título do SEI. Em branco quando o título não permite afirmar (ex.: dois documentos chamados só 'Relatório')">Tipo</th>
                      <th className="py-1.5 pr-2 font-normal">Documento</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Departamento</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Assinado por</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap">Data</th>
                      <th className="py-1.5 pr-2 font-normal whitespace-nowrap" title="Proposta do motor de versões (Fase 4) — só informativo, nada gravado">Estado</th>
                      <th className="py-1.5 font-normal text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Modo "lista da análise": em vez da linha do tempo do SEI inteira, só os
                        documentos que o analista abre pra analisar, um de cada tipo, o mais
                        recente de cada — inclusive os que estão DENTRO dos contêineres. Tipo não
                        encontrado aparece assim mesmo: saber que falta a ART é informação. */}
                    {soUltimaVersao && montarListaDaAnalise(resultado.eventos, TIPOS_DA_ANALISE_ACEITE).map((item) => (
                      <tr key={item.tipo} className="border-b border-[var(--border)]">
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                          {item.idSei ?? "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                          {item.paginaIni
                            ? `pg. ${item.paginaIni}${item.paginaFim !== item.paginaIni ? `–${item.paginaFim}` : ""}`
                            : ""}
                        </td>
                        <td className="py-1.5 pr-2 text-xs whitespace-nowrap align-top">
                          <span className={item.idSei ? "font-bold text-[var(--accent)]" : "font-bold text-[var(--text-muted)]"}>
                            {item.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 align-top text-[var(--text-primary)]">
                          {item.idSei ? (
                            <>
                              {item.titulo}
                              {item.dePeca && (
                                <span className="text-xs text-[var(--text-muted)] ml-1">
                                  (dentro deste documento)
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-[var(--warning)]">
                              não encontrado neste processo
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] align-top">{item.setor ?? ""}</td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] align-top" />
                        <td className="py-1.5 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top">
                          {item.data ?? ""}
                        </td>
                        <td className="py-1.5 pr-2 text-xs whitespace-nowrap align-top" />
                        <td className="py-1.5 align-top">
                          {item.idSei && item.paginaIni && item.paginaFim && (
                            <span className="flex gap-2 justify-end shrink-0">
                              <button
                                onClick={() => setVisualizando({ pagina: item.paginaIni!, paginaIni: item.paginaIni!, paginaFim: item.paginaFim! })}
                                disabled={!arquivo}
                                title={arquivo ? undefined : "Solte o PDF de novo pra abrir a página"}
                                className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                              >
                                👁 Abrir
                              </button>
                              <button
                                onClick={() => baixarRecorte({ chave: `analise-${item.tipo}`, paginaIni: item.paginaIni!, paginaFim: item.paginaFim!, titulo: `${item.tipo} ${item.idSei}` })}
                                disabled={!arquivo || baixando === `analise-${item.tipo}`}
                                title={arquivo ? undefined : "Solte o PDF de novo pra baixar o recorte"}
                                className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap"
                              >
                                {baixando === `analise-${item.tipo}` ? "⏳" : "⬇ Baixar"}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!soUltimaVersao && resultado.eventos.map((ev) => {
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
                        <td className="py-1.5 pr-2 text-xs whitespace-nowrap align-top">
                          {(() => {
                            const rot = rotuloDoEvento(ev);
                            if (!rot) return <span className="text-[var(--text-muted)]">—</span>;
                            return (
                              <span className="font-bold text-[var(--accent)]">{rot}</span>
                            );
                          })()}
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
                        <td className="py-1.5 pr-2 text-xs whitespace-nowrap align-top">
                          {(() => {
                            const est = estadosPorIdSei.get(ev.idSei);
                            if (!est) return null;
                            return <span title={`${est.motivo} (confiança ${est.confianca})`}>{ROTULO_ESTADO[est.estado]}</span>;
                          })()}
                        </td>
                        <td className="py-1.5 align-top">
                          <span className="flex gap-2 justify-end shrink-0">
                            <button
                              onClick={() => setVisualizando({ pagina: ev.paginaIni, paginaIni: ev.paginaIni, paginaFim: ev.paginaFim })}
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
                            <td className="py-1 pr-2 text-xs whitespace-nowrap align-top">
                              {(() => {
                                const rotPeca = rotuloDoPapelPeca(peca.papel);
                                return rotPeca
                                  ? <span className="font-bold text-[var(--accent)]">{rotPeca}</span>
                                  : <span className="text-[var(--text-muted)]">—</span>;
                              })()}
                            </td>
                            <td className="py-1 pr-2 text-[var(--text-primary)] align-top" colSpan={3}>
                              {ROTULO_PAPEL_PECA[peca.papel]}
                              {peca.confianca === "baixa" && (
                                <span className="text-[var(--warning)] ml-1">(confiança baixa)</span>
                              )}
                            </td>
                            <td className="py-1 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top" />
                            <td className="py-1 pr-2 text-xs text-[var(--text-muted)] whitespace-nowrap align-top" />
                            <td className="py-1 align-top">
                              <span className="flex gap-2 justify-end shrink-0">
                                <button
                                  onClick={() => setVisualizando({ pagina: peca.paginaIni, paginaIni: peca.paginaIni, paginaFim: peca.paginaFim })}
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
          paginaIni={visualizando.paginaIni}
          paginaFim={visualizando.paginaFim}
          onFechar={() => setVisualizando(null)}
        />
      )}
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
