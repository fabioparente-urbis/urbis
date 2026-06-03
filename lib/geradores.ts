import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle, WidthType,
  VerticalAlign, PageNumber, UnderlineType, TabStopType,
} from "docx";
import fs from "fs";
import path from "path";

const TEXTOS_DESPACHO: Record<string, string> = {
  d1: "Rever Certidão de Matrícula do imóvel ou certidão de compra e venda;",
  d2: `Conforme Art. 2º, inc. VII da Lei Complementar 314/2018, além de ART/RRT de levantamento da edificação, deverá ser anexado ao processo "relatório/laudo técnico que conste o tipo de estrutura, condições de segurança e habitabilidade da edificação, registros fotográficos da situação atual do imóvel" onde ATESTE as condições de segurança e habitabilidade da edificação;`,
  d3: "Para as edificações acima de 250m² e que não ocuparam a totalidade da área do lote, será indispensável à construção de poço de infiltração/caixa de recarga. – Art.2º §4º;",
  d4: `Atender ao Art. 1º §2° da Lei Complementar 314/2018: "Para fins de análise e comprovação das características da edificação a referência será a imagem do Google Earth, até a data de 04/03/2022, atestada pelo órgão municipal de planejamento, ou, ainda, documentos emitidos até a data da publicação desta Lei Complementar que comprovem as edificações, tais como autos de infração, embargos, notificações e outros documentos oficiais da Prefeitura de Goiânia, além de Vistoria Fiscal devidamente acompanhada de laudo e registro fotográfico com data."`,
  d5: "No caso de mais de um lote, anexar Certidão de Remembramento/Desmembramento ou Decreto da Prefeitura para a aprovação;\nObs. Caso o lote não ser remembrado averiguar documento de DIREITO DE SUPERFÍCIE sobre terrenos de diferentes proprietários, desde que devidamente acordado entre as partes e registrado em Cartório.",
  d6: "Averiguar documento de DIREITO DE SUPERFÍCIE sobre terrenos de diferentes proprietários, desde que devidamente acordado entre as partes e registrado em Cartório.",
  d7: "Para imóveis situados em ÁREA DO ENTORNO DO BEM TOMBADO, deverá ser apresentado a anuência do órgão cultural responsável pelo tombamento do bem gerador da respectiva área do entorno – Art.3º Inst. Norm. n°4/2024;",
  d8: "Anexar Outorga Onerosa: será solicitada, para liberação da taxa final, a Outorga Onerosa, que deverá ser calculada com base no Quadro de Áreas do projeto analisado; protocolar processo específico com o assunto Outorga Onerosa e, após o deferimento, anexar o documento de outorga devidamente aprovado ao presente processo;\nObs. Aplicar Onerosa para edificações com altura superior a 7,50m a partir da laje do térreo e também ultrapassar a unidade imobiliária.",
  c1: `Informar em campo acima do carimbo: "O MEMORIAL DE CÁLCULO DA CAIXA DE INFILTRAÇÃO (RECARGA) É DE RESPONSABILIDADE DO PROFISSIONAL QUE ASSINOU A ART/RRT DE EXECUÇÃO E PROJETO";`,
  c2: `Informar em campo acima do carimbo: "DE ACORDO COM A LEI COMPLEMENTAR 364 DE JAN/2023 ART. 108 - É DE RESPONSABILIDADE DO INTERESSADO A APROVAÇÃO DO PROJETO SOB REGRAMENTO DO CORPO DE BOMBEIRO";`,
  c3: "O carimbo deve estar exatamente como no IN7 DE 10 DE JULHO DE 2024. Consultar COLETÂNEA URBANÍSTICA DE GOIÂNIA (página 525) no site da prefeitura de Goiânia;",
  c4: "Rever o nome da Secretaria no carimbo de aprovação: Secretaria de Eficiência – SEFIC / Diretoria de Análise e Aprovação de Projetos;",
  c5: "Informar o número do processo no campo para aprovação;",
  c6: "Indicar no carimbo a classificação e controle de uso (Art. 8º Inst. Normativa nº4/2024): Edificação habitacional / Edificação de atividade econômica / Edificação Institucional;",
  c7: "Informar CNAE(s) e descrição da(s) atividade(s), conforme Uso do Solo Específico;\nObs. Para o caso de aprovar o projeto com o CNAE indicar documento comprobatório (CAE) até a data de 31/08/22 (Art. 20 da Inst.Norm. n°4);",
  p1: "Informar título do projeto: ALVARÁ DE REGULARIZAÇÃO – LEVANTAMENTO ARQUITETÔNICO;",
  p2: "Informar o número de pavimentos;",
  p3: "Informar o número de unidades e/ou salas;",
  p4: "Informar endereço completo, contendo todas as vias, lotes e quadra;",
  p5: "Compatibilizar a área e as dimensões do terreno informadas no carimbo com a Certidão de Matrícula do Imóvel;",
  p6: "Compatibilizar as áreas informadas no carimbo com o quadro de áreas do projeto;",
  p7: "No quadro de áreas (projeto e carimbo), informar: Área do terreno (m²); Área existente aprovada (m²), se houver; Área a ser regularizada que ocupa o recuo frontal (m²), se houver; Área a ser regularizada remanescente (m²); Área total a ser regularizada (m²);",
  p8: "Caso estejam previstos no projeto, informar área do Índice Paisagístico em m², quantidade de caixas de recarga com o volume atendido (m³);",
  p9: `Substituir o termo Autor de Projeto e RT da obra por "Autor do Levantamento";`,
  pr1: "Hachurar a área que ocupa o recuo frontal mínimo e obrigatório de 5,00m, cotar e indicar a metragem quadrada por pavimento e total de ocupação;",
  pr2: "No caso de uso econômico a ser regularizado em conjunto com a edificação irregular, informar a área ocupada pela atividade no quadro de áreas;",
  pr3: "Apresentar poço de infiltração/caixa de recarga para edificações acima de 250m² que não ocupam a totalidade da área do lote;",
  pr4: "Informar memorial de cálculo da caixa de recarga;",
  pr5: "Locar a caixa na planta de locação;",
  pr6: "De acordo com orientação da AMMA, não deverá ser representado detalhe (planta e corte) da caixa de recarga; informar no projeto somente o memorial de cálculo, a tabela de índices e a nota sobre a responsabilidade do profissional pela execução da caixa;",
  pr7: "Fechamento nas divisas frontais, laterais e fundo atendendo ao Art.81 da LC 364/23 (Inst. Normat. Nº4/24);",
  pr8: "Para que o projeto seja passível de aprovação por Alvará de Regularização, deverá:\n• Apresentar máximo de 7 pavimentos;\n• Atender à altura máxima de 21,00m;\n• Não obstruir/ocupar APM, APP ou logradouro público;",
  pr9: "Apresentar a planta de cobertura inserida no terreno e cotada;",
  pr10: `O lançamento de águas pluviais deve ser realizado internamente ao lote, caso não existam incluir calhas ou rufos na planta e "In loco" para resguardar a divisa lateral e o passeio público;`,
  pr11: "Apresentar planta de situação com a quadra completa; as dimensões/área do terreno devem estar de acordo com documento de propriedade do terreno; numerar os lotes, destacar o lote em questão com hachura e indicação do nome das vias conforme cadastro imobiliário;",
  pr12: "Representar os cortes devidamente cotados;",
  pr13: `Informar "Espaço não habitável" acima das lajes de cobertura, em todos os cortes;`,
  cal1: "Em Calçadas atender e informar: Os rebaixos do meio fio devem atender artigos 88 ao 92 do Código de Obras (LC 364/2023);",
  cal2: `Substituir texto referente à calçada por: "O passeio público atende à Lei Complementar n°324 de 28/11/2019"; Indicar texto nas divisas das calçadas: "não haverá desnível com a calçada do vizinho";`,
  cal3: `Indicar texto nas divisas das calçadas: "não haverá desnível com a calçada do vizinho";`,
  cal4: "Cotar largura da calçada de acordo com a consulta ao Cadastro de Logradouros;",
  cv1: `Para o imóvel situado lindeiro ao corredor viário:\n• Indicar área do corredor hachurada informando a metragem quadrada;\n• Indicar texto na faixa: "faixa reservada para futura expansão da via do sistema viário";`,
  cv2: `Indicar acima do carimbo:\n• "Faixa reservada para futura expansão da via do sistema viário de XXX,XX m²"\n• "O município poderá desapropriar a referida faixa para complementação do sistema no momento de sua implantação";`,
  cv3: "Verificar se o documento do Anexo Único da Instrução Normativa está anexado e assinado pelo proprietário. Art.5º parágrafo único;",
};

const A4_W = 11906;
const A4_H = 16838;
const MARGINS = { top: 1000, right: 1080, bottom: 900, left: 1080 };
const CONTENT_W = A4_W - MARGINS.left - MARGINS.right;

function getLogoData() {
  try { return fs.readFileSync(path.join(process.cwd(), "public", "logo_prefeitura.png")); }
  catch { return null; }
}

function txt(text: string, opts: any = {}) {
  return new TextRun({
    text: String(text ?? ""), font: "Arial", size: opts.size || 20,
    bold: opts.bold || false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    color: opts.color || "000000", italics: opts.italics || false,
  });
}

function p(children: any[], opts: any = {}) {
  return new Paragraph({
    alignment: opts.align !== undefined ? opts.align : AlignmentType.JUSTIFIED,
    spacing: { before: opts.before || 0, after: opts.after !== undefined ? opts.after : 120, line: 260 },
    indent: opts.indent ? { left: opts.indent, hanging: opts.hanging || 0 } : undefined,
    keepLines: true, keepNext: opts.keepNext || false, children,
  });
}

function vazio(after = 100) {
  return new Paragraph({ children: [txt("")], spacing: { before: 0, after } });
}

export type Assinante = { nome: string; matricula?: string; cargo?: string; registro?: string };

/**
 * Formata número como decimal brasileiro (vírgula, duas casas).
 * Aceita number ou string parseável. Retorna "" para nulo/vazio,
 * e devolve o input bruto quando não é número válido.
 */
export function formatarDecimal(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return String(valor);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formata número no padrão BR para inserção em documentos (.docx/.xlsx):
 * sempre 2 casas decimais, separador vírgula e SEM separador de milhares.
 * Use para áreas (m²), medidas (m) e volumes (m³).
 *
 * Aceita number ou string parseável. Retorna "" para nulo/vazio e
 * devolve o input bruto quando não é número válido — para nunca quebrar
 * a renderização do documento por causa de um dado mal-formatado.
 */
export function formatarBR(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n)) return String(valor);
  return n.toFixed(2).replace(".", ",");
}

function blocoAssinaturaAnalista(ass: Assinante): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 40 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
    indent: { left: 2400, right: 2400 },
    children: [txt(ass.nome, { bold: true })],
  }));
  if (ass.matricula) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [txt(`Matrícula: ${ass.matricula}`)],
    }));
  }
  if (ass.cargo) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [txt(ass.cargo)],
    }));
  }
  if (ass.registro) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 30 },
      children: [txt(ass.registro)],
    }));
  }
  return out;
}

function blocoLinhaEmBranco(label: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 40 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } },
      indent: { left: 2400, right: 2400 },
      children: [txt(`${label}: ___________`)],
    }),
  ];
}

function makeHeader(logoData: Buffer | null) {
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const borders = { top: nb, bottom: nb, left: nb, right: nb };
  const logoCell = logoData
    ? new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 200 }, children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: [new ImageRun({ data: logoData, transformation: { width: 240, height: 118 }, type: "png" })] })] })
    : new TableCell({ borders, width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph({ children: [txt("PREFEITURA DE GOIÂNIA", { bold: true })] })] });
  return new Header({ children: [
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [3600, CONTENT_W - 3600], borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb }, rows: [new TableRow({ children: [logoCell, new TableCell({ borders, width: { size: CONTENT_W - 3600, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 28 }, children: [txt("Secretaria Municipal de Planejamento Urbano e Habitação", { bold: true, underline: true, size: 17, color: "375623" })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 28 }, children: [txt("Superintendência da Ordem Pública", { bold: true, underline: true, size: 17, color: "375623" })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [txt("Diretoria de Análise e Aprovação de Projetos", { bold: true, underline: true, size: 17, color: "375623" })] }),
    ] })] })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "AAAAAA", space: 1 } }, spacing: { before: 80, after: 0 }, children: [txt("")] }),
  ] });
}

function makeFooter(label: string) {
  return new Footer({ children: [new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, spacing: { before: 60 }, tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }], children: [txt("Página ", { size: 17 }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 17 }), txt(" de ", { size: 17 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 17 }), txt(`\t${label}`, { size: 17 })] })] });
}

const GRUPOS_DESPACHO: { categoria: string; titulo: string }[] = [
  { categoria: "d",   titulo: "DOCUMENTAÇÃO" },
  { categoria: "c",   titulo: "CARIMBO" },
  { categoria: "p",   titulo: "PROJETO — CARIMBO" },
  { categoria: "pr",  titulo: "PROJETO — DESENHO" },
  { categoria: "cal", titulo: "CALÇADA" },
  { categoria: "cv",  titulo: "CORREDOR VIÁRIO" },
];

function categorizarItem(id: string): string {
  if (/^pr\d+$/i.test(id)) return "pr";
  if (/^cal\d+$/i.test(id)) return "cal";
  if (/^cv\d+$/i.test(id)) return "cv";
  if (/^d\d+$/i.test(id)) return "d";
  if (/^p\d+$/i.test(id)) return "p";
  if (/^c\d+$/i.test(id)) return "c";
  return "?";
}

function subtituloSecao(titulo: string) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 100, line: 260 },
    keepLines: true,
    keepNext: true,
    children: [txt(titulo, { bold: true, underline: true })],
  });
}

/**
 * Renderiza itens não conformes agrupados pelo `grupo` vindo do checklist.
 * Texto = exatamente `item.texto` (zero reescrita). Numeração contínua entre grupos.
 */
function gerarItensAgrupados(
  itens: { texto: string; grupo: string; ordem: number }[],
) {
  const out: Paragraph[] = [];
  if (!itens?.length) return out;

  // Agrupa preservando a ordem de primeira aparição de cada grupo.
  const ordemGrupos: string[] = [];
  const buckets: Record<string, { texto: string; ordem: number }[]> = {};
  itens.forEach((it) => {
    const g = (it.grupo || "OUTROS").toString();
    if (!buckets[g]) {
      buckets[g] = [];
      ordemGrupos.push(g);
    }
    buckets[g].push({ texto: it.texto, ordem: it.ordem });
  });

  let contador = 0;
  ordemGrupos.forEach((grupo) => {
    const lista = buckets[grupo].slice().sort((a, b) => a.ordem - b.ordem);
    if (!lista.length) return;

    out.push(subtituloSecao(grupo.toUpperCase()));

    lista.forEach((it) => {
      contador += 1;
      const texto = it.texto || "";
      if (!texto) return;
      const linhas = texto.split("\n");
      linhas.forEach((linha, i) => {
        const isPrimeira = i === 0;
        out.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: isPrimeira ? 120 : 0, after: 80, line: 260 },
          indent: isPrimeira ? { left: 640, hanging: 640 } : { left: 640 },
          keepLines: true,
          keepNext: i < linhas.length - 1,
          children: [txt(isPrimeira ? `${contador}.   ${linha}` : `    ${linha}`, { size: 20 })],
        }));
      });
    });
  });

  return out;
}

function gerarItens(ids: string[]) {
  const out: Paragraph[] = [];
  if (!ids?.length) return out;

  const buckets: Record<string, string[]> = {};
  ids.forEach((id) => {
    const cat = categorizarItem(id);
    (buckets[cat] ??= []).push(id);
  });

  let contador = 0;
  GRUPOS_DESPACHO.forEach((grupo) => {
    const itens = buckets[grupo.categoria];
    if (!itens?.length) return;

    out.push(subtituloSecao(grupo.titulo));

    itens.forEach((id) => {
      contador += 1;
      const texto = TEXTOS_DESPACHO[id] ?? id;
      if (!texto) return;
      const linhas = texto.split("\n");
      linhas.forEach((linha, i) => {
        const isPrimeira = i === 0;
        out.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: isPrimeira ? 120 : 0, after: 80, line: 260 },
          indent: isPrimeira ? { left: 640, hanging: 640 } : { left: 640 },
          keepLines: true,
          keepNext: i < linhas.length - 1,
          children: [txt(isPrimeira ? `${contador}.   ${linha}` : `    ${linha}`, { size: 20 })],
        }));
      });
    });
  });

  // Itens com prefixo não reconhecido — anexar ao final sem subtítulo, mantendo numeração contínua
  const desconhecidos = buckets["?"];
  if (desconhecidos?.length) {
    desconhecidos.forEach((id) => {
      contador += 1;
      const texto = TEXTOS_DESPACHO[id] ?? id;
      if (!texto) return;
      const linhas = texto.split("\n");
      linhas.forEach((linha, i) => {
        const isPrimeira = i === 0;
        out.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: isPrimeira ? 120 : 0, after: 80, line: 260 },
          indent: isPrimeira ? { left: 640, hanging: 640 } : { left: 640 },
          keepLines: true,
          keepNext: i < linhas.length - 1,
          children: [txt(isPrimeira ? `${contador}.   ${linha}` : `    ${linha}`, { size: 20 })],
        }));
      });
    });
  }

  return out;
}

// Helper para renderizar CAU/CREA do responsável técnico abaixo do "Interessado"
// quando ao menos um dos campos vier preenchido (item 3 Cowork).
function linhaResponsavelTecnico(resp?: { cau?: string | null; crea?: string | null }): Paragraph[] {
  if (!resp) return [];
  const cau = (resp.cau || "").trim();
  const crea = (resp.crea || "").trim();
  const cauValido = cau && cau.toUpperCase() !== "NP" && cau.toUpperCase() !== "CAU-NP";
  const creaValido = crea && crea.toUpperCase() !== "NP";
  if (!cauValido && !creaValido) return [];
  const partes: any[] = [txt("Responsável Técnico:  ", { bold: true })];
  if (cauValido) partes.push(txt(`CAU ${cau}`));
  if (cauValido && creaValido) partes.push(txt("  |  "));
  if (creaValido) partes.push(txt(`CREA ${crea}`));
  return [p(partes, { align: AlignmentType.LEFT, after: 80 })];
}

export async function gerarDespachoRegularizacao(dados: { processo: string; interessado: string; numeroProcessoFisico?: string; numeroDespacho: string; naoConformes: string[]; naoConformesAgrupados?: { texto: string; grupo: string; ordem: number }[]; observacoes: string; observacoesPorAba?: Record<string, string>; analises: { numero: number; data: string; ultima?: boolean }[]; analista?: string; crea?: string; setor?: string; assinante?: Assinante; gerente?: Assinante; diretora?: Assinante; responsavelTecnico?: { cau?: string | null; crea?: string | null }; }): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: dados.setor || "SEFIC / DIRAAP / GERAED",
    registro: dados.crea || "CREA 11716/D-GO",
  };
  const dataAssinatura = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const ano = new Date().getFullYear().toString();
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("SEI:  "), txt(dados.processo, { bold: true }), txt("    |    Processo Físico:  "), txt(dados.numeroProcessoFisico || "—", { bold: true })], { align: AlignmentType.LEFT, after: 60 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 60 }));
  linhaResponsavelTecnico(dados.responsavelTecnico).forEach(par => children.push(par));
  children.push(p([txt("Assunto:  "), txt("ALVARÁ DE REGULARIZAÇÃO", { bold: true })], { align: AlignmentType.LEFT, after: 180 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`DESPACHO Nº   ${dados.numeroDespacho || "___"}   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(new Paragraph({ spacing: { before: 0, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 1 } }, children: [txt("AO INTERESSADO/AUTOR", { bold: true })] }));
  children.push(new Paragraph({ spacing: { before: 100, after: 80 }, children: [txt("OBSERVAÇÕES:", { bold: true })] }));
  ["Análise de acordo com a LEI COMPLEMENTAR Nº 314, de 05/11/2018 que institui o Alvará de Regularização e INSTRUÇÃO NORMATIVA nº 04, de 16/05/2024 que regulamenta a LC nº 314;", "Texto da LC n°314/2018 alterado na LC n°368/2023;", "De acordo com o Decreto Nº 2559, DE 13 DE DEZEMBRO DE 2018, a análise documental foi feita pela CHEADV – CHEFIA DA ADVOCACIA SETORIAL DA SECRETARIA MUNICIPAL DE PLANEJAMENTO URBANO E HABITAÇÃO;"].forEach(b => {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 80, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt("• ", { bold: true }), txt(b)] }));
  });
  children.push(vazio(120));
  children.push(p([txt("A PARTIR DE 13/12/2018 ENTROU EM VIGOR O DECRETO N° 2559/2018, QUE DEFINE NOVOS PROCEDIMENTOS E AMPLIA AUTOMAÇÃO DE PROCESSOS DA ANÁLISE E APROVAÇÃO DE PROJETOS ARQUITETÔNICOS NO MUNICÍPIO DE GOIÂNIA. O MANUAL TAMBÉM DEFINE TODAS AS ETAPAS DE ANÁLISE. OS PROCESSOS AUTUADOS ANTERIORMENTE A ESSA DATA SERÃO ANALISADOS CONFORME AS NOVAS REGRAS VIGENTES.")], { after: 160 }));
  dados.analises.forEach((a, idx) => {
    const label = a.ultima ? `${a.numero}ª ANÁLISE (ÚLTIMA*) :       ${a.data}   – LIBERAÇÃO DE TAXA OU INDEFERIMENTO;` : `${a.numero}ª ANÁLISE:       ${a.data}`;
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 40, after: 40 }, indent: { left: 900 }, keepLines: true, keepNext: idx < dados.analises.length - 1, children: [txt(label, { bold: a.ultima })] }));
  });
  children.push(new Paragraph({ spacing: { before: 80, after: 160 }, indent: { left: 440 }, children: [txt("Observação: *Caso nesta etapa não seja liberada a taxa, o processo/projeto será indeferido.", { size: 18, italics: true })] }));
  children.push(p([txt(`a – Art. 1º §1º LC n°314/2018: "Entende-se por edificações estruturalmente definidas aquelas concluídas ou em fase de cobertura, com lajes ou telhados definitivos, OU ainda aquelas parcialmente concluídas, desde que os pavimentos para os quais se solicita a regularização estejam estruturalmente concluídos e ainda apresente estrutura, a alvenaria e o revestimento externo concluído."`)], { after: 140 }));
  children.push(p([txt("b – Sanar estas irregularidades no local, corrigindo os pontos citados pelo fiscal. Após correção desses itens, o interessado deverá solicitar nova vistoria fiscal, sujeita a nova taxa;")], { after: 80 }));
  if (dados.naoConformesAgrupados && dados.naoConformesAgrupados.length > 0) {
    gerarItensAgrupados(dados.naoConformesAgrupados).forEach(item => children.push(item));
  } else {
    gerarItens(dados.naoConformes).forEach(item => children.push(item));
  }
  if (dados.observacoes) { children.push(vazio(100)); children.push(p([txt("Observações gerais: ", { bold: true }), txt(dados.observacoes)])); }
  if (dados.observacoesPorAba && Object.keys(dados.observacoesPorAba).length > 0) {
    children.push(vazio(100));
    children.push(p([txt("Observações por seção:", { bold: true, underline: {} })]));
    Object.entries(dados.observacoesPorAba).forEach(([aba, obs]) => {
      if (obs && obs.trim()) {
        children.push(p([txt(`${aba}: `, { bold: true }), txt(obs)]));
      }
    });
  }
  children.push(vazio(160));
  children.push(new Paragraph({ spacing: { before: 200, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, children: [txt("CONSIDERAÇÕES FINAIS", { bold: true, underline: true })] }));
  ["AS CÓPIAS DE ARQUIVO NÃO PODEM SER RETIRADAS DO PROCESSO;", "É FACULTADO AO ANALISTA/REVISOR O DIREITO DE SOLICITAR DOCUMENTAÇÃO, CORREÇÕES E ADEQUAÇÕES SEMPRE QUE NECESSÁRIO, ANTES DO DEFERIMENTO DO PROCESSO, CONFORME LEGISLAÇÃO MUNICIPAL VIGENTE."].forEach(item => {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 60, after: 80, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt("• ", { bold: true }), txt(item)] }));
  });
  children.push(vazio(300));
  blocoAssinaturaAnalista(assinante).forEach(par => children.push(par));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 0 }, children: [txt(dataAssinatura)] }));

  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } }, headers: { default: makeHeader(logoData) }, footers: { default: makeFooter("Despacho Regularização") }, children }] });
  return await Packer.toBuffer(doc) as Buffer;
}

export async function gerarDespachoAceite(dados: { processo: string; interessado: string; numeroProcessoFisico?: string; numeroDespacho: string; naoConformes: string[]; naoConformesAgrupados?: { texto: string; grupo: string; ordem: number }[]; observacoes: string; observacoesPorAba?: Record<string, string>; analises: { numero: number; data: string; ultima?: boolean }[]; analista?: string; crea?: string; setor?: string; assinante?: Assinante; gerente?: Assinante; diretora?: Assinante; responsavelTecnico?: { cau?: string | null; crea?: string | null }; }): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: dados.setor || "SEFIC / DIRAAP / GERAED",
    registro: dados.crea || "CREA 11716/D-GO",
  };
  const dataAssinatura = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const ano = new Date().getFullYear().toString();
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("SEI:  "), txt(dados.processo, { bold: true }), txt("    |    Processo Físico:  "), txt(dados.numeroProcessoFisico || "—", { bold: true })], { align: AlignmentType.LEFT, after: 60 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 60 }));
  linhaResponsavelTecnico(dados.responsavelTecnico).forEach(par => children.push(par));
  // Cabeçalho do ACEITE: difere do despacho de Regularização.
  children.push(p([txt("Assunto:  "), txt("ANÁLISE DE ACEITE", { bold: true })], { align: AlignmentType.LEFT, after: 180 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`DESPACHO Nº   ${dados.numeroDespacho || "___"}   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(new Paragraph({ spacing: { before: 0, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 1 } }, children: [txt("AO INTERESSADO/AUTOR", { bold: true })] }));
  children.push(new Paragraph({ spacing: { before: 100, after: 80 }, children: [txt("OBSERVAÇÕES:", { bold: true })] }));
  ["Análise de Aceite com base na legislação municipal vigente para fins de aprovação de projeto/edificação.", "De acordo com o Decreto Nº 2559, DE 13 DE DEZEMBRO DE 2018, a análise documental foi feita pela CHEADV – CHEFIA DA ADVOCACIA SETORIAL DA SECRETARIA MUNICIPAL DE PLANEJAMENTO URBANO E HABITAÇÃO;"].forEach(b => {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 80, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt("• ", { bold: true }), txt(b)] }));
  });
  children.push(vazio(120));
  dados.analises.forEach((a, idx) => {
    const label = a.ultima ? `${a.numero}ª ANÁLISE (ÚLTIMA*) :       ${a.data}   – LIBERAÇÃO DE TAXA OU INDEFERIMENTO;` : `${a.numero}ª ANÁLISE:       ${a.data}`;
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 40, after: 40 }, indent: { left: 900 }, keepLines: true, keepNext: idx < dados.analises.length - 1, children: [txt(label, { bold: a.ultima })] }));
  });
  children.push(new Paragraph({ spacing: { before: 80, after: 160 }, indent: { left: 440 }, children: [txt("Observação: *Caso nesta etapa não seja liberada a taxa, o processo/projeto será indeferido.", { size: 18, italics: true })] }));
  if (dados.naoConformesAgrupados && dados.naoConformesAgrupados.length > 0) {
    gerarItensAgrupados(dados.naoConformesAgrupados).forEach(item => children.push(item));
  } else {
    gerarItens(dados.naoConformes).forEach(item => children.push(item));
  }
  if (dados.observacoes) { children.push(vazio(100)); children.push(p([txt("Observações gerais: ", { bold: true }), txt(dados.observacoes)])); }
  if (dados.observacoesPorAba && Object.keys(dados.observacoesPorAba).length > 0) {
    children.push(vazio(100));
    children.push(p([txt("Observações por seção:", { bold: true, underline: {} })]));
    Object.entries(dados.observacoesPorAba).forEach(([aba, obs]) => {
      if (obs && obs.trim()) {
        children.push(p([txt(`${aba}: `, { bold: true }), txt(obs)]));
      }
    });
  }
  children.push(vazio(160));
  children.push(new Paragraph({ spacing: { before: 200, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, children: [txt("CONSIDERAÇÕES FINAIS", { bold: true, underline: true })] }));
  ["AS CÓPIAS DE ARQUIVO NÃO PODEM SER RETIRADAS DO PROCESSO;", "É FACULTADO AO ANALISTA/REVISOR O DIREITO DE SOLICITAR DOCUMENTAÇÃO, CORREÇÕES E ADEQUAÇÕES SEMPRE QUE NECESSÁRIO, ANTES DO DEFERIMENTO DO PROCESSO, CONFORME LEGISLAÇÃO MUNICIPAL VIGENTE."].forEach(item => {
    children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 60, after: 80, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt("• ", { bold: true }), txt(item)] }));
  });
  children.push(vazio(300));
  blocoAssinaturaAnalista(assinante).forEach(par => children.push(par));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 0 }, children: [txt(dataAssinatura)] }));

  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } }, headers: { default: makeHeader(logoData) }, footers: { default: makeFooter("Despacho Aceite") }, children }] });
  return await Packer.toBuffer(doc) as Buffer;
}

export async function gerarIndeferimento(dados: { processo: string; interessado: string; analises: { numero: number; data: string; despacho?: string }[]; naoConformes?: string[]; observacoes?: string; endereco?: string; analista?: string; crea?: string; setor?: string; assinante?: Assinante; gerente?: Assinante; diretora?: Assinante; }): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: "Análise e Licenciamento de Edificações",
    registro: dados.crea || "CREA 11716/D-GO",
  };
  const dataGoiania = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const ano = new Date().getFullYear().toString();
  const CW = A4_W - MARGINS.left - MARGINS.right;
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const half = Math.floor(CW / 2);
  const quart = Math.floor(CW / 4);
  const brd = { top: nb, bottom: nb, left: nb, right: nb };
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt("APROVAÇÃO DE PROJETO", { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`PARECER Nº   ___   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(p([txt("AO INTERESSADO/AUTOR")], { align: AlignmentType.LEFT, after: 120 }));
  children.push(p([txt("Versam os autos sobre a solicitação de "), txt("APROVAÇÃO DE PROJETO", { bold: true }), txt(`, para o imóvel situado à `), txt(dados.endereco || dados.processo, { bold: true }), txt(". O processo obteve as seguintes análises:")], { after: 100 }));
  dados.analises.filter(a => a.data && a.data !== "NP").forEach((a, i, arr) => {
    const ordinal = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"][a.numero - 1] || `${a.numero}ª`;
    children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 0, after: 50, line: 240 }, indent: { left: 440, hanging: 280 }, keepLines: true, keepNext: i < arr.length - 1, children: [txt("• ", { bold: true }), txt(`${ordinal} análise: `, { bold: true }), txt(`realizada em ${a.data}`), txt(a.despacho ? `, por meio do Despacho nº ${a.despacho}.` : ".")] }));
  });
  children.push(vazio(140));
  children.push(p([txt("O Decreto n° 2.559, de 13 de dezembro de 2018, que revogou o Decreto nº 546, de 27 de fevereiro de 2015, define procedimentos administrativos para análise e aprovação de projetos arquitetônicos e licença no âmbito municipal. Por não cumprimento ao exigido nos despachos anteriormente listados, essa Diretoria de Análise e Aprovação de Projetos "), txt("INDEFERE", { bold: true }), txt(" o prosseguimento dos autos, nos termos do Artigo 8º, §4º, Inciso II do Decreto nº. 2.559/2018.")], { after: 120 }));
  if (dados.naoConformes?.length) {
    children.push(vazio(80));
    children.push(p([txt("Motivos do indeferimento:", { bold: true })], { after: 60 }));
    dados.naoConformes.forEach((motivo, idx) => {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 0, after: 60, line: 260 }, indent: { left: 440, hanging: 280 }, keepLines: true, children: [txt(`${idx + 1}.  ${motivo}`, { size: 20 })] }));
    });
    children.push(vazio(80));
  }
  if (dados.observacoes) {
    children.push(p([txt("Observações: ", { bold: true }), txt(dados.observacoes)], { after: 100 }));
  }
  children.push(p([txt("Informamos que o interessado/autor poderá apresentar recurso ou justificativa em até "), txt("15 (quinze) dias", { bold: true }), txt(", contados a partir da publicação deste parecer, conforme previsto no Artigo 9º do Decreto nº. 2.559/2018. Em caso de recurso julgado improcedente, deverá ser solicitada a abertura de novo processo.")], { after: 160 }));
  children.push(p([txt("Sem nada mais no momento.")], { align: AlignmentType.LEFT, after: 60 }));
  children.push(vazio(200));

  blocoAssinaturaAnalista(assinante).forEach(par => children.push(par));
  if (dados.gerente) { blocoAssinaturaAnalista(dados.gerente).forEach(par => children.push(par)); }
  else { blocoLinhaEmBranco("Gerente").forEach(par => children.push(par)); }
  if (dados.diretora) { blocoAssinaturaAnalista(dados.diretora).forEach(par => children.push(par)); }
  else { blocoLinhaEmBranco("Diretor").forEach(par => children.push(par)); }
  children.push(vazio(120));
  children.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [half, half], borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb }, rows: [new TableRow({ children: [new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [txt(`Goiânia, ${dataGoiania}`)] })] }), new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("SEFIC / DIRAAP / GERAED")] })] })] })] }) as any);

  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } }, headers: { default: makeHeader(logoData) }, footers: { default: makeFooter("Indeferimento") }, children }] });
  return await Packer.toBuffer(doc) as Buffer;
}

export async function gerarArquivamento(dados: { processo: string; interessado: string; analista?: string; crea?: string; assinante?: Assinante; gerente?: Assinante; diretora?: Assinante; }): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || {
    nome: dados.analista || "Engº Fábio Parente Martins Santos",
    cargo: "Análise e Licenciamento de Edificações",
    registro: dados.crea || "CREA 11716/D-GO",
  };
  const dataGoiania = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const ano = new Date().getFullYear().toString();
  const CW = A4_W - MARGINS.left - MARGINS.right;
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const half = Math.floor(CW / 2);
  const quart = Math.floor(CW / 4);
  const brd = { top: nb, bottom: nb, left: nb, right: nb };
  const children: Paragraph[] = [];

  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt("APROVAÇÃO DE PROJETO", { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`PARECER Nº   ___   |   ${ano}`, { bold: true, size: 22 })] }));
  children.push(p([txt("AO ARQUIVO")], { align: AlignmentType.LEFT, after: 160 }));
  children.push(p([txt("Conforme o Decreto n° 2.559, de 13 de dezembro de 2018, que revogou o Decreto nº. 546, de 27 de fevereiro de 2015, definem procedimentos administrativos para análise e aprovação de projetos arquitetônicos e licença no âmbito municipal, e por não cumprimento ao exigido nos despachos anteriormente listados, esta Diretoria comunica o "), txt("ARQUIVAMENTO DO PROCESSO", { bold: true }), txt(", nos termos do Art. 4, Inciso 4.5 e seguintes do Decreto citado, tendo sido o pedido de reconsideração "), txt("INDEFERIDO", { bold: true }), txt(" pela instância competente e exigirá para expectativa de futura aprovação a abertura de "), txt("NOVO PROCESSO", { bold: true }), txt(", mediante o pagamento das respectivas taxas.")], { after: 240 }));
  children.push(p([txt("Sem nada mais no momento.")], { align: AlignmentType.LEFT, after: 60 }));
  children.push(vazio(200));

  blocoAssinaturaAnalista(assinante).forEach(par => children.push(par));
  if (dados.gerente) { blocoAssinaturaAnalista(dados.gerente).forEach(par => children.push(par)); }
  else { blocoLinhaEmBranco("Gerente").forEach(par => children.push(par)); }
  if (dados.diretora) { blocoAssinaturaAnalista(dados.diretora).forEach(par => children.push(par)); }
  else { blocoLinhaEmBranco("Diretor").forEach(par => children.push(par)); }
  children.push(vazio(120));
  children.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [half, half], borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb }, rows: [new TableRow({ children: [new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [txt(`Goiânia, ${dataGoiania}`)] })] }), new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("SEFIC / DIRAAP / GERAED")] })] })] })] }) as any);

  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } }, headers: { default: makeHeader(logoData) }, footers: { default: makeFooter("Arquivamento") }, children }] });
  return await Packer.toBuffer(doc) as Buffer;
}

export async function gerarDespachoInterno(dados: {
  processo: string; interessado: string; numeroDespacho: string;
  data: string; tipoProcesso: string; destino: string; corpo: string;
  assinante?: Assinante;
}): Promise<Buffer> {
  const logoData = getLogoData();
  const assinante: Assinante = dados.assinante || { nome: "Analista", cargo: "Analista de Obras e Urbanismo" };
  const CW = A4_W - MARGINS.left - MARGINS.right;
  const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const brd = { top: nb, bottom: nb, left: nb, right: nb };
  const half = Math.floor(CW / 2);
  const children: Paragraph[] = [];
  children.push(vazio(160));
  children.push(p([txt("Processo / Projeto:  "), txt(dados.processo, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Interessado:  "), txt(dados.interessado, { bold: true })], { align: AlignmentType.LEFT, after: 80 }));
  children.push(p([txt("Assunto:  "), txt(dados.tipoProcesso, { bold: true })], { align: AlignmentType.LEFT, after: 200 }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [txt(`DESPACHO INTERNO Nº ${dados.numeroDespacho}`, { bold: true, size: 22 })] }));
  children.push(p([txt(`À ${dados.destino}`)], { align: AlignmentType.LEFT, after: 160 }));
  dados.corpo.split("\n").forEach((linha: string) => {
    children.push(p([txt(linha || " ")], { after: 80 }));
  });
  children.push(vazio(200));
  blocoAssinaturaAnalista(assinante).forEach(par => children.push(par));
  children.push(vazio(120));
  children.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [half, half], borders: { top: nb, bottom: nb, left: nb, right: nb, insideHorizontal: nb, insideVertical: nb }, rows: [new TableRow({ children: [new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [txt(`Goiânia, ${dados.data}`)] })] }), new TableCell({ borders: brd, width: { size: half, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txt("SEFIC / DIRAAP")] })] })] })] }) as any);
  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { size: { width: A4_W, height: A4_H }, margin: MARGINS } }, headers: { default: makeHeader(logoData) }, footers: { default: makeFooter("Despacho Interno") }, children }] });
  return await Packer.toBuffer(doc) as Buffer;
}
