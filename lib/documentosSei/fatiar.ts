/**
 * lib/documentosSei/fatiar.ts — Fase 1 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md). Fatiador determinístico do PDF único do SEI em
 * eventos. Zero IA, zero rede.
 *
 * Módulo NOVO e ISOLADO: não importa nada de `lib/lerPastaSlot5.ts` (Slot 5) — regra de
 * isolamento entre slots do CLAUDE.md. Usa a mesma biblioteca (`pdfjs-dist`), só isso.
 *
 * ── O QUE O RODAPÉ DO SEI TRAZ (medido em 4 processos reais, Fase 0, 05/09/2026) ──────────────
 * O carimbo do SEI é sempre DOIS itens de texto distintos do PDF (não uma string colada),
 * lado a lado na mesma linha:
 *   item A: "{Título do documento} ({ID SEI})"       ex.: "Despacho 1459 (10476161)"
 *   item B: "SEI {número do processo} / pg. {N}"     ex.: "SEI 25.5.000061039-8 / pg. 139"
 * `pg. {N}` é o número da página DENTRO DO PDF INTEIRO (mesclado pelo SEI), não da peça — por
 * isso serve de conferência cruzada: se o rodapé diz "pg. 139" numa página que não é a 139ª do
 * arquivo, algo está fora de ordem e a página vai para revisão, nunca é aceita no escuro.
 *
 * Setor (letreiro do órgão) e data de assinatura aparecem perto do rodapé/corpo em formato livre
 * — extraídos por MELHOR ESFORÇO nesta fase (podem faltar); a única coisa que este fatiador
 * GARANTE é a contagem fechada de páginas por ID SEI. Refinar setor/data fica para quando algum
 * consumidor (Fase 3 em diante) precisar de verdade.
 */

export type Carimbo = {
  idSei: string;
  titulo: string;
  numeroProcesso: string;
  /** página lida no rodapé — deve bater com o índice real da página no PDF */
  paginaRodape: number;
};

export type EventoSei = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  /** melhor esforço — ver cabeçalho do arquivo */
  setor?: string;
  /** melhor esforço — ver cabeçalho do arquivo */
  data?: string;
  /** melhor esforço — ver cabeçalho do arquivo */
  assinante?: string;
  /**
   * O que o documento É, lido no CORPO do texto quando o título do SEI não diz (08/09/2026).
   * Achado real: a busca de processos no mesmo endereço — uma das condições que impedem a
   * análise — chega ao processo intitulada "Encaminhamento", e só o corpo revela ("após buscas
   * no endereço do imóvel em questão foi localizado o projeto anteriormente aprovado").
   */
  papelPorConteudo?: PapelPorConteudo;
};

/** Vocabulário deliberadamente curto: só entra aqui o que a frase do documento afirma sozinha. */
export type PapelPorConteudo = "busca" | "vistoria" | "foto";

export type MotivoRevisao =
  /** página sem rodapé legível, e os vizinhos não têm o mesmo ID SEI dos dois lados para anexar por continuidade */
  | "sem_rodape_sem_continuidade"
  /** rodapé lido, mas o número do processo não bate com o do resto do PDF */
  | "processo_divergente"
  /** rodapé lido, mas "pg. N" não bate com a posição real da página no arquivo */
  | "pagina_rodape_diverge";

export type PaginaRevisao = {
  pagina: number;
  motivo: MotivoRevisao;
};

/**
 * Andamento da leitura, para a barra de progresso ser honesta — mesma ideia de
 * `lib/lerPastaSlot5.ts` (`Andamento`/`AoAndar`), reproduzida aqui em vez de importada: regra de
 * isolamento entre slots do CLAUDE.md.
 */
export type AndamentoFatiamento = { atual: number; total: number };
export type AoAndarFatiamento = (a: AndamentoFatiamento) => void;

export type ResultadoFatiamento = {
  numeroProcesso: string;
  totalPaginas: number;
  eventos: EventoSei[];
  paginasRevisao: PaginaRevisao[];
};

export type ItemPosicionado = { t: string; x: number; y: number; h: number };

/**
 * Texto corrido + dimensões de uma página, para quem precisa reprocessar um intervalo (Fase 3).
 * `setor`/`assinante`/`data` são os MESMOS sinais melhor-esforço que `fatiarPdfSei` já calcula
 * por página (Fase 1B do plano de leitura de PDF, 10/09/2026 — achado §5.5: o classificador de
 * peças recebia só o texto do corpo, ignorando estes três). Nunca bloqueiam nada, podem faltar.
 */
export type PaginaTexto = {
  pagina: number; texto: string; largura: number; altura: number;
  setor?: string; assinante?: string; data?: string;
};

const RE_TITULO_ID = /^(.+?)\s*\((\d+)\)\s*$/;
/**
 * Variante SEM parênteses do carimbo — ACHADO REAL (08/09/2026, processo 24.5.000024350-0,
 * pg. 186): "Encaminhamento 9981052" em vez de "Encaminhamento (9981052)". O documento inteiro
 * sumia da lista (página ia parar em "revisão" por carimbo ilegível) — foi assim que a BUSCA de
 * processos no mesmo endereço, que o Fábio procurava, ficou invisível no Organizador.
 *
 * Exige 6+ dígitos NO FIM do título pra não confundir número de ato com ID SEI: "Despacho 554"
 * (3 dígitos) nunca casa, "Notificação 92373028 Calçada" (número no meio) nunca casa. Some-se a
 * isso a exigência, que já existia, de haver o item "SEI {processo} / pg. {N}" na MESMA linha —
 * as duas juntas tornam falso positivo praticamente impossível.
 */
const RE_TITULO_ID_SEM_PARENTESES = /^(.+?)\s+(\d{6,})\s*$/;
const RE_SEI_PG = /^SEI\s+([\d.\-]+)\s*\/\s*pg\.\s*(\d+)\s*$/i;
const RE_DATA_LONGA = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+((?:19|20)\d{2})\b/i;

function agruparEmLinhas(itens: ItemPosicionado[]): ItemPosicionado[][] {
  const ordenados = [...itens].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: { y: number; itens: ItemPosicionado[] }[] = [];
  for (const i of ordenados) {
    const tol = Math.max(3, i.h * 0.6);
    const linha = linhas.find((l) => Math.abs(l.y - i.y) < tol);
    if (linha) linha.itens.push(i);
    else linhas.push({ y: i.y, itens: [i] });
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x));
}

/**
 * Acha o carimbo do SEI numa página já extraída. Varre TODAS as linhas (não só o rodapé
 * geométrico) porque letreiro de órgão pode empurrar a "linha de baixo" pra cima do que se
 * esperaria — o achado real é o par de itens "Título (ID)" seguido de "SEI ... / pg. N", esteja
 * onde estiver. Quando há mais de um candidato na página (nunca visto, mas não impossível), fica
 * o mais próximo do rodapé real (maior y).
 */
function acharCarimbo(itens: ItemPosicionado[]): Carimbo | null {
  const linhas = agruparEmLinhas(itens);
  let melhor: { carimbo: Carimbo; y: number } | null = null;

  for (const linha of linhas) {
    const naoBrancos = linha.filter((i) => i.t.trim());
    for (let i = 0; i < naoBrancos.length; i++) {
      const texto = naoBrancos[i].t.trim();
      const mTitulo = RE_TITULO_ID.exec(texto) ?? RE_TITULO_ID_SEM_PARENTESES.exec(texto);
      if (!mTitulo) continue;
      for (let j = i + 1; j < naoBrancos.length; j++) {
        const mSei = RE_SEI_PG.exec(naoBrancos[j].t.trim());
        if (!mSei) continue;
        const carimbo: Carimbo = {
          titulo: mTitulo[1].trim(),
          idSei: mTitulo[2],
          numeroProcesso: mSei[1],
          paginaRodape: parseInt(mSei[2], 10),
        };
        const y = naoBrancos[j].y;
        if (!melhor || y > melhor.y) melhor = { carimbo, y };
        break;
      }
    }
  }
  return melhor?.carimbo ?? null;
}

/**
 * Ampliado em 08/09/2026 (pedido do Fábio: "criar um modo pra identificar data e departamento de
 * cada documento"). Medido no processo real 24.5.000024350-0: os eventos que ficavam sem
 * departamento eram os do interessado (sem letreiro nenhum — esses continuam em branco, e é o
 * certo) e os de órgãos cujo letreiro não começa por nenhuma das 8 palavras originais. As novas
 * entradas cobrem a nomenclatura do restante da Prefeitura sem afrouxar a regra: continua sendo
 * INÍCIO de linha, dentro do cabeçalho, com os mesmos filtros de ruído.
 */
const RE_ORGAO = /^(prefeitura|secretaria|subsecretaria|chefia|diretoria|departamento|divis[ãa]o|ger[êe]ncia|superintend[êe]ncia|coordenadoria|comiss[ãa]o|procuradoria|assessoria|n[úu]cleo|ag[êe]ncia|junta|conselho|instituto|companhia|fundo|autarquia)\b/i;
/** abaixo desta altura (pontos) já é corpo do documento — acima é letreiro/cabeçalho */
const ALTURA_CABECALHO = 260;

/**
 * Melhor esforço: o departamento/setor emissor. Antes só olhava a linha do rodapé (o que deixava
 * quase tudo em branco); a partir de 06/09/2026 lê o CABEÇALHO da página — "se ler o documento
 * vai saber", como o Fábio observou. Um despacho real (Fase 0/1) trouxe três linhas no topo:
 * "Prefeitura de Goiânia" → "Secretaria Municipal de Eficiência" → "Chefia da Advocacia
 * Setorial" — a ÚLTIMA é a mais específica (a que emitiu de fato), por isso pega a última
 * ocorrência dentro da faixa do cabeçalho, nunca uma linha qualquer da página (o corpo do
 * despacho pode CITAR outra secretaria de passagem — "Secretaria Municipal da Fazenda" — que não
 * é quem emitiu; por isso a busca para em `ALTURA_CABECALHO` e não desce pro corpo do texto).
 */
export function acharSetorNaPagina(itens: ItemPosicionado[]): string | undefined {
  const linhas = agruparEmLinhas(itens).filter((l) => l[0] && l[0].y < ALTURA_CABECALHO);
  let ultimo: string | undefined;
  for (const linha of linhas) {
    const texto = linha.map((i) => i.t).join(" ").trim();
    if (!RE_ORGAO.test(texto)) continue;
    /* Letreiro de verdade não vem colado com e-mail, data ou hora — visto em casos reais
     * (Fase 1/2, 4 processos): marca d'água do SEI grudada na linha ("... 08/05/2025 - 17:46:58"),
     * assinatura de e-mail ("Fulano <fulano@x.com> 13 de abril de 2026 às 10:06"). Mais seguro
     * ficar sem do que mostrar ruído. Também exige mais de uma palavra — "GERÊNCIA" sozinha (viu
     * no processo 25.5.000061039-8) não identifica setor nenhum. */
    const pareceRuido =
      texto.length > 100 ||
      texto.split(/\s+/).length < 2 ||
      /@/.test(texto) ||
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(texto) ||
      /\bàs\s+\d{1,2}[:h]\d{2}\b/i.test(texto) ||
      RE_DATA_LONGA.test(texto);
    if (pareceRuido) continue;
    ultimo = texto;
  }
  return ultimo;
}

const RE_HORA = /\bàs\s+(\d{1,2})[:h](\d{2})\b/i;

// padrão-padrão do SEI: "Documento assinado eletronicamente por FULANO DE TAL, Cargo, em..."
const RE_ASSINADO_ELETRONICAMENTE = /documento\s+assinado\s+eletronicamente\s+por\s+([^,\n]{3,80})/i;
// assinatura tipo SIFIS: nome em CAIXA ALTA seguido do cargo ("ANDRE LUIZ JUBE VIANA Auditor - Matrícula ...")
const RE_NOME_MAIUSCULO_COM_CARGO =
  /\b([A-ZÀÂÃÁÉÊÍÓÔÕÚÇ][A-ZÀÂÃÁÉÊÍÓÔÕÚÇ'’.\s]{4,60}[A-ZÀÂÃÁÉÊÍÓÔÕÚÇ])\s+(?:Auditor|Fiscal|Analista|Assistente|Chefe|Diretor[a]?|Gerente|Coordenador[a]?|Engenheiro[a]?|Arquiteto[a]?|Advogad[oa]|Secretári[oa])\b/;

/** Melhor esforço: quem assinou o documento — nunca bloqueia nada, só ajuda o analista a identificar. */
export function acharAssinante(textoPagina: string): string | undefined {
  const eletronico = RE_ASSINADO_ELETRONICAMENTE.exec(textoPagina);
  if (eletronico) return eletronico[1].trim();
  const sifis = RE_NOME_MAIUSCULO_COM_CARGO.exec(textoPagina);
  return sifis ? sifis[1].trim() : undefined;
}

/** dd/mm/aaaa (ou dd-mm-aaaa) — formato de DUAM, comprovante, guia de taxa e formulários. */
const RE_DATA_NUMERICA = /\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})\b/;

/**
 * Melhor esforço: última data por extenso encontrada no texto da página (assinatura costuma vir
 * perto do fim). Quando a assinatura eletrônica do SEI traz horário logo depois ("..., às
 * 14:32,...") ele entra junto — senão fica só a data.
 *
 * Ampliado em 08/09/2026 (pedido do Fábio): quando a página NÃO traz data por extenso, cai na
 * última data numérica (dd/mm/aaaa). Medido no processo real 24.5.000024350-0: era exatamente
 * isso que deixava DUAM, Comprovante e Anexo de Pagamento de Taxa sem data nenhuma na tela — são
 * formulários/guias, que nunca escrevem "13 de maio de 2024". A data por extenso continua tendo
 * PRIORIDADE (é a da assinatura); a numérica é só o que sobra quando não existe assinatura por
 * extenso na página.
 */
export function acharData(textoPagina: string): string | undefined {
  let ultima: RegExpExecArray | null = null;
  const re = new RegExp(RE_DATA_LONGA, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(textoPagina))) ultima = m;
  if (ultima) {
    const depoisDaData = textoPagina.slice(ultima.index + ultima[0].length, ultima.index + ultima[0].length + 30);
    const hora = RE_HORA.exec(depoisDaData);
    return hora ? `${ultima[0]}, às ${hora[1].padStart(2, "0")}:${hora[2]}` : ultima[0];
  }

  let ultimaNum: RegExpExecArray | null = null;
  const reNum = new RegExp(RE_DATA_NUMERICA, "g");
  while ((m = reNum.exec(textoPagina))) ultimaNum = m;
  return ultimaNum ? ultimaNum[0] : undefined;
}

/**
 * Assinaturas de CONTEÚDO — usadas só quando o título do SEI não diz o que o documento é.
 * Zero IA: são frases que o próprio documento escreve. Entra pouca coisa aqui de propósito —
 * cada regra tem que ser afirmação do documento, não pista fraca.
 */
const ASSINATURAS_CONTEUDO: { papel: PapelPorConteudo; re: RegExp }[] = [
  {
    papel: "busca",
    re: /busca(s)?\s+no\s+endere[çc]o|busca(s)?\s+de\s+processos?\s+arquivad|processos?\s+arquivad[oa]s?\s+no\s+endere[çc]o|projeto\s+anteriormente\s+aprovado/i,
  },
  /**
   * ACHADO REAL (08/09/2026, processo 24.5.000024350-0): a fiscalização manda dois documentos
   * seguidos, e o SEI intitula OS DOIS de "Relatório" — pg. 177 é o registro fotográfico, pg. 179
   * é a vistoria. Pelo título é impossível separar; no corpo, cada um se identifica na primeira
   * linha ("REGISTRO FOTOGRÁFICO DO LOCAL" / "TERMO DE VISTORIA"). Como a vistoria é uma das
   * condições que impedem a análise, confundir as duas custa caro.
   */
  { papel: "vistoria", re: /termo\s+de\s+vistoria|relat[óo]rio\s+de\s+fiscaliza[çc][ãa]o|relat[óo]rio\s+de\s+vistoria|relat[óo]rio\s+circunstanciado/i },
  { papel: "foto", re: /registro\s+fotogr[áa]fico/i },
];

function acharPapelPorConteudo(textoPagina: string): PapelPorConteudo | undefined {
  for (const a of ASSINATURAS_CONTEUDO) if (a.re.test(textoPagina)) return a.papel;
  return undefined;
}

type PaginaLida = {
  pagina: number;
  carimbo: Carimbo | null;
  setor?: string;
  data?: string;
  assinante?: string;
  papelPorConteudo?: PapelPorConteudo;
};

/**
 * Um PDF aberto pelo pdfjs, pra ser reaproveitado por várias leituras. Achado real (06/09/2026,
 * testando a Fase 6 contra 2+ contêineres no mesmo PDF): o build "legacy" do pdfjs quebra com
 * `DataCloneError` na SEGUNDA chamada de `getDocument` dentro do MESMO processo Node (24.x) — o
 * "worker" falso dele (`LoopbackPort`) carrega estado entre chamadas que o `structuredClone` mais
 * estrito do Node novo não aceita mais na 2ª vez. Por isso `getDocument` só pode ser chamado UMA
 * VEZ por requisição — `fatiarPdfSei` abre o documento e devolve o `LeitorPdf` pra quem precisar
 * ler outros intervalos depois (`lerPaginasIntervalo`) reaproveitar, em vez de abrir de novo.
 */
export type LeitorPdf = { doc: any };

async function abrirDocumentoPdf(buffer: Uint8Array): Promise<any> {
  // legacy build: é o que funciona em Node sem DOM (mesma escolha de lib/lerPastaSlot5.ts, sem importar de lá)
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({ data: buffer, useSystemFonts: true, isEvalSupported: false }).promise;
}

async function lerPaginas(doc: any, aoAndar?: AoAndarFatiamento): Promise<PaginaLida[]> {
  const paginas: PaginaLida[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    aoAndar?.({ atual: p - 1, total: doc.numPages });
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const itens: ItemPosicionado[] = (tc.items as any[])
      .map((i) => ({ t: i.str ?? "", x: i.transform[4], y: vp.height - i.transform[5], h: i.height || 8 }))
      .filter((i) => i.t.trim());

    const carimbo = acharCarimbo(itens);
    const textoPagina = itens.map((i) => i.t).join(" ");
    paginas.push({
      pagina: p,
      carimbo,
      setor: acharSetorNaPagina(itens),
      data: acharData(textoPagina),
      assinante: acharAssinante(textoPagina),
      papelPorConteudo: acharPapelPorConteudo(textoPagina),
    });
  }
  aoAndar?.({ atual: doc.numPages, total: doc.numPages });
  return paginas;
}

/**
 * Lê texto + dimensões de um intervalo de páginas (1-based, inclusive) — usado pela Fase 3
 * (`lib/documentosSei/pecas.ts`) e pela Fase 6/7 (`lib/documentosSei/persistencia.ts`) pra
 * reabrir um evento (contêiner ou peça) sem reprocessar o PDF inteiro de novo. Recebe o
 * `LeitorPdf` já aberto por `fatiarPdfSei` — NUNCA abre o documento de novo (ver comentário de
 * `LeitorPdf` acima: `getDocument` só pode rodar uma vez por requisição).
 */
export async function lerPaginasIntervalo(
  leitor: LeitorPdf,
  paginaIni: number,
  paginaFim: number,
): Promise<PaginaTexto[]> {
  const paginas: PaginaTexto[] = [];
  for (let p = paginaIni; p <= paginaFim; p++) {
    const page = await leitor.doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // mesma extração de item posicionado que `lerPaginas` usa — precisa de x/y/altura pra achar o
    // setor (que só conta dentro do cabeçalho, ver ALTURA_CABECALHO), não só o texto corrido.
    const itens: ItemPosicionado[] = (tc.items as any[])
      .map((i) => ({ t: i.str ?? "", x: i.transform[4], y: vp.height - i.transform[5], h: i.height || 8 }))
      .filter((i) => i.t.trim());
    const texto = itens.map((i) => i.t).join(" ");
    paginas.push({
      pagina: p, texto, largura: vp.width, altura: vp.height,
      setor: acharSetorNaPagina(itens), assinante: acharAssinante(texto), data: acharData(texto),
    });
  }
  return paginas;
}

/**
 * Fatia o PDF completo do SEI em eventos. Nunca devolve resultado parcial silencioso: se a
 * contagem de páginas não fechar (Σ eventos + Σ revisão ≠ total), lança erro — a chamadora
 * decide o que fazer, mas não finge sucesso.
 */
export async function fatiarPdfSei(
  buffer: Uint8Array,
  aoAndar?: AoAndarFatiamento,
): Promise<{ resultado: ResultadoFatiamento; leitor: LeitorPdf }> {
  const doc = await abrirDocumentoPdf(buffer);
  const leitor: LeitorPdf = { doc };
  const paginas = await lerPaginas(doc, aoAndar);
  const totalPaginas = paginas.length;

  const contagemProcesso = new Map<string, number>();
  for (const p of paginas) {
    if (!p.carimbo) continue;
    contagemProcesso.set(p.carimbo.numeroProcesso, (contagemProcesso.get(p.carimbo.numeroProcesso) ?? 0) + 1);
  }
  const numeroProcesso = [...contagemProcesso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  // carimbo válido = tem rodapé, processo bate com o do PDF, e "pg. N" bate com a posição real
  type Validada = { pagina: number; carimbo: Carimbo; setor?: string; data?: string; assinante?: string; papelPorConteudo?: PapelPorConteudo };
  const validas: (Validada | null)[] = paginas.map((p) => {
    if (!p.carimbo) return null;
    if (p.carimbo.numeroProcesso !== numeroProcesso) return null;
    if (p.carimbo.paginaRodape !== p.pagina) return null;
    return { pagina: p.pagina, carimbo: p.carimbo, setor: p.setor, data: p.data, assinante: p.assinante, papelPorConteudo: p.papelPorConteudo };
  });

  const paginasRevisao: PaginaRevisao[] = [];
  // idSei "efetivo" por página: o da própria página se válida, senão herdado por continuidade
  const idEfetivo: (string | null)[] = new Array(totalPaginas).fill(null);

  for (let idx = 0; idx < totalPaginas; idx++) {
    const v = validas[idx];
    if (v) {
      idEfetivo[idx] = v.carimbo.idSei;
      continue;
    }
    const original = paginas[idx];
    let motivo: MotivoRevisao = "sem_rodape_sem_continuidade";
    if (original.carimbo && original.carimbo.numeroProcesso !== numeroProcesso) motivo = "processo_divergente";
    else if (original.carimbo && original.carimbo.paginaRodape !== original.pagina) motivo = "pagina_rodape_diverge";

    /**
     * Página que TEM rodapé legível mas ele CONTRADIZ o arquivo (outro processo, ou "pg. N" que não
     * bate com a posição real) nunca é absorvida por continuidade — vai direto para revisão.
     *
     * Corrigido em 07/09/2026 (auditoria): o cabeçalho deste arquivo sempre prometeu isso ("algo
     * está fora de ordem e a página vai para revisão, nunca é aceita no escuro"), mas o código
     * caía na continuidade abaixo e, quando os vizinhos concordavam, engolia a página em silêncio
     * — sem aparecer em `paginasRevisao`, contra o princípio §5.2/§5.3 do plano.
     *
     * A continuidade continua valendo para o caso que ela existe para resolver: página SEM rodapé
     * legível (miolo de desenho técnico, digitalização), onde não há sinal contraditório nenhum,
     * só ausência de sinal.
     */
    if (motivo !== "sem_rodape_sem_continuidade") {
      paginasRevisao.push({ pagina: original.pagina, motivo });
      continue;
    }

    // continuidade: só anexa quando o vizinho válido de cada lado existe E os dois lados concordam
    let antes: string | null = null;
    for (let k = idx - 1; k >= 0; k--) {
      if (validas[k]) { antes = validas[k]!.carimbo.idSei; break; }
      if (idEfetivo[k]) { antes = idEfetivo[k]; break; }
    }
    let depois: string | null = null;
    for (let k = idx + 1; k < totalPaginas; k++) {
      if (validas[k]) { depois = validas[k]!.carimbo.idSei; break; }
    }
    if (antes && depois && antes === depois) {
      idEfetivo[idx] = antes;
    } else {
      paginasRevisao.push({ pagina: original.pagina, motivo });
    }
  }

  /**
   * Um evento é um intervalo CONTÍNUO de páginas. Se uma página do meio foi para revisão, o evento
   * PRECISA ser cortado ali e recomeçar depois — senão `paginaIni..paginaFim` passaria por cima da
   * página em revisão e ela seria contada duas vezes (uma no evento, outra em `paginasRevisao`),
   * quebrando a soma fechada. Por isso a continuação exige que a página ANTERIOR pertença ao mesmo
   * evento (`idEfetivo[idx - 1] === id`), não só que o último evento tenha o mesmo `idSei`.
   *
   * Antes de 07/09/2026 isso nunca acontecia porque página com rodapé contraditório era absorvida
   * pela continuidade (o defeito corrigido acima); com ela indo para revisão como sempre foi
   * prometido, o corte passou a ser necessário. O mesmo buraco já era possível antes por outro
   * caminho (vizinhos discordando), e ali derrubava a requisição inteira no guarda de soma abaixo
   * em vez de devolver o índice — agora os dois casos ficam corretos.
   */
  const eventos: EventoSei[] = [];
  for (let idx = 0; idx < totalPaginas; idx++) {
    const id = idEfetivo[idx];
    if (!id) continue;
    const atual = eventos[eventos.length - 1];
    if (atual && atual.idSei === id && idx > 0 && idEfetivo[idx - 1] === id) {
      atual.paginaFim = paginas[idx].pagina;
      if (!atual.setor && validas[idx]?.setor) atual.setor = validas[idx]!.setor;
      if (!atual.data && validas[idx]?.data) atual.data = validas[idx]!.data;
      if (!atual.assinante && validas[idx]?.assinante) atual.assinante = validas[idx]!.assinante;
      if (!atual.papelPorConteudo && validas[idx]?.papelPorConteudo) atual.papelPorConteudo = validas[idx]!.papelPorConteudo;
      continue;
    }
    const v = validas[idx];
    eventos.push({
      idSei: id,
      titulo: v?.carimbo.titulo ?? "(herdado por continuidade)",
      paginaIni: paginas[idx].pagina,
      paginaFim: paginas[idx].pagina,
      setor: v?.setor,
      data: v?.data,
      assinante: v?.assinante,
      papelPorConteudo: v?.papelPorConteudo,
    });
  }

  const paginasEmEventos = eventos.reduce((soma, e) => soma + (e.paginaFim - e.paginaIni + 1), 0);
  if (paginasEmEventos + paginasRevisao.length !== totalPaginas) {
    throw new Error(
      `fatiarPdfSei: contagem de páginas não fechou (${paginasEmEventos} em eventos + ${paginasRevisao.length} em revisão ≠ ${totalPaginas} total). Recorte cancelado — nada de resultado parcial.`,
    );
  }

  return { resultado: { numeroProcesso, totalPaginas, eventos, paginasRevisao }, leitor };
}
