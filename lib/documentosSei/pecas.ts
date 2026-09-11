/**
 * lib/documentosSei/pecas.ts — Fase 3 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md). "Abrir os contêineres": eventos genéricos do SEI
 * ("Documentação", "Processo", "Solicitação") escondem várias peças dentro — projeto, ART,
 * matrícula, laudo, foto etc. Este módulo separa essas peças DENTRO de um evento já fatiado
 * (Fase 1), sem reler o PDF inteiro.
 *
 * Módulo NOVO e ISOLADO: não importa `lib/lerPastaSlot5.ts` (Slot 5) — regra de isolamento entre
 * slots do CLAUDE.md. A tabela `ASSINATURAS_PECA` abaixo é reproduzida no ESPÍRITO da tabela
 * `ASSINATURAS` de `lerPastaSlot5.ts` (array ordenado, primeira regra que casar decide), mas
 * escrita do zero para o vocabulário dos Slots 1/2 e testada por PÁGINA (não pelo documento
 * inteiro, que aqui é só um pedaço do PDF do SEI).
 *
 * Zero IA. Página que não casa nenhuma assinatura vira `classificacao_pendente` — NUNCA é
 * descartada (princípio §5.2 do plano: "nenhuma página some em silêncio").
 *
 * Fase 4 (10/09/2026): as regras saem do array `ASSINATURAS_PECA` fixo e passam a vir de
 * `documentos_sei_regras_identificacao` (tela `app/admin/regras-identificacao`), com cache curto
 * em `regrasIdentificacao.ts` — o array abaixo continua existindo como PADRÃO, usado se o banco
 * estiver vazio ou fora do ar.
 */
import type { PaginaTexto } from "./fatiar";
import { carregarRegras, type RegraRegex } from "./regrasIdentificacao";

export type PapelPeca =
  | "processo_fisico"
  | "uso_solo"
  | "projeto"
  | "levantamento"
  | "art"
  | "art_levantamento"
  | "art_caixa"
  | "matricula"
  | "certidao"
  | "laudo"
  | "vistoria"
  | "foto"
  | "ortofoto"
  | "memorial"
  | "procuracao"
  | "embargo"
  | "notificacao_calcada"
  | "despacho_cheadv"
  | "despacho"
  | "parecer"
  | "oficio"
  | "requerimento"
  | "email"
  | "classificacao_pendente";

export type PecaSei = {
  papel: PapelPeca;
  paginaIni: number;
  paginaFim: number;
  /** "media" quando casou uma assinatura de conteúdo; "baixa" quando ficou pendente. */
  confianca: "media" | "baixa";
  /**
   * Melhor esforço, primeira ocorrência não vazia dentro do intervalo da peça — Fase 1B do plano
   * de leitura de PDF (10/09/2026), achado §5.5: o classificador via só o texto do corpo; estes
   * três já eram extraídos por página (`fatiar.ts`) e descartados aqui. Nunca decidem o papel
   * sozinhos nesta fase (risco de inventar regra sem processo real que a sustente — ver
   * `feedback_medir_antes_de_afirmar`); servem por ora para o analista ver na tela e para uma
   * fase futura combinar sinais com evidência real.
   */
  setor?: string;
  assinante?: string;
  data?: string;
};

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Ordem importa: a primeira assinatura que casar decide o papel da página (mesmo princípio de
 * `ASSINATURAS`/`SLOTS_SEI` em `lerPastaSlot5.ts` e de `REGRAS` em `compararLip.ts`). Vocabulário
 * limitado ao que o plano cita (§6 Fase 3) — ampliar exige processo real que justifique.
 *
 * PADRÃO de fallback (Fase 4) — a tabela `documentos_sei_regras_identificacao` é a fonte normal em
 * produção; isto só entra em jogo se o banco estiver vazio/fora do ar. Mantido idêntico à carga
 * inicial da migration `2026_09_10_documentos_sei_regras_identificacao.sql` de propósito.
 */
const ASSINATURAS_PECA: { papel: PapelPeca; re: RegExp }[] = [
  // capa do Atende Fácil (Fase 5, entrevista 10/09/2026, medido em FISICO 3941406.pdf/5340648.pdf):
  // só confirmado para regularização — "aceite" ainda sem exemplo real, entra como aposta cautelosa.
  { papel: "processo_fisico", re: /\bsolicita\s+o\s+alvara\s+de\s+(regularizacao|aceite)\b/ },
  // uso do solo do CONTEC (só Regularização; Aceite não passa por lá — Fase 5, medido em USO
  // 4167740.pdf e 5444163.pdf: carimbo varia — "Parecer NNN - Uso do Solo - COMTEC" num processo,
  // "Uso do Solo Aprovação de Projeto NN - COMTEC" no outro — a frase fixa dos dois é "uso do solo")
  { papel: "uso_solo", re: /\buso\s+do\s+solo\b/ },
  { papel: "matricula", re: /\b(certidao\s+de\s+matricula|registro\s+de\s+imoveis)\b/ },
  // ART de Levantamento e ART da Caixa (recarga) são campos DISTINTOS no LIP — só sugerir um ou
  // outro quando a peça deixa isso explícito; ambíguo fica em "art" genérico, sem sugestão
  // (compararLip.ts segue o princípio "melhor vazio que chutado").
  { papel: "art_levantamento", re: /\b(art|rrt)\b[^.]{0,40}\blevantamento\b|\blevantamento\b[^.]{0,40}\b(art|rrt)\b/ },
  { papel: "art_caixa", re: /\b(art|rrt)\b[^.]{0,40}\bcaixa\b|\bcaixa\b[^.]{0,40}\b(art|rrt)\b/ },
  { papel: "art", re: /\b(art\s+obra\s+ou\s+servico|anotacao\s+de\s+responsabilidade\s+tecnica|detalhes?\s+do\s+rrt|n[ºo°]?\s*(do\s+)?rrt)\b/ },
  { papel: "levantamento", re: /\blevantamento\s+(planialtimetrico|topografico)\b/ },
  { papel: "projeto", re: /\b(area\s+total\s+da\s+construcao|projeto\s+legal\s+de\s+arquitetura|quadro\s+de\s+areas)\b/ },
  { papel: "laudo", re: /\blaudo\s+(tecnico|de\s+vistoria|geologico|estrutural)?\b/ },
  { papel: "vistoria", re: /\b(relatorio\s+de\s+vistoria|relatorio\s+de\s+fiscalizacao|relatorio\s+circunstanciado)\b/ },
  { papel: "foto", re: /\b(registro\s+fotografico|fotografia|fotos?\s+do\s+local)\b/ },
  // aérea do Google/mapa urbano digital de Goiânia (Fase 5, medido em ORTOFOTO 5607055.pdf)
  { papel: "ortofoto", re: /\bmapa\s+urbano\s+basico\s+digital\s+de\s+goiania\b/ },
  { papel: "memorial", re: /\bmemorial\s+(descritivo|de\s+calculo)\b/ },
  { papel: "procuracao", re: /\bprocuracao\b/ },
  { papel: "embargo", re: /\bembargo\b/ },
  // GEFEP (Fase 5, medido em NOTIFICACAO DA CALÇADA 6797870.pdf pg. 4) — checar ANTES de "vistoria",
  // que casaria com a página de relatório circunstanciado do mesmo PDF (é peça separada, ok)
  { papel: "notificacao_calcada", re: /\bnotificacao\s+calcada\s+n\b/ },
  // despacho de conformidade documental da CHEADV — só o que APROVA, não qualquer despacho de
  // pendência (cobrança de documento) no meio do caminho. Carimbo real medido: "Despacho 956 -
  // CHEADV - Documentação conforme" — mesmo teste (cheadv + conforme) já usado em
  // compararLip.ts:REGRAS (`seiCheadv`), que opera direto sobre o título do evento; esta cópia em
  // ASSINATURAS_PECA cobre o caso do despacho aparecer como PEÇA dentro de um contêiner genérico.
  { papel: "despacho_cheadv", re: /\bcheadv\b[^.]{0,60}\bconforme\b|\bconforme\b[^.]{0,60}\bcheadv\b/ },
  // atos numerados: mesma distinção já registrada no plano ("despachos sucessivos são atos, não versões")
  { papel: "despacho", re: /^\s*despacho\b/ },
  { papel: "parecer", re: /^\s*parecer\b/ },
  { papel: "oficio", re: /^\s*of[ií]cio\b/ },
  { papel: "requerimento", re: /\brequerimento\b/ },
  // e-mail: heurística fraca de propósito (cabeçalho De/Para/Assunto), nunca decide sozinha coisa mais forte acima
  { papel: "email", re: /\bde\s*:.*\bpara\s*:|assunto\s*:/ },
  { papel: "certidao", re: /\bcertidao\b/ },
];

function classificarComRegras(texto: string, regras: RegraRegex<PapelPeca>[]): PapelPeca | null {
  const norm = normalizar(texto);
  for (const a of regras) if (a.re.test(norm)) return a.papel;
  return null;
}

/**
 * Carrega as regras de `documentos_sei_regras_identificacao` (tabela='peca', Fase 4 do plano de
 * leitura de PDF) — cacheado, cai em `ASSINATURAS_PECA` se o banco falhar ou estiver vazio. Regex
 * compilada SEM flag: o texto já chega normalizado (minúsculo, sem acento) por `normalizar()`.
 */
function carregarAssinaturasPeca() {
  return carregarRegras("peca", PAPEIS_VALIDOS as ReadonlySet<PapelPeca>, ASSINATURAS_PECA, (s) => new RegExp(s));
}

/** Testa se o título do evento é um contêiner genérico (esconde várias peças dentro). */
export function ehContainerGenerico(titulo: string): boolean {
  const norm = normalizar(titulo);
  return /^(documenta[çc][ãa]o|processo|solicita[çc][ãa]o|anexo|documentos?)\b/.test(norm);
}

/**
 * Classifica o TÍTULO de um evento que NÃO é contêiner (não tem peças por dentro) usando a mesma
 * tabela `ASSINATURAS_PECA` — usado pela persistência (Fase 6/7) pra dar papel a um evento avulso
 * do SEI que não é ato (despacho/parecer/ofício/notificação) nem contêiner. `null` quando nenhuma
 * assinatura casa — o chamador decide o que fazer (nunca inventa papel).
 */
export async function classificarTitulo(titulo: string): Promise<PapelPeca | null> {
  const regras = await carregarAssinaturasPeca();
  return classificarComRegras(titulo, regras);
}

/**
 * Separa as peças de um evento-contêiner. `paginasDoEvento` já vem restrito ao intervalo do
 * evento (ver `lerPaginasIntervalo` em `fatiar.ts`) — a contagem fecha por construção, já que toda
 * página do array entra em exatamente uma peça (classificada ou `classificacao_pendente`).
 *
 * Muda de peça quando: (a) a classificação por conteúdo muda, OU (b) a orientação da página vira
 * (retrato↔paisagem) — sinal citado no plano (§6 Fase 3) para separar peças do mesmo tipo aparente
 * coladas (ex.: duas ARTs seguidas). O pior caso desta heurística é separar demais uma peça só
 * (nunca junta duas peças diferentes por engano) — direção seguindo o princípio de nunca perder
 * dado, só eventualmente sobrar peça de mais.
 */
export async function abrirContainer(paginasDoEvento: PaginaTexto[]): Promise<PecaSei[]> {
  const regras = await carregarAssinaturasPeca();
  const pecas: PecaSei[] = [];
  let orientacaoAnterior: "retrato" | "paisagem" | null = null;

  for (const p of paginasDoEvento) {
    const papel = classificarComRegras(p.texto, regras) ?? "classificacao_pendente";
    const orientacao: "retrato" | "paisagem" = p.largura > p.altura ? "paisagem" : "retrato";
    const mudaOrientacao = orientacaoAnterior !== null && orientacao !== orientacaoAnterior;

    const atual = pecas[pecas.length - 1];
    if (atual && atual.papel === papel && !mudaOrientacao) {
      atual.paginaFim = p.pagina;
      // melhor esforço: primeira ocorrência não vazia dentro da peça, nunca sobrescreve a que já achou
      if (!atual.setor && p.setor) atual.setor = p.setor;
      if (!atual.assinante && p.assinante) atual.assinante = p.assinante;
      if (!atual.data && p.data) atual.data = p.data;
    } else {
      pecas.push({
        papel,
        paginaIni: p.pagina,
        paginaFim: p.pagina,
        confianca: papel === "classificacao_pendente" ? "baixa" : "media",
        setor: p.setor, assinante: p.assinante, data: p.data,
      });
    }
    orientacaoAnterior = orientacao;
  }

  return fundirPendentesEntreIguais(pecas);
}

/**
 * Fase 1B do plano de leitura de PDF (10/09/2026), regra do Fábio: "tem que analisar o que tá
 * escrito antes e depois da página em branco... se o padrão do documento é o mesmo". Uma peça
 * `classificacao_pendente` (tipicamente página escaneada, sem texto pra casar regra nenhuma) que
 * fica ENTRE duas peças do MESMO papel é a MESMA peça continuando — funde as três numa só.
 *
 * Conservador de propósito, mesmo espírito da continuidade de idSei em `fatiar.ts`: só funde
 * quando os dois lados CONCORDAM. Papel diferente dos dois lados (ex.: laudo → páginas em branco
 * → memorial, caso real medido no processo 24.5.000024350-0) NUNCA funde — fica pendente, pro
 * analista decidir, exatamente como hoje. O pior caso desta regra é deixar pendente uma página
 * que era mesmo continuação; nunca o oposto (grudar em documento errado).
 *
 * Só o próprio texto pode dizer que uma peça pendente já classificada continua depois — nunca
 * decide GRAVAR fora do triplo (esquerda, pendente, direita); pendente entre uma peça e o FIM do
 * contêiner (sem vizinho direito) ou o INÍCIO (sem vizinho esquerdo) não tem com o que concordar.
 */
function fundirPendentesEntreIguais(pecas: PecaSei[]): PecaSei[] {
  const fundidas: PecaSei[] = [];
  for (const peca of pecas) {
    const anterior = fundidas[fundidas.length - 1];
    const antesDoAnterior = fundidas[fundidas.length - 2];
    if (
      peca.papel !== "classificacao_pendente" &&
      anterior?.papel === "classificacao_pendente" &&
      antesDoAnterior &&
      antesDoAnterior.papel === peca.papel
    ) {
      fundidas.pop(); // a pendente
      fundidas.pop(); // a peça de antes, que agora se estende até o fim da atual
      fundidas.push({
        papel: peca.papel,
        paginaIni: antesDoAnterior.paginaIni,
        paginaFim: peca.paginaFim,
        confianca: "baixa", // parte foi inferida por posição, não por regra de texto — sinaliza "confira"
        setor: antesDoAnterior.setor ?? anterior.setor ?? peca.setor,
        assinante: antesDoAnterior.assinante ?? anterior.assinante ?? peca.assinante,
        data: antesDoAnterior.data ?? anterior.data ?? peca.data,
      });
      continue;
    }
    fundidas.push(peca);
  }
  return fundidas;
}

/** Papéis que a classificação por visão (Fase 8) pode devolver — qualquer outro valor é ignorado. */
const PAPEIS_VALIDOS = new Set<string>([
  "processo_fisico", "uso_solo", "projeto", "levantamento", "art", "art_levantamento", "art_caixa",
  "matricula", "certidao", "laudo", "vistoria", "foto", "ortofoto", "memorial", "procuracao",
  "embargo", "notificacao_calcada", "despacho_cheadv", "despacho", "parecer", "oficio",
  "requerimento", "email",
]);

/**
 * Aplica ao índice o que a classificação por visão (Fase 8, `visaoAmbiguas.ts`) disse sobre cada
 * página ambígua. Existe porque a maior parte do que o analista procura — ART, certidão de
 * matrícula, embargo, procuração — chega ao processo DIGITALIZADA: medido no processo real
 * 24.5.000024350-0, as páginas dentro do contêiner têm 52 caracteres de texto (só o carimbo do
 * SEI), então nenhuma regra determinística tem o que ler ali. A visão é o único caminho, e só
 * roda sob clique explícito do analista, com o custo mostrado antes.
 *
 * Só mexe em peça `classificacao_pendente`: o que a Fase 3 já classificou por conteúdo real
 * NUNCA é sobrescrito por palpite de visão — regra determinística vence adivinhação.
 */
export function aplicarClassificacaoVisao(
  pecas: PecaSei[],
  porPagina: Record<number, string | null>,
): PecaSei[] {
  const saida: PecaSei[] = [];
  for (const peca of pecas) {
    if (peca.papel !== "classificacao_pendente") { saida.push({ ...peca }); continue; }
    for (let pagina = peca.paginaIni; pagina <= peca.paginaFim; pagina++) {
      const sugerido = porPagina[pagina];
      const papel: PapelPeca = sugerido && PAPEIS_VALIDOS.has(sugerido)
        ? (sugerido as PapelPeca)
        : "classificacao_pendente";
      const ultimo = saida[saida.length - 1];
      if (ultimo && ultimo.papel === papel && ultimo.paginaFim === pagina - 1) {
        ultimo.paginaFim = pagina;
      } else {
        saida.push({
          papel, paginaIni: pagina, paginaFim: pagina,
          confianca: papel === "classificacao_pendente" ? "baixa" : "media",
        });
      }
    }
  }
  return saida;
}

/** Rótulo humano de cada papel, para a tela. */
export const ROTULO_PAPEL_PECA: Record<PapelPeca, string> = {
  processo_fisico: "Processo Físico (capa Atende Fácil)",
  uso_solo: "Uso do Solo (CONTEC)",
  projeto: "Projeto",
  levantamento: "Levantamento",
  art: "ART/RRT (não identificado qual)",
  art_levantamento: "ART de Levantamento",
  art_caixa: "ART da Caixa",
  matricula: "Matrícula",
  certidao: "Certidão",
  laudo: "Laudo",
  vistoria: "Vistoria",
  foto: "Fotografia",
  ortofoto: "Ortofoto",
  memorial: "Memorial",
  procuracao: "Procuração",
  embargo: "Embargo",
  notificacao_calcada: "Notificação de Calçada (GEFEP)",
  despacho_cheadv: "Despacho de Conformidade (CHEADV)",
  despacho: "Despacho",
  parecer: "Parecer",
  oficio: "Ofício",
  requerimento: "Requerimento",
  email: "E-mail",
  classificacao_pendente: "Classificação pendente",
};
