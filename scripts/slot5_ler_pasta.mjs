#!/usr/bin/env node
/**
 * E0 + E1 do slot 5 (Aprovação de Projeto) — leitura da pasta do processo SEM IA.
 *
 * Varre a pasta do processo (raiz = rodada 1, cada subpasta = rodada seguinte), calcula hash,
 * identifica o papel de cada arquivo pelo conteúdo, extrai o que a camada de texto entrega e
 * preenche os campos do LIP. Nada vai para o Gemini. Nada é gravado no banco.
 *
 * Uso:  node scripts/slot5_ler_pasta.mjs "~/Desktop/SLOT 5"
 *       node scripts/slot5_ler_pasta.mjs "<pasta>" --json saida.json
 *
 * Ver docs/PROMPT_LEITURA_PASTA_SLOT5.md
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

// ───────────────────────── infra ─────────────────────────

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
};

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** Só dígitos — para comparar IPTU escrito de jeitos diferentes. */
const soDigitos = (s) => (s || "").replace(/\D/g, "");

/** "365,83m²" -> 365.83 */
const num = (s) => {
  if (s == null) return null;
  const m = String(s).match(/-?\d{1,3}(?:\.\d{3})*,\d+|-?\d+,\d+|-?\d+/);
  if (!m) return null;
  return parseFloat(m[0].replace(/\./g, "").replace(",", "."));
};

const fmt = (n, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toFixed(d).replace(".", ",");

// ───────────────────────── camada de texto ─────────────────────────

/** Palavras com coordenadas, para ler carimbo de prancha (texto CAD é posicionado, não corrido). */
function palavrasComCoordenadas(pdf, pagina = 1) {
  const xml = sh("pdftotext", ["-bbox-layout", "-f", String(pagina), "-l", String(pagina), pdf, "-"]);
  const palavras = [];
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  let m;
  while ((m = re.exec(xml))) {
    palavras.push({
      x: +m[1], y: +m[2], x2: +m[3], y2: +m[4],
      txt: m[5].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
    });
  }
  return palavras;
}

/**
 * Acha o rótulo e devolve o primeiro valor que casa com `padrao` na vizinhança —
 * primeiro à direita na mesma faixa horizontal, depois logo abaixo. É assim que se lê
 * carimbo de prancha: por proximidade geométrica, não por linha de texto.
 */
function valorPerto(palavras, rotulo, padrao, opts = {}) {
  const { raio = 220, alturaLinha = 14 } = opts;
  const alvo = norm(rotulo);
  const tokens = alvo.split(" ");

  for (let i = 0; i < palavras.length; i++) {
    // casa o rótulo, que pode estar quebrado em várias palavras
    let ok = true;
    for (let t = 0; t < tokens.length; t++) {
      const p = palavras[i + t];
      if (!p || !norm(p.txt).startsWith(tokens[t].slice(0, Math.max(3, tokens[t].length - 1)))) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const ini = palavras[i];
    const fim = palavras[i + tokens.length - 1] || ini;
    const candidatos = palavras
      .map((p) => {
        const mesmaLinha = Math.abs(p.y - ini.y) <= alturaLinha && p.x >= fim.x2 - 2;
        const abaixo = p.y > fim.y2 - 2 && p.y - fim.y2 < raio &&
                       p.x2 > ini.x - raio && p.x < fim.x2 + raio;
        if (!mesmaLinha && !abaixo) return null;
        if (!padrao.test(p.txt)) return null;
        const dist = mesmaLinha
          ? p.x - fim.x2
          : (p.y - fim.y2) * 3 + Math.abs(p.x - ini.x);
        return { p, dist };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    if (candidatos.length) return candidatos[0].p.txt;
  }
  return null;
}

const P_AREA = /^A?=?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*m?²?$|^\d+,\d+m²$/i;
const P_NUM = /\d+,\d+/;

// ───────────────────────── identificação de papéis ─────────────────────────

/**
 * Assinaturas de conteúdo, EM ORDEM DE PRECEDÊNCIA. A primeira que casar decide.
 *
 * A prancha vem antes da ART de propósito: a nota SEPLANH impressa no desenho diz
 * "A CAIXA DE INFILTRAÇÃO É DE RESPONSABILIDADE DO PROFISSIONAL QUE ASSINOU A ART / RRT DE
 * EXECUÇÃO E PROJETO" — texto que casa com qualquer assinatura frouxa de ART. Um documento que
 * FALA de ART não é uma ART. Por isso a ART exige o cabeçalho do formulário, não a sigla solta.
 */
const ASSINATURAS = [
  { papel: "projeto",            re: /AREA TOTAL DA CONSTRUCAO|PROJETO LEGAL DE ARQUITETURA|QUADROS? DE ABERTURAS/ },
  { papel: "uso_solo",           re: /INFORMACAO DE USO DO SOLO/ },
  { papel: "certidao_matricula", re: /CERTIDAO DE MATRICULA|REGISTRO DE IMOVEIS DA/ },
  { papel: "art",                re: /ART OBRA OU SERVICO|DETALHES DO RRT|N[ºO°]? DO RRT|ANOTACAO DE RESPONSABILIDADE TECNICA PARA/ },
  { papel: "requerimento",       re: /REQUERIMENTO|REQUEIRO/ },
  { papel: "declaracao",         re: /DECLARACAO DE RESPONSABILIDADE|DECLARO/ },
];

/** Nome do arquivo → papel esperado, só para a rodada 1 (slots fixos do SEI). */
const SLOTS_SEI = [
  { re: /ART.*CAIXA/i,                     papel: "art_caixa" },
  { re: /ART.*EXECU/i,                     papel: "art_execucao" },
  { re: /ART.*PROJETO/i,                   papel: "art_projeto" },
  { re: /CERTIDAO|CERTID[ÃA]O/i,           papel: "certidao_matricula" },
  { re: /DECLARA/i,                        papel: "declaracao" },
  { re: /DOCUMENTOS/i,                     papel: "documentos_pessoais" },
  { re: /\.(dwg|dxf)$/i,                   papel: "projeto_cad" },
  { re: /^PROJETO\s*\.pdf$/i,              papel: "projeto" },
  { re: /USO\s*DO\s*SOLO/i,                papel: "uso_solo" },
  { re: /REQUERIMENTO/i,                   papel: "requerimento" },
];

/** Os 10 Documentos Obrigatórios da rodada 1. */
const OBRIGATORIOS = [
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

/** Nunca vão ao Gemini: fora do escopo do analista (CHEADV) ou ilegíveis por natureza. */
const SO_PRESENCA = new Set(["documentos_pessoais", "declaracao", "projeto_cad"]);

// ───────────────────────── extratores ─────────────────────────

function lerUsoDoSolo(txt) {
  const d = {};
  const t = txt.replace(/[ \t]+/g, " ");

  // O Uso do Solo é tabular: rótulo numa linha, valores na seguinte, colunas separadas por
  // 2+ espaços. Colapsar os espaços destrói as colunas — então aqui se trabalha no texto CRU.
  const linhas = txt.split("\n");
  const proxLinha = (re) => {
    const i = linhas.findIndex((l) => re.test(l));
    if (i < 0) return null;
    for (let j = i + 1; j < linhas.length; j++) if (linhas[j].trim()) return linhas[j];
    return null;
  };
  const colunas = (l) => (l || "").trim().split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);

  d.numero = (t.match(/UDS\d{10,}/) || [])[0] || null;
  d.iptu = (t.match(/\b\d{14}\b/) || [])[0] || null;
  d.tipo = /APROVA[ÇC][ÃA]O DE PROJETO/i.test(t) ? "APROVAÇÃO DE PROJETO" : null;

  const [q, l, emb] = colunas(proxLinha(/Quadra\s+Lote\s+Possui Embargo/i));
  d.quadra = q || null;
  d.lote = l || null;
  d.embargo = emb || null;

  d.bairro = colunas(proxLinha(/^\s*Bairro\s*$/i))[0] || null;

  const [via, classe] = colunas(proxLinha(/Nome da Via\s+Classifica[çc][ãa]o da Via/i));
  d.via = via || null;
  d.classificacaoVia = classe || null;

  d.unidadeTerritorial = colunas(proxLinha(/Unidades Territoriais/i))[0] || null;

  const corr = colunas(proxLinha(/Corredor\(es\) Vi[áa]rio\(s\)/i))[0];
  d.corredorViario = corr && corr !== "-" ? corr : null;
  d.fracaoIdeal = (t.match(/FRA[ÇC][ÃA]O IDEAL:\s*([^\n]+)/i) || [])[1]?.trim() || null;
  d.iccap = (t.match(/(1m³ para cada \d+m² de [^\n]+)/i) || [])[1]?.trim() || null;
  d.iccapDivisor = num((t.match(/1m³ para cada (\d+)m²/i) || [])[1]);
  d.paisagisticoMin = num((t.match(/m[íi]nimo de (\d+)%/i) || [])[1]);
  d.indiceOcupacao = (t.match(/[ÍI]NDICE DE OCUPA[ÇC][ÃA]O:\s*([^\n]+)/i) || [])[1]?.trim() || null;
  d.embarqueDesembarque = (t.match(/Embarque Desembarque[\s\S]{0,200}?\b(SIM|N[ÃA]O)\b/i) || [])[1] || null;
  // a coluna "Embarque Desembarque" fica na MESMA linha; sem separar por colunas, o "NÃO" dela
  // gruda no texto do porte
  d.areaMaxima = (colunas(linhas.find((l) => /[áa]rea m[áa]xima ser[áa]/i.test(l)))[0] || "")
    .replace(/^.*?[áa]rea m[áa]xima ser[áa]\s*/i, "").trim() || null;
  d.cnaes = [...t.matchAll(/\b(\d{9})\s+([A-ZÀ-Ú][^\n]{4,60}?)\s+(?:N[ÃA]O|SIM)\b/gi)]
    .map((m) => ({ codigo: m[1], denominacao: m[2].trim() }));
  d.dataEmissao = (() => {
    const m = t.match(/GOI[ÂA]NIA (\d{1,2}) DE ([A-ZÇÃ]+) DE (\d{4})/i);
    if (!m) return null;
    const meses = ["JANEIRO","FEVEREIRO","MARCO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
    const i = meses.indexOf(norm(m[2]));
    return i < 0 ? null : `${String(m[1]).padStart(2,"0")}/${String(i+1).padStart(2,"0")}/${m[3]}`;
  })();
  d.validadeDias = num((t.match(/VALIDADE DA INFORMA[ÇC][ÃA]O:\s*(\d+)\s*DIAS/i) || [])[1]);
  const vagas = t.match(/0 a 90 m²[^\n]*\n\s*(ISENTO[^\n]+)/i);
  d.tabelaVagas = vagas?.[1]?.trim() || null;
  return d;
}

function lerPrancha(pdf, txt) {
  const w = palavrasComCoordenadas(pdf, 1);
  const t = txt.replace(/[ \t]+/g, " ");
  const d = {};
  // "ÁREA DO TERRENO" e não "TERRENO": a palavra solta aparece em nota de acabamento na prancha,
  // e o rótulo do carimbo é "ÁREA DO TERRENO ORIGINAL:".
  d.areaTerreno = num(valorPerto(w, "ÁREA DO TERRENO", P_AREA));
  d.areaTotalConstrucao = num(valorPerto(w, "ÁREA TOTAL DA CONSTRUÇÃO:", P_AREA));
  d.permeavel = num(valorPerto(w, "Área de cobertura vegetal permeável:", P_AREA));
  d.permeavelPct = num(valorPerto(w, "Área de cobertura vegetal permeável:", /^_?\s*\d+,\d+%$/));
  d.naoPermeavel = num(valorPerto(w, "Área de cobertura vegetal não permeável:", P_AREA));
  d.naoPermeavelPct = num(valorPerto(w, "Área de cobertura vegetal não permeável:", /^_?\s*\d+,\d+%$/));
  d.vegetalTotal = num(valorPerto(w, "Área de cobertura vegetal TOTAL:", P_AREA));
  d.vegetalTotalPct = num(valorPerto(w, "Área de cobertura vegetal TOTAL:", /^_?\s*\d+,\d+%$/));
  d.volumeCaixa = num((t.match(/V\s*=\s*(\d+,\d+)m³/) || [])[1]);
  d.numeroCaixas = (t.match(/N[úu]mero de caixas:\s*(\d+)/i) || [])[1] || null;
  d.revisao = (t.match(/\bREV\s?(\d{2})\b/i) || [])[0]?.replace(/\s/g, "") || null;
  // a data do carimbo tem que ser lida POR COORDENADA: uma prancha está cheia de outras datas
  // (especificações de porta, notas de norma), e a primeira do arquivo não é a do projeto.
  d.data = valorPerto(w, "DATA:", /^\d{2}\/\d{2}\/\d{4}$/) || null;
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

function lerArt(txt) {
  const t = txt.replace(/[ \t]+/g, " ");
  const d = { atividades: [] };
  d.numero = (t.match(/N[ºo°]?\s*do RRT:\s*(\S+)/i) || [])[1] ||        // formulário do CAU (intitulado RRT)
             (t.match(/NUMERO_DA_ART=(\d+)/i) || [])[1] ||               // ART do CREA (link de impressão)
             (t.match(/\bART\s*n?[ºo°]?\s*[:.]?\s*(\d{10,})/i) || [])[1] || null;
  d.registroProfissional = (t.match(/N[ºo°]?\s*do Registro:\s*(\S+)/i) || [])[1] ||
                           (t.match(/Registro:\s*(\S+)/i) || [])[1] || null;
  d.tituloProfissional = (t.match(/T[íi]tulo Pro[fﬁ]issional:\s*([^\n]+?)(?:\s{2,}|$)/i) || [])[1]?.trim() || null;
  d.dataCelebracao = (t.match(/Celebrado em:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  d.dataRegistro = (t.match(/Data de Registro:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] ||
                   (t.match(/Registrada em\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  d.contratante = (t.match(/Contratante[^\n]*\n[^\n]*?\s{2,}([A-ZÀ-Ú][A-ZÀ-Ú\s.&-]{5,60}?)\s{2,}/i) || [])[1]?.trim() ||
                  (t.match(/^\S+\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.&-]*(?:LTDA|S\.?A\.?|ME|EIRELI))\b/im) || [])[1]?.trim() || null;
  d.declaracaoAcessibilidade = /Declara[çc][ãa]o de Acessibilidade/i.test(t);

  // ART do CREA: linhas "DESCRICAO  quantidade  UNIDADE"
  for (const m of t.matchAll(/^\s*([A-ZÀ-Ú][A-ZÀ-Ú\s\/.,-]{10,90}?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(METROS?\s+(?:QUADRADOS?|CUBICOS?|C[ÚU]BICOS?))\s*$/gim)) {
    d.atividades.push({ descricao: m[1].trim(), quantidade: m[2], unidade: m[3].trim() });
  }
  // formulário do CAU (intitulado RRT): "Atividade: X | Quantidade: Y | Unidade: Z"
  const ativs = [...t.matchAll(/Atividade:\s*([^\n]+?)\s*(?:Unidade:\s*(metro[^\n]*))?$/gim)];
  const quants = [...t.matchAll(/Quantidade:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi)].map((m) => m[1]);
  const unids = [...t.matchAll(/Unidade:\s*(metro\s+\S+)/gi)].map((m) => m[1]);
  ativs.forEach((m, i) => {
    if (quants[i]) {
      d.atividades.push({ descricao: m[1].replace(/Quantidade:.*/i, "").trim(), quantidade: quants[i], unidade: unids[i] || "" });
    }
  });
  return d;
}

function lerRequerimento(txt) {
  const t = txt.replace(/[ \t]+/g, " ");
  const d = {};
  d.interessado = (t.match(/^\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+){1,5})\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s*$/m) || [])[1]?.trim() || null;
  d.cpf = (t.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/) || [])[1] || null;
  d.iptu = (t.match(/(\d{3}\.\d{3}\.\d{4}\.\d{4})/) || [])[1] || null;
  d.enderecoImovel = (t.match(/(Rua\s+\d+\s+Quadra[^\n]+)/i) || [])[1]?.trim() || null;
  const uso = t.match(/\b(Comercial|Residencial|Misto|Institucional)\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  d.tipoUso = uso?.[1] || null;
  d.areaDeclarada = num(uso?.[2]);
  return d;
}

function lerCertidao(txt) {
  const t = txt.replace(/[ \t]+/g, " ");
  return {
    matricula: (t.match(/matr[íi]cula n[ºo°]\s*([\d.]+)/i) || [])[1] || null,
    livro: (t.match(/Livro\s*(\d+)/i) || [])[1] || null,
    // as dimensões e confrontações da matrícula estão em imagem nesta amostra
    dimensoes: null,
  };
}

// ───────────────────────── E0: varredura ─────────────────────────

function varrer(raiz) {
  const arquivos = [];
  const push = (dir, rodada, nomeRodada) => {
    for (const nome of fs.readdirSync(dir).sort()) {
      if (nome.startsWith(".")) continue;
      const full = path.join(dir, nome);
      if (fs.statSync(full).isFile()) arquivos.push({ full, nome, rodada, nomeRodada });
    }
  };
  push(raiz, 1, "raiz");
  const subs = fs.readdirSync(raiz).filter((n) => !n.startsWith(".") && fs.statSync(path.join(raiz, n)).isDirectory()).sort();
  subs.forEach((s, i) => push(path.join(raiz, s), i + 2, s));
  return arquivos;
}

function catalogar(arquivos) {
  return arquivos.map((a) => {
    const buf = fs.readFileSync(a.full);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    const ext = path.extname(a.nome).toLowerCase();
    const item = { ...a, hash, ext, bytes: buf.length, papeis: [], atividades: [], soPresenca: false };

    if (ext === ".dwg" || ext === ".dxf") {
      item.papeis = ["projeto_cad"];
      item.soPresenca = true;
      item.confianca = "alta";
      item.prova = `extensão ${ext} (único caso em que a extensão decide)`;
      return item;
    }
    if (ext !== ".pdf") {
      item.papeis = ["outros"];
      item.confianca = "baixa";
      return item;
    }

    item.paginas = num(sh("pdfinfo", [a.full]).match(/^Pages:\s*(\d+)/m)?.[1]) || 0;
    item.texto = sh("pdftotext", ["-layout", a.full, "-"]);
    item.charsTexto = item.texto.replace(/\s/g, "").length;
    item.temCamadaTexto = item.charsTexto > 50;

    const T = norm(item.texto);
    // primeira assinatura que casar, na ordem de precedência
    const achado = ASSINATURAS.find((s) => s.re.test(T)) || null;

    // pista do nome só na rodada 1 (slots fixos do SEI)
    const pista = a.rodada === 1 ? SLOTS_SEI.find((s) => s.re.test(a.nome))?.papel : null;

    if (!item.temCamadaTexto) {
      // escaneado: sem conteúdo legível, só a pista da raiz salva
      item.papeis = pista ? [pista] : ["outros"];
      item.confianca = pista ? "media" : "baixa";
      item.prova = "PDF sem camada de texto (digitalizado) — identificado pela pista do nome na raiz";
      item.escaneado = true;
    } else if (achado?.papel === "art") {
      // o papel da ART sai EXCLUSIVAMENTE do quadro de atividade técnica
      const art = lerArt(item.texto);
      item.atividades = art.atividades;
      const temM2 = art.atividades.some((x) => /QUADRAD/i.test(x.unidade));
      const temM3 = art.atividades.some((x) => /C[ÚU]BIC/i.test(x.unidade));
      const ehProjeto = art.atividades.some((x) => /PROJETO|ELABORA/i.test(x.descricao));
      if (temM2) item.papeis.push(ehProjeto ? "art_projeto" : "art_execucao");
      if (temM3) item.papeis.push("art_caixa");
      if (!item.papeis.length) item.papeis = ["art_indefinida"];
      item.confianca = art.atividades.length ? "alta" : "baixa";
      item.prova = art.atividades.map((x) => `${x.descricao} — ${x.quantidade} ${x.unidade}`).join(" | ")
                   || "quadro de atividade técnica ilegível";
    } else if (achado) {
      item.papeis = [achado.papel];
      item.confianca = "alta";
      item.prova = `assinatura de conteúdo: ${achado.re.source.split("|")[0]}`;
    } else {
      item.papeis = pista ? [pista] : ["outros"];
      item.confianca = pista ? "media" : "baixa";
      item.prova = pista ? "pista do nome na raiz, sem assinatura de conteúdo" : "não reconhecido";
    }

    // extratores despacham pelo PAPEL RESOLVIDO, não pelo caminho que resolveu.
    // Sem isso, um documento identificado pela pista do nome entra no catálogo e não é lido.
    if (!item.soPresenca && item.temCamadaTexto) {
      if (item.papeis.includes("uso_solo")) item.dados = lerUsoDoSolo(item.texto);
      else if (item.papeis.includes("projeto")) item.dados = lerPrancha(a.full, item.texto);
      else if (item.papeis.includes("requerimento")) item.dados = lerRequerimento(item.texto);
      else if (item.papeis.includes("certidao_matricula")) item.dados = lerCertidao(item.texto);
      else if (item.papeis.some((p) => p.startsWith("art"))) item.dados = lerArt(item.texto);
    }

    // divergência nome × conteúdo só é sinal na rodada 1
    if (a.rodada === 1 && pista && !item.papeis.includes(pista) && !item.papeis.includes("art_indefinida")) {
      item.divergenciaNome = `nome diz "${pista}", conteúdo diz "${item.papeis.join("+")}"`;
    }
    if (item.papeis.some((p) => SO_PRESENCA.has(p))) item.soPresenca = true;
    return item;
  });
}

// ───────────────────────── E1: papel vigente por rodada ─────────────────────────

function paraDate(br) {
  const m = (br || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

function dataDoDocumento(item) {
  const d = item.dados || {};
  return d.dataEmissao || d.dataRegistro || d.dataCelebracao || d.data || null;
}

/** Mais recente EMITIDO vence. Desempate: data → revisão → rodada. */
function vigentes(catalogo) {
  const porPapel = {};
  for (const it of catalogo) {
    for (const papel of it.papeis) {
      const atual = porPapel[papel];
      if (!atual) { porPapel[papel] = it; continue; }
      const dNovo = paraDate(dataDoDocumento(it)), dAtual = paraDate(dataDoDocumento(atual));
      let venceu;
      if (dNovo && dAtual && +dNovo !== +dAtual) venceu = dNovo > dAtual;
      else {
        const rNovo = num(it.dados?.revisao), rAtual = num(atual.dados?.revisao);
        if (rNovo != null && rAtual != null && rNovo !== rAtual) venceu = rNovo > rAtual;
        else venceu = it.rodada > atual.rodada;
      }
      if (venceu) {
        porPapel[papel] = it;
        if (dNovo && dAtual && dNovo < dAtual) it.alertaRetrocesso = true;
      } else if (it.rodada > atual.rodada && dNovo && dAtual && dNovo < dAtual) {
        it.alertaRetrocesso = `rodada ${it.rodada} traz documento emitido em ${dataDoDocumento(it)}, anterior ao vigente (${dataDoDocumento(atual)})`;
      }
    }
  }

  /**
   * art_caixa é o único papel que costuma ter dois candidatos legítimos — o projeto e a execução
   * da rede pluvial, cada um dentro de uma ART maior. Nesse caso o número já está em
   * numeroDeArtProjeto ou numeroDeArtExecucao, e o campo do LIP só repetiria.
   *
   * Regra: prefere ART DEDICADA à caixa (todas as atividades são pluviais). Não havendo,
   * cai para a de execução e MARCA que é repetição, para o analista ver que não é um terceiro
   * documento. Decisão do Fábio, 26/07/2026: "se for o mesmo documento pra tudo sim".
   */
  const candidatosCaixa = catalogo.filter((it) => it.papeis.includes("art_caixa"));
  if (candidatosCaixa.length > 1) {
    const ehPluvial = (a) => /PLUVIA|DRENAG|SANEAM|RECARGA|INFILTRA/i.test(a.descricao);
    const dedicada = candidatosCaixa.find((it) => it.atividades.length && it.atividades.every(ehPluvial));
    if (dedicada) {
      porPapel.art_caixa = dedicada;
      porPapel.art_caixa.caixaDedicada = true;
    } else {
      const exec = candidatosCaixa.find((it) => it.papeis.includes("art_execucao"));
      porPapel.art_caixa = exec || porPapel.art_caixa;
      porPapel.art_caixa.caixaRepetida = exec ? "ART de execução" : "ART de projeto";
    }
  }

  return porPapel;
}

// ───────────────────────── E2/E3: campos do LIP ─────────────────────────

const TOL = 0.02; // tolerância de arredondamento em m² / m³

function preencherLip(vig) {
  const C = {}; // chave -> { valor, origem, fonte }
  const set = (chave, valor, origem, fonte) => {
    if (valor == null || valor === "") return;
    C[chave] = { valor: String(valor), origem, fonte };
  };

  const uds = vig.uso_solo?.dados || {};
  const pr = vig.projeto?.dados || {};
  const rq = vig.requerimento?.dados || {};
  const ct = vig.certidao_matricula?.dados || {};
  const aProj = vig.art_projeto?.dados || {};
  const aExec = vig.art_execucao?.dados || {};
  const aCx = vig.art_caixa?.dados || {};

  // ── identificação
  set("logradouro", uds.via || pr.endereco?.match(/RUA\s*\d+/i)?.[0], "lido", "Uso do Solo (Nome da Via)");
  set("quadra", uds.quadra, "lido", "Uso do Solo");
  set("lote", uds.lote, "lido", "Uso do Solo");
  set("bairro", uds.bairro, "lido", "Uso do Solo");
  set("iptu", soDigitos(uds.iptu || pr.iptu || rq.iptu), "lido", "Uso do Solo");
  set("proprietario", rq.interessado, "lido", "Requerimento");
  set("nome_responsavel_arq", pr.arquiteto, "lido", "carimbo da prancha");
  set("cau", pr.cau, "lido", "carimbo da prancha");
  set("nome_responsavel_eng", pr.engenheiro, "lido", "carimbo da prancha");
  set("crea", pr.crea, "lido", "carimbo da prancha");
  set("quantasFrentes", uds.via ? 1 : null, "calculado", "1 via no Uso do Solo");

  // ── uso do solo
  set("usoDoSoloN", uds.numero, "lido", "Uso do Solo");
  set("unidadeTerritorialDoUsoDoSolo", uds.unidadeTerritorial, "lido", "Uso do Solo");
  set("usoDoSoloEParaAprovacao", uds.tipo === "APROVAÇÃO DE PROJETO" ? "SIM" : "NÃO", "calculado", "Tipo de Uso do Solo");
  set("tipoDeVia1", uds.classificacaoVia, "lido", "Uso do Solo");
  set("anexouCertidaoDeCorredorViario", uds.corredorViario ? "SIM" : "NÃO", "calculado", "campo Corredor Viário do UDS");
  set("atendeOPorteAdmitido", /sem limite/i.test(uds.areaMaxima || "") ? "SIM" : null, "calculado", uds.areaMaxima);
  set("cnae", uds.cnaes?.map((c) => c.codigo).join(" / "), "lido", "Uso do Solo");
  set("esquina", "NÃO", "calculado", "1 frente");

  // ── ART (número + presença)
  set("numeroDeArtProjeto", aProj.numero, "lido", "ART de projeto");
  set("numeroDeArtExecucao", aExec.numero, "lido", "ART de execução");
  set("numeroDeArtCaixa", aCx.numero, "lido",
      vig.art_caixa?.caixaDedicada ? "ART dedicada à caixa de recarga"
      : vig.art_caixa?.caixaRepetida ? `repetido da ${vig.art_caixa.caixaRepetida} — a caixa não tem ART própria`
      : "ART de caixa");
  set("anexouArtRrtProjeto", vig.art_projeto ? "SIM" : "NÃO", "calculado", "catálogo");
  set("anexouArtRrtExecucao", vig.art_execucao ? "SIM" : "NÃO", "calculado", "catálogo");
  set("anexouArtRrtCaixa", vig.art_caixa ? "SIM" : "NÃO", "calculado", "catálogo");
  set("artDeProjetoAtendeAAcessibilidade", aProj.declaracaoAcessibilidade ? "SIM" : null, "lido", "declaração de acessibilidade na ART de projeto");
  set("aArtDeExecucaoAtendeA", aExec.declaracaoAcessibilidade ? "SIM" : null, "lido", "ART de execução");

  // ── dados do projeto
  set("areaTerreno", fmt(pr.areaTerreno), "lido", "carimbo da prancha");
  set("areaTotal", fmt(pr.areaTotalConstrucao), "lido", "carimbo da prancha");
  set("pav", pr.pavimentos, "lido", "carimbo da prancha");
  set("certidao", ct.matricula, "lido", "Certidão de Matrícula");

  // ── caixa de recarga (CALCULADO e confrontado, nunca copiado)
  set("nDeCaixasDeCaptacao", pr.numeroCaixas, "lido", "carimbo da prancha");
  set("volumeDaCaixaDeRecarga", fmt(pr.volumeCaixa), "lido", "carimbo (a conferir por cálculo)");

  // ── fração ideal
  if (/90,00m²/.test(uds.fracaoIdeal || "") && /ADENSAMENTO B[ÁA]SICO/i.test(uds.unidadeTerritorial || "")) {
    set("aabEApac190", "SIM", "calculado", uds.fracaoIdeal);
  }

  // ── área permeável exigida (fórmula sobre o parâmetro do UDS)
  if (pr.areaTerreno && uds.paisagisticoMin) {
    set("opcao1TotalExigidoAreaTerreno", fmt(pr.areaTerreno * uds.paisagisticoMin / 100), "calculado",
        `${fmt(pr.areaTerreno)} m² × ${uds.paisagisticoMin}%`);
    set("opcao2TotalExigidoAreaTerreno", fmt(pr.areaTerreno * 0.10), "calculado", `${fmt(pr.areaTerreno)} m² × 10%`);
    set("opcao2TotalExigidoAreaTerreno2", fmt(pr.areaTerreno * 0.05), "calculado", `${fmt(pr.areaTerreno)} m² × 5%`);
    set("opcao3TotalExigidoAreaTerreno", fmt(pr.areaTerreno * 0.25), "calculado", `${fmt(pr.areaTerreno)} m² × 25%`);
  }

  set("tipoProcessoLip", "APROVAÇÃO DE PROJETO", "padrao", "valor padrão do assunto");
  set("comercio", /comercial/i.test(rq.tipoUso || "") ? "SIM" : null, "lido", "Requerimento");
  set("atividadeEconomica", uds.cnaes?.length ? "SIM" : null, "calculado", "CNAEs no Uso do Solo");

  return C;
}

// ───────────────────────── E3: conferências ─────────────────────────

function conferir(vig, C) {
  const uds = vig.uso_solo?.dados || {};
  const pr = vig.projeto?.dados || {};
  const rq = vig.requerimento?.dados || {};
  const aProj = vig.art_projeto?.dados || {};
  const aExec = vig.art_execucao?.dados || {};
  const aCx = vig.art_caixa?.dados || {};
  const out = [];

  const cmp = (nome, a, b, unidade = "m²", detalhe = "") => {
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

  // somatório interno da cobertura vegetal
  if (pr.permeavel != null && pr.naoPermeavel != null) {
    cmp("Soma da cobertura vegetal fecha o total declarado?", pr.permeavel + pr.naoPermeavel, pr.vegetalTotal, "m²",
        "somatório interno da prancha");
  }

  // mesmo dado em documentos diferentes
  const areaArtProj = num(aProj.atividades?.find((x) => /QUADRAD/i.test(x.unidade))?.quantidade);
  const areaArtExec = num(aExec.atividades?.find((x) => /QUADRAD/i.test(x.unidade))?.quantidade);
  const volArtCx = num(aCx.atividades?.find((x) => /C[ÚU]BIC/i.test(x.unidade))?.quantidade);
  cmp("Área na ART de projeto confere com o projeto?", areaArtProj, pr.areaTotalConstrucao);
  cmp("Área na ART de execução confere com o projeto?", areaArtExec, pr.areaTotalConstrucao);
  cmp("Volume na ART de caixa confere com o projeto?", volArtCx, pr.volumeCaixa, "m³");
  cmp("Área no requerimento confere com o projeto?", rq.areaDeclarada, pr.areaTotalConstrucao);

  // IPTU nas três grafias (normalizado)
  const iptus = [["Uso do Solo", uds.iptu], ["prancha", pr.iptu], ["requerimento", rq.iptu]]
    .filter(([, v]) => v).map(([k, v]) => [k, soDigitos(v)]);
  const iguais = new Set(iptus.map(([, v]) => v));
  out.push({
    nome: "IPTU é o mesmo nos três documentos?",
    estado: iptus.length < 2 ? "SEM DADO" : iguais.size === 1 ? "CONFERE" : "NÃO CONFERE",
    detalhe: iptus.map(([k, v]) => `${k}: ${v}`).join(" · ") + (iguais.size === 1 ? " (normalizados)" : ""),
  });

  // nº do Uso do Solo citado na prancha
  out.push((() => {
    const a = soDigitos(uds.numero), b = soDigitos(pr.usoDoSoloN);
    if (!a || !b) return { nome: "Prancha cita o Uso do Solo correto?", estado: "SEM DADO", detalhe: "número ausente" };
    return { nome: "Prancha cita o Uso do Solo correto?", estado: a === b ? "CONFERE" : "NÃO CONFERE",
             detalhe: `UDS ${uds.numero} × carimbo ${pr.usoDoSoloN}` };
  })());

  // ICCAP: refazer a conta, não copiar
  out.push((() => {
    const nome = "Volume da caixa de recarga confere com a área impermeabilizada?";
    if (!uds.iccapDivisor || pr.volumeCaixa == null)
      return { nome, estado: "SEM DADO", detalhe: "falta parâmetro do UDS ou volume da prancha" };
    const areaImplicita = pr.volumeCaixa * uds.iccapDivisor;
    return {
      nome, estado: "SEM DADO",
      detalhe: `o volume declarado (${fmt(pr.volumeCaixa)} m³) implica ${fmt(areaImplicita)} m² impermeabilizados ` +
               `a 1m³/${uds.iccapDivisor}m². A ÁREA IMPERMEABILIZADA DO TERRENO não existe como campo no LIP ` +
               `e não está na camada de texto — sem ela isso é transcrição, não conferência.`,
      dependencia: "área impermeabilizada do terreno",
    };
  })());

  // índice paisagístico
  out.push((() => {
    const nome = "Índice paisagístico atende o mínimo do Uso do Solo?";
    if (pr.vegetalTotal == null || !pr.areaTerreno || !uds.paisagisticoMin)
      return { nome, estado: "SEM DADO", detalhe: "falta área vegetal, área do terreno ou parâmetro" };
    const pct = (pr.vegetalTotal / pr.areaTerreno) * 100;
    const exigido = pr.areaTerreno * uds.paisagisticoMin / 100;
    return {
      nome,
      estado: pr.vegetalTotal + TOL >= exigido ? "CONFERE" : "NÃO CONFERE",
      detalhe: `${fmt(pr.vegetalTotal)} m² = ${fmt(pct)}% do terreno; exigido ${uds.paisagisticoMin}% = ${fmt(exigido)} m²` +
               (pr.vegetalTotalPct != null && Math.abs(pct - pr.vegetalTotalPct) > 0.05
                 ? ` — a prancha declara ${fmt(pr.vegetalTotalPct)}%, recálculo dá ${fmt(pct)}%` : ""),
    };
  })());

  // índice de aproveitamento
  out.push((() => {
    const nome = "Índice de aproveitamento dentro do máximo?";
    if (!pr.areaTotalConstrucao || !pr.areaTerreno) return { nome, estado: "SEM DADO", detalhe: "falta área" };
    const ia = pr.areaTotalConstrucao / pr.areaTerreno;
    return { nome, estado: ia <= 7.5 ? "CONFERE" : "NÃO CONFERE",
             detalhe: `${fmt(pr.areaTotalConstrucao)} ÷ ${fmt(pr.areaTerreno)} = ${fmt(ia)}× (máx. 7,5×)` };
  })());

  // vagas — depende da área ocupada pela atividade, que não é a área construída
  out.push({
    nome: "Vagas de estacionamento exigidas × atendidas",
    estado: "SEM DADO",
    detalhe: `o UDS exige "${uds.tabelaVagas || "?"}". A base do cálculo é a ÁREA OCUPADA PELA ATIVIDADE, ` +
             `que desconta circulação, manobra e estacionamento — e esses descontos estão nas tabelas ` +
             `coladas como imagem na prancha. Usar os ${fmt(pr.areaTotalConstrucao)} m² inteiros é o erro que o modelo cometeu no teste.`,
    dependencia: "área ocupada pela atividade (tabela em imagem)",
  });

  // coerência de datas: a prancha não pode ser anterior à ART que a acoberta
  out.push((() => {
    const nome = "As datas dos documentos são coerentes entre si?";
    const dPr = paraDate(pr.data);
    const dArt = paraDate(aProj.dataRegistro || aProj.dataCelebracao);
    if (!dPr || !dArt) return { nome, estado: "SEM DADO", detalhe: "falta data da prancha ou da ART de projeto" };
    const diasAntes = Math.round((dArt - dPr) / 86400000);
    if (diasAntes <= 0) return { nome, estado: "CONFERE", detalhe: `prancha ${pr.data} · ART de projeto ${aProj.dataRegistro}` };
    return {
      nome,
      estado: "NÃO CONFERE",
      detalhe: `a prancha está datada ${pr.data}, ${diasAntes} dias ANTES da ART de projeto (${aProj.dataRegistro}). ` +
               `Um projeto não pode ser anterior à ART que o acoberta.` +
               (diasAntes > 300 && diasAntes < 400
                 ? ` A diferença é de aproximadamente um ano com o MESMO dia e mês — indício forte de ano errado digitado no carimbo, não de projeto antigo.`
                 : ""),
    };
  })());

  // documento vencido — fora do escopo, mas registrado
  if (uds.dataEmissao && uds.validadeDias) {
    const venc = paraDate(uds.dataEmissao);
    venc?.setDate(venc.getDate() + uds.validadeDias);
    out.push({
      nome: "Validade do Uso do Solo (fora do escopo do analista)",
      estado: "INFORMATIVO",
      detalhe: `emitido ${uds.dataEmissao}, validade ${uds.validadeDias} dias → vence ${venc?.toLocaleDateString("pt-BR")}. Escopo da CHEADV.`,
    });
  }

  return out;
}

// ───────────────────────── relatório ─────────────────────────

function relatorio(catalogo, vig, C, confs) {
  const L = [];
  const linha = (c = "─") => L.push(c.repeat(100));

  L.push("");
  L.push("╔" + "═".repeat(98) + "╗");
  L.push("║  SLOT 5 — APROVAÇÃO DE PROJETO · LEITURA DA PASTA (E0 + E1, sem IA)".padEnd(99) + "║");
  L.push("╚" + "═".repeat(98) + "╝");

  // catálogo
  L.push("");
  L.push("1. CATÁLOGO DA PASTA");
  linha();
  for (const it of catalogo) {
    const marca = it.soPresenca ? "○" : "●";
    L.push(`${marca} [rodada ${it.rodada}] ${it.nome}`);
    L.push(`    papéis: ${it.papeis.join(" + ")}   confiança: ${it.confianca}` +
           (it.paginas ? `   ${it.paginas} pág.` : "") +
           (it.charsTexto != null ? `   ${it.charsTexto} chars de texto` : ""));
    L.push(`    hash: ${it.hash.slice(0, 16)}…`);
    if (it.escaneado) L.push(`    ⚠ digitalizado — sem camada de texto`);
    if (it.divergenciaNome) L.push(`    ⚠ ${it.divergenciaNome}`);
    if (it.alertaRetrocesso) L.push(`    ⚠ ${it.alertaRetrocesso}`);
    const dt = dataDoDocumento(it);
    if (dt) L.push(`    emitido em ${dt}` + (it.dados?.revisao ? ` · ${it.dados.revisao}` : ""));
    if (it.soPresenca) L.push(`    → só presença: nunca vai ao Gemini`);
    if (it.prova) L.push(`    prova: ${it.prova.slice(0, 150)}`);
    L.push("");
  }

  // duplicidade de hash
  const porHash = {};
  catalogo.forEach((it) => (porHash[it.hash] ||= []).push(it));
  const grupos = Object.values(porHash).filter((v) => v.length > 1);
  const mesmaRodada = grupos.filter((v) => new Set(v.map((i) => i.rodada)).size === 1);
  const outraRodada = grupos.filter((v) => new Set(v.map((i) => i.rodada)).size > 1);

  if (mesmaRodada.length) {
    L.push("   MESMO ARQUIVO EM DOIS SLOTS DA MESMA RODADA:");
    mesmaRodada.forEach((v) => L.push(`   · ${v.map((i) => i.nome).join("  =  ")}`));
    L.push("     Não é erro: uma ART pode exercer dois papéis, e cada papel recebe o mesmo número.");
    L.push("");
  }
  if (outraRodada.length) {
    L.push("   ARQUIVO REENVIADO SEM NENHUMA ALTERAÇÃO (hash idêntico entre rodadas):");
    for (const v of outraRodada) {
      const ord = v.sort((a, b) => a.rodada - b.rodada);
      L.push(`   · ${ord.map((i) => `r${i.rodada}: ${i.nome}`).join("  →  ")}`);
      const rev = ord[0].dados?.revisao;
      if (rev && ord.some((i) => /REV\s?\d+/i.test(i.nome) && !new RegExp(rev, "i").test(i.nome))) {
        L.push(`     ⚠ o nome anuncia revisão nova, mas o carimbo continua ${rev} e o arquivo é byte a byte o mesmo.`);
        L.push(`       Nada foi corrigido — não há o que reanalisar, e a revisão declarada não existe no documento.`);
      } else {
        L.push(`     → não precisa ser relido: herda tipo e extração da rodada anterior, custo zero de Gemini.`);
      }
    }
    L.push("");
  }

  // obrigatórios
  L.push("2. DOCUMENTOS OBRIGATÓRIOS DA RODADA 1");
  linha();
  const papeisPresentes = new Set(catalogo.flatMap((it) => it.papeis));
  let faltando = 0;
  for (const [papel, nome] of OBRIGATORIOS) {
    const tem = papeisPresentes.has(papel);
    if (!tem) faltando++;
    L.push(`   ${tem ? "✔" : "✘"} ${nome}${tem ? "" : "   ← PENDÊNCIA"}`);
  }
  L.push("");
  L.push(`   ${faltando === 0 ? "Nenhuma pendência documental." : `${faltando} documento(s) obrigatório(s) ausente(s) — detectado sem uma única chamada de IA.`}`);

  // custo
  const lidos = catalogo.filter((it) => !it.soPresenca && it.ext === ".pdf");
  const hashesUnicos = new Set(lidos.map((it) => it.hash));
  const pagTotal = catalogo.reduce((s, it) => s + (it.paginas || 0), 0);
  const pagIgnoradas = catalogo.filter((it) => it.soPresenca).reduce((s, it) => s + (it.paginas || 0), 0);
  L.push("");
  L.push("3. CUSTO DE LEITURA");
  linha();
  L.push(`   páginas na pasta ................... ${pagTotal}`);
  L.push(`   ignoradas por escopo .............. -${pagIgnoradas}`);
  L.push(`   arquivos distintos a ler .......... ${hashesUnicos.size} (de ${lidos.length} nomes)`);
  L.push(`   páginas efetivamente lidas ........ ${pagTotal - pagIgnoradas}  (todas por pdftotext, custo zero)`);
  L.push(`   chamadas ao Gemini nesta execução .. 0`);

  // campos do LIP
  L.push("");
  L.push("4. CAMPOS DO LIP PREENCHIDOS");
  linha();
  const porOrigem = {};
  Object.entries(C).forEach(([k, v]) => (porOrigem[v.origem] ||= []).push([k, v]));
  for (const origem of ["lido", "calculado", "padrao"]) {
    const itens = porOrigem[origem] || [];
    if (!itens.length) continue;
    L.push("");
    L.push(`   ── ${origem.toUpperCase()} (${itens.length})`);
    for (const [k, v] of itens) {
      L.push(`   ${k.padEnd(36)} ${String(v.valor).padEnd(30)} ← ${v.fonte}`);
    }
  }
  L.push("");
  L.push(`   TOTAL PREENCHIDO: ${Object.keys(C).length} de 125 campos, sem IA.`);

  // conferências
  L.push("");
  L.push("5. CONFERÊNCIAS (o código conclui, não o modelo)");
  linha();
  const icone = { "CONFERE": "✔", "NÃO CONFERE": "✘", "SEM DADO": "?", "INFORMATIVO": "i" };
  for (const c of confs) {
    L.push(`   ${icone[c.estado] || " "} [${c.estado}] ${c.nome}`);
    L.push(`      ${c.detalhe}`);
    if (c.dependencia) L.push(`      depende de: ${c.dependencia}`);
    L.push("");
  }
  const cnt = (e) => confs.filter((c) => c.estado === e).length;
  L.push(`   ${cnt("CONFERE")} confere · ${cnt("NÃO CONFERE")} não confere · ${cnt("SEM DADO")} sem dado`);
  L.push("");

  return L.join("\n");
}

// ───────────────────────── main ─────────────────────────

const alvo = process.argv[2];
if (!alvo) {
  console.error('uso: node scripts/slot5_ler_pasta.mjs "<pasta do processo>" [--json saida.json]');
  process.exit(1);
}
const raiz = alvo.replace(/^~/, process.env.HOME);
if (!fs.existsSync(raiz)) {
  console.error(`pasta não encontrada: ${raiz}`);
  process.exit(1);
}

const catalogo = catalogar(varrer(raiz));
const vig = vigentes(catalogo);
const C = preencherLip(vig);
const confs = conferir(vig, C);

console.log(relatorio(catalogo, vig, C, confs));

const iJson = process.argv.indexOf("--json");
if (iJson > 0 && process.argv[iJson + 1]) {
  const limpo = catalogo.map(({ texto, ...r }) => r);
  fs.writeFileSync(process.argv[iJson + 1],
    JSON.stringify({ catalogo: limpo, campos: C, conferencias: confs }, null, 2));
  console.log(`JSON gravado em ${process.argv[iJson + 1]}`);
}
