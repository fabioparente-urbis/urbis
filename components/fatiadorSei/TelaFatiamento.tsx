"use client";

/**
 * components/fatiadorSei/TelaFatiamento.tsx — núcleo da Fase 6 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("módulo próprio e tela gráfica").
 *
 * Tela nova, fora do processo, 100% operável por teclado (Mac e Windows) — pedido explícito do
 * Fábio (10/09/2026): "o esquema é velocidade no fatiamento". Reaproveita o pipeline de produção
 * sem alterá-lo (`/api/analise-{slot}/documentos-sei`, mesmo `fatiarPdfSei`/`abrirContainer` de
 * sempre) e acrescenta o que não existia: correção manual do corte, com histórico de
 * desfazer/refazer (`hooks/useHistoricoReducer.ts`) e rastreabilidade de cada ação
 * (`/api/documentos-sei/fatiador-eventos`, grava em `mhd_eventos`, mesma fonte que já alimenta o
 * BDI hoje).
 *
 * Em 11/09/2026 esta tela recebeu os três recursos que só existiam no Organizador (dentro do
 * processo), para que ele possa ser removido do Slot 1/2 sem o analista perder nada no caminho —
 * decisão do Fábio, "leva os 3 pro Fatiador, depois arranca":
 *   1. comparar com o LIP e gravar campo na ficha (só campo VAZIO, nunca sobrescreve);
 *   2. pacote vigente + manifesto (.zip, Vigentes/Histórico);
 *   3. "Analisar páginas ambíguas" com a visão do Gemini, sob clique e com custo estimado antes.
 *
 * Mesmo dia, pedido do Fábio já usando a tela: renomear o PDF exportado (`R`, muda só o nome do
 * arquivo — `nomeExportacao` em `estadoEdicao.ts` —, nunca o título da lista); ir direto pra uma
 * página do visualizador digitando o número; abrir o PDF do processo inteiro em outra aba
 * (`Cmd/Ctrl+P`, `blob:` local, nunca sobe ao servidor).
 *
 * 14/09/2026, olhando a tela ao vivo: `MiniaturaPdf` na coluna do meio — fixa mesmo quando a lista
 * rola, mostra a página candidata a corte (ou a primeira do item selecionado), clique amplia no
 * visualizador grande, que por sua vez ganhou setas do teclado e Esc. A classificação de cada
 * linha virou clicável — liga na tela o `editarPapel` que já existia no reducer desde a Fase 6,
 * mas nunca tinha UI. Refinado em 15/09/2026: dois modos com atalho próprio cada — `R` digita
 * livre (`rotuloManual`), `E` escolhe da lista fechada de papéis (`editarPapel`); clique do mouse
 * abre o mais provável pro item. "Exportar confirmados" baixa num zip só todos os itens ✓, depois
 * de exportar um avulso só
 * esbarrar na pergunta óbvia seguinte: "e se tiver várias da mesma forma?". E "Limpar fatiador"
 * zera tudo sem forçar a escolher outro arquivo na hora.
 *
 * O último fatiamento em andamento passa a ficar salvo POR USUÁRIO no navegador (IndexedDB, ver
 * `lib/documentosSei/rascunhoFatiador.ts`), auto-salvo debounced a cada correção — recarregar a
 * página ou fechar sem querer não perde o trabalho. Nunca sobe pro servidor.
 *
 * Mesmo dia: "Exportar/Importar configuração" (`lib/documentosSei/configuracaoFatiador.ts`) — um
 * .zip portátil com o PDF completo + um Excel (nomes, páginas, fatias, cortes), pra levar o
 * trabalho pra fora do navegador (backup, outra máquina, outro analista) e voltar exatamente ao
 * ponto de onde parou. Diferente do rascunho automático (que é POR USUÁRIO e só existe no
 * IndexedDB local): este é um arquivo de verdade, que o analista escolhe quando gerar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VisualizadorPdf from "@/components/documentosSei/VisualizadorPdf";
import MiniaturaPdf from "@/components/documentosSei/MiniaturaPdf";
import { ROTULO_PAPEL_PECA, ehContainerGenerico, type PecaSei } from "@/lib/documentosSei/pecas";
import { rotuloDoEvento, rotuloDoPapelPeca } from "@/lib/documentosSei/rotuloAnalista";
import { exportarItem, exportarItensEmZip } from "@/lib/documentosSei/exportarPecas";
import { dataParaNomeArquivo } from "@/lib/documentosSei/hashOrigem";
import { baixarBlob, gerarPacoteVigente } from "@/lib/documentosSei/pacoteVigenteClient";
import { resolverEstados } from "@/lib/documentosSei/motorVersoes";
import { sugerirCamposLip, ROTULO_CAMPO_LIP } from "@/lib/documentosSei/compararLip";
import { AVISO_IA_DESLIGADA } from "@/lib/constants";
import { agruparEmLotes, itensParaLeitura } from "@/lib/documentosSei/agruparParaLeitura";
import { lerLotes, type ResultadoLote, type CampoLido } from "@/lib/documentosSei/lerComGemini";
import { LIMITE_BYTES_MODELO_PADRAO } from "@/lib/modeloGemini";
import {
  reduzirFatiamento, ESTADO_VAZIO, type ItemFatiado, type StatusEdicao,
} from "@/lib/documentosSei/estadoEdicao";
import { salvarRascunho, carregarRascunho, limparRascunho, type RascunhoFatiador } from "@/lib/documentosSei/rascunhoFatiador";
import { exportarConfiguracao, importarConfiguracao } from "@/lib/documentosSei/configuracaoFatiador";
import { useHistoricoReducer } from "@/hooks/useHistoricoReducer";
import { useAtalhosTeclado } from "@/hooks/useAtalhosTeclado";
import { rotuloAtalho, type Atalho } from "@/lib/documentosSei/atalhosTeclado";

type Slot = "regularizacao" | "aceite_sei";

const ROTA_POR_SLOT: Record<Slot, string> = {
  regularizacao: "/api/analise-regularizacao/documentos-sei",
  aceite_sei: "/api/analise-aceite-sei/documentos-sei",
};
const NOME_SLOT: Record<Slot, string> = {
  regularizacao: "Regularização (Slot 1)",
  aceite_sei: "Aceite SEI (Slot 2)",
};

type EventoSei = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  setor?: string;
  data?: string;
  assinante?: string;
  papelPorConteudo?: "busca" | "vistoria" | "foto";
  pecas?: PecaSei[];
};
type ResultadoFatiamento = {
  numeroProcesso: string;
  totalPaginas: number;
  eventos: EventoSei[];
};

/** Vocabulário de papéis conhecido, pra popular o <select> de classificação — ordenado pelo rótulo. */
const OPCOES_PAPEL = Object.entries(ROTULO_PAPEL_PECA)
  .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

const ROTULO_STATUS: Record<StatusEdicao, string> = {
  proposto: "proposto",
  confirmado: "✓ confirmado",
  editado: "✎ editado",
  lixo: "🗑 lixo",
};
const COR_STATUS: Record<StatusEdicao, string> = {
  proposto: "text-[var(--text-muted)]",
  confirmado: "text-[#16A34A]",
  editado: "text-[var(--accent)]",
  lixo: "text-[var(--error)]",
};

/** Achata eventos + peças de contêiner numa lista só de itens editáveis, na ordem de página. */
function montarItensIniciais(eventos: EventoSei[]): ItemFatiado[] {
  const itens: ItemFatiado[] = [];
  for (const ev of eventos) {
    if (ehContainerGenerico(ev.titulo) && ev.pecas?.length) {
      for (let i = 0; i < ev.pecas.length; i++) {
        const p = ev.pecas[i];
        itens.push({
          id: `${ev.idSei}::peca::${i}`, idSei: ev.idSei, titulo: ev.titulo, papel: p.papel,
          paginaIni: p.paginaIni, paginaFim: p.paginaFim, setor: p.setor, assinante: p.assinante,
          data: p.data, status: "proposto", paraLeitura: true,
        });
      }
    } else {
      itens.push({
        id: ev.idSei, idSei: ev.idSei, titulo: rotuloDoEvento(ev) ?? ev.titulo,
        paginaIni: ev.paginaIni, paginaFim: ev.paginaFim, setor: ev.setor, assinante: ev.assinante,
        data: ev.data, status: "proposto", paraLeitura: true,
      });
    }
  }
  return itens;
}

export default function TelaFatiamento() {
  const [slot, setSlot] = useState<Slot>("regularizacao");
  const [processoCodigo, setProcessoCodigo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [numeroProcesso, setNumeroProcesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<{ pagina: number; paginaIni: number; paginaFim: number } | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);
  const [exportandoConfirmados, setExportandoConfirmados] = useState(false);
  /** Só filtro de EXIBIÇÃO — pedido do Fábio (15/09/2026). Não mexe no estado real dos itens; as
   * ações (exportar confirmados, enviar pra leitura etc.) continuam olhando `itens` inteiro. */
  const [ocultarLixo, setOcultarLixo] = useState(false);
  /** Nome do proprietário — pedido do Fábio (15/09/2026): "faltou o nome do proprietário e o
   * número do processo SEI, como no LIP do Slot 1 ou 2". O número (`numeroProcesso`, lido do
   * próprio PDF) já existia; só o nome nunca era buscado — a ficha só era lida sob clique de
   * "Comparar com o LIP". */
  const [proprietarioNome, setProprietarioNome] = useState<string | null>(null);
  const [exportandoConfig, setExportandoConfig] = useState(false);
  const [importandoConfig, setImportandoConfig] = useState(false);
  const importConfigRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const [progressoLeitura, setProgressoLeitura] = useState<{ mensagem: string; pct: number } | null>(null);
  const [resultadoLeitura, setResultadoLeitura] = useState<ResultadoLote | null>(null);
  /**
   * Os eventos como o servidor devolveu, antes de virarem itens editáveis. Guardados porque o
   * pacote-zip (motorVersoes) e a análise de páginas ambíguas trabalham sobre EVENTO/peça, não
   * sobre o item achatado — portados do Organizador em 11/09/2026.
   */
  const [eventosBrutos, setEventosBrutos] = useState<EventoSei[] | null>(null);
  const [geminiAtivo, setGeminiAtivo] = useState(false);
  const [gerandoPacote, setGerandoPacote] = useState(false);
  const [analisandoPendentes, setAnalisandoPendentes] = useState(false);
  const [comparandoLip, setComparandoLip] = useState(false);
  const [camposLipAtuais, setCamposLipAtuais] = useState<Record<string, { valor?: string } | undefined>>({});
  const [selecionadosLip, setSelecionadosLip] = useState<Record<string, boolean>>({});
  const [salvandoLip, setSalvandoLip] = useState(false);
  const [nomeRenomeando, setNomeRenomeando] = useState("");
  /**
   * Edição inline da classificação, direto na linha da lista — pedido do Fábio (14/09/2026):
   * "quero poder editar o nome ali na classificação pendente", refinado em 15/09/2026 em dois
   * modos distintos, cada um com seu atalho: `select` escolhe da lista fechada de papéis
   * conhecidos (`ROTULO_PAPEL_PECA` — texto livre ali quebraria os lugares que testam
   * `papel === "classificacao_pendente"`, como `paginasPendentes` abaixo); `texto` digita livre,
   * gravando em `rotuloManual` (não em `papel` nem `titulo` — ver o campo em estadoEdicao.ts).
   * Clique do mouse abre o modo mais provável pro item (select se já tem papel, texto senão); `R`
   * sempre abre texto, `E` sempre abre select — o analista escolhe, não o item.
   */
  const [editandoClassificacaoId, setEditandoClassificacaoId] = useState<string | null>(null);
  const [modoEdicaoClassificacao, setModoEdicaoClassificacao] = useState<"texto" | "select">("texto");
  const [tituloEditando, setTituloEditando] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const renomearInputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  /** URL do PDF inteiro aberto em outra aba — guardada pra revogar quando troca de arquivo. */
  const urlPdfInteiroRef = useRef<string | null>(null);

  // Rascunho por usuário (14/09/2026) — precisa saber QUEM está logado antes de guardar/checar
  // qualquer coisa; mesma rota que a tela de configurações já usa pra isso.
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoFatiador | null>(null);
  const rascunhoSalvandoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (!cancelado && j?.data?.id) setUsuarioId(j.data.id); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  // Checa se sobrou um rascunho salvo, uma vez, assim que sabe QUEM está logado — só enquanto a
  // tela ainda está vazia (não sobrepõe um fatiamento que já esteja em andamento).
  useEffect(() => {
    if (!usuarioId || numeroProcesso) return;
    let cancelado = false;
    carregarRascunho(usuarioId).then((r) => { if (!cancelado && r) setRascunho(r); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  function restaurarRascunho(r: RascunhoFatiador) {
    setProcessoCodigo(r.processoCodigo);
    setSlot(r.slot as Slot);
    setErro(null);
    const arquivoRestaurado = new File([r.arquivoBlob], r.arquivoNome, { type: r.arquivoTipo });
    setArquivo(arquivoRestaurado);
    setEventosBrutos(r.eventosBrutos as EventoSei[]);
    setNumeroProcesso(r.numeroProcesso);
    resetar({ itens: r.itens, selecionadoId: r.itens[0]?.id ?? null });
    setResultadoLeitura((r.resultadoLeitura as ResultadoLote | undefined) ?? null);
    setRascunho(null);
  }

  function descartarRascunho() {
    if (usuarioId) limparRascunho(usuarioId);
    setRascunho(null);
  }

  const { estado, aplicar, desfazer, refazer, resetar, podeDesfazer, podeRefazer } =
    useHistoricoReducer(reduzirFatiamento, ESTADO_VAZIO);

  const itens = estado.itens;
  const selecionado = itens.find((i) => i.id === estado.selecionadoId) ?? null;
  /** página candidata a novo corte dentro do item selecionado — ajustável com ←/→ */
  const [paginaCorte, setPaginaCorte] = useState<number | null>(null);

  // Guarda o progresso automaticamente, debounced — mesmo padrão de auto-save já usado na ficha do
  // LIP (ProcessoClient.tsx), só que aqui o destino é o navegador do próprio analista, não o banco.
  useEffect(() => {
    if (!usuarioId || !arquivo || !numeroProcesso || !eventosBrutos) return;
    if (rascunhoSalvandoRef.current) clearTimeout(rascunhoSalvandoRef.current);
    rascunhoSalvandoRef.current = setTimeout(() => {
      salvarRascunho(usuarioId, {
        processoCodigo, slot, numeroProcesso, eventosBrutos, itens,
        arquivoNome: arquivo.name, arquivoTipo: arquivo.type, arquivoBlob: arquivo,
        resultadoLeitura,
      });
    }, 1200);
    return () => { if (rascunhoSalvandoRef.current) clearTimeout(rascunhoSalvandoRef.current); };
  }, [itens, usuarioId, arquivo, numeroProcesso, eventosBrutos, processoCodigo, slot, resultadoLeitura]);

  // Campo de renomear segue a seleção: troca de item mostra o nome DELE, não o do anterior.
  useEffect(() => {
    setNomeRenomeando(selecionado?.nomeExportacao ?? "");
  }, [selecionado?.id]);

  // A lista rola sozinha pra acompanhar a seleção — pedido do Fábio (15/09/2026): "à medida que
  // vou pondo pra baixo [ArrowDown], a barra lateral tem que descer pra sempre mostrar a linha
  // selecionada". `block: "nearest"` só rola o mínimo pra trazer a linha de volta à vista — não
  // recentraliza a cada passo, o que deixaria a rolagem "pulando" a cada seta.
  useEffect(() => {
    listaRef.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: "nearest" });
  }, [estado.selecionadoId]);

  // Nome do proprietário no cabeçalho, igual ao LIP — busca uma vez, assim que o PDF é processado
  // e o número do processo (SEI) já está sabido. Silencioso se a ficha não existir ainda
  // (processo novo que o analista ainda não abriu no LIP) ou se falhar: o Fatiador funciona
  // normalmente sem esse dado, é só contexto extra.
  useEffect(() => {
    if (!numeroProcesso || !processoCodigo) { setProprietarioNome(null); return; }
    let cancelado = false;
    carregarFichaLip()
      .then((dados) => { if (!cancelado) setProprietarioNome(dados?.proprietario?.valor ?? null); })
      .catch(() => { if (!cancelado) setProprietarioNome(null); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeroProcesso]);

  // O objeto URL do PDF inteiro só faz sentido para o arquivo atual — revoga ao trocar/sair.
  useEffect(() => {
    return () => { if (urlPdfInteiroRef.current) URL.revokeObjectURL(urlPdfInteiroRef.current); };
  }, [arquivo]);

  const registrarEvento = useCallback(
    (tipo: string, titulo: string, detalhe?: unknown) => {
      if (!processoCodigo) return;
      fetch("/api/documentos-sei/fatiador-eventos", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoCodigo, tipo, titulo, detalhe }),
      }).catch(() => {}); // rastreabilidade é melhor esforço — nunca trava a ação do analista
    },
    [processoCodigo],
  );

  async function processar(f: File) {
    if (!processoCodigo.trim()) { setErro("Informe o código do processo antes de soltar o PDF."); return; }
    setArquivo(f);
    setErro(null);
    resetar(ESTADO_VAZIO);
    setNumeroProcesso(null);
    setProcessando(true);
    setProgresso(0);
    try {
      const fd = new FormData();
      fd.append("arquivo", f, f.name);
      fd.append("processo_codigo", processoCodigo);
      const r = await fetch(`${ROTA_POR_SLOT[slot]}?processo_codigo=${encodeURIComponent(processoCodigo)}`, {
        method: "POST", body: fd,
      });
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
      const d = dados as ResultadoFatiamento;
      setNumeroProcesso(d.numeroProcesso);
      setEventosBrutos(d.eventos);
      resetar({ itens: montarItensIniciais(d.eventos), selecionadoId: null });
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setProcessando(false);
    }
  }

  /**
   * Interruptor global de IA, lido uma vez. Conferido ANTES de perguntar do custo (regra do Fábio,
   * 07/09/2026 — docs/URBIS_PLANO_GOVERNANCA_IA.md §5): perguntar "confirma US$ 0,004?" e só
   * depois dizer que está desligado faz o analista aprovar um gasto que nunca poderia acontecer.
   * O servidor recusa de novo de qualquer jeito — isto aqui é para o analista, não para a segurança.
   */
  useEffect(() => {
    let cancelado = false;
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (!cancelado) setGeminiAtivo(!!j?.data?.documentos_vivos_gemini_ativo); })
      .catch(() => { if (!cancelado) setGeminiAtivo(false); });
    return () => { cancelado = true; };
  }, []);

  /** Pacote vigente + manifesto — portado do Organizador. Opera sobre EVENTOS, não sobre peças. */
  async function baixarPacoteVigente() {
    if (!arquivo || !eventosBrutos || !numeroProcesso) return;
    setGerandoPacote(true);
    try {
      const { blob, nomeArquivo } = await gerarPacoteVigente({
        arquivo, numeroProcesso, eventos: eventosBrutos as any,
        estados: resolverEstados(eventosBrutos as any),
      });
      baixarBlob(blob, nomeArquivo);
      registrarEvento("fatiador_exportacao", `pacote vigente — ${nomeArquivo}`);
    } catch (e: any) {
      setErro(`Falha ao gerar o pacote vigente: ${e?.message ?? e}`);
    } finally {
      setGerandoPacote(false);
    }
  }

  /** Páginas que o fatiador não conseguiu classificar sozinho — candidatas à visão. */
  const paginasPendentes = useMemo(() => {
    const out: number[] = [];
    for (const i of itens) {
      if (i.papel !== "classificacao_pendente" || i.status !== "proposto") continue;
      for (let p = i.paginaIni; p <= i.paginaFim; p++) out.push(p);
    }
    return out;
  }, [itens]);

  /**
   * Estimativa duplicada aqui de propósito (mesma razão do Organizador): importar
   * lib/documentosSei/visaoAmbiguas.ts traria lib/visao/rasterizar junto, que é server-only
   * (mupdf/WASM) e não pode entrar no bundle do cliente.
   */
  function estimarCustoUsd(nPaginas: number): number {
    return nPaginas * (1100 * (0.3 / 1_000_000) + 200 * (2.5 / 1_000_000));
  }

  async function analisarPendentes() {
    if (!arquivo || !paginasPendentes.length) return;
    if (!geminiAtivo) { setErro(AVISO_IA_DESLIGADA); return; }
    const custo = estimarCustoUsd(paginasPendentes.length);
    if (!window.confirm(`Mandar ${paginasPendentes.length} página(s) pro Gemini? Custo estimado: US$ ${custo.toFixed(4)}.`)) return;
    setAnalisandoPendentes(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo, arquivo.name);
      fd.append("processo_codigo", processoCodigo);
      fd.append("paginas", JSON.stringify(paginasPendentes));
      const r = await fetch(`${ROTA_POR_SLOT[slot]}/analisar-pendentes`, { method: "POST", body: fd });
      const j = await r.json();
      // "IA desligada" é instrução, não falha: vai sem o prefixo "Falha ao...", que faria o
      // analista ler como defeito do sistema em vez de algo que ele resolve pedindo liberação.
      if (!j.ok && j.iaDesligada) { setErro(j.erro ?? AVISO_IA_DESLIGADA); return; }
      if (!j.ok) throw new Error(j.erro ?? "Falha ao analisar páginas ambíguas");
      const porPagina: Record<number, string | null> = {};
      for (const item of j.resultados) porPagina[item.pagina] = item.papel;
      aplicar({ tipo: "aplicarVisao", porPagina });
      registrarEvento("fatiador_correcao", `visão classificou ${Object.keys(porPagina).length} página(s) ambígua(s)`, { paginas: paginasPendentes });
    } catch (e: any) {
      setErro(`Falha ao analisar páginas ambíguas: ${e?.message ?? e}`);
    } finally {
      setAnalisandoPendentes(false);
    }
  }

  /**
   * "Comparar com o LIP" — terceiro e último recurso portado do Organizador (11/09/2026).
   *
   * Diferença de desenho, obrigatória: o Organizador vivia DENTRO de `ProcessoClient` e entregava
   * os campos por callback (`onAceitarCampos`), com o estado do LIP já na mão. O Fatiador é tela
   * separada — precisa buscar a ficha (`/api/processo/carregar`) e gravar (`/api/processo/salvar`)
   * por conta própria.
   *
   * REGRA: só preenche campo VAZIO, nunca sobrescreve o que já está lá — mesma regra que a
   * sugestão do MAC (Fase 9B) já usa. Campo já preenchido aparece na lista, dizendo com o quê,
   * mas desmarcado: quem decide trocar é o analista, não a tela. E a ficha é relida na hora de
   * gravar, para não escrever por cima de algo alterado em outra aba nesse meio tempo.
   */
  const sugestoesLip = useMemo(
    () => (eventosBrutos ? sugerirCamposLip(eventosBrutos as any) : {}),
    [eventosBrutos],
  );

  async function carregarFichaLip() {
    if (!processoCodigo) return null;
    const r = await fetch(`/api/processo/carregar?id=${encodeURIComponent(processoCodigo)}&tipo=${slot}`, { credentials: "include" });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.erro ?? "não consegui carregar a ficha do processo");
    return (j.dados ?? {}) as Record<string, { valor?: string } | undefined>;
  }

  async function abrirComparacaoLip() {
    setErro(null);
    try {
      const dados = await carregarFichaLip();
      if (!dados) return;
      setCamposLipAtuais(dados);
      const iniciais: Record<string, boolean> = {};
      for (const chave of Object.keys(sugestoesLip)) iniciais[chave] = !dados[chave]?.valor;
      setSelecionadosLip(iniciais);
      setComparandoLip(true);
    } catch (e: any) {
      setErro(`Falha ao comparar com o LIP: ${e?.message ?? e}`);
    }
  }

  async function aceitarCamposLip() {
    const marcados = Object.entries(selecionadosLip).filter(([, v]) => v).map(([k]) => k);
    if (!marcados.length) return;
    setSalvandoLip(true);
    setErro(null);
    try {
      const dados = await carregarFichaLip(); // relê agora, não confia no que foi lido antes
      if (!dados) return;
      const novo: Record<string, any> = { ...dados };
      let gravados = 0;
      for (const chave of marcados) {
        const s = sugestoesLip[chave];
        if (!s) continue;
        novo[chave] = { valor: s.idSei, origem: "urbis", fonte: `Fatiador de PDF SEI — ${s.titulo}, pg. ${s.pagina}` };
        gravados++;
      }
      const r = await fetch("/api/processo/salvar", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: processoCodigo, dados: novo, tipo: slot }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.erro ?? "o servidor recusou a gravação");
      registrarEvento("fatiador_correcao", `${gravados} campo(s) aceito(s) no LIP`, { campos: marcados });
      setCamposLipAtuais(novo);
      setComparandoLip(false);
    } catch (e: any) {
      setErro(`Falha ao gravar no LIP: ${e?.message ?? e}`);
    } finally {
      setSalvandoLip(false);
    }
  }

  function selecionar(id: string) {
    aplicar({ tipo: "selecionar", id });
    setPaginaCorte(null);
  }

  function moverSelecao(direcao: 1 | -1) {
    aplicar({ tipo: "moverSelecao", direcao });
    setPaginaCorte(null);
  }

  function confirmar() {
    if (!selecionado) return;
    aplicar({ tipo: "confirmar", id: selecionado.id });
    registrarEvento("fatiador_confirmacao", `${selecionado.titulo} (${selecionado.idSei})`, { paginas: [selecionado.paginaIni, selecionado.paginaFim] });
  }

  function alternarLixo() {
    if (!selecionado) return;
    if (selecionado.status === "lixo") {
      aplicar({ tipo: "restaurarDoLixo", id: selecionado.id });
      registrarEvento("fatiador_restauracao", `${selecionado.titulo} (${selecionado.idSei})`);
    } else {
      aplicar({ tipo: "marcarLixo", id: selecionado.id });
      registrarEvento("fatiador_lixo", `${selecionado.titulo} (${selecionado.idSei})`);
    }
  }

  function moverPaginaCorte(direcao: 1 | -1) {
    if (!selecionado) return;
    const min = selecionado.paginaIni + 1;
    const max = selecionado.paginaFim;
    if (min > max) return; // item de 1 página só não tem onde cortar
    setPaginaCorte((p) => {
      const atual = p ?? min;
      return Math.min(max, Math.max(min, atual + direcao));
    });
  }

  function aplicarNovoCorte() {
    if (!selecionado || paginaCorte == null) return;
    aplicar({ tipo: "novoCorte", id: selecionado.id, naPagina: paginaCorte });
    registrarEvento("fatiador_corte", `${selecionado.titulo} (${selecionado.idSei})`, { naPagina: paginaCorte });
    setPaginaCorte(null);
  }

  function excluirCorte() {
    if (!selecionado) return;
    aplicar({ tipo: "excluirCorte", id: selecionado.id });
    registrarEvento("fatiador_correcao", `junta ${selecionado.titulo} (${selecionado.idSei}) ao vizinho anterior`);
  }

  function alternarParaLeitura() {
    if (!selecionado) return;
    aplicar({ tipo: "alternarParaLeitura", id: selecionado.id });
  }

  /**
   * Fase 7 — "ligar fatiador à leitura". Agrupa os itens marcados (`paraLeitura`, sem lixo) em
   * lotes até LIMITE_BYTES_MODELO_PADRAO e roda o mesmo pipeline S1→S2→S3 que a tela do processo
   * usa, só que sobre os lotes menores. Resultado é PROPOSTA — nunca grava em lugar nenhum
   * sozinho, o analista confere e copia pra onde precisar (mesmo princípio de sempre).
   */
  async function enviarParaLeitura() {
    if (!arquivo || !processoCodigo.trim() || lendo) return;
    const elegiveis = itensParaLeitura(itens);
    if (!elegiveis.length) { setErro("Nenhum item marcado para leitura (tudo lixo ou desmarcado)."); return; }
    setLendo(true);
    setErro(null);
    setResultadoLeitura(null);
    setProgressoLeitura({ mensagem: "Montando lotes...", pct: 0 });
    try {
      const lotes = await agruparEmLotes(arquivo, itens, LIMITE_BYTES_MODELO_PADRAO);
      const resultado = await lerLotes(
        lotes, { processoCodigo, slot },
        (mensagem, pct) => setProgressoLeitura({ mensagem, pct }),
      );
      setResultadoLeitura(resultado);
      registrarEvento("fatiador_leitura", `${lotes.length} lote(s), ${elegiveis.length} item(ns)`, {
        lotes: lotes.length, itens: elegiveis.length, foraDaLeitura: itens.length - elegiveis.length,
        campos: Object.keys(resultado.campos).length,
      });
    } catch (e: any) {
      setErro(`Falha na leitura: ${e?.message ?? e}`);
    } finally {
      setLendo(false);
      setProgressoLeitura(null);
    }
  }

  function abrirVisualizador() {
    if (!selecionado) return;
    setVisualizando({ pagina: paginaCorte ?? selecionado.paginaIni, paginaIni: selecionado.paginaIni, paginaFim: selecionado.paginaFim });
  }

  async function exportarSelecionado() {
    if (!selecionado || !arquivo) return;
    setExportando(selecionado.id);
    try {
      const { blob, nomeArquivo } = await exportarItem(arquivo, selecionado);
      baixarBlob(blob, nomeArquivo);
      registrarEvento("fatiador_exportacao", nomeArquivo, { idSei: selecionado.idSei, papel: selecionado.papel });
    } catch (e: any) {
      setErro(`Falha ao exportar: ${e?.message ?? e}`);
    } finally {
      setExportando(null);
    }
  }

  /**
   * Exporta todos os itens CONFIRMADOS de uma vez, num zip — pedido do Fábio (14/09/2026): "e se
   * tiver várias da mesma forma?", depois de confirmar a primeira fatia e perguntar se dava pra
   * exportar só ela. Baixar N PDFs avulsos ao mesmo tempo esbarra no bloqueio de pop-up/download
   * múltiplo do navegador — por isso um zip só.
   */
  const confirmados = useMemo(() => itens.filter((i) => i.status === "confirmado"), [itens]);
  async function exportarConfirmados() {
    if (!arquivo || !confirmados.length) return;
    setExportandoConfirmados(true);
    setErro(null);
    try {
      const nomeDoZip = `${numeroProcesso} - confirmados - ${dataParaNomeArquivo()}.zip`;
      const { blob, nomeArquivo } = await exportarItensEmZip(arquivo, confirmados, nomeDoZip);
      baixarBlob(blob, nomeArquivo);
      registrarEvento("fatiador_exportacao", `${confirmados.length} confirmado(s) em zip`, { itens: confirmados.length });
    } catch (e: any) {
      setErro(`Falha ao exportar confirmados: ${e?.message ?? e}`);
    } finally {
      setExportandoConfirmados(false);
    }
  }

  /** Renomeia o item selecionado — só muda o nome do PDF exportado, não o título na lista. */
  function renomearSelecionado() {
    if (!selecionado) return;
    const nome = nomeRenomeando.trim();
    if (!nome) return;
    aplicar({ tipo: "renomear", id: selecionado.id, nomeExportacao: nome });
    registrarEvento("fatiador_correcao", `renomeado para "${nome}"`, { idSei: selecionado.idSei, id: selecionado.id });
  }

  /** O que a linha mostra HOJE pra este item — mesma fórmula usada no render da lista. */
  function rotuloAtual(item: ItemFatiado): string {
    if (item.rotuloManual) return item.rotuloManual;
    if (item.papel) return ROTULO_PAPEL_PECA[item.papel as keyof typeof ROTULO_PAPEL_PECA] ?? rotuloDoPapelPeca(item.papel) ?? item.titulo;
    return item.titulo;
  }

  function abrirEdicaoClassificacao(item: ItemFatiado, modo: "texto" | "select") {
    selecionar(item.id);
    setTituloEditando(rotuloAtual(item));
    setModoEdicaoClassificacao(modo);
    setEditandoClassificacaoId(item.id);
  }

  function aplicarPapel(id: string, papel: string) {
    aplicar({ tipo: "editarPapel", id, papel });
    registrarEvento("fatiador_correcao", `classificação alterada para "${ROTULO_PAPEL_PECA[papel as keyof typeof ROTULO_PAPEL_PECA] ?? papel}"`, { id });
    setEditandoClassificacaoId(null);
  }

  function aplicarRotuloManual(id: string) {
    const rotulo = tituloEditando.trim();
    if (rotulo) {
      aplicar({ tipo: "renomearClassificacao", id, rotulo });
      registrarEvento("fatiador_correcao", `classificação renomeada para "${rotulo}"`, { id });
    }
    setEditandoClassificacaoId(null);
  }

  /**
   * `R` sempre digita livre, `E` sempre abre a lista de papéis conhecidos — pedido do Fábio
   * (15/09/2026): "R poderia renomear, eu digitar, e E poderia abrir a caixa pra mim escolher".
   * Antes `R` decidia sozinho qual dos dois modos abrir, conforme o item já ter `papel` ou não;
   * agora quem escolhe é o analista, não o item. (E antes de tudo isso `R` focava a caixa de
   * renomear do PAINEL do lado — nome do PDF na exportação, `renomearInputRef` — que é outro
   * "renomear" ainda; continua funcionando, só sem atalho de teclado próprio, clica nela.)
   */
  function atalhoRenomearClassificacao() {
    if (selecionado) abrirEdicaoClassificacao(selecionado, "texto");
  }
  function atalhoEscolherClassificacao() {
    if (selecionado) abrirEdicaoClassificacao(selecionado, "select");
  }

  /**
   * Abre o PDF do processo inteiro numa aba nova — pedido do Fábio (11/09/2026), pra conferir o
   * contexto sem sair da tela de fatiamento. Nunca sobe pro servidor: é o mesmo `File` já em
   * memória no navegador, só virando um `blob:` URL local.
   */
  function abrirPdfInteiro() {
    if (!arquivo) return;
    if (!urlPdfInteiroRef.current) urlPdfInteiroRef.current = URL.createObjectURL(arquivo);
    window.open(urlPdfInteiroRef.current, "_blank", "noopener,noreferrer");
  }

  /**
   * Zera o fatiamento em andamento e volta pra tela de soltar o PDF — pedido do Fábio (14/09/2026).
   * Diferença pro "Abrir outro PDF" de baixo: aquele já abre a janela de escolher arquivo na hora;
   * este só limpa e deixa o analista decidir quando (ou se) solta outro PDF. Pede confirmação
   * porque é destrutivo — perde correção manual ainda não exportada, sem aviso seria fácil de
   * clicar sem querer no meio de um fatiamento longo.
   */
  function limparFatiador(): boolean {
    if (itens.length && !window.confirm("Limpar o fatiamento atual? As correções ainda não exportadas se perdem.")) return false;
    if (urlPdfInteiroRef.current) { URL.revokeObjectURL(urlPdfInteiroRef.current); urlPdfInteiroRef.current = null; }
    if (usuarioId) limparRascunho(usuarioId);
    setArquivo(null);
    setNumeroProcesso(null);
    setErro(null);
    setEventosBrutos(null);
    setResultadoLeitura(null);
    setProgressoLeitura(null);
    setComparandoLip(false);
    resetar(ESTADO_VAZIO);
    return true;
  }

  function abrirNovoPdf() {
    if (limparFatiador()) inputRef.current?.click();
  }

  /**
   * Exporta o pacote completo — pedido do Fábio (15/09/2026): PDF + Excel (nomes, páginas,
   * fatias, cortes), pra importar depois e voltar exatamente ao ponto de agora.
   */
  async function exportarConfiguracaoAtual() {
    if (!arquivo || !numeroProcesso) return;
    setExportandoConfig(true);
    setErro(null);
    try {
      const { blob, nomeArquivo } = await exportarConfiguracao(
        arquivo, { processoCodigo, slot, numeroProcesso }, itens, eventosBrutos,
      );
      baixarBlob(blob, nomeArquivo);
      registrarEvento("fatiador_exportacao", `configuração completa — ${nomeArquivo}`, { itens: itens.length });
    } catch (e: any) {
      setErro(`Falha ao exportar configuração: ${e?.message ?? e}`);
    } finally {
      setExportandoConfig(false);
    }
  }

  /** Importa um .zip exportado antes e devolve o fatiador exatamente àquele ponto. */
  async function importarConfiguracaoArquivo(f: File) {
    setImportandoConfig(true);
    setErro(null);
    try {
      const { arquivo: arquivoImportado, info, itens: itensImportados, eventosBrutos: eventosImportados } =
        await importarConfiguracao(f);
      setProcessoCodigo(info.processoCodigo);
      setSlot(info.slot as Slot);
      setArquivo(arquivoImportado);
      setEventosBrutos(eventosImportados as EventoSei[] | null);
      setNumeroProcesso(info.numeroProcesso || info.processoCodigo);
      resetar({ itens: itensImportados, selecionadoId: itensImportados[0]?.id ?? null });
      if (!eventosImportados) {
        setErro('Configuração importada, mas sem "eventos-brutos.json" no zip — "Comparar com o LIP" e "Baixar pacote (.zip)" ficam indisponíveis até fatiar de novo.');
      }
    } catch (e: any) {
      setErro(`Falha ao importar configuração: ${e?.message ?? e}`);
    } finally {
      setImportandoConfig(false);
    }
  }

  const atalhos = useMemo<Atalho[]>(() => [
    { tecla: "ArrowDown", acao: () => moverSelecao(1), descricao: "próximo item" },
    { tecla: "ArrowUp", acao: () => moverSelecao(-1), descricao: "item anterior" },
    { tecla: "ArrowRight", acao: () => moverPaginaCorte(1), descricao: "mover a página de corte candidata pra frente" },
    { tecla: "ArrowLeft", acao: () => moverPaginaCorte(-1), descricao: "mover a página de corte candidata pra trás" },
    { tecla: "Enter", acao: confirmar, descricao: "concordar/confirmar o item selecionado" },
    { tecla: "n", acao: aplicarNovoCorte, descricao: "criar corte na página marcada" },
    { tecla: "Backspace", acao: excluirCorte, descricao: "excluir corte (junta ao anterior)" },
    { tecla: "x", acao: alternarLixo, descricao: "marcar/desmarcar como lixo" },
    { tecla: "l", acao: alternarParaLeitura, descricao: "marcar/desmarcar para leitura" },
    { tecla: " ", acao: abrirVisualizador, descricao: "abrir a página no visualizador" },
    { tecla: "Enter", mod: true, acao: enviarParaLeitura, descricao: "enviar marcados para leitura" },
    { tecla: "z", mod: true, acao: desfazer, descricao: "desfazer" },
    { tecla: "z", mod: true, shift: true, acao: refazer, descricao: "refazer" },
    { tecla: "y", mod: true, acao: refazer },
    { tecla: "o", mod: true, acao: abrirNovoPdf, descricao: "abrir novo PDF" },
    { tecla: "e", mod: true, acao: exportarSelecionado, descricao: "exportar o item selecionado" },
    { tecla: "r", acao: atalhoRenomearClassificacao, descricao: "renomear a classificação (digitar)" },
    { tecla: "e", acao: atalhoEscolherClassificacao, descricao: "escolher a classificação (lista)" },
    { tecla: "p", mod: true, acao: abrirPdfInteiro, descricao: "abrir o PDF inteiro em outra aba" },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [selecionado, arquivo, paginaCorte, podeDesfazer, podeRefazer, itens, lendo, processoCodigo]);

  useAtalhosTeclado(atalhos, !visualizando);

  return (
    <div className="max-w-[1400px] mx-auto p-4">
      <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">✂️ Fatiador de PDF do SEI</h1>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Tela própria, fora do processo — corrige o fatiamento automático rápido, tudo por teclado.
        As telas de análise (dentro do processo) continuam do jeito que sempre foram.
      </p>

      {!numeroProcesso && rascunho && (
        <div className="bg-[var(--bg-card)] border border-[var(--accent)] rounded-xl p-4 max-w-xl mb-3">
          <p className="text-sm text-[var(--text-primary)] mb-1">
            📝 Tem um fatiamento em andamento: <b>{rascunho.numeroProcesso}</b> ({rascunho.itens.length} item(ns)),
            salvo {new Date(rascunho.guardadoEm).toLocaleString("pt-BR")}.
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => restaurarRascunho(rascunho)}
              className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-[var(--accent-fg)]">
              Continuar de onde parei
            </button>
            <button onClick={descartarRascunho}
              className="text-xs px-3 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)]">
              Descartar
            </button>
          </div>
        </div>
      )}

      {!numeroProcesso && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 max-w-xl">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Slot</span>
              <select value={slot} onChange={(e) => setSlot(e.target.value as Slot)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1.5 text-sm">
                <option value="regularizacao">{NOME_SLOT.regularizacao}</option>
                <option value="aceite_sei">{NOME_SLOT.aceite_sei}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Código do processo</span>
              <input value={processoCodigo} onChange={(e) => setProcessoCodigo(e.target.value)}
                placeholder="ex.: 24.5.000024350-0"
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1.5 text-sm" />
            </label>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) processar(f); }}
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
              <p className="text-sm text-[var(--text-muted)]">📑 Solte o PDF do SEI aqui, ou clique para escolher</p>
            )}
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" disabled={processando}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processar(f); e.target.value = ""; }} />
          </div>
          {/* Importar configuração — pedido do Fábio (15/09/2026): retomar de um .zip exportado
              antes (PDF + Excel com nomes/páginas/fatias/cortes), sem fatiar tudo de novo. */}
          <div className="mt-3 text-center">
            <button onClick={() => importConfigRef.current?.click()} disabled={importandoConfig}
              className="text-xs px-3 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
              {importandoConfig ? "⏳ Importando..." : "📂 Importar configuração (.zip)"}
            </button>
            <input ref={importConfigRef} type="file" accept=".zip" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importarConfiguracaoArquivo(f); e.target.value = ""; }} />
          </div>
          {erro && <p className="mt-3 text-sm text-[var(--error)] bg-[var(--error-bg)] rounded p-2">⚠ {erro}</p>}
        </div>
      )}

      {/* Coluna do meio (miniatura) — 15/09/2026: MiniaturaPdf.tsx passou a renderizar por
          ALTURA (mesmo max-h-[70vh] da lista), não largura fixa; a largura da imagem varia com a
          altura da tela. 620px é folga pra caber a maioria dos monitores sem cortar — acima disso
          o próprio componente rola horizontalmente em vez de estourar layout. */}
      {numeroProcesso && (
        <div className="grid grid-cols-[1fr_620px_280px] gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs text-[var(--text-muted)]">
                  Processo <span className="font-mono text-[var(--text-primary)]">{numeroProcesso}</span> · {ocultarLixo
                    ? `${itens.filter((i) => i.status !== "lixo").length} de ${itens.length} item(ns) (lixo oculto)`
                    : `${itens.length} item(ns)`}
                </p>
                {/* Nome do proprietário, igual ao cabeçalho do LIP — pedido do Fábio (15/09/2026).
                    Some sozinho se a ficha ainda não tiver esse campo preenchido. */}
                {proprietarioNome && (
                  <p className="text-xs text-[var(--text-primary)] mt-0.5">{proprietarioNome}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {erro && <p className="text-xs text-[var(--error)]">⚠ {erro}</p>}
                <label className="flex items-center gap-1 text-xs text-[var(--text-muted)] cursor-pointer select-none">
                  <input type="checkbox" checked={ocultarLixo} onChange={(e) => setOcultarLixo(e.target.checked)} />
                  Ocultar lixo
                </label>
                <button onClick={abrirPdfInteiro} disabled={!arquivo}
                  title="Abre o PDF do processo inteiro numa aba nova, pra conferir contexto sem sair daqui (Cmd/Ctrl+P)"
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40 whitespace-nowrap">
                  📄 PDF inteiro em outra aba
                </button>
              </div>
            </div>
            <div ref={listaRef} className="border border-[var(--border)] rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
              {(ocultarLixo ? itens.filter((i) => i.status !== "lixo") : itens).map((item) => {
                const rotulo = rotuloAtual(item);
                const ativo = item.id === estado.selecionadoId;
                return (
                  <div key={item.id} data-ativo={ativo || undefined} onClick={() => selecionar(item.id)}
                    className={`flex items-center gap-3 px-3 py-2 border-b border-[var(--border)] cursor-pointer text-sm ${
                      ativo ? "bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]" : "hover:bg-[var(--bg-secondary)]"
                    }`}>
                    <span className="text-xs text-[var(--text-muted)] w-20 shrink-0">
                      pg. {item.paginaIni}{item.paginaFim !== item.paginaIni ? `–${item.paginaFim}` : ""}
                      {ativo && paginaCorte != null && (
                        <span className="text-[var(--accent)] block">✂ em {paginaCorte}</span>
                      )}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] w-24 shrink-0">{item.idSei}</span>
                    {editandoClassificacaoId === item.id ? (
                      modoEdicaoClassificacao === "select" ? (
                        <select
                          autoFocus value={item.papel ?? "classificacao_pendente"} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => aplicarPapel(item.id, e.target.value)}
                          onBlur={() => setEditandoClassificacaoId(null)}
                          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditandoClassificacaoId(null); } }}
                          className="flex-1 min-w-0 text-xs px-1.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--accent)] text-[var(--text-primary)]"
                        >
                          {OPCOES_PAPEL.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
                        </select>
                      ) : (
                        <input
                          autoFocus value={tituloEditando} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setTituloEditando(e.target.value)}
                          onBlur={() => aplicarRotuloManual(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); aplicarRotuloManual(item.id); }
                            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditandoClassificacaoId(null); }
                          }}
                          className="flex-1 min-w-0 text-xs px-1.5 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--accent)] text-[var(--text-primary)]"
                        />
                      )
                    ) : (
                      <span
                        onClick={(e) => { e.stopPropagation(); abrirEdicaoClassificacao(item, item.papel ? "select" : "texto"); }}
                        title="Clique pra editar — ou selecione o item e use R (digitar) / E (escolher da lista)"
                        className="flex-1 text-[var(--text-primary)] truncate cursor-text hover:underline decoration-dotted"
                      >
                        {rotulo}
                        {item.criadoManualmente && <span className="text-[10px] text-[var(--accent)] ml-1">(corte manual)</span>}
                      </span>
                    )}
                    <span className="text-xs shrink-0" title={item.paraLeitura ? "Entra no lote de leitura" : "Fora da leitura"}>
                      {item.paraLeitura ? "📖" : "🚫"}
                    </span>
                    <span className={`text-xs shrink-0 ${COR_STATUS[item.status]}`}>{ROTULO_STATUS[item.status]}</span>
                  </div>
                );
              })}
              {!itens.length && (
                <p className="px-3 py-6 text-sm text-[var(--text-muted)] text-center">Nenhum item — o PDF não trouxe eventos.</p>
              )}
              {itens.length > 0 && ocultarLixo && itens.every((i) => i.status === "lixo") && (
                <p className="px-3 py-6 text-sm text-[var(--text-muted)] text-center">
                  Todos os itens estão no lixo — desmarque "Ocultar lixo" pra ver.
                </p>
              )}
            </div>
          </div>

          <MiniaturaPdf
            arquivo={arquivo}
            pagina={paginaCorte ?? selecionado?.paginaIni ?? null}
            onAmpliar={selecionado ? abrirVisualizador : undefined}
          />

          {/* Pedido explícito do Fábio (10/09/2026): a lista de atalhos fica sempre visível na
              tela, não escondida atrás de "?" — velocidade não combina com abrir ajuda toda hora. */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 h-fit sticky top-4">
            <p className="text-xs text-[var(--text-muted)] mb-2">
              📖 {itensParaLeitura(itens).length} de {itens.length} para leitura
            </p>
            <button onClick={enviarParaLeitura} disabled={lendo || !itensParaLeitura(itens).length}
              className="mb-3 w-full text-xs px-2 py-1.5 rounded bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-40">
              {lendo ? "⏳ Lendo..." : "🧠 Enviar marcados para leitura"}
            </button>

            {/* Portados do Organizador de PDF SEI em 11/09/2026, antes de ele ser removido do
                Slot 1/2 — decisão do Fábio: nenhum botão que ele usa pode sumir no meio do caminho. */}
            <button onClick={baixarPacoteVigente} disabled={gerandoPacote || !eventosBrutos}
              title="Zip com um PDF por documento, separado em Vigentes/Histórico, com o manifesto junto"
              className="mb-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
              {gerandoPacote ? "⏳ Gerando..." : "📦 Baixar pacote (.zip)"}
            </button>
            <button onClick={exportarConfirmados} disabled={exportandoConfirmados || !confirmados.length}
              title="Baixa num zip só todos os itens já confirmados (✓)"
              className="mb-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
              {exportandoConfirmados ? "⏳ Gerando..." : `✓ Exportar confirmados (${confirmados.length})`}
            </button>
            <button onClick={abrirComparacaoLip} disabled={!eventosBrutos || !processoCodigo}
              title="Ver quais campos da ficha este PDF consegue preencher"
              className="mb-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
              📋 Comparar com o LIP ({Object.keys(sugestoesLip).length})
            </button>
            {comparandoLip && (
              <div className="mb-3 border border-[var(--border)] rounded p-2 bg-[var(--bg-secondary)]">
                <p className="text-[10px] text-[var(--text-muted)] mb-2">
                  Marcado = grava na ficha. Campo já preenchido vem desmarcado — trocar é decisão sua.
                </p>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {Object.entries(sugestoesLip).map(([chave, s]) => {
                    const atual = camposLipAtuais[chave]?.valor;
                    return (
                      <label key={chave} className="flex items-start gap-1.5 text-[10px] cursor-pointer">
                        <input type="checkbox" checked={!!selecionadosLip[chave]} className="mt-0.5"
                          onChange={(e) => setSelecionadosLip((p) => ({ ...p, [chave]: e.target.checked }))} />
                        <span className="text-[var(--text-primary)]">
                          <b>{ROTULO_CAMPO_LIP[chave] ?? chave}</b> → {s.idSei}
                          <span className="text-[var(--text-muted)]"> ({s.titulo}, pg. {s.pagina})</span>
                          {atual && <span className="text-[var(--error)]"> · já preenchido: {atual}</span>}
                        </span>
                      </label>
                    );
                  })}
                  {!Object.keys(sugestoesLip).length && (
                    <p className="text-[10px] text-[var(--text-muted)]">Este PDF não trouxe nenhum documento que alimente campo do LIP.</p>
                  )}
                </div>
                <div className="flex gap-1 mt-2">
                  <button onClick={aceitarCamposLip} disabled={salvandoLip}
                    className="flex-1 text-[10px] px-2 py-1 rounded bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-40">
                    {salvandoLip ? "gravando..." : "Gravar marcados na ficha"}
                  </button>
                  <button onClick={() => setComparandoLip(false)} className="text-[10px] px-2 py-1 rounded border border-[var(--border-strong)] text-[var(--text-primary)]">
                    fechar
                  </button>
                </div>
              </div>
            )}
            <button onClick={analisarPendentes} disabled={analisandoPendentes || !paginasPendentes.length}
              title={paginasPendentes.length
                ? `${paginasPendentes.length} página(s) que o fatiador não classificou sozinho — custo estimado US$ ${estimarCustoUsd(paginasPendentes.length).toFixed(4)}`
                : "Nenhuma página ambígua pendente"}
              className="mb-3 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
              {analisandoPendentes ? "⏳ Analisando..." : `🔍 Analisar ${paginasPendentes.length} página(s) ambígua(s)`}
            </button>
            {progressoLeitura && (
              <div className="mb-3">
                <p className="text-[10px] text-[var(--text-muted)] mb-1">{progressoLeitura.mensagem}</p>
                <div className="w-full h-1.5 rounded bg-[var(--bg-secondary)] overflow-hidden">
                  <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progressoLeitura.pct}%` }} />
                </div>
              </div>
            )}
            {resultadoLeitura && (() => {
              // `campos[chave]` vem `null` quando /api/lip/s3 não achou evidência pra esse campo
              // (route.ts:352-354) — renderizar `c.valor` sem filtrar antes derrubava a tela
              // inteira (TypeError: Cannot read properties of null), achado do Fábio, 15/09/2026.
              const encontrados = Object.entries(resultadoLeitura.campos).filter(
                (par): par is [string, CampoLido] => !!par[1],
              );
              return (
                <div className="mb-3 border border-[var(--border)] rounded p-2 bg-[var(--bg-secondary)]">
                  <p className="text-[10px] font-bold text-[var(--text-primary)] mb-1">
                    {encontrados.length} campo(s) lido(s)
                  </p>
                  <ul className="text-[10px] text-[var(--text-muted)] space-y-0.5 max-h-32 overflow-y-auto">
                    {encontrados.map(([chave, c]) => (
                      <li key={chave}><b className="text-[var(--text-primary)]">{chave}</b>: {c.valor}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <p className="text-xs font-bold text-[var(--text-primary)] mb-2">⌨️ Atalhos</p>
            <ul className="space-y-1.5 text-xs">
              {atalhos.filter((a) => a.descricao).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)]">{a.descricao}</span>
                  <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] whitespace-nowrap">
                    {rotuloAtalho(a)}
                  </kbd>
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t border-[var(--border)] flex gap-2">
              <button onClick={desfazer} disabled={!podeDesfazer}
                className="flex-1 text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] disabled:opacity-40">
                ↩ Desfazer
              </button>
              <button onClick={refazer} disabled={!podeRefazer}
                className="flex-1 text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] disabled:opacity-40">
                ↪ Refazer
              </button>
            </div>
            {selecionado && (
              <>
                {/* Renomear — pedido do Fábio (11/09/2026): só muda o NOME do PDF exportado, nunca
                    o título que aparece na lista (esse continua vindo do fatiamento/carimbo). */}
                <div className="mt-2 flex gap-1">
                  <input
                    ref={renomearInputRef} value={nomeRenomeando}
                    onChange={(e) => setNomeRenomeando(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); renomearSelecionado(); } }}
                    placeholder="nome do PDF ao exportar"
                    title="Nome do arquivo ao exportar — clique aqui pra editar"
                    className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)]"
                  />
                  <button onClick={renomearSelecionado} disabled={!nomeRenomeando.trim()}
                    className="shrink-0 text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
                    ✎
                  </button>
                </div>
                {selecionado.nomeExportacao && (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    exporta como: <b className="text-[var(--text-primary)]">{selecionado.nomeExportacao} {selecionado.idSei}.pdf</b>
                  </p>
                )}
                <button onClick={exportarSelecionado} disabled={!arquivo || exportando === selecionado.id}
                  className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-40">
                  {exportando === selecionado.id ? "⏳ Exportando..." : "⬇ Exportar selecionado"}
                </button>
              </>
            )}
            <button onClick={abrirNovoPdf}
              className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)]">
              📄 Abrir outro PDF
            </button>
            <button onClick={limparFatiador}
              title="Zera o fatiamento e volta pra tela de soltar o PDF, sem abrir a janela de escolher arquivo"
              className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--error)]">
              🧹 Limpar fatiador
            </button>
            <button onClick={exportarConfiguracaoAtual} disabled={!arquivo || exportandoConfig}
              title="Baixa um .zip com o PDF completo + um Excel com nomes, páginas, fatias e cortes — pra importar depois e voltar exatamente aqui"
              className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] disabled:opacity-40">
              {exportandoConfig ? "⏳ Gerando..." : "💾 Exportar configuração (.zip)"}
            </button>
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processar(f); e.target.value = ""; }} />
          </div>
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
