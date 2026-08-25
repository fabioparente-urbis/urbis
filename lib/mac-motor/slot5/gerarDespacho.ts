/**
 * lib/mac-motor/slot5/gerarDespacho.ts — Despacho ao Interessado do Slot 5 (Aprovação de Projeto).
 *
 * NÃO desenha o documento do zero. Parte de `public/templates/despacho-slot5-base.docx`, que é o
 * próprio "Despacho Geral - Aprovacao.docx" do Fábio com o miolo recortado (ver
 * scripts/montar-template-despacho.py). Assim o despacho emitido sai visualmente igual ao modelo
 * oficial — mesma fonte, mesmos estilos, mesma numeração automática das exigências — com duas
 * correções feitas por cima do template (o arquivo original, herdado de outra pessoa, não tinha
 * nem uma nem outra): a logo do Slot 1 (`public/logo_prefeitura.png`, a do template original nunca
 * apareceu nem nele) e a numeração de página "X/Y" no rodapé (campos `PAGE`/`NUMPAGES`).
 *
 * O que muda por processo:
 *   · cabeçalho: OS / PROJETO Nº / INTERESSADO / ASSUNTO / DESPACHO Nº — tudo vindo do LIP;
 *   · tabela "Controle de Etapas": a data de CADA análise (1ª + 4 reanálises). A data da 1ª nunca
 *     é sobrescrita quando a 2ª é emitida — é histórico, mesma regra do Slot 1/2;
 *   · o miolo: as exigências, que são exatamente os itens marcados NÃO CONFORME no MAC,
 *     agrupados pelo grupo do checklist (o mesmo texto de `mac_checklist_itens.texto`);
 *   · a data por extenso e a assinatura do analista logado no URBIS.
 *
 * Isolado do Slot 1: não importa nada de lib/geradores.ts nem das rotas de despacho da
 * Regularização/Aceite. A ÚNICA coisa compartilhada é a numeração (/api/numeracao/proximo), por
 * decisão explícita do Fábio: todos os slots consomem a mesma série de despachos e pareceres,
 * com as mesmas regras.
 */

import JSZip from "jszip";
import fs from "fs/promises";
import path from "path";

export type ItemNaoConforme = {
  texto: string; grupo: string; ordem: number;
  /** Observação que o analista escreveu NESTE item. Sai logo abaixo da exigência, recuada — é
   * o complemento dele para aquele item, não uma exigência nova, então não consome número. */
  observacao?: string | null;
};

export type DadosDespacho = {
  codigo: string;
  numeroProcessoFisico: string;
  interessado: string;
  assunto: string;
  numeroDespacho: string;
  /** dd/mm/aaaa — data de emissão escolhida no modal, não a data em que o arquivo foi gerado. */
  dataEmissao: string;
  cheadvN?: string | null;
  naoConformes: ItemNaoConforme[];
  /** Uma posição por etapa (1ª análise, reanálises 1-4). `null` = etapa ainda não emitida. */
  datasEtapas: (string | null)[];
  assinante: { nome: string; cargo?: string | null; registro?: string | null };
};

const CAMINHO_TEMPLATE = path.join(process.cwd(), "public", "templates", "despacho-slot5-base.docx");

/** `&`, `<` e `>` em texto de exigência quebram o XML do documento. */
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Parágrafo de título de grupo — estilo `CitaoIntensa`, o mesmo dos títulos de seção do modelo. */
function paragrafoGrupo(titulo: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="CitaoIntensa"/><w:spacing w:before="240" w:after="0"/>`
    + `<w:ind w:left="0" w:right="0"/><w:jc w:val="both"/></w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:cstheme="minorHAnsi"/><w:i w:val="0"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(titulo)}</w:t></w:r></w:p>`;
}

/** Exigência — estilo `Lista` com a numeração automática `numId=6`, a mesma lista 1..N do modelo.
 * O número não é escrito no texto: quem numera é o Word, então a sequência sai contínua entre os
 * grupos sem o gerador ter que contar. */
function paragrafoItem(texto: string, observacao?: string | null): string {
  const linhas = String(texto ?? "").split("\n").filter((l) => l.trim() !== "");
  if (!linhas.length) return "";
  const linhasObs = String(observacao ?? "").trim()
    ? String(observacao).trim().split("\n").filter((l) => l.trim() !== "")
    : [];
  // Um item inteiro (exigência + continuações + observação) não pode ficar partido entre duas
  // páginas — metade numa folha, metade na outra. `keepNext` em todo parágrafo do item, exceto o
  // último, gruda todos eles: se não couber inteiro no que resta da página, o Word empurra o bloco
  // todo pra próxima. `keepLines` evita órfã/viúva dentro de um parágrafo que quebre em mais de
  // uma linha visual.
  const totalParagrafos = linhas.length + linhasObs.length;
  let indice = 0;
  const keep = () => { indice++; return indice < totalParagrafos ? `<w:keepNext/><w:keepLines/>` : `<w:keepLines/>`; };

  const rPr = `<w:rPr><w:rFonts w:eastAsia="Batang" w:cstheme="minorHAnsi"/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;
  // `keepNext`/`keepLines` têm posição fixa no schema: logo após `pStyle`, antes de `numPr`.
  const pPrNumerado = (k: string) => `<w:pPr><w:pStyle w:val="Lista"/>${k}<w:numPr><w:ilvl w:val="0"/><w:numId w:val="6"/></w:numPr>`
    + `<w:suppressAutoHyphens w:val="0"/><w:spacing w:before="120" w:after="0"/>`
    + `<w:ind w:left="0" w:hanging="357"/><w:jc w:val="both"/>`
    + `<w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorHAnsi"/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`;
  // Continuação de um item com quebra de linha: mesma margem, sem consumir outro número da lista.
  const pPrContinuacao = (k: string) => `<w:pPr><w:pStyle w:val="Lista"/>${k}<w:suppressAutoHyphens w:val="0"/>`
    + `<w:spacing w:before="0" w:after="0"/><w:ind w:left="357"/><w:jc w:val="both"/></w:pPr>`;

  let saida = linhas.map((linha, i) =>
    `<w:p>${i === 0 ? pPrNumerado(keep()) : pPrContinuacao(keep())}<w:r>${rPr}<w:t xml:space="preserve">${esc(linha.trim())}</w:t></w:r></w:p>`,
  ).join("");

  // Observação do analista: entra LOGO ABAIXO da exigência, recuada e em itálico, fora da lista
  // numerada — é complemento daquele item, não uma exigência a mais.
  if (linhasObs.length) {
    const rPrObs = `<w:rPr><w:rFonts w:eastAsia="Batang" w:cstheme="minorHAnsi"/><w:i/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>`;
    const pPrObs = (k: string) => `<w:pPr><w:pStyle w:val="Lista"/>${k}<w:suppressAutoHyphens w:val="0"/>`
      + `<w:spacing w:before="40" w:after="0"/><w:ind w:left="640"/><w:jc w:val="both"/></w:pPr>`;
    saida += linhasObs.map((linha, i) =>
      `<w:p>${pPrObs(keep())}<w:r>${rPrObs}<w:t xml:space="preserve">${esc(i === 0 ? `Obs.: ${linha.trim()}` : linha.trim())}</w:t></w:r></w:p>`,
    ).join("");
  }
  return saida;
}

function paragrafoSimples(texto: string, opts: { negrito?: boolean; centralizado?: boolean; antes?: number } = {}): string {
  const jc = opts.centralizado ? `<w:jc w:val="center"/>` : `<w:jc w:val="both"/>`;
  const b = opts.negrito ? "<w:b/>" : "";
  return `<w:p><w:pPr><w:pStyle w:val="Corpodetexto"/>`
    + `<w:spacing w:before="${opts.antes ?? 0}" w:after="0" w:line="240" w:lineRule="auto"/>${jc}</w:pPr>`
    + `<w:r><w:rPr><w:rFonts w:eastAsia="Batang" w:cs="Arial"/>${b}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
    + `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

/** Monta as exigências agrupadas. Grupos na ordem em que aparecem no checklist; dentro de cada
 * grupo, na ordem do próprio checklist. */
function montarExigencias(itens: ItemNaoConforme[]): string {
  if (!itens.length) {
    return paragrafoSimples(
      "Não foram identificadas exigências nesta análise.", { antes: 120 },
    );
  }
  const ordemGrupos: string[] = [];
  const buckets: Record<string, ItemNaoConforme[]> = {};
  for (const it of itens) {
    const g = it.grupo || "OUTROS";
    if (!buckets[g]) { buckets[g] = []; ordemGrupos.push(g); }
    buckets[g].push(it);
  }
  return ordemGrupos.map((g) =>
    paragrafoGrupo(g)
    + buckets[g].sort((a, b) => a.ordem - b.ordem)
      .map((it) => paragrafoItem(it.texto, it.observacao)).join(""),
  ).join("");
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Só o miolo ("26 de maio de 2026"): no modelo o "Goiânia, " e o "." são runs separados. */
function dataPorExtenso(dataBR: string): string {
  const m = String(dataBR ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return String(dataBR ?? "");
  return `${Number(m[1])} de ${MESES[Number(m[2]) - 1] ?? m[2]} de ${m[3]}`;
}

/** Troca o texto de um `<w:t>` cujo conteúdo atual seja exatamente `de`. Os campos do modelo estão
 * cada um em seu próprio run, então a troca é pontual e não desmonta a formatação. */
function trocarTexto(xml: string, de: string, para: string): string {
  const alvo = `>${esc(de)}<`;
  const i = xml.indexOf(alvo);
  if (i === -1) return xml;
  return xml.slice(0, i) + `>${esc(para)}<` + xml.slice(i + alvo.length);
}

let logoCache: Buffer | null | undefined;
/** A logo do Slot 1 (`public/logo_prefeitura.png`) — mesma imagem, mesmo arquivo. O template do
 * Slot 5 trouxe sua própria logo embutida como imagem FLUTUANTE (anchor, atrás do texto), herdada
 * do "Despacho Geral - Aprovacao.docx" original — mas o Fábio confirmou que ELE TAMBÉM não mostra a
 * logo ao abrir puro no Word, então o defeito é do arquivo-fonte, não desta geração. Em vez de
 * tentar consertar um posicionamento flutuante que não dá pra renderizar aqui pra conferir, a logo
 * do Slot 1 é inserida do zero, do jeito que já se sabe que funciona: imagem INLINE (corre no
 * texto, sem posição/z-order ambígua), a exemplo de `lib/geradores.ts`. */
async function logoPrefeitura(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;
  try { logoCache = await fs.readFile(path.join(process.cwd(), "public", "logo_prefeitura.png")); }
  catch { logoCache = null; }
  return logoCache;
}

/** Substitui o parágrafo que hoje só contém a imagem flutuante quebrada por um parágrafo novo,
 * alinhado à esquerda (mesmo lado da logo no Slot 1), com a logo do Slot 1 inline. Não mexe em
 * mais nada do cabeçalho — se não achar `<w:drawing>`, não faz nada. */
function trocarLogoPorInline(h: string, rId: string): string {
  const idxDrawing = h.indexOf("<w:drawing>");
  if (idxDrawing === -1) return h;
  const idxPStart = Math.max(h.lastIndexOf("<w:p ", idxDrawing), h.lastIndexOf("<w:p>", idxDrawing));
  const fimTag = h.indexOf("</w:p>", idxDrawing);
  const idxPEnd = fimTag === -1 ? -1 : fimTag + "</w:p>".length;
  if (idxPStart === -1 || idxPEnd === -1) return h;

  const LARGURA = 2286000; // 240px a 9525 EMU/px — mesma proporção do Slot 1 (lib/geradores.ts)
  const ALTURA = 1123950; // 118px
  const novoParagrafo =
    `<w:p><w:pPr><w:pStyle w:val="Cabealho"/><w:jc w:val="left"/></w:pPr>`
    + `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${LARGURA}" cy="${ALTURA}"/>`
    + `<wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="9001" name="LogoSlot5"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:nvPicPr><pic:cNvPr id="9001" name="LogoSlot5"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LARGURA}" cy="${ALTURA}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  return h.slice(0, idxPStart) + novoParagrafo + h.slice(idxPEnd);
}

/** Troca a n-ésima ocorrência de `__/__/____` (as 5 linhas da tabela de Controle de Etapas). */
function trocarDatasEtapas(xml: string, datas: (string | null)[]): string {
  let saida = "";
  let resto = xml;
  for (let i = 0; i < 5; i++) {
    const pos = resto.indexOf("__/__/____");
    if (pos === -1) break;
    const data = datas[i];
    saida += resto.slice(0, pos) + (data ?? "__/__/____");
    resto = resto.slice(pos + "__/__/____".length);
  }
  return saida + resto;
}

export async function gerarDespachoAprovacaoProjeto(dados: DadosDespacho): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await fs.readFile(CAMINHO_TEMPLATE));

  // ── Cabeçalho (repete em toda página): vem do LIP ─────────────────────────
  const logo = await logoPrefeitura();
  for (const nome of Object.keys(zip.files).filter((n) => /^word\/header\d+\.xml$/.test(n))) {
    let h = await zip.file(nome)!.async("string");
    if (!h.includes("DESPACHO Nº")) continue;
    h = trocarTexto(h, "OS ______ / PROJETO Nº _____",
      `OS ${dados.numeroProcessoFisico || "______"} / PROJETO Nº ${dados.codigo}`);
    h = trocarTexto(h, "INTERESSADO: _____", `INTERESSADO: ${dados.interessado}`);
    h = trocarTexto(h, "ASSUNTO: ________", `ASSUNTO: ${dados.assunto}`);
    h = trocarTexto(h, "DESPACHO Nº ____ | 2026",
      `DESPACHO Nº ${dados.numeroDespacho} | ${dados.dataEmissao.slice(-4)}`);

    if (logo) {
      const RID_LOGO = "rIdLogoSlot5";
      zip.file("word/media/logoSlot5Aprovacao.png", logo);
      const relsPath = nome.replace("word/", "word/_rels/") + ".rels";
      let rels = (await zip.file(relsPath)?.async("string"))
        ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
      if (!rels.includes(RID_LOGO)) {
        rels = rels.replace("</Relationships>",
          `<Relationship Id="${RID_LOGO}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logoSlot5Aprovacao.png"/></Relationships>`);
      }
      zip.file(relsPath, rels);
      h = trocarLogoPorInline(h, RID_LOGO);
    }

    zip.file(nome, h);
  }

  // ── Rodapé: numeração de página compacta "X/Y" (o template não trazia nenhuma) ─
  for (const nome of Object.keys(zip.files).filter((n) => /^word\/footer\d+\.xml$/.test(n))) {
    let f = await zip.file(nome)!.async("string");
    if (!f.includes("diraap.goiania@gmail.com")) continue;
    const rPr = `<w:rPr><w:b/><w:bCs/><w:color w:val="999999"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>`;
    const numeroPagina =
      `<w:p><w:pPr><w:pStyle w:val="Rodap"/><w:jc w:val="right"/></w:pPr>`
      + `<w:fldSimple w:instr=" PAGE "><w:r>${rPr}<w:t>1</w:t></w:r></w:fldSimple>`
      + `<w:r>${rPr}<w:t>/</w:t></w:r>`
      + `<w:fldSimple w:instr=" NUMPAGES "><w:r>${rPr}<w:t>1</w:t></w:r></w:fldSimple>`
      + `</w:p>`;
    f = f.replace("</w:ftr>", numeroPagina + "</w:ftr>");
    zip.file(nome, f);
  }

  // ── Corpo ─────────────────────────────────────────────────────────────────
  let doc = await zip.file("word/document.xml")!.async("string");

  doc = trocarDatasEtapas(doc, dados.datasEtapas);

  // O número da CHEADV mora num run só (" ____/2025"), separado do "Nº" que vem antes — por isso
  // a troca mira esse run, não a frase inteira. O valor do LIP já traz o ano ("1.577 / 2026").
  if (dados.cheadvN?.trim()) {
    const cheadv = dados.cheadvN.trim().replace(/\s*\/\s*/g, "/");
    doc = trocarTexto(doc, " ____/2025", ` ${cheadv}`);
  }

  // As exigências entram entre o parágrafo da CHEADV e "CONSIDERAÇÕES FINAIS". A âncora é o
  // sombreado DEE6EF do título — é o único no documento e não depende de contar parágrafos.
  const marcaShd = `<w:shd w:val="clear" w:color="auto" w:fill="DEE6EF"/>`;
  let posShd = doc.indexOf(marcaShd);
  if (posShd === -1) posShd = doc.indexOf(marcaShd.replace("/>", " />"));
  if (posShd === -1) throw new Error("template do despacho: âncora de CONSIDERAÇÕES FINAIS não encontrada");
  const inicioParagrafo = doc.lastIndexOf("<w:p ", posShd) === -1
    ? doc.lastIndexOf("<w:p>", posShd)
    : Math.max(doc.lastIndexOf("<w:p ", posShd), doc.lastIndexOf("<w:p>", posShd));
  if (inicioParagrafo === -1) throw new Error("template do despacho: início do parágrafo de CONSIDERAÇÕES FINAIS não encontrado");

  doc = doc.slice(0, inicioParagrafo) + montarExigencias(dados.naoConformes) + doc.slice(inicioParagrafo);

  // ── Data e assinatura ─────────────────────────────────────────────────────
  doc = trocarTexto(doc, "26 de maio de 2026", dataPorExtenso(dados.dataEmissao));

  const assinatura =
    paragrafoSimples("", { antes: 400 })
    + paragrafoSimples(dados.assinante.nome, { negrito: true, centralizado: true })
    + (dados.assinante.cargo ? paragrafoSimples(dados.assinante.cargo, { centralizado: true }) : "")
    + (dados.assinante.registro ? paragrafoSimples(dados.assinante.registro, { centralizado: true }) : "");
  const fimBody = doc.lastIndexOf("<w:sectPr");
  const inicioSectPr = fimBody === -1 ? doc.lastIndexOf("</w:body>") : fimBody;
  doc = doc.slice(0, inicioSectPr) + assinatura + doc.slice(inicioSectPr);

  zip.file("word/document.xml", doc);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
