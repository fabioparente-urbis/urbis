/**
 * lib/lerPastaSlot5.ts — leitura da pasta do processo de Aprovação de Projeto (slot 5).
 *
 * Porte do `scripts/slot5_ler_pasta.mjs` para dentro do URBIS. A única diferença é a fonte do
 * texto: o script usa `pdftotext` (binário do sistema, que não existe no runtime da Vercel) e
 * aqui se usa `pdfjs-dist`, que já era dependência do projeto e roda em JavaScript puro.
 *
 * A troca saiu melhor que o original: o pdfjs entrega o texto em ITENS com coordenada, e no
 * carimbo da prancha o rótulo vem como um item inteiro ("ÁREA DO TERRENO ORIGINAL:") com o valor
 * no item logo abaixo. Nas tabelas — Uso do Solo, quadro de atividade técnica — cada célula é um
 * item, então coluna deixa de ser adivinhação por contagem de espaços.
 *
 * NENHUMA chamada de IA acontece aqui. Ver docs/PROMPT_LEITURA_PASTA_SLOT5.md
 */

export type ItemTexto = { t: string; x: number; y: number; h: number; pagina: number };
export type Linha = { y: number; pagina: number; itens: ItemTexto[]; texto: string };

export type DocTexto = {
  paginas: number;
  itens: ItemTexto[];
  linhas: Linha[];
  texto: string;
  charsTexto: number;
  temCamadaTexto: boolean;
};

export type ArquivoEntrada = {
  nome: string;
  rodada: number;
  hash: string;
  buffer: Uint8Array;
};

export type Atividade = { descricao: string; quantidade: string; unidade: string };

export type ItemCatalogo = {
  nome: string;
  rodada: number;
  hash: string;
  ext: string;
  bytes: number;
  paginas: number;
  charsTexto: number;
  temCamadaTexto: boolean;
  escaneado?: boolean;
  papeis: string[];
  confianca: "alta" | "media" | "baixa";
  prova: string;
  atividades: Atividade[];
  soPresenca: boolean;
  divergenciaNome?: string;
  alertaRetrocesso?: string;
  dataDocumento: string | null;
  revisao: string | null;
  dados?: any;
  caixaDedicada?: boolean;
  caixaRepetida?: string;
  /** veio da memória do MHD: nada foi reprocessado */
  daMemoria?: boolean;
};

export type Conferencia = {
  nome: string;
  estado: "CONFERE" | "NÃO CONFERE" | "ALERTA" | "SEM DADO" | "INFORMATIVO";
  detalhe: string;
  dependencia?: string;
};

/**
 * O que aconteceu com um campo NAQUELE processo.
 *
 * `resultado` é execução, não declaração — a matriz (lib/rastreabilidade) diz o que o campo PODE
 * ser; isto diz o que ele FOI. Nenhum campo termina ausente: a soma dos resultados fecha em 136.
 *
 * NAO_ENCONTRADO ≠ NAO_APLICAVEL ≠ FONTE_ILEGIVEL:
 *   NAO_APLICAVEL   leu, aplicou regra, concluiu que não se aplica — exige `evidencia`
 *   NAO_ENCONTRADO  procurou onde devia, o texto existe, o dado não estava lá — exige `tentativa`
 *   FONTE_ILEGIVEL  o documento não oferece conteúdo utilizável — exige `tentativa.motivoIlegivel`
 * A distinção existe porque a correção é diferente: extrator, regra ou OCR.
 */
export type ResultadoCampo = {
  resultado: ResultadoExec;
  valor?: string;
  fonte: string;
  /** o que foi lido e permitiu concluir NP. Obrigatório em NAO_APLICAVEL. */
  evidencia?: string;
  /** onde procurou e por que não achou. Obrigatório em NAO_ENCONTRADO e FONTE_ILEGIVEL. */
  tentativa?: TentativaLeitura;
};

export type ResultadoExec =
  | "ENCONTRADO" | "CALCULADO" | "NAO_APLICAVEL" | "NAO_ENCONTRADO" | "FONTE_ILEGIVEL"
  | "DOCUMENTO_AUSENTE" | "AGUARDANDO_FATO" | "MANUAL" | "BLOQUEADO" | "NAO_IMPLEMENTADO";

export type TentativaLeitura = {
  documento?: string;
  hash?: string;
  pagina?: number | string;
  procurou: string[];
  temCamadaTexto?: boolean;
  charsTexto?: number;
  motivoIlegivel?:
    | "SEM_CAMADA_TEXTO" | "RESOLUCAO_INSUFICIENTE" | "TEXTO_CORROMPIDO"
    | "PARCIALMENTE_ILEGIVEL" | "CONTEUDO_NAO_INTERPRETAVEL";
  motivo: string;
};

/** compatibilidade: a tela ainda usa `origem` para colorir */
export type CampoLido = ResultadoCampo & { origem?: string };

export type ResultadoLeitura = {
  catalogo: ItemCatalogo[];
  campos: Record<string, ResultadoCampo>;
  conferencias: Conferencia[];
  obrigatorios: { papel: string; nome: string; presente: boolean }[];
  duplicidades: { mesmaRodada: string[][]; entreRodadas: string[][] };
  custo: { paginasNaPasta: number; paginasIgnoradas: number; arquivosDistintos: number; chamadasIA: number;
           paginasReaproveitadas: number; paginasProcessadas: number };
  /** texto e estrutura de cada arquivo processado agora — o que o MHD guarda no lugar do PDF */
  extratos: { hash: string; texto: string; linhas: unknown }[];
  /**
   * papel → hash do arquivo VENCEDOR daquele papel. Só o vencedor vira versão no MHD: sem isto,
   * a mesma folha salva com dois nomes (a ART de execução e a de caixa são o MESMO arquivo)
   * criava duas versões do mesmo papel, e a segunda aparecia como "correção" numa leitura em que
   * nada foi corrigido.
   */
  vigentesPorPapel: Record<string, string>;
};

// ───────────────────────────── infra ─────────────────────────────

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export const soDigitos = (s?: string | null) => (s || "").replace(/\D/g, "");

/** "365,83m²" -> 365.83 · "1.234,56" -> 1234.56 */
export const num = (s?: string | number | null): number | null => {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const m = String(s).match(/-?\d{1,3}(?:\.\d{3})*,\d+|-?\d+,\d+|-?\d+/);
  return m ? parseFloat(m[0].replace(/\./g, "").replace(",", ".")) : null;
};

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(d).replace(".", ",");

const paraDate = (br?: string | null): Date | null => {
  const m = (br || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};

// ───────────────────────── camada de texto ─────────────────────────

/**
 * Extrai o texto com coordenadas via pdfjs-dist e agrupa em linhas.
 * `y` é convertido para top-down (origem no alto), para bater com a leitura humana da página.
 */
export async function extrairPdf(buffer: Uint8Array): Promise<DocTexto> {
  // legacy build: é o que funciona em Node sem DOM
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: buffer, useSystemFonts: true, isEvalSupported: false }).promise;

  const itens: ItemTexto[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const i of tc.items as any[]) {
      const t = (i.str || "").trim();
      if (!t) continue;
      itens.push({ t, x: i.transform[4], y: vp.height - i.transform[5], h: i.height || 8, pagina: p });
    }
  }

  /**
   * Agrupa por linha. A tolerância acompanha a ALTURA DA FONTE, não um número fixo: no Uso do
   * Solo o "R 2" e o "COLETORA" da mesma linha da tabela vêm com 3 unidades de diferença em y, e
   * uma tolerância fixa de 3 os separava — o que fazia a classificação da via sumir.
   */
  const linhas: Linha[] = [];
  for (const i of [...itens].sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x)) {
    const tol = Math.max(3, i.h * 0.6);
    const L = linhas.find((l) => l.pagina === i.pagina && Math.abs(l.y - i.y) < tol);
    if (L) L.itens.push(i);
    else linhas.push({ y: i.y, pagina: i.pagina, itens: [i], texto: "" });
  }
  for (const l of linhas) {
    l.itens.sort((a, b) => a.x - b.x);
    l.texto = l.itens.map((i) => i.t).join(" ");
  }

  const texto = linhas.map((l) => l.texto).join("\n");
  const charsTexto = texto.replace(/\s/g, "").length;
  return { paginas: doc.numPages, itens, linhas, texto, charsTexto, temCamadaTexto: charsTexto > 50 };
}

/**
 * Valor de um rótulo do carimbo. No CAD o texto é posicionado, não corrido: o valor está no
 * item logo ABAIXO do rótulo, na mesma coluna, ou à direita na mesma linha.
 */
function valorPerto(doc: DocTexto, rotulo: string, padrao: RegExp, raio = 40): string | null {
  const alvo = norm(rotulo);
  const rot = doc.itens.filter((i) => norm(i.t).startsWith(alvo));
  for (const r of rot) {
    const candidatos = doc.itens
      .filter((i) => i !== r && i.pagina === r.pagina && padrao.test(i.t))
      .map((i) => {
        const abaixo = i.y > r.y && i.y - r.y < raio && Math.abs(i.x - r.x) < 200;
        const direita = Math.abs(i.y - r.y) < 4 && i.x > r.x;
        if (!abaixo && !direita) return null;
        return { i, dist: direita ? i.x - r.x : (i.y - r.y) * 3 + Math.abs(i.x - r.x) };
      })
      .filter(Boolean) as { i: ItemTexto; dist: number }[];
    if (candidatos.length) return candidatos.sort((a, b) => a.dist - b.dist)[0].i.t;
  }
  return null;
}

/** Linha seguinte à que casa com `re` — tabela com rótulo em cima e valores embaixo. */
function proxLinha(doc: DocTexto, re: RegExp): Linha | null {
  const i = doc.linhas.findIndex((l) => re.test(l.texto));
  return i < 0 ? null : doc.linhas[i + 1] ?? null;
}

const colunas = (l: Linha | null) => (l ? l.itens.map((i) => i.t) : []);

const P_AREA = /\d{1,3}(?:\.\d{3})*,\d{2}\s*m?²?/i;
const P_DATA = /^\d{2}\/\d{2}\/\d{4}$/;

// ───────────────────── identificação de papéis ─────────────────────

/**
 * Ordem de precedência: a primeira assinatura que casar decide.
 *
 * A prancha vem antes da ART de propósito. A nota SEPLANH impressa no desenho diz
 * "A CAIXA DE INFILTRAÇÃO É DE RESPONSABILIDADE DO PROFISSIONAL QUE ASSINOU A ART / RRT DE
 * EXECUÇÃO E PROJETO" — texto que casa com qualquer assinatura frouxa de ART. Um documento que
 * FALA de ART não é uma ART: por isso a ART exige cabeçalho de formulário, não a sigla solta.
 */
const ASSINATURAS: { papel: string; re: RegExp }[] = [
  { papel: "projeto", re: /AREA TOTAL DA CONSTRUCAO|PROJETO LEGAL DE ARQUITETURA|QUADROS? DE ABERTURAS/ },
  { papel: "uso_solo", re: /INFORMACAO DE USO DO SOLO/ },
  { papel: "certidao_matricula", re: /CERTIDAO DE MATRICULA|REGISTRO DE IMOVEIS DA/ },
  { papel: "art", re: /ART OBRA OU SERVICO|DETALHES DO RRT|N[ºO°]? DO RRT|ANOTACAO DE RESPONSABILIDADE TECNICA PARA/ },
  { papel: "requerimento", re: /REQUERIMENTO|REQUEIRO/ },
  { papel: "declaracao", re: /DECLARACAO DE RESPONSABILIDADE|DECLARO/ },
];

/** Nome do arquivo → papel esperado. Vale SÓ na rodada 1 (slots fixos do SEI). */
const SLOTS_SEI: { re: RegExp; papel: string }[] = [
  { re: /ART.*CAIXA/i, papel: "art_caixa" },
  { re: /ART.*EXECU/i, papel: "art_execucao" },
  { re: /ART.*PROJETO/i, papel: "art_projeto" },
  { re: /CERTID[ÃA]?[AO]/i, papel: "certidao_matricula" },
  { re: /DECLARA/i, papel: "declaracao" },
  { re: /DOCUMENTOS/i, papel: "documentos_pessoais" },
  { re: /\.(dwg|dxf)$/i, papel: "projeto_cad" },
  { re: /^PROJETO\s*\.pdf$/i, papel: "projeto" },
  { re: /USO\s*DO\s*SOLO/i, papel: "uso_solo" },
  { re: /REQUERIMENTO/i, papel: "requerimento" },
];

/** Os 10 Documentos Obrigatórios da rodada 1. */
export const OBRIGATORIOS: [string, string][] = [
  ["art_caixa", "ART de caixa de recarga"],
  ["art_execucao", "ART de execução"],
  ["art_projeto", "ART do projeto de arquitetura"],
  ["certidao_matricula", "Certidão de Matrícula"],
  ["declaracao", "Declaração de Responsabilidade"],
  ["documentos_pessoais", "Documentos da Pessoa Física/Jurídica"],
  ["projeto_cad", "Projeto em DWG/DXF"],
  ["projeto", "Projeto em PDF"],
  ["requerimento", "Requerimento"],
  ["uso_solo", "Uso do Solo Aprovação de Projeto"],
];

/** Nunca são lidos: escopo da CHEADV (decisão do analista) ou ilegíveis por natureza. */
export const SO_PRESENCA = new Set(["documentos_pessoais", "declaracao", "projeto_cad"]);

// ───────────────────────────── extratores ─────────────────────────────

function lerUsoDoSolo(doc: DocTexto) {
  const t = doc.texto;
  const d: any = {};
  d.numero = (t.match(/UDS\d{10,}/) || [])[0] || null;
  d.iptu = (t.match(/\b\d{14}\b/) || [])[0] || null;
  d.tipo = /APROVA[ÇC][ÃA]O DE PROJETO/i.test(t) ? "APROVAÇÃO DE PROJETO" : null;

  const [q, l, emb] = colunas(proxLinha(doc, /Quadra\s+Lote\s+Possui Embargo/i));
  d.quadra = q ?? null;
  d.lote = l ?? null;
  d.embargo = emb ?? null;

  d.bairro = colunas(proxLinha(doc, /^\s*Bairro\s*$/i))[0] ?? null;

  const [via, classe] = colunas(proxLinha(doc, /Nome da Via\s+Classifica[çc][ãa]o da Via/i));
  d.via = via ?? null;
  d.classificacaoVia = classe ?? null;

  d.unidadeTerritorial = colunas(proxLinha(doc, /Unidades Territoriais/i))[0] ?? null;

  const corr = colunas(proxLinha(doc, /Corredor\(es\) Vi[áa]rio\(s\)/i))[0];
  d.corredorViario = corr && corr !== "-" ? corr : null;

  d.fracaoIdeal = (t.match(/FRA[ÇC][ÃA]O IDEAL:\s*([^\n]+)/i) || [])[1]?.trim() || null;
  d.iccap = (t.match(/(1m³ para cada \d+m² de [^\n]+)/i) || [])[1]?.trim() || null;
  d.iccapDivisor = num((t.match(/1m³ para cada (\d+)m²/i) || [])[1]);
  d.paisagisticoMin = num((t.match(/m[íi]nimo de (\d+)%/i) || [])[1]);
  d.indiceOcupacao = (t.match(/[ÍI]NDICE DE OCUPA[ÇC][ÃA]O:\s*([^\n]+)/i) || [])[1]?.trim() || null;
  d.embarqueDesembarque = (t.match(/Embarque Desembarque[\s\S]{0,200}?\b(SIM|N[ÃA]O)\b/i) || [])[1] || null;

  // "Para o(s) grau(s) GI-1 a área máxima será sem limite de área" — a coluna de embarque fica
  // na MESMA linha, então se pega a célula, não o resto da linha
  const linhaPorte = doc.linhas.find((l) => /[áa]rea m[áa]xima ser[áa]/i.test(l.texto));
  d.areaMaxima =
    linhaPorte?.itens.map((i) => i.t).find((c) => /[áa]rea m[áa]xima ser[áa]/i.test(c))
      ?.replace(/^.*?[áa]rea m[áa]xima ser[áa]\s*/i, "").trim() || null;

  d.cnaes = [...t.matchAll(/\b(\d{9})\s+([A-ZÀ-Ú][^\n]{4,60}?)\s+(?:N[ÃA]O|SIM)\b/gi)].map((m) => ({
    codigo: m[1],
    denominacao: m[2].trim(),
  }));

  d.dataEmissao = (() => {
    const m = t.match(/GOI[ÂA]NIA (\d{1,2}) DE ([A-ZÇÃ]+) DE (\d{4})/i);
    if (!m) return null;
    const meses = ["JANEIRO","FEVEREIRO","MARCO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
    const i = meses.indexOf(norm(m[2]));
    return i < 0 ? null : `${String(m[1]).padStart(2, "0")}/${String(i + 1).padStart(2, "0")}/${m[3]}`;
  })();
  d.validadeDias = num((t.match(/VALIDADE DA INFORMA[ÇC][ÃA]O:\s*(\d+)\s*DIAS/i) || [])[1]);

  const vagas = t.match(/0 a 90 m²[^\n]*\n\s*(ISENTO[^\n]+)/i);
  d.tabelaVagas = vagas?.[1]?.trim() || null;
  return d;
}

/**
 * Campos do carimbo conforme o modelo oficial da IN 007/2024 — "PROJETO LEGAL DE ARQUITETURA /
 * APROVAÇÃO DE PROJETO: EDIFICAÇÃO NOVA", página 522 da Coletânea Urbanística de Goiânia, 3ª
 * edição, 2024.
 *
 * Cada campo traz o rótulo OFICIAL primeiro e, depois, as variantes que aparecem na prática. Isso
 * importa: a prancha da amostra escreve "Área de cobertura vegetal permeável" onde o modelo manda
 * "FORRAÇÃO VEGETAL PERMEÁVEL", e "ÁREA DO TERRENO ORIGINAL" onde o modelo manda "ÁREA DO
 * TERRENO". Ler só o rótulo de uma prancha seria calibrar o sistema para um projetista só.
 *
 * `exigidoPelaIN` marca o que o carimbo É OBRIGADO a trazer — a ausência vira pendência, não
 * silêncio.
 */
const CARIMBO_IN007: { chave: string; oficial: string; variantes: string[]; exigidoPelaIN: boolean }[] = [
  { chave: "areaTerreno", oficial: "ÁREA DO TERRENO", variantes: ["ÁREA DO TERRENO ORIGINAL"], exigidoPelaIN: true },
  { chave: "areaTotalConstrucao", oficial: "ÁREA TOTAL DA CONSTRUÇÃO", variantes: [], exigidoPelaIN: true },
  { chave: "permeavel", oficial: "FORRAÇÃO VEGETAL PERMEÁVEL", variantes: ["Área de cobertura vegetal permeável"], exigidoPelaIN: true },
  { chave: "naoPermeavel", oficial: "FORRAÇÃO VEGETAL NÃO PERMEÁVEL", variantes: ["Área de cobertura vegetal não permeável"], exigidoPelaIN: true },
  { chave: "vegetalTotal", oficial: "ÍNDICE TOTAL", variantes: ["Área de cobertura vegetal TOTAL"], exigidoPelaIN: true },
];

function lerPrancha(doc: DocTexto) {
  const t = doc.texto;
  const d: any = { carimboFaltando: [] as string[] };

  // o pdfjs entrega rótulo e valor no MESMO item ("A= 78,48m² _ 13,72%"), então área e
  // percentual saem da mesma string
  const areaEPct = (rotulos: string[]) => {
    for (const r of rotulos) {
      const v = valorPerto(doc, r, P_AREA);
      if (!v) continue;
      return {
        area: num(v.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*m²/i)?.[1]),
        pct: num(v.match(/(\d+,\d+)\s*%/)?.[1]),
        rotuloUsado: r,
      };
    }
    return { area: null, pct: null, rotuloUsado: null as string | null };
  };

  for (const campo of CARIMBO_IN007) {
    const r = areaEPct([campo.oficial, ...campo.variantes]);
    d[campo.chave] = r.area;
    d[campo.chave + "Pct"] = r.pct;
    if (r.area == null && campo.exigidoPelaIN) d.carimboFaltando.push(campo.oficial);
    else if (r.rotuloUsado && r.rotuloUsado !== campo.oficial) {
      (d.carimboVariantes ||= []).push(`"${r.rotuloUsado}" no lugar de "${campo.oficial}"`);
    }
  }

  /**
   * ICCAP. O modelo oficial manda "EXIGIDO XXX M² / ATENDIDO XXX M3" — os DOIS valores. É daí que
   * sairia a área impermeabilizada que hoje falta para conferir o volume da caixa. Quando a
   * prancha traz só o volume atendido (como na amostra, "V = 2,32m³"), o carimbo está fora do
   * modelo e a conferência do ICCAP fica sem base.
   */
  const iccap = valorPerto(doc, "ICCAP", /EXIGIDO|ATENDIDO|\d+,\d+/i, 60)
             || valorPerto(doc, "ÍNDICE DE CONTROLE E CAPTAÇÃO", /V\s*=|\d+,\d+/i, 60);
  d.iccapExigido = num(t.match(/EXIGIDO\s*([\d.]+,?\d*)\s*[Mm]/i)?.[1]);
  d.iccapAtendido = num(t.match(/ATENDIDO\s*([\d.]+,?\d*)\s*[Mm]/i)?.[1]);
  d.volumeCaixa = d.iccapAtendido ?? num((t.match(/V\s*=\s*(\d+,\d+)\s*m³/i) || [])[1]);
  if (d.iccapExigido == null) d.carimboFaltando.push("ICCAP — EXIGIDO (o modelo pede EXIGIDO e ATENDIDO)");
  d.iccapBruto = iccap;

  d.numeroCaixas = (t.match(/N[úu]mero de caixas:\s*(\d+)/i) || [])[1] || null;
  d.revisao = (t.match(/\bREV\s?(\d{2})\b/i) || [])[0]?.replace(/\s/g, "") || null;

  // a data do carimbo tem que vir DO RÓTULO: a prancha está cheia de outras datas (especificação
  // de porta, nota de norma) e a primeira do arquivo é de 2019
  d.data = valorPerto(doc, "DATA:", P_DATA);
  // DATAS SEPARADAS: "a prancha é anterior à ART" é conclusão, não fato. O fato são as datas, e um
  // projeto tem várias. Guardar só uma obriga a escolher qual, e a comparação fica frágil.
  d.dataElaboracao = valorPerto(doc, "DATA DE ELABORAÇÃO", P_DATA) ?? d.data;
  d.dataRevisao = valorPerto(doc, "DATA DA REVISÃO", P_DATA) ?? valorPerto(doc, "REVISÃO:", P_DATA);
  d.folha = valorPerto(doc, "FOLHA:", /^\d+\s*\/\s*\d+$|^\d+$/);
  d.desenho = valorPerto(doc, "DESENHO:", /\S/);

  d.pavimentos = (t.match(/(\d{2})\s*PAVIMENTO/i) || [])[1] || null;
  d.terreo = /PAVIMENTO\s*_?\s*T[ÉE]RREO/i.test(t);
  d.iptu = (t.match(/IT?U\s*([\d.]{14,20})/i) || [])[1] || null;
  d.usoDoSoloN = (t.match(/USO DO SOLO N[ºO°]:\s*(\S+)/i) || [])[1] || null;
  d.endereco = (t.match(/(RUA [^\n,]+,\s*N[ºO°]\s*\d+[^\n]*LOTE\s*\d+)/i) || [])[1]?.trim() || null;

  const arq = t.match(/ARQ\.\s*([A-ZÀ-Ú\s]+?)\s*CAU:\s*(\S+)/i);
  d.arquiteto = arq?.[1]?.trim() || null;
  d.cau = arq?.[2] || null;
  const eng = t.match(/ENG\.?\s*CIVIL\s*([A-ZÀ-Ú\s]+?)\s*CREA:\s*(\S+)/i);
  d.engenheiro = eng?.[1]?.trim() || null;
  d.crea = eng?.[2] || null;
  return d;
}

function lerArt(doc: DocTexto) {
  const t = doc.texto;
  const d: any = { atividades: [] as Atividade[] };

  d.numero =
    (t.match(/N[ºo°]?\s*do RRT:\s*(\S+)/i) || [])[1] ||               // formulário do CAU
    (t.match(/NUMERO_DA_ART=(\d+)/i) || [])[1] ||                     // ART do CREA (link de impressão)
    (t.match(/\bART\s*n?[ºo°]?\s*[:.]?\s*(\d{10,})/i) || [])[1] || null;
  d.registroProfissional =
    (t.match(/N[ºo°]?\s*do Registro:\s*(\S+)/i) || [])[1] || (t.match(/Registro:\s*(\S+)/i) || [])[1] || null;
  d.dataCelebracao = (t.match(/Celebrado em:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  d.dataRegistro =
    (t.match(/Data de Registro:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] ||
    (t.match(/Registrada em\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  d.declaracaoAcessibilidade = /Declara[çc][ãa]o de Acessibilidade/i.test(t);
  // A ART do CREA imprime "Coordenadas Geográficas: -16.6773299,-49.2573366". O campo do LIP era
  // tratado como digitação manual desde a Regularização — nunca ninguém tinha olhado aqui.
  d.coordenadas = (t.match(/Coordenadas Geogr[áa]ficas:\s*(-?\d+[.,]\d+\s*,\s*-?\d+[.,]\d+)/i) || [])[1]
    ?.replace(/\s+/g, "") || null;
  // datas separadas da ART: cadastro, registro e assinatura são coisas diferentes
  d.dataCadastro = (t.match(/Data de Cadastro:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  d.dataAssinatura = (t.match(/na data e hora:\s*(\d{4})-(\d{2})-(\d{2})/i) || []).slice(1, 4)
    .reverse().join("/") || null;
  d.dataElaboracao = d.dataCadastro ?? d.dataCelebracao ?? null;

  // ART do CREA: a linha tem três células — descrição, quantidade, unidade
  for (const l of doc.linhas) {
    const c = l.itens.map((i) => i.t);
    if (c.length >= 3 && /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(c[1]) && /METROS?\s+(QUADRADOS?|CUBICOS?|C[ÚU]BICOS?)/i.test(c[2])) {
      d.atividades.push({ descricao: c[0], quantidade: c[1], unidade: c[2] });
    }
  }
  // formulário do CAU: "Grupo: X | Quantidade: Y" e, na linha seguinte, "Atividade: Z | Unidade: U"
  for (let i = 0; i < doc.linhas.length - 1; i++) {
    const a = doc.linhas[i].texto, b = doc.linhas[i + 1].texto;
    const qtd = a.match(/Quantidade:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1];
    const ativ = b.match(/Atividade:\s*(.+?)\s*(?:Unidade:|$)/i)?.[1];
    const unid = b.match(/Unidade:\s*(metro\s+\S+)/i)?.[1];
    if (qtd && ativ) d.atividades.push({ descricao: ativ.trim(), quantidade: qtd, unidade: unid || "" });
  }
  return d;
}

function lerRequerimento(doc: DocTexto) {
  const t = doc.texto;
  const d: any = {};
  d.interessado =
    (t.match(/^\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+){1,5})\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s*$/m) || [])[1]?.trim() || null;
  d.cpf = (t.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/) || [])[1] || null;
  d.iptu = (t.match(/(\d{3}\.\d{3}\.\d{4}\.\d{4})/) || [])[1] || null;
  d.enderecoImovel = (t.match(/(Rua\s+\d+\s+Quadra[^\n]+)/i) || [])[1]?.trim() || null;
  const uso = t.match(/\b(Comercial|Residencial|Misto|Institucional)\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  d.tipoUso = uso?.[1] || null;
  d.areaDeclarada = num(uso?.[2]);
  return d;
}

function lerCertidao(doc: DocTexto) {
  const t = doc.texto;
  return {
    matricula: (t.match(/matr[íi]cula n[ºo°]\s*([\d.]+)/i) || [])[1] || null,
    livro: (t.match(/Livro\s*(\d+)/i) || [])[1] || null,
    // as dimensões e confrontações da matrícula vêm em imagem: não há o que ler aqui
    dimensoes: null as string | null,
  };
}

// ───────────────────────────── catálogo ─────────────────────────────

/**
 * Conhecimento já guardado no MHD, indexado por hash. Documento com hash conhecido NÃO é
 * reprocessado: o catálogo é reconstruído da memória, sem abrir o PDF.
 */
export type Conhecido = {
  papeis: string[];
  dados: any;
  paginas: number | null;
  charsTexto?: number | null;
  dataDocumento: string | null;
  revisao: string | null;
  lidoEm?: string;
};

async function catalogar(
  arquivos: ArquivoEntrada[],
  conhecidos?: Map<string, Conhecido>,
): Promise<{ catalogo: ItemCatalogo[]; extratos: { hash: string; texto: string; linhas: unknown }[] }> {
  const out: ItemCatalogo[] = [];
  const extratos: { hash: string; texto: string; linhas: unknown }[] = [];

  for (const a of arquivos) {
    // ── MEMÓRIA: mesmo hash = mesmo conteúdo. Não abre o arquivo, não extrai, não chama IA.
    const memo = conhecidos?.get(a.hash);
    if (memo) {
      out.push({
        nome: a.nome, rodada: a.rodada, hash: a.hash,
        ext: (a.nome.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase(),
        bytes: a.buffer.length, paginas: memo.paginas ?? 0,
        charsTexto: memo.charsTexto ?? 0, temCamadaTexto: (memo.charsTexto ?? 0) > 50,
        papeis: memo.papeis, confianca: "alta",
        prova: `reaproveitado da memória do MHD${memo.lidoEm ? ` (lido em ${new Date(memo.lidoEm).toLocaleDateString("pt-BR")})` : ""}`,
        atividades: memo.dados?.atividades ?? [],
        soPresenca: memo.papeis.some((p) => SO_PRESENCA.has(p)),
        dataDocumento: memo.dataDocumento, revisao: memo.revisao,
        dados: memo.dados, daMemoria: true,
      });
      continue;
    }

    const ext = (a.nome.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
    const base: ItemCatalogo = {
      nome: a.nome, rodada: a.rodada, hash: a.hash, ext, bytes: a.buffer.length,
      paginas: 0, charsTexto: 0, temCamadaTexto: false,
      papeis: [], confianca: "baixa", prova: "", atividades: [], soPresenca: false,
      dataDocumento: null, revisao: null,
    };

    if (ext === ".dwg" || ext === ".dxf") {
      out.push({ ...base, papeis: ["projeto_cad"], soPresenca: true, confianca: "alta",
        prova: `extensão ${ext} — único caso em que a extensão decide, porque não há conteúdo legível` });
      continue;
    }
    if (ext !== ".pdf") {
      out.push({ ...base, papeis: ["outros"], prova: "extensão não reconhecida" });
      continue;
    }

    let doc: DocTexto;
    try {
      doc = await extrairPdf(a.buffer);
    } catch (e: any) {
      out.push({ ...base, papeis: ["outros"], prova: `PDF ilegível: ${e?.message ?? e}` });
      continue;
    }

    const item: ItemCatalogo = { ...base, paginas: doc.paginas, charsTexto: doc.charsTexto, temCamadaTexto: doc.temCamadaTexto };
    // o que o MHD guarda no lugar do PDF: o texto e a ESTRUTURA com coordenada. Sem a
    // coordenada não se relê carimbo de prancha, e a reanálise futura exigiria o arquivo.
    extratos.push({ hash: a.hash, texto: doc.texto, linhas: { paginas: doc.paginas, itens: doc.itens } });
    const T = norm(doc.texto);
    const achado = ASSINATURAS.find((s) => s.re.test(T)) || null;
    /**
     * Pista do nome. Na RAIZ vale como sinal forte (os 10 slots do SEI têm nome padronizado) e a
     * divergência com o conteúdo é alerta. Na SUBPASTA o nome não pode CONTRADIZER o conteúdo, mas
     * serve de ÚLTIMO RECURSO quando o conteúdo não diz nada — sem isso, uma declaração de
     * responsabilidade que chega numa correção virava "outros", porque o texto dela é curto demais
     * para ter assinatura reconhecível.
     */
    const pista = SLOTS_SEI.find((s) => s.re.test(a.nome))?.papel ?? null;
    const pistaForte = a.rodada === 1;

    if (!doc.temCamadaTexto) {
      item.papeis = pista ? [pista] : ["outros"];
      item.confianca = pista ? "media" : "baixa";
      item.escaneado = true;
      item.prova = "PDF sem camada de texto (digitalizado) — identificado pela pista do nome";
    } else if (achado?.papel === "art") {
      // o papel da ART sai EXCLUSIVAMENTE do quadro de atividade técnica
      const art = lerArt(doc);
      item.atividades = art.atividades;
      const temM2 = art.atividades.some((x: Atividade) => /QUADRAD/i.test(x.unidade));
      const temM3 = art.atividades.some((x: Atividade) => /C[ÚU]BIC/i.test(x.unidade));
      const ehProjeto = art.atividades.some((x: Atividade) => /PROJETO|ELABORA/i.test(x.descricao));
      if (temM2) item.papeis.push(ehProjeto ? "art_projeto" : "art_execucao");
      if (temM3) item.papeis.push("art_caixa");
      if (!item.papeis.length) item.papeis = ["art_indefinida"];
      item.confianca = art.atividades.length ? "alta" : "baixa";
      item.prova = art.atividades.map((x: Atividade) => `${x.descricao} — ${x.quantidade} ${x.unidade}`).join(" | ")
        || "quadro de atividade técnica ilegível";
    } else if (achado) {
      item.papeis = [achado.papel];
      item.confianca = "alta";
      item.prova = `assinatura de conteúdo: ${achado.papel}`;
    } else {
      item.papeis = pista ? [pista] : ["outros"];
      item.confianca = pista ? (pistaForte ? "media" : "baixa") : "baixa";
      item.prova = pista
        ? `pista do nome${pistaForte ? " na raiz" : " (subpasta — último recurso)"}, sem assinatura de conteúdo`
        : "não reconhecido";
    }

    if (item.papeis.some((p) => SO_PRESENCA.has(p))) item.soPresenca = true;

    // extratores despacham pelo PAPEL RESOLVIDO, não pelo caminho que o resolveu: o requerimento
    // não contém a palavra "requerimento" (é formulário do DOM) e só entra pela pista do nome
    if (!item.soPresenca && doc.temCamadaTexto) {
      if (item.papeis.includes("uso_solo")) item.dados = lerUsoDoSolo(doc);
      else if (item.papeis.includes("projeto")) item.dados = lerPrancha(doc);
      else if (item.papeis.includes("requerimento")) item.dados = lerRequerimento(doc);
      else if (item.papeis.includes("certidao_matricula")) item.dados = lerCertidao(doc);
      else if (item.papeis.some((p) => p.startsWith("art"))) item.dados = lerArt(doc);
    }

    item.dataDocumento =
      item.dados?.dataEmissao || item.dados?.dataRegistro || item.dados?.dataCelebracao || item.dados?.data || null;
    item.revisao = item.dados?.revisao ?? null;

    // divergência nome × conteúdo só é sinal na raiz, onde o nome é padronizado
    if (pistaForte && pista && !item.papeis.includes(pista) && !item.papeis.includes("art_indefinida")) {
      item.divergenciaNome = `nome diz "${pista}", conteúdo diz "${item.papeis.join("+")}"`;
    }

    out.push(item);
  }
  return { catalogo: out, extratos };
}

// ──────────────────── vigência: mais recente EMITIDO vence ────────────────────

/**
 * Vigência por papel.
 *
 * REGRA DO FÁBIO (27/07/2026, corrigindo a versão anterior): **a subpasta mais recente SEMPRE tem
 * prioridade** sobre qualquer outra pasta ou arquivo. A subpasta É a correção que o requerente
 * mandou — ela manda, e ponto. Não se discute com ela por data.
 *
 * A versão anterior deste código decidia pela data de emissão impressa no documento, e isso estava
 * errado: fazia uma correção nova perder para um documento antigo melhor datado.
 *
 * A data continua sendo lida, mas **rebaixada a aviso**: se o arquivo da rodada nova for emitido
 * antes do que ele substitui, o sistema avisa e usa mesmo assim. Custa nada e às vezes pega o
 * requerente reenviando arquivo velho por engano.
 */
function vigentes(catalogo: ItemCatalogo[]) {
  const porPapel: Record<string, ItemCatalogo> = {};

  for (const it of catalogo) {
    for (const papel of it.papeis) {
      const atual = porPapel[papel];
      if (!atual) { porPapel[papel] = it; continue; }

      // 1º critério e critério soberano: rodada maior vence
      let venceu = it.rodada > atual.rodada;
      // dentro da MESMA rodada, aí sim desempata por data e depois por revisão
      if (it.rodada === atual.rodada) {
        const dNovo = paraDate(it.dataDocumento), dAtual = paraDate(atual.dataDocumento);
        if (dNovo && dAtual && +dNovo !== +dAtual) venceu = dNovo > dAtual;
        else {
          const rNovo = num(it.revisao), rAtual = num(atual.revisao);
          venceu = rNovo != null && rAtual != null ? rNovo > rAtual : false;
        }
      }

      if (venceu) {
        // aviso, nunca bloqueio: a rodada nova vence de qualquer jeito
        const dNovo = paraDate(it.dataDocumento), dAtual = paraDate(atual.dataDocumento);
        if (dNovo && dAtual && dNovo < dAtual) {
          it.alertaRetrocesso =
            `a rodada ${it.rodada} passa a valer (é a correção mais recente), mas o documento está ` +
            `emitido em ${it.dataDocumento}, ANTES do que ele substitui (${atual.dataDocumento}) — ` +
            `confira se o requerente não reenviou arquivo desatualizado`;
        }
        porPapel[papel] = it;
      }
    }
  }

  /**
   * art_caixa é o único papel com dois candidatos legítimos — o projeto e a execução da rede
   * pluvial, cada um dentro de uma ART maior. Nesse caso o número já está em numeroDeArtProjeto
   * ou numeroDeArtExecucao, e o campo do LIP só repetiria. Prefere ART DEDICADA; não havendo,
   * cai para a de execução e MARCA que é repetição.
   */
  const todosCaixa = catalogo.filter((it) => it.papeis.includes("art_caixa"));
  if (todosCaixa.length > 1) {
    // A RODADA É SOBERANA: a preferência abaixo é desempate DENTRO da rodada mais recente, nunca
    // por cima dela. Sem este recorte, uma ART de caixa que chega numa correção perdia para a da
    // raiz só porque a da raiz também era a de execução.
    const ultimaRodada = Math.max(...todosCaixa.map((it) => it.rodada));
    const candidatos = todosCaixa.filter((it) => it.rodada === ultimaRodada);

    const ehPluvial = (a: Atividade) => /PLUVIA|DRENAG|SANEAM|RECARGA|INFILTRA/i.test(a.descricao);
    const dedicada = candidatos.find((it) => it.atividades.length > 0 && it.atividades.every(ehPluvial));
    if (dedicada) {
      porPapel.art_caixa = dedicada;
      dedicada.caixaDedicada = true;
    } else {
      const exec = candidatos.find((it) => it.papeis.includes("art_execucao"));
      const escolhido = exec ?? candidatos[0];
      porPapel.art_caixa = escolhido;
      escolhido.caixaRepetida = escolhido.papeis.includes("art_execucao")
        ? "ART de execução" : "ART de projeto";
    }
  }

  return porPapel;
}

// ──────────────────────── campos do LIP ────────────────────────

const TOL = 0.02; // tolerância de arredondamento, em m² / m³

function preencherLip(vig: Record<string, ItemCatalogo>) {
  const C: Record<string, ResultadoCampo> = {};

  /**
   * O `set` NUNCA sai calado.
   *
   * A versão anterior fazia `if (valor == null) return`, e o campo simplesmente não existia no
   * resultado: nem NP, nem erro, nem aviso — sumia. Isso quebrava, em silêncio, a própria regra de
   * "nenhum campo termina vazio sem justificativa", e escondia justamente o caso mais frequente na
   * prática: o projetista montou o PDF de outro jeito e o rótulo não estava onde se procurou.
   *
   * Agora, sem valor, grava-se NAO_ENCONTRADO com ONDE se procurou — que é o insumo para evoluir
   * o leitor em vez de descobrir a falha por acaso, meses depois.
   */
  const set = (
    chave: string, valor: any, resultado: ResultadoExec, fonte: string,
    procurou?: string[], doc?: ItemCatalogo,
  ) => {
    if (valor != null && valor !== "" && valor !== "—") {
      C[chave] = { valor: String(valor), resultado, fonte };
      return;
    }
    // sem valor: o motivo depende de o documento existir e ser legível
    if (!doc) {
      C[chave] = {
        resultado: "NAO_ENCONTRADO", fonte,
        tentativa: { procurou: procurou ?? [fonte], motivo: "documento de origem não está no catálogo" },
      };
      return;
    }
    if (!doc.temCamadaTexto) {
      C[chave] = {
        resultado: "FONTE_ILEGIVEL", fonte,
        tentativa: {
          documento: doc.nome, hash: doc.hash, procurou: procurou ?? [fonte],
          temCamadaTexto: false, charsTexto: doc.charsTexto,
          motivoIlegivel: "SEM_CAMADA_TEXTO",
          motivo: `${doc.nome} não tem camada de texto (${doc.paginas} página(s) digitalizadas)`,
        },
      };
      return;
    }
    C[chave] = {
      resultado: "NAO_ENCONTRADO", fonte,
      tentativa: {
        documento: doc.nome, hash: doc.hash, procurou: procurou ?? [fonte],
        temCamadaTexto: true, charsTexto: doc.charsTexto,
        motivo: `o padrão não localizou o dado em ${doc.nome}, que tem texto legível`,
      },
    };
  };

  /** valor lido de documento */
  const lido = (chave: string, valor: any, fonte: string, doc?: ItemCatalogo, procurou?: string[]) =>
    set(chave, valor, "ENCONTRADO", fonte, procurou, doc);
  /** resultado de conta ou derivação */
  const calc = (chave: string, valor: any, fonte: string, doc?: ItemCatalogo, procurou?: string[]) =>
    set(chave, valor, "CALCULADO", fonte, procurou, doc);

  /**
   * NÃO APLICÁVEL exige PROVA POSITIVA: só se produz NP quando alguma informação foi lida, uma
   * regra declarada foi aplicada, e a regra concluiu que o campo não se aplica. Ausência de valor
   * nunca gera NP — isso é NAO_ENCONTRADO, e confundir os dois esconde falha de leitura atrás de
   * uma resposta que parece decidida.
   */
  const np = (chave: string, regra: string, evidencia: string) => {
    C[chave] = { valor: "NP", resultado: "NAO_APLICAVEL", fonte: regra, evidencia };
  };

  const uds = vig.uso_solo?.dados ?? {};
  const pr = vig.projeto?.dados ?? {};
  const rq = vig.requerimento?.dados ?? {};
  const ct = vig.certidao_matricula?.dados ?? {};
  const aProj = vig.art_projeto?.dados ?? {};
  const aExec = vig.art_execucao?.dados ?? {};
  const aCx = vig.art_caixa?.dados ?? {};

  // identificação
  set("logradouro", uds.via ?? pr.endereco?.match(/RUA\s*\d+/i)?.[0], "ENCONTRADO", "Uso do Solo (Nome da Via)");
  set("quadra", uds.quadra, "ENCONTRADO", "Uso do Solo");
  set("lote", uds.lote, "ENCONTRADO", "Uso do Solo");
  set("bairro", uds.bairro, "ENCONTRADO", "Uso do Solo");
  set("iptu", soDigitos(uds.iptu ?? pr.iptu ?? rq.iptu), "ENCONTRADO", "Uso do Solo");
  set("proprietario", rq.interessado, "ENCONTRADO", "Requerimento");
  set("nome_responsavel_arq", pr.arquiteto, "ENCONTRADO", "carimbo da prancha");
  set("cau", pr.cau, "ENCONTRADO", "carimbo da prancha");
  set("nome_responsavel_eng", pr.engenheiro, "ENCONTRADO", "carimbo da prancha");
  set("crea", pr.crea, "ENCONTRADO", "carimbo da prancha");
  set("quantasFrentes", uds.via ? 1 : null, "CALCULADO", "1 via no Uso do Solo");
  set("esquina", uds.via ? "NÃO" : null, "CALCULADO", "1 frente");

  // uso do solo
  set("usoDoSoloN", uds.numero, "ENCONTRADO", "Uso do Solo");
  set("unidadeTerritorialDoUsoDoSolo", uds.unidadeTerritorial, "ENCONTRADO", "Uso do Solo");
  set("usoDoSoloEParaAprovacao", uds.tipo ? (uds.tipo === "APROVAÇÃO DE PROJETO" ? "SIM" : "NÃO") : null, "CALCULADO", "Tipo de Uso do Solo");
  set("tipoDeVia1", uds.classificacaoVia, "ENCONTRADO", "Uso do Solo");
  set("anexouCertidaoDeCorredorViario", uds.via ? (uds.corredorViario ? "SIM" : "NÃO") : null, "CALCULADO", "campo Corredor Viário do UDS");
  set("atendeOPorteAdmitido", /sem limite/i.test(uds.areaMaxima ?? "") ? "SIM" : null, "CALCULADO", uds.areaMaxima ?? "");
  set("cnae", uds.cnaes?.length ? uds.cnaes.map((c: any) => c.codigo).join(" / ") : null, "ENCONTRADO", "Uso do Solo");

  // ART
  set("numeroDeArtProjeto", aProj.numero, "ENCONTRADO", "ART de projeto");
  set("numeroDeArtExecucao", aExec.numero, "ENCONTRADO", "ART de execução");
  set("numeroDeArtCaixa", aCx.numero, "ENCONTRADO",
      vig.art_caixa?.caixaDedicada ? "ART dedicada à caixa de recarga"
      : vig.art_caixa?.caixaRepetida ? `repetido da ${vig.art_caixa.caixaRepetida} — a caixa não tem ART própria`
      : "ART de caixa");
  set("anexouArtRrtProjeto", vig.art_projeto ? "SIM" : "NÃO", "CALCULADO", "catálogo");
  set("anexouArtRrtExecucao", vig.art_execucao ? "SIM" : "NÃO", "CALCULADO", "catálogo");
  set("anexouArtRrtCaixa", vig.art_caixa ? "SIM" : "NÃO", "CALCULADO", "catálogo");
  set("artDeProjetoAtendeAAcessibilidade", aProj.declaracaoAcessibilidade ? "SIM" : null, "ENCONTRADO", "declaração de acessibilidade na ART de projeto");
  set("aArtDeExecucaoAtendeA", aExec.declaracaoAcessibilidade ? "SIM" : null, "ENCONTRADO", "ART de execução");

  // dados do projeto
  set("areaTerreno", pr.areaTerreno != null ? fmt(pr.areaTerreno) : null, "ENCONTRADO", "carimbo da prancha");
  set("areaTotal", pr.areaTotalConstrucao != null ? fmt(pr.areaTotalConstrucao) : null, "ENCONTRADO", "carimbo da prancha");
  set("pav", pr.pavimentos, "ENCONTRADO", "carimbo da prancha");
  set("certidao", ct.matricula, "ENCONTRADO", "Certidão de Matrícula");

  // caixa de recarga — lido para CONFRONTAR, nunca para valer por si
  set("nDeCaixasDeCaptacao", pr.numeroCaixas, "ENCONTRADO", "carimbo da prancha");
  set("volumeDaCaixaDeRecarga", pr.volumeCaixa != null ? fmt(pr.volumeCaixa) : null, "ENCONTRADO",
      "carimbo da prancha (a conferir por cálculo)");

  /**
   * PRIMITIVOS — os fatos que produzem o veredito, criados no LIP em 27/07/2026.
   * O que a camada de texto entrega já entra preenchido; o que ela não alcança fica VAZIO de
   * propósito, para o analista digitar. Campo vazio é honesto; campo chutado contamina a
   * conferência que depende dele.
   */
  const qtd = (d: any, re: RegExp) => {
    const v = d.atividades?.find((x: Atividade) => re.test(x.unidade))?.quantidade;
    return v ?? null;
  };
  set("areaNaArtDeProjeto", qtd(aProj, /QUADRAD/i), "ENCONTRADO", "quadro de atividade técnica da ART de projeto");
  set("areaNaArtDeExecucao", qtd(aExec, /QUADRAD/i), "ENCONTRADO", "quadro de atividade técnica da ART de execução");
  set("volumeNaArtDeCaixa", qtd(aCx, /C[ÚU]BIC/i), "ENCONTRADO", "quadro de atividade técnica da ART de caixa");
  set("areaPermeavelProjetada", pr.permeavel != null ? fmt(pr.permeavel) : null, "ENCONTRADO",
      "cobertura vegetal permeável no carimbo");
  set("volumeExigidoDaCaixa", pr.iccapExigido != null ? fmt(pr.iccapExigido) : null, "ENCONTRADO",
      "ICCAP EXIGIDO no carimbo (IN 007/2024)");
  // área impermeabilizada: quando o carimbo traz o EXIGIDO, ela é dedutível do parâmetro do UDS
  if (pr.iccapExigido != null && uds.iccapDivisor) {
    set("areaImpermeabilizada", fmt(pr.iccapExigido * uds.iccapDivisor), "CALCULADO",
        `${fmt(pr.iccapExigido)} m³ × ${uds.iccapDivisor} m²/m³ (parâmetro do Uso do Solo)`);
  }
  // alertas do Uso do Solo: o que o próprio documento sinaliza e muda a análise
  {
    const alertas: string[] = [];
    if (uds.corredorViario) alertas.push(`corredor viário: ${uds.corredorViario}`);
    if (uds.embargo && /SIM/i.test(uds.embargo)) alertas.push("imóvel COM EMBARGO");
    if (uds.embarqueDesembarque && /SIM/i.test(uds.embarqueDesembarque)) alertas.push("exige embarque/desembarque");
    set("alertasDoUsoDoSolo", alertas.length ? alertas.join(" · ") : (uds.numero ? "nenhum alerta no documento" : null), "CALCULADO", "Uso do Solo");
  }

  // fração ideal
  if (/90,00m²/.test(uds.fracaoIdeal ?? "") && /ADENSAMENTO B[ÁA]SICO/i.test(uds.unidadeTerritorial ?? "")) {
    set("aabEApac190", "SIM", "CALCULADO", uds.fracaoIdeal);
  }

  // área permeável exigida — fórmula sobre o parâmetro do UDS
  if (pr.areaTerreno && uds.paisagisticoMin) {
    set("opcao1TotalExigidoAreaTerreno", fmt((pr.areaTerreno * uds.paisagisticoMin) / 100), "CALCULADO",
        `${fmt(pr.areaTerreno)} m² × ${uds.paisagisticoMin}%`);
    set("opcao2TotalExigidoAreaTerreno", fmt(pr.areaTerreno * 0.10), "CALCULADO", `${fmt(pr.areaTerreno)} m² × 10%`);
    set("opcao2TotalExigidoAreaTerreno2", fmt(pr.areaTerreno * 0.05), "CALCULADO", `${fmt(pr.areaTerreno)} m² × 5%`);
    set("opcao3TotalExigidoAreaTerreno", fmt(pr.areaTerreno * 0.25), "CALCULADO", `${fmt(pr.areaTerreno)} m² × 25%`);
  }

  set("tipoProcessoLip", "APROVAÇÃO DE PROJETO", "ENCONTRADO", "valor padrão do assunto");
  set("comercio", /comercial/i.test(rq.tipoUso ?? "") ? "SIM" : null, "ENCONTRADO", "Requerimento");
  set("atividadeEconomica", uds.cnaes?.length ? "SIM" : null, "CALCULADO", "CNAEs no Uso do Solo");

  /* ══════════════════════════════════════════════════════════════════════════════
   * GRUPO A — sem IA. Regra sobre dado já lido, ou resultado de conferência que já
   * rodou. Ver lib/lipMapa.ts para o inventário completo dos 136 campos.
   *
   * "NÃO APLICÁVEL" É RESPOSTA, NÃO OMISSÃO. Metade do LIP do slot 5 trata de uso
   * habitacional, de 2ª a 4ª via e de documentos que este processo não tem. Deixar
   * esses campos vazios obriga o analista a reconferir um por um para descobrir que
   * não havia nada a preencher. Fechá-los em NP com o motivo à vista é o que faz o
   * LIP virar retrato do processo em vez de formulário meio preenchido.
   * ══════════════════════════════════════════════════════════════════════════════ */

  // ── 2ª a 4ª via: só existem quando o imóvel tem mais de uma frente
  const umaVia = !!uds.via && !uds.via2;
  if (umaVia) {
    for (const n of [2, 3, 4]) {
      np(`via${n}`, "o Uso do Solo traz uma via só", `quantasFrentes = ${C.quantasFrentes?.valor ?? "1"}, lido do Uso do Solo`);
      np(`tipoDeVia${n}`, "o Uso do Solo traz uma via só", `quantasFrentes = ${C.quantasFrentes?.valor ?? "1"}, lido do Uso do Solo`);
      np(`larguraDaVia${n}`, "o Uso do Solo traz uma via só", `quantasFrentes = ${C.quantasFrentes?.valor ?? "1"}, lido do Uso do Solo`);
      np(`larguraDoPasseio${n}`, "o Uso do Solo traz uma via só", `quantasFrentes = ${C.quantasFrentes?.valor ?? "1"}, lido do Uso do Solo`);
    }
  }

  // ── tipo de uso: derivado do que o requerimento marca e do que o UDS lista
  const ehComercial = /comercial/i.test(rq.tipoUso ?? "") || (uds.cnaes?.length ?? 0) > 0;
  const ehHabitacional = /residencial|habitacional/i.test(rq.tipoUso ?? "");
  set("tipoUso", rq.tipoUso ? String(rq.tipoUso).toUpperCase() : null, "ENCONTRADO", "Requerimento");

  if (ehComercial && !ehHabitacional) {
    np("habSeriada", "uso comercial", "regra aplicada sobre dado já lido nesta leitura");
    np("habColetiva", "uso comercial", "regra aplicada sobre dado já lido nesta leitura");
    np("quitinete", "uso comercial", "regra aplicada sobre dado já lido nesta leitura");
    np("institucional", "uso comercial", "regra aplicada sobre dado já lido nesta leitura");
    np("atendeDecreto9451PUsoHab", "o Decreto 9.451 só alcança uso habitacional", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── térreo: não há acesso vertical nem tráfego de elevador para analisar
  const pav = num(pr.pavimentos);
  if (pav === 1) {
    np("trafegoElevadores", "edificação térrea", "regra aplicada sobre dado já lido nesta leitura");
    np("acessoVertical", "edificação térrea", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── documentos: presença no catálogo, ou alerta do próprio Uso do Solo
  if (vig.uso_solo) {
    np("docEmitidoPeloComandoDaAeronautica", "o Uso do Solo alerta quando é área aeroportuária, e não alertou", "regra aplicada sobre dado já lido nesta leitura");
    if (!uds.corredorViario) np("smmPCorredoresDoArtigo116", "sem corredor viário no Uso do Solo", "regra aplicada sobre dado já lido nesta leitura");
    // Art. 163 só alcança via expressa e acesso direto proibido
    if (uds.classificacaoVia && !/EXPRESSA|MARGINAL/i.test(uds.classificacaoVia)) {
      np("art163BaiaDeDesaceleracaoAa", `via ${uds.classificacaoVia.toLowerCase()}`, "regra aplicada sobre dado já lido nesta leitura");
    }
  }
  if (vig.projeto) {
    np("tDC", "nenhum documento de T.D.C. na pasta", "regra aplicada sobre dado já lido nesta leitura");
    np("demolicao", "nenhum documento de demolição na pasta", "regra aplicada sobre dado já lido nesta leitura");
    np("certidaoDeAcessib", "certidão de acessibilidade não regulamentada", "regra aplicada sobre dado já lido nesta leitura");
    np("dimensoesDoLoteConferemComRememb", "sem remembramento, remanejamento ou desmembramento na pasta", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── a ART de execução do CREA não traz declaração de acessibilidade
  if (vig.art_execucao && !aExec.declaracaoAcessibilidade) {
    np("aArtDeExecucaoAtendeA", "a ART de execução não traz declaração de acessibilidade", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── coordenadas: estão na ART, e o campo era digitado à mão
  set("coordenadas", aExec.coordenadas ?? aProj.coordenadas ?? aCx.coordenadas, "ENCONTRADO",
      "campo Coordenadas Geográficas da ART");

  /* ── endereço: comparar quadra e lote SEPARADAMENTE, e normalizados.
   *
   * Comparar a string inteira dá falso negativo garantido: o mesmo lote aparece como
   * "QUADRA 18 A LOTE 06" no carimbo, "Quadra A-18 Lote 06" no requerimento e "A18"/"06"
   * no Uso do Solo. Letra e número trocam de ordem, e há hífen, ponto e espaço no meio.
   * Normalizar cada parte e aceitar a inversão é o que faz a conferência dizer a verdade. */
  const chaveLocal = (x?: string | null) => {
    const t = norm(x ?? "").replace(/[^A-Z0-9]/g, "");
    const letras = t.replace(/[0-9]/g, "");
    const numeros = t.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""); // "06" e "6" são o mesmo lote
    return letras + numeros;
  };
  const achaApos = (texto: string | null | undefined, rotulo: RegExp) =>
    (norm(texto ?? "").match(rotulo) || [])[1] ?? null;

  if (uds.quadra && uds.lote && (pr.endereco || rq.enderecoImovel)) {
    const alvoQ = chaveLocal(uds.quadra), alvoL = chaveLocal(uds.lote);
    const fontes = [
      ["carimbo da prancha", pr.endereco],
      ["requerimento", rq.enderecoImovel],
    ] as [string, string | null][];

    const divergentes: string[] = [];
    let comparou = 0;
    for (const [nome, texto] of fontes) {
      if (!texto) continue;
      const q = achaApos(texto, /QUADRA\s*([A-Z0-9 -]{1,8}?)\s*LOTE/);
      // o lote é token compacto ("06", "12/15", "6A"); aceitar espaço aqui engolia o bairro
      // seguinte e transformava "Lote 06 Jardim Goiás" em lote "06 JARDI"
      const l = achaApos(texto, /LOTE\s*([0-9]{1,4}(?:\/[0-9]{1,4})?[A-Z]?)\b/);
      if (!q && !l) continue;
      comparou++;
      if ((q && chaveLocal(q) !== alvoQ) || (l && chaveLocal(l) !== alvoL)) {
        divergentes.push(`${nome}: quadra ${q?.trim() ?? "?"} lote ${l?.trim() ?? "?"}`);
      }
    }
    if (comparou) {
      set("oEnderecoEstaCorretoNoUso", divergentes.length ? "NÃO" : "SIM", "CALCULADO",
          divergentes.length
            ? `Uso do Solo diz quadra ${uds.quadra} lote ${uds.lote}; diverge em ${divergentes.join(" · ")}`
            : `quadra ${uds.quadra} e lote ${uds.lote} batem no carimbo e no requerimento`);
    }
  }

  /* ── conferências que já rodam e cujo veredito não chegava ao campo ─────────────
   * A aritmética destes três já é feita em `conferir()`. O campo do LIP ficava vazio
   * ao lado de uma conferência que dizia CONFERE — a informação existia e não era
   * gravada onde o analista olha. */
  const confere = (a: number | null, b: number | null) =>
    a == null || b == null ? null : Math.abs(a - b) <= TOL ? "SIM" : "NÃO";
  const qtdArt = (d: any, re: RegExp) =>
    num(d.atividades?.find((x: Atividade) => re.test(x.unidade))?.quantidade);

  set("aAreaNaArtDeProjeto", confere(qtdArt(aProj, /QUADRAD/i), pr.areaTotalConstrucao), "CALCULADO",
      "área da ART de projeto × área do carimbo");
  set("aAreaNaArtDeExecucao", confere(qtdArt(aExec, /QUADRAD/i), pr.areaTotalConstrucao), "CALCULADO",
      "área da ART de execução × área do carimbo");
  set("volumeConfereComOProjeto", confere(qtdArt(aCx, /C[ÚU]BIC/i), pr.volumeCaixa), "CALCULADO",
      "volume da ART de caixa × volume do carimbo");

  /* ══════════════════════════════════════════════════════════════════════════════
   * GRUPO B — cálculo novo sobre o que já se tem. Nada aqui vai à IA.
   * ══════════════════════════════════════════════════════════════════════════════ */

  // ── classificação de uso e porte
  set("habitacional", ehHabitacional ? "SIM" : ehComercial ? "NÃO" : null, "CALCULADO",
      "derivado do tipo de uso do requerimento e dos CNAEs do Uso do Solo");
  set("misto", ehHabitacional && ehComercial ? "SIM" : (ehComercial || ehHabitacional) ? "NÃO" : null, "CALCULADO", "há uso habitacional e econômico ao mesmo tempo?");
  if (uds.areaMaxima) {
    set("grandePorte", /sem limite/i.test(uds.areaMaxima) ? "NÃO" : null, "CALCULADO",
        `porte admitido no Uso do Solo: ${uds.areaMaxima}`);
  }

  // ── fração ideal: só se aplica por unidade territorial, e uma exclui as outras
  if (/ADENSAMENTO B[ÁA]SICO/i.test(uds.unidadeTerritorial ?? "")) {
    np("aosEApaIntegranteDaArau", "unidade territorial é AAB", "regra aplicada sobre dado já lido nesta leitura");
    np("chacarasVerificarNomeDoBairroNa", "unidade territorial é AAB, não chácara", "regra aplicada sobre dado já lido nesta leitura");
    np("chacarasVerificarNomeDoBairroNa2", "unidade territorial é AAB, não chácara", "regra aplicada sobre dado já lido nesta leitura");
    if (!/quitinete/i.test(rq.tipoUso ?? "")) np("quitineteEmAab130", "não há quitinete no projeto", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── vaga de ambulância: só para CNAE de atividade específica (saúde)
  if (uds.cnaes?.length) {
    const saude = uds.cnaes.some((c: any) => /^86|sa[úu]de|hospital|cl[íi]nic/i.test(c.codigo + " " + c.denominacao));
    if (!saude) np("vagaAmbulanciaPCnaeAtivEspec", "nenhum CNAE de atividade específica de saúde", "regra aplicada sobre dado já lido nesta leitura");
  }

  /* ── APROVEITAMENTO — fórmula pura sobre área e pavimentos.
   * O índice é área construída ÷ área do lote. "Até XXº pav." só difere do total
   * quando há pavimento acima do limite de altura; em edificação térrea os dois
   * coincidem, e dizer isso é mais honesto que repetir o número sem explicar. */
  if (pr.areaTotalConstrucao && pr.areaTerreno) {
    const ia = pr.areaTotalConstrucao / pr.areaTerreno;
    set("areaTotalMax75x", fmt(pr.areaTerreno * 7.5), "CALCULADO",
        `${fmt(pr.areaTerreno)} m² × 7,5 (máximo do coeficiente)`);
    set("indiceDeAproveitamentoDoProjetoTotal", fmt(ia), "CALCULADO",
        `${fmt(pr.areaTotalConstrucao)} ÷ ${fmt(pr.areaTerreno)}`);
    if (pav === 1) {
      set("areaAteXxPav", fmt(pr.areaTotalConstrucao), "CALCULADO",
          "edificação térrea: a área até o último pavimento é a área total");
      set("indiceDeAproveitamentoDoProjetoAte", fmt(ia), "CALCULADO",
          "edificação térrea: o índice até o último pavimento é o índice total");
      np("aproveitamentoExigidoAreaDeFruicao", "área de fruição só é exigida com aproveitamento acima do básico", "regra aplicada sobre dado já lido nesta leitura");
    }
  }

  return C;
}

// ──────────────────────── conferências ────────────────────────

function conferir(vig: Record<string, ItemCatalogo>): Conferencia[] {
  const uds = vig.uso_solo?.dados ?? {};
  const pr = vig.projeto?.dados ?? {};
  const rq = vig.requerimento?.dados ?? {};
  const aProj = vig.art_projeto?.dados ?? {};
  const aExec = vig.art_execucao?.dados ?? {};
  const aCx = vig.art_caixa?.dados ?? {};
  const out: Conferencia[] = [];

  const cmp = (nome: string, a: number | null, b: number | null, unidade = "m²", detalhe = "") => {
    if (a == null || b == null) {
      out.push({ nome, estado: "SEM DADO", detalhe: detalhe || `falta ${a == null ? "o primeiro" : "o segundo"} valor` });
      return;
    }
    const dif = Math.abs(a - b);
    out.push({
      nome,
      estado: dif <= TOL ? "CONFERE" : "NÃO CONFERE",
      detalhe: `${fmt(a)} ${unidade} × ${fmt(b)} ${unidade}${dif > TOL ? ` (diferença ${fmt(dif)})` : ""}${detalhe ? " — " + detalhe : ""}`,
    });
  };

  if (pr.permeavel != null && pr.naoPermeavel != null) {
    cmp("Soma da cobertura vegetal fecha o total declarado?", pr.permeavel + pr.naoPermeavel, pr.vegetalTotal,
        "m²", "somatório interno da prancha");
  }

  const q = (d: any, re: RegExp) => num(d.atividades?.find((x: Atividade) => re.test(x.unidade))?.quantidade);
  cmp("Área na ART de projeto confere com o projeto?", q(aProj, /QUADRAD/i), pr.areaTotalConstrucao);
  cmp("Área na ART de execução confere com o projeto?", q(aExec, /QUADRAD/i), pr.areaTotalConstrucao);
  cmp("Volume na ART de caixa confere com o projeto?", q(aCx, /C[ÚU]BIC/i), pr.volumeCaixa, "m³");
  cmp("Área no requerimento confere com o projeto?", rq.areaDeclarada, pr.areaTotalConstrucao);

  // mesmo dado em documentos diferentes, normalizado antes de comparar
  const iptus = ([["Uso do Solo", uds.iptu], ["prancha", pr.iptu], ["requerimento", rq.iptu]] as [string, string][])
    .filter(([, v]) => v).map(([k, v]) => [k, soDigitos(v)] as [string, string]);
  const distintos = new Set(iptus.map(([, v]) => v));
  out.push({
    nome: "IPTU é o mesmo nos três documentos?",
    estado: iptus.length < 2 ? "SEM DADO" : distintos.size === 1 ? "CONFERE" : "NÃO CONFERE",
    detalhe: iptus.map(([k, v]) => `${k}: ${v}`).join(" · ") + (distintos.size === 1 ? " (normalizados)" : ""),
  });

  out.push((() => {
    const a = soDigitos(uds.numero), b = soDigitos(pr.usoDoSoloN);
    const nome = "Prancha cita o Uso do Solo correto?";
    if (!a || !b) return { nome, estado: "SEM DADO" as const, detalhe: "número ausente" };
    return { nome, estado: (a === b ? "CONFERE" : "NÃO CONFERE") as Conferencia["estado"],
             detalhe: `UDS ${uds.numero} × carimbo ${pr.usoDoSoloN}` };
  })());

  // conformidade do carimbo com o modelo oficial (IN 007/2024, pg. 522 da Coletânea)
  out.push((() => {
    const nome = "O carimbo segue o modelo da IN 007/2024?";
    if (!vig.projeto) return { nome, estado: "SEM DADO" as const, detalhe: "prancha ausente" };
    const faltando: string[] = pr.carimboFaltando ?? [];
    const variantes: string[] = pr.carimboVariantes ?? [];
    if (!faltando.length && !variantes.length)
      return { nome, estado: "CONFERE" as const, detalhe: "todos os campos exigidos estão presentes, com os rótulos do modelo" };
    return {
      nome,
      estado: (faltando.length ? "NÃO CONFERE" : "CONFERE") as Conferencia["estado"],
      detalhe:
        (faltando.length ? `FALTAM no carimbo: ${faltando.join(" · ")}. ` : "") +
        (variantes.length ? `Rótulos fora do padrão (lidos assim mesmo): ${variantes.join(" · ")}.` : ""),
    };
  })());

  // ICCAP: refazer a conta, nunca copiar da tabela do projetista
  out.push((() => {
    const nome = "Volume da caixa de recarga confere com a área impermeabilizada?";
    if (!uds.iccapDivisor || pr.volumeCaixa == null)
      return { nome, estado: "SEM DADO" as const, detalhe: "falta parâmetro do UDS ou volume da prancha" };

    // caminho bom: o carimbo traz EXIGIDO e ATENDIDO, como manda a IN 007/2024
    if (pr.iccapExigido != null && pr.iccapAtendido != null) {
      const areaImperm = pr.iccapExigido * uds.iccapDivisor;
      return {
        nome,
        estado: (pr.iccapAtendido + TOL >= pr.iccapExigido ? "CONFERE" : "NÃO CONFERE") as Conferencia["estado"],
        detalhe: `exigido ${fmt(pr.iccapExigido)} m³ · atendido ${fmt(pr.iccapAtendido)} m³ ` +
                 `(a 1m³/${uds.iccapDivisor}m², o exigido corresponde a ${fmt(areaImperm)} m² impermeabilizados)`,
      };
    }

    // caminho da amostra: só o volume atendido, sem o exigido
    return {
      nome, estado: "SEM DADO" as const,
      detalhe: `o carimbo declara só o volume atendido (${fmt(pr.volumeCaixa)} m³) e omite o EXIGIDO, que a ` +
               `IN 007/2024 obriga. Esse volume implicaria ${fmt(pr.volumeCaixa * uds.iccapDivisor)} m² ` +
               `impermeabilizados a 1m³/${uds.iccapDivisor}m² — mas conferir o declarado contra ele mesmo é ` +
               `transcrição, não conferência.`,
      dependencia: "ICCAP EXIGIDO no carimbo, ou a área impermeabilizada do terreno",
    };
  })());

  out.push((() => {
    const nome = "Índice paisagístico atende o mínimo do Uso do Solo?";
    if (pr.vegetalTotal == null || !pr.areaTerreno || !uds.paisagisticoMin)
      return { nome, estado: "SEM DADO" as const, detalhe: "falta área vegetal, área do terreno ou parâmetro" };
    const pct = (pr.vegetalTotal / pr.areaTerreno) * 100;
    const exigido = (pr.areaTerreno * uds.paisagisticoMin) / 100;
    return {
      nome,
      estado: (pr.vegetalTotal + TOL >= exigido ? "CONFERE" : "NÃO CONFERE") as Conferencia["estado"],
      detalhe: `${fmt(pr.vegetalTotal)} m² = ${fmt(pct)}% do terreno; exigido ${uds.paisagisticoMin}% = ${fmt(exigido)} m²` +
               (pr.vegetalTotalPct != null && Math.abs(pct - pr.vegetalTotalPct) > 0.05
                 ? ` — a prancha declara ${fmt(pr.vegetalTotalPct)}%, recálculo dá ${fmt(pct)}%` : ""),
    };
  })());

  out.push((() => {
    const nome = "Índice de aproveitamento dentro do máximo?";
    if (!pr.areaTotalConstrucao || !pr.areaTerreno)
      return { nome, estado: "SEM DADO" as const, detalhe: "falta área" };
    const ia = pr.areaTotalConstrucao / pr.areaTerreno;
    return { nome, estado: (ia <= 7.5 ? "CONFERE" : "NÃO CONFERE") as Conferencia["estado"],
             detalhe: `${fmt(pr.areaTotalConstrucao)} ÷ ${fmt(pr.areaTerreno)} = ${fmt(ia)}× (máx. 7,5×)` };
  })());

  out.push({
    nome: "Vagas de estacionamento exigidas × atendidas",
    estado: "SEM DADO",
    detalhe: `o UDS exige "${uds.tabelaVagas ?? "?"}". A base do cálculo é a ÁREA OCUPADA PELA ATIVIDADE, que ` +
             `desconta circulação, manobra e estacionamento — e esses descontos estão nas tabelas coladas como ` +
             `imagem na prancha. Usar a área construída inteira é o erro clássico.`,
    dependencia: "área ocupada pela atividade (tabela em imagem)",
  });

  /**
   * Coerência de datas. É ALERTA, não veredito.
   *
   * A versão anterior afirmava "um projeto não pode ser anterior à ART que o acoberta" — categórico
   * demais. A prancha pode ter data de elaboração legitimamente anterior, a ART pode ser registrada
   * depois, pode haver revisão sem atualizar o carimbo, ou pode ser erro de ano. Quem decide o
   * efeito é a regra do slot e, em última instância, o analista.
   *
   * O sistema aponta o fato e a hipótese mais provável; não conclui irregularidade.
   */
  out.push((() => {
    const nome = "As datas dos documentos são coerentes entre si?";
    const dPr = paraDate(pr.dataElaboracao ?? pr.data);
    const dArt = paraDate(aProj.dataRegistro ?? aProj.dataElaboracao ?? aProj.dataCelebracao);
    if (!dPr || !dArt) return { nome, estado: "SEM DADO" as const, detalhe: "falta data da prancha ou da ART de projeto" };
    const dias = Math.round((+dArt - +dPr) / 86400000);
    if (dias <= 0) {
      return { nome, estado: "CONFERE" as const,
               detalhe: `prancha ${pr.dataElaboracao ?? pr.data} · ART de projeto ${aProj.dataRegistro ?? aProj.dataElaboracao}` };
    }
    const provavelAno = dias > 300 && dias < 400;
    return {
      nome, estado: "ALERTA" as const,
      detalhe: `a data declarada na prancha (${pr.dataElaboracao ?? pr.data}) é ${dias} dias anterior à da ` +
               `ART/RRT correspondente (${aProj.dataRegistro ?? aProj.dataElaboracao}). ` +
               (provavelAno
                 ? `A diferença é de aproximadamente um ano com o MESMO dia e mês — o mais provável é ano ` +
                   `errado digitado no carimbo. `
                 : "") +
               `Verificar possível erro no carimbo, registro posterior da ART ou irregularidade documental.`,
    };
  })());

  if (uds.dataEmissao && uds.validadeDias) {
    const venc = paraDate(uds.dataEmissao);
    venc?.setDate(venc.getDate() + uds.validadeDias);
    out.push({
      nome: "Validade do Uso do Solo (fora do escopo do analista)",
      estado: "INFORMATIVO",
      detalhe: `emitido ${uds.dataEmissao}, validade ${uds.validadeDias} dias → vence ` +
               `${venc?.toLocaleDateString("pt-BR")}. Escopo da CHEADV.`,
    });
  }

  return out;
}

// ───────────────────────────── entrada ─────────────────────────────

/** Lê a pasta inteira e devolve catálogo, campos do LIP e conferências. Zero chamadas de IA. */
export async function lerPastaSlot5(
  arquivos: ArquivoEntrada[],
  conhecidos?: Map<string, Conhecido>,
): Promise<ResultadoLeitura> {
  const { catalogo, extratos } = await catalogar(arquivos, conhecidos);
  const vig = vigentes(catalogo);
  const campos = preencherLip(vig);
  const conferencias = conferir(vig);

  const presentes = new Set(catalogo.flatMap((it) => it.papeis));
  const obrigatorios = OBRIGATORIOS.map(([papel, nome]) => ({ papel, nome, presente: presentes.has(papel) }));

  const porHash: Record<string, ItemCatalogo[]> = {};
  for (const it of catalogo) (porHash[it.hash] ||= []).push(it);
  const grupos = Object.values(porHash).filter((v) => v.length > 1);
  const duplicidades = {
    mesmaRodada: grupos.filter((v) => new Set(v.map((i) => i.rodada)).size === 1).map((v) => v.map((i) => i.nome)),
    entreRodadas: grupos.filter((v) => new Set(v.map((i) => i.rodada)).size > 1)
      .map((v) => v.sort((a, b) => a.rodada - b.rodada).map((i) => `r${i.rodada}: ${i.nome}`)),
  };

  const paginasNaPasta = catalogo.reduce((s, it) => s + it.paginas, 0);
  const paginasIgnoradas = catalogo.filter((it) => it.soPresenca).reduce((s, it) => s + it.paginas, 0);
  // só conta como reaproveitada a página que teria sido processada: as ignoradas por escopo
  // (documentos pessoais, declaração, DWG) nunca entram na conta, senão o saldo fica negativo
  const paginasReaproveitadas = catalogo
    .filter((it) => it.daMemoria && !it.soPresenca)
    .reduce((s, it) => s + it.paginas, 0);

  return {
    catalogo, campos, conferencias, obrigatorios, duplicidades,
    custo: {
      paginasNaPasta,
      paginasIgnoradas,
      arquivosDistintos: new Set(catalogo.filter((it) => !it.soPresenca).map((it) => it.hash)).size,
      chamadasIA: 0,
      paginasReaproveitadas,
      paginasProcessadas: paginasNaPasta - paginasIgnoradas - paginasReaproveitadas,
    },
    extratos,
    vigentesPorPapel: Object.fromEntries(Object.entries(vig).map(([papel, it]) => [papel, it.hash])),
  };
}
