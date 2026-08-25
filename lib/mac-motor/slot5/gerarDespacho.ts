/**
 * lib/mac-motor/slot5/gerarDespacho.ts — Despacho ao Interessado do Slot 5 (Aprovação de Projeto).
 *
 * NÃO desenha o documento do zero. Parte de `public/templates/despacho-slot5-base.docx`, que é o
 * próprio "Despacho Geral - Aprovacao.docx" do Fábio com o miolo recortado (ver
 * scripts/montar-template-despacho.py). Assim o despacho emitido sai visualmente IDÊNTICO ao
 * modelo oficial — mesma fonte, mesmos estilos, mesmo cabeçalho com logo, mesmo rodapé, mesma
 * numeração automática — porque é literalmente o mesmo arquivo.
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
  const rPr = `<w:rPr><w:rFonts w:eastAsia="Batang" w:cstheme="minorHAnsi"/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;
  const pPrNumerado = `<w:pPr><w:pStyle w:val="Lista"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="6"/></w:numPr>`
    + `<w:suppressAutoHyphens w:val="0"/><w:spacing w:before="120" w:after="0"/>`
    + `<w:ind w:left="0" w:hanging="357"/><w:jc w:val="both"/>`
    + `<w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorHAnsi"/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`;
  // Continuação de um item com quebra de linha: mesma margem, sem consumir outro número da lista.
  const pPrContinuacao = `<w:pPr><w:pStyle w:val="Lista"/><w:suppressAutoHyphens w:val="0"/>`
    + `<w:spacing w:before="0" w:after="0"/><w:ind w:left="357"/><w:jc w:val="both"/></w:pPr>`;

  let saida = linhas.map((linha, i) =>
    `<w:p>${i === 0 ? pPrNumerado : pPrContinuacao}<w:r>${rPr}<w:t xml:space="preserve">${esc(linha.trim())}</w:t></w:r></w:p>`,
  ).join("");

  // Observação do analista: entra LOGO ABAIXO da exigência, recuada e em itálico, fora da lista
  // numerada — é complemento daquele item, não uma exigência a mais.
  const obs = String(observacao ?? "").trim();
  if (obs) {
    const rPrObs = `<w:rPr><w:rFonts w:eastAsia="Batang" w:cstheme="minorHAnsi"/><w:i/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>`;
    const pPrObs = `<w:pPr><w:pStyle w:val="Lista"/><w:suppressAutoHyphens w:val="0"/>`
      + `<w:spacing w:before="40" w:after="0"/><w:ind w:left="640"/><w:jc w:val="both"/></w:pPr>`;
    saida += obs.split("\n").filter((l) => l.trim() !== "").map((linha, i) =>
      `<w:p>${pPrObs}<w:r>${rPrObs}<w:t xml:space="preserve">${esc(i === 0 ? `Obs.: ${linha.trim()}` : linha.trim())}</w:t></w:r></w:p>`,
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
  for (const nome of Object.keys(zip.files).filter((n) => /^word\/header\d+\.xml$/.test(n))) {
    let h = await zip.file(nome)!.async("string");
    if (!h.includes("DESPACHO Nº")) continue;
    h = trocarTexto(h, "OS ______ / PROJETO Nº _____",
      `OS ${dados.numeroProcessoFisico || "______"} / PROJETO Nº ${dados.codigo}`);
    h = trocarTexto(h, "INTERESSADO: _____", `INTERESSADO: ${dados.interessado}`);
    h = trocarTexto(h, "ASSUNTO: ________", `ASSUNTO: ${dados.assunto}`);
    h = trocarTexto(h, "DESPACHO Nº ____ | 2026",
      `DESPACHO Nº ${dados.numeroDespacho} | ${dados.dataEmissao.slice(-4)}`);
    zip.file(nome, h);
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
