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
import crypto from "node:crypto";
import { ehCompactado, abrirCompactado } from "./descompactar";

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
  /** veio de dentro de um .rar/.zip — guarda o nome do compactado, para o catálogo dizer de onde saiu */
  origemCompactado?: string;
};

/**
 * Andamento da leitura, para a barra de progresso ser HONESTA.
 *
 * A leitura da pasta é uma requisição só e demora dezenas de segundos. Sem isto a tela só podia
 * fingir progresso — encher sozinha por tempo e travar num número qualquer até a resposta chegar.
 * Com o retorno de quantos arquivos já foram, a porcentagem passa a significar trabalho feito,
 * como já é no LER PROCESSO.
 */
export type Andamento = {
  fase: "abrindo" | "lendo" | "conferindo";
  atual: number;
  total: number;
  documento?: string;
};
export type AoAndar = (a: Andamento) => void;

/**
 * VERSÃO DOS EXTRATORES — subir SEMPRE que a leitura passar a extrair algo diferente.
 *
 * O MHD não reprocessa documento de hash conhecido: reconstrói o catálogo a partir do `dados` que
 * ficou guardado. Isso é ótimo para custo, e foi uma armadilha real — as correções de quadra,
 * lote, nº do Uso do Solo, matrícula e tabela de vias não apareceram no processo 50724, porque
 * todos os documentos já estavam na memória e voltaram com o `dados` da versão ANTIGA. O analista
 * via campo vazio e não tinha como saber que a correção existia.
 *
 * A versão viaja dentro do próprio `dados` (é JSON), então não precisa de migração: memória
 * gravada por versão diferente é ignorada, o documento é relido e volta a valer.
 *
 * v2 — 17/08/2026: quadra/lote sem "Possui Embargo", nº do UDS pela coluna Processo, matrícula
 *      com "n." e a tabela de vias inteira.
 */
/* 3 — 26/08/2026. Subir este número INVALIDA todo `dados` guardado no MHD e força reextração.
 * Obrigatório sempre que um leitor muda: a rota só reusa a memória quando `_v` bate
 * (`app/api/lip/ler-pasta/route.ts`), então mexer no parser sem subir a versão faz a leitura
 * devolver o que o extrator ANTIGO tinha entendido — a correção existe no código e não aparece.
 * 3 acompanhou: unidade `m2` sem expoente, leitor do ATENDIMENTO, profissional e contratante na
 * ART, nome do interessado por CPF/CNPJ e a cascata de fontes.
 * 4 acompanha: ART de "EXECUCAO E PROJETO" valendo para os dois papéis e as duas grafias novas
 * do ICCAP — as duas vivem dentro de `dados`, que é justamente o que fica guardado. */
export const VERSAO_EXTRATOR = 4;

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
  | "DOCUMENTO_AUSENTE" | "AGUARDANDO_FATO" | "MANUAL" | "BLOQUEADO" | "NAO_IMPLEMENTADO"
  | "INFERIDO";

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
  obrigatorios: { papel: string; nome: string; presente: boolean; dispensavel: boolean }[];
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

/** Vocabulário fechado da hierarquia viária de Goiânia — é o que fecha a linha de uma via. */
const P_CLASSE_VIA = /\b(ARTERIAL|COLETORA|LOCAL|EXPRESSA|MARGINAL|VICINAL|RODOVI|CICLOVI|PEDESTRE)/i;
/** Um nome de via começa pelo tipo de logradouro. Serve para NÃO confundir nota com nome. */
const P_NOME_VIA = /^(AVENIDA|AV\b|RUA|R\b|ALAMEDA|AL\b|PRA[ÇC]A|TRAVESSA|RODOVIA|ANEL|VIA)\b/i;

/**
 * Todas as vias da tabela "Nome da Via / Classificação da Via" do Uso do Solo.
 *
 * A célula do nome QUEBRA em mais de uma linha quando traz nota ("Esta na influencia da via
 * expressa: GO010"), e a classificação aparece na linha onde a quebra termina. Por isso quem fecha
 * a via é a linha da CLASSIFICAÇÃO, e o nome é o último candidato válido visto — a nota nunca vira
 * nome, porque não começa por tipo de logradouro.
 */
function lerTabelaDeVias(doc: DocTexto): { nome: string; classificacao: string | null }[] {
  const i = doc.linhas.findIndex((l) => /Nome da Via\s+Classifica[çc][ãa]o da Via/i.test(l.texto));
  if (i < 0) return [];

  const vias: { nome: string; classificacao: string | null }[] = [];
  let nomePendente: string | null = null;

  for (const linha of doc.linhas.slice(i + 1)) {
    // a tabela acaba quando começa a próxima seção do documento
    if (/Unidades Territoriais|Corredor\(es\)|FRA[ÇC][ÃA]O IDEAL|[ÍI]NDICE DE OCUPA|Processo\s+Tipo/i.test(linha.texto)) break;

    const cols = linha.itens.map((it) => it.t.trim()).filter(Boolean);
    if (!cols.length) continue;

    const ultima = cols[cols.length - 1];
    if (P_CLASSE_VIA.test(ultima) && cols.length > 1) {
      const candidato = cols[0];
      const nome = P_NOME_VIA.test(candidato) ? candidato : nomePendente;
      if (nome) vias.push({ nome, classificacao: ultima });
      nomePendente = null;
    } else if (P_NOME_VIA.test(cols[0])) {
      // nome sem classificação na mesma linha: guarda e espera a linha que fecha
      if (nomePendente) vias.push({ nome: nomePendente, classificacao: null });
      nomePendente = cols[0];
    }
  }
  if (nomePendente) vias.push({ nome: nomePendente, classificacao: null });
  return vias;
}

/* Sem o lookbehind e a alternativa "\d+" puro, "3572,10" (sem ponto de milhar) casava a partir
 * do 2º dígito e virava 572,10 — a regex não é ancorada, então o motor achava a MENOR
 * terminação válida em vez da maior. Achado real: carimbo do processo 50724 escreve
 * "ÁREA TOTAL DA CONSTRUÇÃO: 3572,10m²" sem ponto, e a conferência com a ART (3.572,10, essa
 * com ponto) dava NÃO por causa do dígito perdido, não por divergência de verdade. */
/* "m2" com o DÍGITO dois, não o expoente — 26/08/2026.
 *
 * O CAD nem sempre exporta "m²": a prancha do processo 48535 escreve "524,70m2", e a do 48533
 * igual. Exigindo o caractere "²" o carimbo inteiro deixava de ser lido — área do terreno, área
 * construída e as três de cobertura vegetal voltavam NAO_ENCONTRADO — e a ficha chegava vazia
 * justamente nos campos que o analista olha primeiro, sem nenhum aviso. O mesmo vale para "m3".
 *
 * `2\b` (e `3\b`) exige fronteira: casa "524,70m2" e não engole o "2" de "12,00m20" nem de uma
 * medida seguida de outro número. */
const U_AREA = "m\\s*(?:\u00b2|2\\b)";
const U_VOLUME = "m\\s*(?:\u00b3|3\\b)";
const P_AREA = new RegExp(`(?<!\\d)(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}\\s*(?:${U_AREA})?`, "i");
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
  /* ATENDIMENTO vem ANTES da matrícula de propósito — 26/08/2026.
   *
   * O print do Alvará Mais Fácil traz a lista de "Documentos Obrigatórios", e nela está escrito
   * "Certidão de Matrícula (proprietário)". A assinatura da matrícula casava nesse ÍNDICE e o
   * ATENDIMENTO era catalogado como certidão — perdendo o documento mais rico da pasta (é ele que
   * traz proprietário, endereço, área do terreno, área a construir, responsável técnico e CAU,
   * todos em campo separado). Achado no 48535. */
  /* Só frases que existem NA TELA do sistema. A primeira versão desta assinatura aceitava
   * "DADOS DO IMOVEL ... RESPONSAVEL TECNICO" e capturou o REQUERIMENTO do DOM, que tem as mesmas
   * duas seções: o requerimento virava "atendimento", vencia por rodada mais alta e o print de
   * verdade era descartado como versão superada — perdendo as DUAS fontes de proprietário de uma
   * vez. Regressão vista em produção no 48533, 26/08/2026 00:07. */
  { papel: "atendimento", re: /CONSULTA ALVAR[ÁA]|APROVACAO SIMPLIFICADA|ANEXE OS ARQUIVOS OBRIGATORIOS|SEM ANEXO PARA MOSTRAR/ },
  { papel: "certidao_matricula", re: /CERTIDAO DE MATRICULA|REGISTRO DE IMOVEIS DA/ },
  { papel: "art", re: /ART OBRA OU SERVICO|DETALHES DO RRT|N[ºO°]? DO RRT|ANOTACAO DE RESPONSABILIDADE TECNICA PARA/ },
  { papel: "requerimento", re: /REQUERIMENTO|REQUEIRO/ },
  { papel: "declaracao", re: /DECLARACAO DE RESPONSABILIDADE|DECLARO/ },
  /* Print da tela "Analisar projeto" do sistema Atendimento da Prefeitura (Alvará Mais Fácil) —
   * pedido do Fábio 2026-08-18 pra alimentar o item 1 do MAC ("Conferir os dados... no Sistema
   * Alvará Fácil"). Não é papel do SEI, entra só quando o analista anexa o print na pasta. */
  { papel: "atendimento", re: /ANALISAR PROJETO.*LICENCA|SISTEMA ALVARA MAIS FACIL.*ANALISAR PROJETO/ },
];

/** Nome do arquivo → papel esperado. Vale SÓ na rodada 1 (slots fixos do SEI). */
const SLOTS_SEI: { re: RegExp; papel: string }[] = [
  { re: /ART.*CAIXA/i, papel: "art_caixa" },
  { re: /ART.*EXECU/i, papel: "art_execucao" },
  { re: /ART.*PROJETO/i, papel: "art_projeto" },
  /* "CERTIDAO DE CORREDOR" é certidão de corredor viário, não de matrícula — documento diferente,
   * de outro órgão. Sem a exclusão ela assumia o papel da matrícula pela pista do nome. */
  { re: /CERTID[ÃA]?[AO](?!.*CORREDOR)/i, papel: "certidao_matricula" },
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

/**
 * REGRA MASTER DO FÁBIO (17/08/2026): Requerimento, Declaração de Responsabilidade, Documentos
 * pessoais do interessado e o Projeto em DWG/DXF são **totalmente irrelevantes para qualquer
 * análise de Aprovação de Projeto**. Foram peça da análise documental da CHEADV, não da técnica.
 *
 * Consequência: nunca são lidos (`SO_PRESENCA`) e nunca são cobrados (`DISPENSAVEIS`). Continuam
 * catalogados e a ausência continua registrada — o analista vê o que veio e o que não veio; o que
 * some é a exigência e o gasto de leitura.
 */
export const SO_PRESENCA = new Set(["documentos_pessoais", "declaracao", "projeto_cad", "requerimento"]);

/** Ausência REGISTRADA, mas não exigida. Mesma regra master: some a cobrança, não o registro. */
export const DISPENSAVEIS = new Set(["documentos_pessoais", "declaracao", "projeto_cad", "requerimento"]);

// ───────────────────────────── extratores ─────────────────────────────

function lerUsoDoSolo(doc: DocTexto) {
  const t = doc.texto;
  const d: any = {};
  /* Duas grafias do número do Uso do Solo. A antiga imprime "UDS0000000000"; a do 50724 traz só a
   * coluna "Processo" ("Processo | Tipo de Uso Do Solo" → "92202842 | APROVAÇÃO DE PROJETO"), e
   * sem este segundo caminho o campo ficava vazio e a conferência da prancha morria em SEM DADO. */
  d.numero = (t.match(/UDS\d{10,}/) || [])[0]
    || colunas(proxLinha(doc, /^\s*Processo\s+Tipo de Uso Do Solo\s*$/i))[0]?.match(/^\d{6,}$/)?.[0]
    || null;
  d.iptu = (t.match(/\b\d{14}\b/) || [])[0] || null;
  d.tipo = /APROVA[ÇC][ÃA]O DE PROJETO/i.test(t) ? "APROVAÇÃO DE PROJETO" : null;

  /* O cabeçalho "Quadra Lote" nem sempre traz "Possui Embargo" na mesma linha — no 50724 o embargo
   * está lá em cima, junto da Inscrição IPTU, e a exigência das três colunas fazia a linha não
   * casar: quadra e lote saíam vazios, e com eles as dimensões do lote. Casa com as duas grafias. */
  const [q, l, emb] = colunas(proxLinha(doc, /^\s*Quadra\s+Lote(\s+Possui Embargo)?\s*$/i));
  d.quadra = q ?? null;
  d.lote = l ?? null;
  d.embargo = emb ?? colunas(proxLinha(doc, /Inscri[çc][ãa]o IPTU\s+Possui Embargo/i))[1] ?? null;

  d.bairro = colunas(proxLinha(doc, /^\s*Bairro\s*$/i))[0] ?? null;

  /* A tabela "Nome da Via / Classificação da Via" tem UMA LINHA POR VIA, e o lote de esquina tem
   * mais de uma. Ler só a primeira linha depois do cabeçalho custava caro: no 50724 o UDS traz
   * AVENIDA ANAPOLIS (Arterial de 1ª Categoria) e RUA RSL12 (Coletora), e o LIP registrava uma via
   * sem classificação, com via2/3/4 marcadas "não se aplica" e esquina = NÃO. Frente, recuo, porte
   * e vagas saem todos daí.
   *
   * A célula do nome pode QUEBRAR em duas linhas ("AVENIDA ANAPOLIS" + a nota de via expressa), e
   * a classificação vem na linha onde a quebra termina. Por isso a linha da CLASSIFICAÇÃO é que
   * fecha a via, e o nome é o último candidato visto — nunca a nota. */
  d.vias = lerTabelaDeVias(doc);
  d.via = d.vias[0]?.nome ?? null;
  d.classificacaoVia = d.vias[0]?.classificacao ?? null;
  d.via2 = d.vias[1]?.nome ?? null;
  d.classificacaoVia2 = d.vias[1]?.classificacao ?? null;
  d.via3 = d.vias[2]?.nome ?? null;
  d.classificacaoVia3 = d.vias[2]?.classificacao ?? null;
  d.via4 = d.vias[3]?.nome ?? null;
  d.classificacaoVia4 = d.vias[3]?.classificacao ?? null;

  d.unidadeTerritorial = colunas(proxLinha(doc, /Unidades Territoriais/i))[0] ?? null;

  const corr = colunas(proxLinha(doc, /Corredor\(es\) Vi[áa]rio\(s\)/i))[0];
  d.corredorViario = corr && corr !== "-" ? corr : null;

  d.fracaoIdeal = (t.match(/FRA[ÇC][ÃA]O IDEAL:\s*([^\n]+)/i) || [])[1]?.trim() || null;
  d.iccap = (t.match(new RegExp(`(1\\s*${U_VOLUME} para cada \\d+\\s*${U_AREA} de [^\\n]+)`, "i")) || [])[1]?.trim() || null;
  d.iccapDivisor = num((t.match(new RegExp(`1\\s*${U_VOLUME} para cada (\\d+)\\s*${U_AREA}`, "i")) || [])[1]);
  d.paisagisticoMin = num((t.match(/m[íi]nimo de (\d+)%/i) || [])[1]);
  d.indiceOcupacao = (t.match(/[ÍI]NDICE DE OCUPA[ÇC][ÃA]O:\s*([^\n]+)/i) || [])[1]?.trim() || null;
  d.embarqueDesembarque = (t.match(/Embarque Desembarque[\s\S]{0,200}?\b(SIM|N[ÃA]O)\b/i) || [])[1] || null;

  // "Para o(s) grau(s) GI-1 a área máxima será sem limite de área" — a coluna de embarque fica
  // na MESMA linha, então se pega a célula, não o resto da linha
  const linhaPorte = doc.linhas.find((l) => /[áa]rea m[áa]xima ser[áa]/i.test(l.texto));
  d.areaMaxima =
    linhaPorte?.itens.map((i) => i.t).find((c) => /[áa]rea m[áa]xima ser[áa]/i.test(c))
      ?.replace(/^.*?[áa]rea m[áa]xima ser[áa]\s*/i, "").trim() || null;
  /* Achado real (processo 50724): esse Uso do Solo não usa a frase acima — escreve "ADMITE
   * GI-1, GI-2, GI-3, GI-4 e GI-5 SEM LIMITE DE ÁREA" na linha da tabela de CNAEs (a coluna de
   * embarque também fica na mesma linha). Sem esse fallback, `atendeOPorteAdmitido` ficava sem
   * dado mesmo o documento dizendo claramente que não há limite. */
  if (!d.areaMaxima) {
    const linhaAdmite = doc.linhas.find((l) => /ADMITE[\s\S]*SEM LIMITE DE [ÁA]REA/i.test(l.texto));
    if (linhaAdmite) d.areaMaxima = "SEM LIMITE DE ÁREA";
  }

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
  // "I. P. Grama"/"I. P. Cob. veg. não permeável"/"I. P. Total" achado real no processo 50724 —
  // "I.P." = Índice Paisagístico, terceira grafia diferente pro mesmo trio de campos
  { chave: "permeavel", oficial: "FORRAÇÃO VEGETAL PERMEÁVEL", variantes: ["Área de cobertura vegetal permeável", "I. P. Grama"], exigidoPelaIN: true },
  { chave: "naoPermeavel", oficial: "FORRAÇÃO VEGETAL NÃO PERMEÁVEL", variantes: ["Área de cobertura vegetal não permeável", "I. P. Cob. veg. nao permeavel", "I. P. Cob. veg. não permeável"], exigidoPelaIN: true },
  { chave: "vegetalTotal", oficial: "ÍNDICE TOTAL", variantes: ["Área de cobertura vegetal TOTAL", "I. P. Total"], exigidoPelaIN: true },
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
        area: num(v.match(new RegExp(`(?<!\\d)((?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2})\\s*${U_AREA}`, "i"))?.[1]),
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
  /**
   * REGRA MESTRA — elevador em imóvel comercial (Fábio, 2026-08-18).
   *
   * "Previsão"/"projeção" de espaço pro elevador NÃO conta como ter elevador — é tratado
   * EXATAMENTE como não ter. Em imóvel comercial só existe "ou tem ou não tem", sem meio-termo.
   * Um poço reservado pra instalação futura não gera tráfego de passageiros hoje.
   *
   * Achado real (processo 50724): a palavra "ELEVADOR" aparece na prancha, mas só em
   * "PROJEÇÃO ESPAÇO ELEVADOR" (poço reservado, nunca instalado) e numa especificação de
   * esquadria ("JA03 Elevador Vasca..." — é tipo de janela, não elevador de prédio). Procurar
   * só a palavra "ELEVADOR" dá falso positivo; o sinal certo é a frase de previsão/projeção.
   */
  d.previsaoElevadorSemInstalar = /PROJE[ÇC][ÃA]O\s+ESPA[ÇC]O\s+ELEVADOR|PREVIS[ÃA]O[\s\S]{0,20}ELEVADOR/i.test(t);

  const iccap = valorPerto(doc, "ICCAP", /EXIGIDO|ATENDIDO|\d+,\d+/i, 60)
             || valorPerto(doc, "ÍNDICE DE CONTROLE E CAPTAÇÃO", /V\s*=|\d+,\d+/i, 60);
  d.iccapExigido = num(t.match(/EXIGIDO:?\s*=?\s*([\d.]+,?\d*)\s*[Mm]/i)?.[1]);
  d.iccapAtendido = num(t.match(/ATENDIDO:?\s*=?\s*([\d.]+,?\d*)\s*[Mm]/i)?.[1]);
  /* Achado real (processo 50724): o carimbo não traz "EXIGIDO"/"ATENDIDO" nem "V = X,XXm³" —
   * só "10Cxs. 22,60m³" direto, junto do rótulo I.C.C.A.P. Sem esse terceiro padrão, tanto o
   * número de caixas quanto o volume adotado ficavam vazios. */
  /* Terceira e quarta grafias do ICCAP, achadas no 48533: "EXIGIDO: 1,35 m³ / ATENDIDO: 2,26 m³
   * - 01 CAIXA" e "I.C.C.A.P. 01 CAIXA 2,26 m³". Sem elas o volume e o número de caixas ficavam
   * vazios com a informação escrita na prancha. */
  const cxs = t.match(new RegExp(`(\\d+)\\s*Cxs\\.?\\s*(\\d+,\\d+)\\s*${U_VOLUME}`, "i"))
    || t.match(new RegExp(`(\\d+)\\s*CAIXAS?\\s+(\\d+,\\d+)\\s*${U_VOLUME}`, "i"));
  d.volumeCaixa = d.iccapAtendido
    ?? num((t.match(new RegExp(`V\\s*=\\s*(\\d+,\\d+)\\s*${U_VOLUME}`, "i")) || [])[1])
    ?? num(cxs?.[2]);
  if (d.iccapExigido == null) d.carimboFaltando.push("ICCAP — EXIGIDO (o modelo pede EXIGIDO e ATENDIDO)");
  d.iccapBruto = iccap;

  d.numeroCaixas = (t.match(/N[úu]mero de caixas:\s*(\d+)/i) || [])[1]
    || cxs?.[1]
    || (t.match(/\b(\d{1,2})\s*CAIXAS?\b/i) || [])[1]
    || null;
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

  /* AUTOR DO PROJETO. O padrão antigo exigia "ARQ. NOME CAU: xxx". As pranchas de 26/08 escrevem
   * "Arquiteta e Urbanista - MARCILENE SALES DIAS AMORIM - CAU-GO A118288-9" — outro formato,
   * outro separador, e "CAU-GO" em vez de "CAU:". Os dois passam a valer. */
  const arq = t.match(/ARQ\.\s*([A-ZÀ-Ú\s]+?)\s*CAU:\s*(\S+)/i)
    || t.match(/ARQUITET[OA](?:\s+E\s+URBANISTA)?\s*[-–—:]\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.]+?)\s*[-–—]\s*CAU[-\s:]*[A-Z]{0,2}\s*(\S+)/i);
  d.arquiteto = arq?.[1]?.trim() || null;
  d.cau = arq?.[2] || null;
  const eng = t.match(/ENG\.?\s*CIVIL\s*([A-ZÀ-Ú\s]+?)\s*CREA:\s*(\S+)/i);
  d.engenheiro = eng?.[1]?.trim() || null;
  d.crea = eng?.[2] || null;

  /* Nº DE UNIDADES — o carimbo da IN 007/2024 exige, e o desta amostra não traz.
   * Procura-se do mesmo jeito que os demais rótulos do carimbo: se o projetista escreveu, lê; se
   * omitiu, o campo fecha em NAO_ENCONTRADO e a pendência aparece como descumprimento da norma.
   * Não é conteúdo rasterizado — verificado na camada de texto em 29/07/2026. */
  const unidades = valorPerto(doc, "Nº DE UNIDADES", /^\d{1,4}$/)
    ?? ((t.match(/N[ºO°.]?\s*DE\s*UNIDADES[^\d]{0,20}(\d{1,4})/i) || [])[1] || null);
  d.unidComerciais = /COMERCIAL|ESCRIT[ÓO]RIO|LOJA/i.test(t) ? unidades : null;
  d.unidHabitacionais = /HABITACIONAL|RESIDENCIAL|APARTAMENTO/i.test(t) ? unidades : null;
  if (!unidades) d.carimboFaltando.push("Nº DE UNIDADES (a IN 007/2024 exige no carimbo)");
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

  /* A ART é a fonte mais confiável de QUEM assina e PARA QUEM — é documento de conselho, com o
   * nome do profissional e do contratante em campo próprio. Passa a ser lida porque a prancha nem
   * sempre traz (no 48533 o responsável é engenheiro, com CREA, e o carimbo não escreve "CAU"). */
  d.profissional =
    (t.match(/\b([A-ZÀ-Ú][A-ZÀ-Ú\s.]{6,60}?)\s*RNP:/i) || [])[1]?.trim()
    || (t.match(/Profissional:\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s.]{6,60}?)\s*(?:CPF|T[íi]tulo|Registro|N[ºo°])/i) || [])[1]?.trim()
    || null;
  d.tituloProfissional = (t.match(/T[íi]tulo profissional:\s*([^,\n]{3,50})/i) || [])[1]?.trim() || null;
  d.contratante = (t.match(/Contratante:\s*(.{3,70}?)\s*CPF\/CNPJ:/i) || [])[1]?.trim() || null;
  d.proprietario = (t.match(/Propriet[áa]ri[oa]\(?a?\)?:\s*(.{3,70}?)\s*CPF\/CNPJ:/i) || [])[1]?.trim() || null;
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

/* NOME DO INTERESSADO — 26/08/2026.
 *
 * A versão anterior exigia nome e CPF na MESMA linha e em Caixa Alta e baixa
 * ("Fulano de Tal 123.456.789-00"). Na prática nenhum dos dois requerimentos reais de 26/08 batia:
 *   · 48535 — o interessado é PESSOA JURÍDICA ("OMEGA PARTICIPAÇÕES E INVESTIMENTO LTDA"), com
 *     CNPJ, e o número vem na LINHA DE BAIXO do nome;
 *   · 48533 — o nome está em CAIXA ALTA, que o padrão anterior não aceitava.
 * Resultado: o campo mais visível da ficha voltava vazio nos dois.
 *
 * Regra nova: acha o primeiro CPF **ou** CNPJ e pega o nome que estiver junto dele — na mesma
 * linha, antes do número, ou na linha imediatamente acima. */
const RE_CPF_CNPJ = /(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/;

/** Parece nome de pessoa ou razão social? Duas palavras ou mais, só letras (aceita CAIXA ALTA,
 * "&", "." e "-"), e nada que seja rótulo de formulário. */
function pareceNome(bruto: string): boolean {
  const t = String(bruto ?? "").trim();
  if (t.length < 5 || t.length > 90) return false;
  if (/\d/.test(t)) return false;
  if (/@|www\.|http/i.test(t)) return false;
  if (/^(nome|interessado|propriet|requerente|endere|raz[ãa]o|cpf|cnpj|e-?mail|telefone)/i.test(t)) return false;
  const palavras = t.split(/\s+/).filter((x) => /[A-Za-zÀ-Úà-ú]/.test(x));
  return palavras.length >= 2;
}

/** Nome que acompanha o primeiro CPF/CNPJ do documento — na mesma linha ou na de cima. */
function nomeJuntoDoDocumento(doc: DocTexto): string | null {
  /* Ordem VISUAL. `extrairPdf` já converte o y para top-down (origem no alto) e monta as linhas
   * ordenadas por página e y crescente — ou seja, `doc.linhas` JÁ está de cima para baixo.
   * Reordenar por y decrescente inverte a página e faz "a linha acima" virar a de baixo: foi o
   * que fez o proprietário sair como "SECRETARIA MUNICIPAL DE EFICIÊNCIA-SEFIC" num teste. */
  const linhas = [...doc.linhas]
    .sort((a, b) => (a.pagina - b.pagina) || (a.y - b.y))
    .map((l) => l.texto.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(RE_CPF_CNPJ);
    if (!m) continue;
    const antesNaLinha = linhas[i].slice(0, linhas[i].indexOf(m[1]))
      .replace(/(CNPJ|CPF)[\/A-Z]*\s*:?\s*$/i, "").trim();
    if (pareceNome(antesNaLinha)) return antesNaLinha;
    const acima = (linhas[i - 1] ?? "").replace(/(CNPJ|CPF)[\/A-Z]*\s*:?\s*$/i, "").trim();
    if (pareceNome(acima)) return acima;
  }
  return null;
}

/**
 * Print da tela do Alvará Mais Fácil. É o documento mais estruturado da pasta: cada dado vem em
 * campo próprio, sem depender do carimbo do CAD. Vale como FONTE DE ÚLTIMO RECURSO para os campos
 * que o projeto não entregou — pedido do Fábio na noite de 26/08: "o endereço, proprietário e
 * profissional tem em tudo... PRINCIPALMENTE na vistoria. Tem que ler tudo".
 *
 * A ordem do texto acompanha o desenho da tela, não a leitura: o VALOR costuma vir ANTES do
 * rótulo ("OMEGA PARTICIPACOES E INVESTIMENTOS LTDA ... Proprietário *"). Por isso a busca é por
 * proximidade posicional (`valorPerto`), não por regex de "rótulo seguido de valor".
 */
function lerAtendimento(doc: DocTexto) {
  const t = doc.texto;
  const d: any = {};

  d.numeroAlvara = (t.match(/Consulta\s+Alvar[áa]\s+(\d{3,})/i) || [])[1]
    || (t.match(/Alvar[áa]\s+(\d{4,})\s+\d+\s+Aprova/i) || [])[1] || null;
  d.iptu = (t.match(/\b(\d{14})\b/) || [])[1] || null;
  d.cpfCnpj = (t.match(/\b(\d{14}|\d{11})\b(?=[^\d]*(?:SOCIETARIO|@|Dados|Tipo Pessoa))/i) || [])[1] || null;

  /* Proprietário e responsável técnico: o nome em CAIXA ALTA que aparece junto do rótulo. Como o
   * valor pode estar antes ou depois, procura-se nos dois sentidos e fica o mais próximo. */
  const nomeMaiusculo = /\b([A-ZÀ-Ú][A-ZÀ-Ú&.\s]{8,60}?)(?=\s{2,}|\s+[a-z(]|$)/;
  d.proprietario = valorPerto(doc, "Proprietário", nomeMaiusculo, 90)
    || valorPerto(doc, "Proprietario", nomeMaiusculo, 90) || null;
  /* "Responsável Técnico" aparece como TÍTULO de seção e como rótulo de campo; o nome costuma
   * vir na linha do número do CAU/CAE ("4405269 MARCILENE SALES DIAS AMORIM"). */
  d.responsavelTecnico =
    (t.match(/\b\d{5,9}\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.]{8,60}?)(?=\s{2,}|\s+Sem\s|\s+Normal|$)/) || [])[1]?.trim()
    || valorPerto(doc, "Responsável Técnico", nomeMaiusculo, 90)
    || valorPerto(doc, "Responsavel Tecnico", nomeMaiusculo, 90) || null;
  // o "(" do CPF entre parênteses entra no casamento — sai aqui
  d.autor = (valorPerto(doc, "Autor", nomeMaiusculo, 60) || "").replace(/[\s(]+$/, "") || null;
  d.cauResponsavel = (t.match(/\b(\d{5,9})\s+[A-ZÀ-Ú][A-ZÀ-Ú\s.]{8,60}?(?=\s{2,}|\s+Sem\s|\s+Normal|$)/) || [])[1] || null;

  /* Na tela o VALOR vem antes do rótulo ("41910502270004 524,7 AV CENTRAL ... Area terreno: (m²)").
   * Por isso a busca posicional, e não "rótulo seguido de número". */
  d.areaTerreno = num(valorPerto(doc, "Area terreno", /\d+(?:\.\d{3})*(?:,\d+)?/, 120) ?? undefined)
    ?? num((t.match(/Area\s+terreno:?\s*\(m²\)\s*\*?\s*([\d.]+,?\d*)/i) || [])[1]);
  d.areaConstruir = num(valorPerto(doc, "Área a ser construída", /\d+(?:\.\d{3})*(?:,\d+)?/, 120) ?? undefined);
  d.enderecoBruto = (t.match(/((?:AV|AVENIDA|R|RUA|AL|ALAMEDA|PRACA|PRA[ÇC]A|TV|TRAVESSA)\s+[^\n]{3,70}?Setor\s+[^\n]{3,40}?)(?=\s*-\s*CEP|\s{2,})/i) || [])[1]?.trim() || null;
  d.situacao = (t.match(/(Apto para An[áa]lise|Em An[áa]lise|Indeferido|Deferido)/i) || [])[1] || null;

  /* O endereço do ATENDIMENTO vem inteiro numa linha só —
   * "R RB11 Quadra 07 Lote 22 Setor SET ALTO DO VALE" — e é a única fonte que traz QUADRA e LOTE
   * juntos quando o Uso do Solo não traz. Quebrado aqui para alimentar os campos um a um. */
  const e = String(d.enderecoBruto ?? "");
  d.quadra = (e.match(/Quadra\s+([A-Z0-9-]+)/i) || [])[1] || null;
  d.lote = (e.match(/Lote\s+([A-Z0-9\/-]+)/i) || [])[1] || null;
  d.setor = (e.match(/Setor\s+(.+?)\s*$/i) || [])[1]?.trim() || null;
  d.logradouro = e.replace(/\s*(Quadra|Lote|Setor)\s+.*$/i, "").trim() || null;
  return d;
}

function lerRequerimento(doc: DocTexto) {
  const t = doc.texto;
  const d: any = {};
  d.interessado = nomeJuntoDoDocumento(doc);
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
    // o cartório da 3ª circunscrição escreve "Matricula n. 55.816", com PONTO: exigir "nº/no/n°"
    // deixava o número de fora e o campo do LIP nascia vazio
    matricula: (t.match(/matr[íi]cula\s*n[.ºo°]*\s*([\d.]+)/i) || [])[1] || null,
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
  aoAndar?: AoAndar,
): Promise<{ catalogo: ItemCatalogo[]; extratos: { hash: string; texto: string; linhas: unknown }[] }> {
  const out: ItemCatalogo[] = [];
  const extratos: { hash: string; texto: string; linhas: unknown }[] = [];

  let lidos = 0;
  for (const a of arquivos) {
    // andamento REAL: quem chama sabe quantos arquivos faltam, e não precisa fingir uma barra
    aoAndar?.({ fase: "lendo", atual: ++lidos, total: arquivos.length, documento: a.nome });
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
      /* Não-PDF (no 50724, três .rar com os slots do SEI dentro) não tem conteúdo a ler, mas TEM
       * nome, e o nome é o slot do SEI. Sem isto o arquivo virava "outros" e o obrigatório era
       * dado como ausente mesmo estando na pasta — "Requerimento.rar" não contava como
       * requerimento. Vale como presença; ler o que está dentro nunca foi necessário, porque todos
       * os papéis que chegam compactados são os da regra master (ver SO_PRESENCA). */
      const pistaNome = SLOTS_SEI.find((s) => s.re.test(a.nome))?.papel ?? null;
      out.push({
        ...base,
        papeis: pistaNome ? [pistaNome] : ["outros"],
        confianca: pistaNome ? "media" : "baixa",
        soPresenca: pistaNome ? SO_PRESENCA.has(pistaNome) : false,
        prova: pistaNome
          ? `arquivo ${ext} — sem conteúdo legível; papel reconhecido pelo nome, vale como presença`
          : "extensão não reconhecida",
      });
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
      /* "EXECUCAO E PROJETO ..." — 26/08/2026.
       *
       * O CREA registra numa ART só as duas atividades, e é assim que vem escrito. O teste
       * anterior procurava PROJETO e parava: a ART virava só `art_projeto`, nenhuma assumia
       * `art_execucao`, e o LIP afirmava "ANEXOU ART/RRT/EXECUÇÃO? NÃO" com a ART na pasta —
       * uma exigência FALSA no despacho, contra um requerente que cumpriu. Visto no 48533.
       *
       * Agora cada atividade responde pelo que ela diz: cita execução, vale como execução; cita
       * projeto, vale como projeto; citando as duas, vale para as duas. */
      const ehProjeto = art.atividades.some((x: Atividade) => /PROJETO|ELABORA/i.test(x.descricao));
      const ehExecucao = art.atividades.some((x: Atividade) => /EXECU/i.test(x.descricao));
      if (temM2) {
        if (ehProjeto) item.papeis.push("art_projeto");
        if (ehExecucao) item.papeis.push("art_execucao");
        if (!ehProjeto && !ehExecucao) item.papeis.push("art_execucao");
      }
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
    /* O NOME DO INTERESSADO SAI DO REQUERIMENTO — 26/08/2026.
     *
     * O requerimento é `SO_PRESENCA` porque **não é importante para a análise técnica** (regra do
     * Fábio, 17/08/2026) — não porque seja proibido lê-lo. A distinção importa: a matriz declara
     * `proprietario` como vindo dele (`doDoc("proprietario","REQUERIMENTO",...)`), e enquanto
     * nada abria o arquivo esse campo não tinha como ser preenchido por leitura nenhuma. No 50724
     * ele está gravado como `manual`, digitado à mão.
     *
     * Lê-se UMA coisa só: o nome do interessado, pescado junto do CPF/CNPJ. Nada mais do
     * requerimento entra na análise, e a ausência dele continua não sendo cobrada
     * (`DISPENSAVEIS`) — o que a regra pede é que ele não pese, não que fique fechado. */
    if (item.papeis.includes("requerimento") && doc.temCamadaTexto) {
      const interessado = nomeJuntoDoDocumento(doc);
      if (interessado) item.dados = { ...(item.dados ?? {}), interessado, _v: VERSAO_EXTRATOR };
    }

    if (!item.soPresenca && doc.temCamadaTexto) {
      if (item.papeis.includes("uso_solo")) item.dados = lerUsoDoSolo(doc);
      else if (item.papeis.includes("atendimento")) item.dados = lerAtendimento(doc);
      else if (item.papeis.includes("projeto")) item.dados = lerPrancha(doc);
      else if (item.papeis.includes("requerimento")) item.dados = lerRequerimento(doc);
      else if (item.papeis.includes("certidao_matricula")) item.dados = lerCertidao(doc);
      else if (item.papeis.some((p) => p.startsWith("art"))) item.dados = lerArt(doc);
      // carimba a versão do extrator no próprio `dados`: é ela que diz se a memória ainda vale
      if (item.dados) item.dados._v = VERSAO_EXTRATOR;
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
  // procedência do que veio de dentro de compactado — sem isso o analista vê no catálogo um
  // arquivo que não existe na pasta e não tem como saber de onde ele saiu
  for (const it of out) {
    const origem = arquivos.find((a) => a.hash === it.hash)?.origemCompactado;
    if (origem) it.prova = `${it.prova} · de dentro de "${origem}"`;
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

      /* PALPITE NÃO DERRUBA LEITURA (processo 50724, 17/08/2026).
       *
       * A rodada é soberana entre documentos IDENTIFICADOS pelo conteúdo. Mas o papel também pode
       * vir da pista do nome, como último recurso, e aí a confiança é "baixa" — é chute. No 50724 a
       * "Certidao de Corredor" numa subpasta casou com a pista /CERTID[ÃA][AO]/, virou
       * `certidao_matricula` de confiança baixa, e por estar na rodada seguinte derrubou a Certidão
       * de Matrícula de verdade, lida com assinatura de conteúdo. O LIP perdeu quadra, lote e
       * dimensões, e o histórico registrou a perda como se fosse "correção" do requerente.
       *
       * Regra: um palpite nunca substitui uma identificação de conteúdo. Ele fica registrado no
       * catálogo e vira alerta — o analista decide, o sistema não decide calado. */
      const palpite = (x: ItemCatalogo) => x.confianca === "baixa";
      if (palpite(it) && !palpite(atual)) {
        it.alertaRetrocesso =
          `identificado como "${papel}" apenas pela pista do nome (confiança baixa) e na rodada ` +
          `${it.rodada}, mas NÃO substitui "${atual.nome}" (rodada ${atual.rodada}), que foi ` +
          `identificado pelo conteúdo — confira se este arquivo é mesmo um(a) ${papel}`;
        continue;
      }
      /* O simétrico é indispensável, e é o que faltava: o palpite pode chegar PRIMEIRO na ordem do
       * catálogo (rodada maior vem antes) e ocupar o papel. Sem esta linha o guarda acima nunca
       * dispara, porque quando o documento de verdade chega ele é o de confiança alta. */
      if (!palpite(it) && palpite(atual)) {
        atual.alertaRetrocesso =
          `assumia o papel de "${papel}" só pela pista do nome; "${it.nome}" foi identificado pelo ` +
          `conteúdo e passa a valer — confira se este arquivo é mesmo um(a) ${papel}`;
        porPapel[papel] = it;
        continue;
      }

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

export function preencherLip(vig: Record<string, ItemCatalogo>) {
  const C: Record<string, ResultadoCampo> = {};

  /**
   * O `set` NUNCA sai calado.
   *
   * A versão anterior fazia `if (valor == null) return`, e o campo simplesmente não existia no
   * resultado: nem NP, nem erro, nem aviso — sumia. Isso quebrava, em silêncio, a própria regra de
   * "nenhum campo termina vazio sem justificativa", e escondia justamente o caso mais frequente na
   * prática: o projetista montou o PDF de outro jeito e o rótulo não estava onde se procurou.
   *
   * `doc` tem TRÊS estados, não dois — é o que separa os três resultados corretamente:
   *   OMITIDO (undefined) → o campo não tem UM documento responsável (é calculado, derivado ou
   *     constante). Sem valor, é NAO_ENCONTRADO — não há "fonte" para julgar ausente ou ilegível.
   *   `null`, ou array em que nenhum entrou no catálogo → a fonte É de um documento único (ou de
   *     uma cadeia de fontes alternativas), e NENHUMA delas veio na pasta → DOCUMENTO_AUSENTE.
   *   `ItemCatalogo` (ou array com pelo menos um item) → a fonte existe. Sem camada de texto em
   *     NENHUMA delas → FONTE_ILEGIVEL. Com texto em pelo menos uma e mesmo assim sem valor →
   *     NAO_ENCONTRADO (a fonte era utilizável; o padrão que falhou).
   *
   * Achado em produção (29/07/2026): nenhuma chamada real passava `doc` — o parâmetro só existia
   * nos wrappers `lido`/`calc`, nunca usados. Por isso FONTE_ILEGIVEL nunca saía do papel, e um
   * documento ausente da pasta virava "documento de origem não está no catálogo" sob NAO_ENCONTRADO
   * em vez de DOCUMENTO_AUSENTE — a distinção existe porque a correção é diferente: DOCUMENTO_AUSENTE
   * pede o documento na pasta; FONTE_ILEGIVEL pede OCR/visão; NAO_ENCONTRADO conserta o extrator.
   */
  const set = (
    chave: string, valor: any, resultado: ResultadoExec, fonte: string,
    procurou?: string[], doc?: ItemCatalogo | (ItemCatalogo | undefined | null)[] | null,
  ) => {
    if (valor != null && valor !== "" && valor !== "—") {
      C[chave] = { valor: String(valor), resultado, fonte };
      return;
    }
    // campo sem fonte documental única (calculado, derivado ou constante): sem doc para julgar
    if (doc === undefined) {
      C[chave] = {
        resultado: "NAO_ENCONTRADO", fonte,
        tentativa: { procurou: procurou ?? [fonte], motivo: "não foi possível localizar ou calcular o dado" },
      };
      return;
    }
    const candidatos = (Array.isArray(doc) ? doc : [doc]).filter((d): d is ItemCatalogo => !!d);
    if (candidatos.length === 0) {
      C[chave] = {
        resultado: "DOCUMENTO_AUSENTE", fonte,
        tentativa: { procurou: procurou ?? [fonte], motivo: "o documento de origem não veio na pasta deste processo" },
      };
      return;
    }
    const legivel = candidatos.find((d) => d.temCamadaTexto);
    if (!legivel) {
      const d = candidatos[0];
      C[chave] = {
        resultado: "FONTE_ILEGIVEL", fonte,
        tentativa: {
          documento: d.nome, hash: d.hash, procurou: procurou ?? [fonte],
          temCamadaTexto: false, charsTexto: d.charsTexto,
          motivoIlegivel: "SEM_CAMADA_TEXTO",
          motivo: `${d.nome} não tem camada de texto (${d.paginas} página(s) digitalizadas)`,
        },
      };
      return;
    }
    C[chave] = {
      resultado: "NAO_ENCONTRADO", fonte,
      tentativa: {
        documento: legivel.nome, hash: legivel.hash, procurou: procurou ?? [fonte],
        temCamadaTexto: true, charsTexto: legivel.charsTexto,
        motivo: `o padrão não localizou o dado em ${legivel.nome}, que tem texto legível`,
      },
    };
  };

  /** valor lido de documento */
  const lido = (chave: string, valor: any, fonte: string, doc?: ItemCatalogo | (ItemCatalogo | undefined | null)[] | null, procurou?: string[]) =>
    set(chave, valor, "ENCONTRADO", fonte, procurou, doc);
  /** resultado de conta ou derivação */
  const calc = (chave: string, valor: any, fonte: string, doc?: ItemCatalogo | (ItemCatalogo | undefined | null)[] | null, procurou?: string[]) =>
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
  const at = vig.atendimento?.dados ?? {};
  const aProj = vig.art_projeto?.dados ?? {};
  const aExec = vig.art_execucao?.dados ?? {};
  const aCx = vig.art_caixa?.dados ?? {};

  /* ── CASCATA DE FONTES ───────────────────────────────────────────────────────────────────
   * Regra do Fábio, 26/08/2026: *"pode ler de outro lugar mas tenho que cobrar a correção do
   * projeto"*. Endereço, proprietário e profissional aparecem em quase todo documento da pasta —
   * principalmente no print do ATENDIMENTO, que traz cada um em campo próprio. Deixar o campo
   * vazio porque o carimbo falhou é esconder informação que a pasta tem.
   *
   * Mas ler de outro lugar NÃO absolve a prancha. Todo campo que DEVERIA estar no carimbo e foi
   * resgatado em outro documento entra em `camposForaDoCarimbo`: a ficha se completa e a
   * deficiência do projeto continua exigível. Quem analisa é analista DE PROJETO — a origem fica
   * escrita no campo, então ele vê na hora que o número não veio de onde a norma manda. */
  const emCascata = (
    chave: string, rotulo: string,
    fontes: { valor: any; fonte: string; doc: any; oficial?: boolean }[],
  ) => {
    const achou = fontes.find((f) => f.valor !== null && f.valor !== undefined && f.valor !== "");
    if (!achou) return;
    /* Resgatado fora da fonte oficial: a EVIDÊNCIA do campo passa a dizer isso com todas as
     * letras. É o que o analista lê na ficha e no log da OBS para cobrar a correção do projeto —
     * o valor aparece preenchido, mas nunca disfarçado de "veio do lugar certo". */
    set(chave, typeof achou.valor === "number" ? fmt(achou.valor) : String(achou.valor),
        "ENCONTRADO", achou.fonte, undefined, achou.doc ?? null);
    if (!achou.oficial && C[chave]) {
      (C[chave] as any).evidencia =
        `${rotulo} não foi lido na fonte oficial (${fontes[0].fonte}) — resgatado em ${achou.fonte}. `
        + `EXIGIR a correção do projeto: a norma manda este dado constar ali.`;
    }
  };


  // identificação
  emCascata("logradouro", "LOGRADOURO", [
    { valor: uds.via ?? pr.endereco?.match(/RUA\s*\d+/i)?.[0], fonte: "Uso do Solo (Nome da Via)", doc: vig.uso_solo, oficial: true },
    { valor: at.logradouro, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  emCascata("quadra", "QUADRA", [
    { valor: uds.quadra, fonte: "Uso do Solo", doc: vig.uso_solo, oficial: true },
    { valor: at.quadra, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  emCascata("lote", "LOTE", [
    { valor: uds.lote, fonte: "Uso do Solo", doc: vig.uso_solo, oficial: true },
    { valor: at.lote, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  emCascata("bairro", "BAIRRO / SETOR", [
    { valor: uds.bairro, fonte: "Uso do Solo", doc: vig.uso_solo, oficial: true },
    { valor: at.setor, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  set("iptu", soDigitos(uds.iptu ?? pr.iptu ?? rq.iptu ?? at.iptu), "ENCONTRADO", "Uso do Solo",
      undefined, [vig.uso_solo, vig.projeto, vig.requerimento]);
  /* Proprietário: requerimento → ATENDIMENTO → ART. NÃO se tenta o carimbo da prancha — testado e
   * descartado em 26/08/2026, porque o carimbo traz outros CNPJs (SEFIC, escritório projetista) e
   * o campo saía com o nome errado, que é pior que vazio num documento assinado. */
  emCascata("proprietario", "PROPRIETÁRIO", [
    { valor: rq.interessado, fonte: "Requerimento", doc: vig.requerimento, oficial: true },
    { valor: at.proprietario, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
    { valor: aProj.proprietario ?? aProj.contratante, fonte: "ART de projeto (contratante)", doc: vig.art_projeto },
    { valor: aExec.proprietario ?? aExec.contratante, fonte: "ART de execução (contratante)", doc: vig.art_execucao },
  ]);
  emCascata("nome_responsavel_arq", "AUTOR DO PROJETO", [
    { valor: pr.arquiteto, fonte: "carimbo da prancha", doc: vig.projeto, oficial: true },
    /* ART antes do print: é documento de conselho, com o profissional em campo rotulado. O print
     * do ATENDIMENTO traz o nome do ANALISTA na mesma tela — pescar dali primeiro arriscaria
     * gravar o nome de quem analisa como autor do projeto. */
    { valor: aProj.profissional, fonte: "ART do projeto (profissional)", doc: vig.art_projeto },
    { valor: at.responsavelTecnico ?? at.autor, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  set("cau", pr.cau, "ENCONTRADO", "carimbo da prancha", undefined, vig.projeto ?? null);
  set("nome_responsavel_eng", pr.engenheiro, "ENCONTRADO", "carimbo da prancha", undefined, vig.projeto ?? null);
  set("crea", pr.crea, "ENCONTRADO", "carimbo da prancha", undefined, vig.projeto ?? null);
  /* Frentes = vias listadas no Uso do Solo. Antes o extrator lia UMA via só, então todo lote saía
   * com 1 frente e esquina NÃO — inclusive os de esquina, e é a esquina que muda recuo e vagas. */
  const nVias = uds.vias?.length ?? 0;
  set("quantasFrentes", nVias || null, "CALCULADO", `${nVias} via(s) no Uso do Solo`, undefined, vig.uso_solo ?? null);
  set("esquina", nVias ? (nVias > 1 ? "SIM" : "NÃO") : null, "CALCULADO",
      `${nVias} frente(s) no Uso do Solo`, undefined, vig.uso_solo ?? null);

  // uso do solo
  set("usoDoSoloN", uds.numero, "ENCONTRADO", "Uso do Solo", undefined, vig.uso_solo ?? null);
  set("unidadeTerritorialDoUsoDoSolo", uds.unidadeTerritorial, "ENCONTRADO", "Uso do Solo", undefined, vig.uso_solo ?? null);
  set("usoDoSoloEParaAprovacao", uds.tipo ? (uds.tipo === "APROVAÇÃO DE PROJETO" ? "SIM" : "NÃO") : null, "CALCULADO", "Tipo de Uso do Solo",
      undefined, vig.uso_solo ?? null);
  set("tipoDeVia1", uds.classificacaoVia, "ENCONTRADO", "Uso do Solo", undefined, vig.uso_solo ?? null);
  // 2ª a 4ª frente: só nascem quando o Uso do Solo lista mais de uma via
  for (const n of [2, 3, 4] as const) {
    set(`via${n}`, uds[`via${n}`], "ENCONTRADO", "Uso do Solo (Nome da Via)", undefined, vig.uso_solo ?? null);
    set(`tipoDeVia${n}`, uds[`classificacaoVia${n}`], "ENCONTRADO", "Uso do Solo", undefined, vig.uso_solo ?? null);
  }
  set("anexouCertidaoDeCorredorViario", uds.via ? (uds.corredorViario ? "SIM" : "NÃO") : null, "CALCULADO", "campo Corredor Viário do UDS",
      undefined, vig.uso_solo ?? null);
  set("atendeOPorteAdmitido", /sem limite/i.test(uds.areaMaxima ?? "") ? "SIM" : null, "CALCULADO", uds.areaMaxima ?? "",
      undefined, vig.uso_solo ?? null);
  set("cnae", uds.cnaes?.length ? uds.cnaes.map((c: any) => c.codigo).join(" / ") : null, "ENCONTRADO", "Uso do Solo",
      undefined, vig.uso_solo ?? null);

  // ART
  set("numeroDeArtProjeto", aProj.numero, "ENCONTRADO", "ART de projeto", undefined, vig.art_projeto ?? null);
  set("numeroDeArtExecucao", aExec.numero, "ENCONTRADO", "ART de execução", undefined, vig.art_execucao ?? null);
  set("numeroDeArtCaixa", aCx.numero, "ENCONTRADO",
      vig.art_caixa?.caixaDedicada ? "ART dedicada à caixa de recarga"
      : vig.art_caixa?.caixaRepetida ? `repetido da ${vig.art_caixa.caixaRepetida} — a caixa não tem ART própria`
      : "ART de caixa",
      undefined, vig.art_caixa ?? null);
  set("anexouArtRrtProjeto", vig.art_projeto ? "SIM" : "NÃO", "CALCULADO", "catálogo");
  set("anexouArtRrtExecucao", vig.art_execucao ? "SIM" : "NÃO", "CALCULADO", "catálogo");
  set("anexouArtRrtCaixa", vig.art_caixa ? "SIM" : "NÃO", "CALCULADO", "catálogo");
  set("artDeProjetoAtendeAAcessibilidade", aProj.declaracaoAcessibilidade ? "SIM" : null, "ENCONTRADO", "declaração de acessibilidade na ART de projeto",
      undefined, vig.art_projeto ?? null);
  set("aArtDeExecucaoAtendeA", aExec.declaracaoAcessibilidade ? "SIM" : null, "ENCONTRADO", "ART de execução",
      undefined, vig.art_execucao ?? null);

  // dados do projeto
  emCascata("areaTerreno", "ÁREA DO TERRENO", [
    { valor: pr.areaTerreno, fonte: "carimbo da prancha", doc: vig.projeto, oficial: true },
    { valor: at.areaTerreno, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  emCascata("areaTotal", "ÁREA TOTAL DA CONSTRUÇÃO", [
    { valor: pr.areaTotalConstrucao, fonte: "carimbo da prancha", doc: vig.projeto, oficial: true },
    { valor: at.areaConstruir, fonte: "print do ATENDIMENTO", doc: vig.atendimento },
  ]);
  set("pav", pr.pavimentos, "ENCONTRADO", "carimbo da prancha", undefined, vig.projeto ?? null);
  set("unidComerciais", pr.unidComerciais, "ENCONTRADO", "carimbo, 'Nº DE UNIDADES'",
      ["rótulo 'Nº DE UNIDADES' no carimbo", "variantes 'N. DE UNIDADES', 'NUMERO DE UNIDADES'"], vig.projeto ?? null);
  set("unidHabitacionais", pr.unidHabitacionais, "ENCONTRADO", "carimbo, 'Nº DE UNIDADES'",
      ["rótulo 'Nº DE UNIDADES' no carimbo", "variantes 'N. DE UNIDADES', 'NUMERO DE UNIDADES'"], vig.projeto ?? null);
  set("certidao", ct.matricula, "ENCONTRADO", "Certidão de Matrícula", undefined, vig.certidao_matricula ?? null);

  // caixa de recarga — lido para CONFRONTAR, nunca para valer por si
  set("nDeCaixasDeCaptacao", pr.numeroCaixas, "ENCONTRADO", "carimbo da prancha", undefined, vig.projeto ?? null);
  set("volumeDaCaixaDeRecarga", pr.volumeCaixa != null ? fmt(pr.volumeCaixa) : null, "ENCONTRADO",
      "carimbo da prancha (a conferir por cálculo)", undefined, vig.projeto ?? null);

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
  set("areaNaArtDeProjeto", qtd(aProj, /QUADRAD/i), "ENCONTRADO", "quadro de atividade técnica da ART de projeto",
      undefined, vig.art_projeto ?? null);
  set("areaNaArtDeExecucao", qtd(aExec, /QUADRAD/i), "ENCONTRADO", "quadro de atividade técnica da ART de execução",
      undefined, vig.art_execucao ?? null);
  set("volumeNaArtDeCaixa", qtd(aCx, /C[ÚU]BIC/i), "ENCONTRADO", "quadro de atividade técnica da ART de caixa",
      undefined, vig.art_caixa ?? null);
  set("areaPermeavelProjetada", pr.permeavel != null ? fmt(pr.permeavel) : null, "ENCONTRADO",
      "cobertura vegetal permeável no carimbo", undefined, vig.projeto ?? null);
  /* área impermeabilizada: achado real (memorial das caixas de retenção do processo 50724) —
   * é a área do lote MENOS a área de grama (permeável), sem descontar mais nada (nem
   * estacionamento, nem construção separadamente — tudo que não é grama já conta como
   * impermeável). Bate exato com a conta do próprio projetista: 5.071,49 − 569,29 = 4.502,20m².
   * Preferido ao cálculo reverso (ICCAP EXIGIDO × divisor) por não depender do carimbo declarar
   * EXIGIDO — quando os dois discordam, é sinal de erro no ICCAP declarado ou no rótulo de
   * grama lido, então vale a pena manter o reverso como fallback pra quando falta a grama. */
  const areaImpermCalc = pr.areaTerreno != null && pr.permeavel != null ? pr.areaTerreno - pr.permeavel : null;
  if (areaImpermCalc != null) {
    set("areaImpermeabilizada", fmt(areaImpermCalc), "CALCULADO",
        `${fmt(pr.areaTerreno)} m² (lote) − ${fmt(pr.permeavel)} m² (grama/permeável)`);
  } else if (pr.iccapExigido != null && uds.iccapDivisor) {
    set("areaImpermeabilizada", fmt(pr.iccapExigido * uds.iccapDivisor), "CALCULADO",
        `${fmt(pr.iccapExigido)} m³ × ${uds.iccapDivisor} m²/m³ (parâmetro do Uso do Solo)`);
  }
  /* volume exigido da caixa: mesmo achado — o carimbo deste processo nunca declara "EXIGIDO"
   * (só "10Cxs. 22,60m³", o volume ADOTADO). Sem a área impermeabilizada calculada acima e o
   * divisor do Uso do Solo (1m³ a cada 200m²), esse campo ficava sempre vazio nesse formato de
   * carimbo. Bate com a conta do memorial: 4.502,20 ÷ 200 = 22,51m³. */
  if (pr.iccapExigido != null) {
    set("volumeExigidoDaCaixa", fmt(pr.iccapExigido), "ENCONTRADO",
        "ICCAP EXIGIDO no carimbo (IN 007/2024)", undefined, vig.projeto ?? null);
  } else if (areaImpermCalc != null && uds.iccapDivisor) {
    set("volumeExigidoDaCaixa", fmt(areaImpermCalc / uds.iccapDivisor), "CALCULADO",
        `${fmt(areaImpermCalc)} m² ÷ ${uds.iccapDivisor} m²/m³ (área impermeável ÷ parâmetro do Uso do Solo)`);
  }
  // alertas do Uso do Solo: o que o próprio documento sinaliza e muda a análise
  {
    const alertas: string[] = [];
    if (uds.corredorViario) alertas.push(`corredor viário: ${uds.corredorViario}`);
    if (uds.embargo && /SIM/i.test(uds.embargo)) alertas.push("imóvel COM EMBARGO");
    if (uds.embarqueDesembarque && /SIM/i.test(uds.embarqueDesembarque)) alertas.push("exige embarque/desembarque");
    set("alertasDoUsoDoSolo", alertas.length ? alertas.join(" · ") : (uds.numero ? "nenhum alerta no documento" : null), "CALCULADO", "Uso do Solo",
        undefined, vig.uso_solo ?? null);
  }

  // fração ideal: a lógica completa (comercial × zona territorial) está mais abaixo, junto com
  // os outros 4 campos da aba — precisa de `ehComercial`/`ehHabitacional`, calculados só lá embaixo.

  /* Índice paisagístico — 3 caminhos de conformidade, MUTUAMENTE EXCLUSIVOS, decididos pelo que
   * o carimbo mostra (não pelo que se "exige" em abstrato — a versão anterior calculava os 4
   * valores sempre, mesmo pros caminhos que o projeto nem usa). Regra do Fábio (2026-08-18),
   * revista ao vivo no processo 50724:
   *   Opção 1 (15% só grama): só quando NÃO há cobertura vegetal não permeável nenhuma.
   *   Opção 2 (10% grama + até 5% não permeável): quando HÁ as duas frações.
   *   Opção 3 (25% não permeável, zero grama): só quando NÃO há grama nenhuma.
   * O valor de cada opção que se aplica é o PERCENTUAL alcançado daquela fração (não a área,
   * não um "exigido" abstrato) — a(s) opção(ões) que não se aplicam ao caso concreto viram NP,
   * nunca ficam em branco. */
  if (pr.permeavelPct != null || pr.naoPermeavelPct != null) {
    const temGrama = (pr.permeavel ?? 0) > 0;
    const temNaoPermeavel = (pr.naoPermeavel ?? 0) > 0;
    const pctGrama = pr.permeavelPct != null ? `${fmt(pr.permeavelPct)}%` : null;
    const pctNaoPermeavel = pr.naoPermeavelPct != null ? `${fmt(pr.naoPermeavelPct)}%` : null;
    if (temGrama && !temNaoPermeavel) {
      set("opcao1TotalExigidoAreaTerreno", pctGrama, "CALCULADO", "só grama, sem cobertura não permeável — Opção 1");
      np("opcao2TotalExigidoAreaTerreno", "sem cobertura não permeável — se aplica a Opção 1, não a 2", "regra aplicada sobre dado já lido nesta leitura");
      np("opcao2TotalExigidoAreaTerreno2", "sem cobertura não permeável — se aplica a Opção 1, não a 2", "regra aplicada sobre dado já lido nesta leitura");
      np("opcao3TotalExigidoAreaTerreno", "há grama — Opção 3 exige zero grama", "regra aplicada sobre dado já lido nesta leitura");
    } else if (temGrama && temNaoPermeavel) {
      np("opcao1TotalExigidoAreaTerreno", "há cobertura não permeável — Opção 1 exige só grama", "regra aplicada sobre dado já lido nesta leitura");
      set("opcao2TotalExigidoAreaTerreno", pctGrama, "CALCULADO", "fração de grama da Opção 2");
      set("opcao2TotalExigidoAreaTerreno2", pctNaoPermeavel, "CALCULADO", "fração não permeável da Opção 2");
      np("opcao3TotalExigidoAreaTerreno", "há grama — Opção 3 exige zero grama", "regra aplicada sobre dado já lido nesta leitura");
    } else if (!temGrama && temNaoPermeavel) {
      np("opcao1TotalExigidoAreaTerreno", "sem grama — Opção 1 exige grama", "regra aplicada sobre dado já lido nesta leitura");
      np("opcao2TotalExigidoAreaTerreno", "sem grama — Opção 2 exige mínimo de grama", "regra aplicada sobre dado já lido nesta leitura");
      np("opcao2TotalExigidoAreaTerreno2", "sem grama — Opção 2 exige mínimo de grama", "regra aplicada sobre dado já lido nesta leitura");
      set("opcao3TotalExigidoAreaTerreno", pctNaoPermeavel, "CALCULADO", "zero grama, só cobertura não permeável — Opção 3");
    }
  }

  set("tipoProcessoLip", "APROVAÇÃO DE PROJETO", "ENCONTRADO", "valor padrão do assunto");
  /* Sem o requerimento (regra master), quem diz que o uso é econômico são os CNAEs do Uso do Solo
   * — documento que a análise lê de qualquer jeito. Antes o campo dependia só do requerimento e
   * por isso nascia vazio. */
  set("comercio", (uds.cnaes?.length ?? 0) > 0 ? "SIM" : null, "CALCULADO", "CNAEs no Uso do Solo",
      undefined, vig.uso_solo ?? null);
  set("atividadeEconomica", uds.cnaes?.length ? "SIM" : null, "CALCULADO", "CNAEs no Uso do Solo", undefined, vig.uso_solo ?? null);

  /* ══════════════════════════════════════════════════════════════════════════════
   * GRUPO A — sem IA. Regra sobre dado já lido, ou resultado de conferência que já
   * rodou. Ver lib/rastreabilidade/lipSlot5.ts para o inventário completo dos 136 campos.
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
  set("tipoUso", ehComercial && !ehHabitacional ? "COMERCIAL" : ehHabitacional && !ehComercial ? "HABITACIONAL" : null,
      "CALCULADO", "CNAEs no Uso do Solo", undefined, vig.uso_solo ?? null);

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
  /* Regra mestra do Fábio (2026-08-18) continua valendo em princípio — em comercial, previsão/
   * projeção de elevador sem instalar conta como não ter — mas a DETECÇÃO por texto que eu
   * tinha escrito aqui (procurar "PROJEÇÃO ESPAÇO ELEVADOR") deu falso positivo no próprio
   * processo 50724: a frase aparece, mas o projeto TEM elevador real (sala "Elevador 3,15m²"
   * ao lado da escada, na planta do 1º pavimento). "Projeção" nesse contexto de desenho é termo
   * de representação gráfica (o elemento projetado numa vista), não "reservado sem instalar".
   * Removido até achar um sinal textual confiável — fica MANUAL igual antes. */

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
    // padrão do Fábio (2026-08-18): valor sempre é o texto completo, nunca "NP" — a Prefeitura
    // não emite essa certidão, então "NP" (não se aplica) confundiria com "não pertence"
    C.certidaoDeAcessib = {
      valor: "Não Implementada Pela Prefeitura", resultado: "NAO_APLICAVEL",
      fonte: "certidão de acessibilidade não regulamentada pela Prefeitura",
      evidencia: "regra aplicada sobre dado já lido nesta leitura",
    };
    np("dimensoesDoLoteConferemComRememb", "sem remembramento, remanejamento ou desmembramento na pasta", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── a ART de execução do CREA não traz declaração de acessibilidade
  if (vig.art_execucao && !aExec.declaracaoAcessibilidade) {
    np("aArtDeExecucaoAtendeA", "a ART de execução não traz declaração de acessibilidade", "regra aplicada sobre dado já lido nesta leitura");
  }

  // ── coordenadas: estão na ART, e o campo era digitado à mão
  set("coordenadas", aExec.coordenadas ?? aProj.coordenadas ?? aCx.coordenadas, "ENCONTRADO",
      "campo Coordenadas Geográficas da ART", undefined, [vig.art_execucao, vig.art_projeto, vig.art_caixa]);

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

  /* ── fração ideal: regula subdivisão em "economias" — só existe em uso habitacional.
   * Regra mestra do Fábio (2026-08-18): se o carimbo/requerimento já classificou comercial,
   * a aba inteira é NP, ponto — nem chega a olhar zona territorial. Achado real (processo
   * 50724): `aabEApac190` não tinha NENHUM caminho de NP, só o de SIM (linha removida acima) —
   * ficava em branco em todo processo comercial, e o Fábio tinha que digitar NP à mão. */
  if (ehComercial && !ehHabitacional) {
    np("aabEApac190", "uso comercial — fração ideal só se aplica a uso habitacional", "regra aplicada sobre dado já lido nesta leitura");
    np("aosEApaIntegranteDaArau", "uso comercial — fração ideal só se aplica a uso habitacional", "regra aplicada sobre dado já lido nesta leitura");
    np("chacarasVerificarNomeDoBairroNa", "uso comercial — fração ideal só se aplica a uso habitacional", "regra aplicada sobre dado já lido nesta leitura");
    np("chacarasVerificarNomeDoBairroNa2", "uso comercial — fração ideal só se aplica a uso habitacional", "regra aplicada sobre dado já lido nesta leitura");
    np("quitineteEmAab130", "uso comercial — fração ideal só se aplica a uso habitacional", "regra aplicada sobre dado já lido nesta leitura");
  } else if (/ADENSAMENTO B[ÁA]SICO/i.test(uds.unidadeTerritorial ?? "")) {
    // uso habitacional em AAB: ARAU/APA e Chácara são zonas territoriais diferentes, se excluem
    if (/90,00\s*m²/.test(uds.fracaoIdeal ?? "")) set("aabEApac190", "SIM", "CALCULADO", uds.fracaoIdeal);
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

  /* ── "X" = TENHO CERTEZA QUE NÃO TEM ────────────────────────────────────────────────────────
   * Convenção do Fábio (26/08/2026): campo vazio pode ser falha minha de leitura; campo com X é
   * AFIRMAÇÃO — o documento que era obrigado a trazer aquilo não traz, e por isso vira cobrança.
   *
   * Por isso o X só é escrito onde a norma fecha a lista e o documento foi lido inteiro: a IN
   * 007/2024 diz o que o carimbo tem que conter, `lerPrancha` percorre essa lista e devolve
   * `carimboFaltando`. Fora daí eu não distingo "não tem" de "não soube ler" — e marcar X num
   * campo que EXISTE no documento criaria exigência falsa contra quem cumpriu, que é o pior erro
   * que este sistema pode cometer (aconteceu hoje, com a ART de execução).
   *
   * Só marca campo que ficou SEM VALOR NENHUM: se a cascata resgatou o dado em outro documento, o
   * valor vale e a falha do carimbo já está registrada na evidência daquele campo. */
  const FALTA_NO_CARIMBO: { rotulo: RegExp; campos: string[] }[] = [
    { rotulo: /N[ºO°]\s*DE UNIDADES/i, campos: ["unidComerciais", "unidHabitacionais"] },
    { rotulo: /^[ÁA]REA DO TERRENO/i, campos: ["areaTerreno"] },
    { rotulo: /^[ÁA]REA TOTAL DA CONSTRU/i, campos: ["areaTotal"] },
    { rotulo: /FORRA[ÇC][ÃA]O VEGETAL PERME[ÁA]VEL/i, campos: ["areaPermeavelProjetada"] },
    { rotulo: /ICCAP/i, campos: ["volumeExigidoDaCaixa"] },
  ];
  if (vig.projeto) {
    for (const falta of (pr.carimboFaltando ?? []) as string[]) {
      const regra = FALTA_NO_CARIMBO.find((r) => r.rotulo.test(falta));
      if (!regra) continue;
      for (const chave of regra.campos) {
        if (C[chave]?.valor) continue;   // veio de outra fonte — o valor manda, não o X
        C[chave] = {
          valor: "X",
          resultado: "NAO_ENCONTRADO",
          fonte: `não consta no carimbo — a IN 007/2024 exige "${falta}"`,
          evidencia: "carimbo lido por inteiro e o campo não está lá — COBRAR no despacho",
        } as any;
      }
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
  /* A conferência "Área no requerimento × projeto" saiu com a regra master: o requerimento não
   * entra na análise do slot 5, então ela viveria eternamente em SEM DADO — pendência de mentira,
   * que é pior do que pendência nenhuma. Pelo mesmo motivo o IPTU passou a ser conferido em dois
   * documentos, não três. */

  // mesmo dado em documentos diferentes, normalizado antes de comparar
  const iptus = ([["Uso do Solo", uds.iptu], ["prancha", pr.iptu]] as [string, string][])
    .filter(([, v]) => v).map(([k, v]) => [k, soDigitos(v)] as [string, string]);
  const distintos = new Set(iptus.map(([, v]) => v));
  out.push({
    nome: "IPTU é o mesmo no Uso do Solo e na prancha?",
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

/**
 * Abre os compactados ANTES de catalogar, e só os que importam.
 *
 * Regra do Fábio: documento importante que vier em .rar é descompactado. O que continua fechado é
 * o que a regra master já dá por irrelevante — e é o NOME do compactado que decide, porque ele é o
 * slot do SEI. "Requerimento.rar" fica fechado e vale presença; "ART.zip" é aberto.
 *
 * Abrir aqui, e não dentro de `catalogar`, mantém o resto da leitura sem saber que compactado
 * existe: o que sai daqui é uma lista de arquivos comum, cada um com hash do PRÓPRIO conteúdo — é
 * isso que faz o MHD reconhecer depois a mesma folha solta na pasta.
 */
async function expandirCompactados(arquivos: ArquivoEntrada[]): Promise<ArquivoEntrada[]> {
  const out: ArquivoEntrada[] = [];

  for (const a of arquivos) {
    if (!ehCompactado(a.nome)) { out.push(a); continue; }

    const pista = SLOTS_SEI.find((s) => s.re.test(a.nome))?.papel ?? null;
    if (pista && SO_PRESENCA.has(pista)) { out.push(a); continue; } // irrelevante: não se abre

    const { arquivos: dentro, erro } = await abrirCompactado(a.nome, a.buffer);
    if (erro || !dentro.length) {
      // falhou: segue como estava, valendo presença — a leitura nunca cai por causa disto
      out.push({ ...a, origemCompactado: erro ? `não foi possível abrir: ${erro}` : undefined });
      continue;
    }
    for (const f of dentro) {
      out.push({
        nome: f.nome,
        rodada: a.rodada,
        hash: crypto.createHash("sha256").update(f.buffer).digest("hex"),
        buffer: f.buffer,
        origemCompactado: a.nome,
      });
    }
  }
  return out;
}

/** Lê a pasta inteira e devolve catálogo, campos do LIP e conferências. Zero chamadas de IA. */
export async function lerPastaSlot5(
  arquivos: ArquivoEntrada[],
  conhecidos?: Map<string, Conhecido>,
  aoAndar?: AoAndar,
): Promise<ResultadoLeitura> {
  aoAndar?.({ fase: "abrindo", atual: 0, total: arquivos.length });
  const expandidos = await expandirCompactados(arquivos);

  const { catalogo, extratos } = await catalogar(expandidos, conhecidos, aoAndar);

  aoAndar?.({ fase: "conferindo", atual: expandidos.length, total: expandidos.length });
  const vig = vigentes(catalogo);
  const campos = preencherLip(vig);
  const conferencias = conferir(vig);

  const presentes = new Set(catalogo.flatMap((it) => it.papeis));
  const obrigatorios = OBRIGATORIOS.map(([papel, nome]) => ({
    papel, nome, presente: presentes.has(papel), dispensavel: DISPENSAVEIS.has(papel),
  }));

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
