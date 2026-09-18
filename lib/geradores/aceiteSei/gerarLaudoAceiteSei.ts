// ============================================================
// lib/geradores/aceiteSei/gerarLaudoAceiteSei.ts
// URBIS — Laudo de Análise do ALVARÁ DE ACEITE (Slot 2).
//
// Template: public/templates/laudo_aceite_sei.xlsm
//
// ISOLAMENTO DE SLOT (CLAUDE.md): este gerador é do Slot 2 e NÃO
// importa nada de `lib/geradores/gerarLaudo.ts` (Slot 1) nem de
// `lib/mac-motor/slot5/` — mesmo onde o código se parece. O laudo do
// Aceite é OUTRO documento, não o da Regularização com campos
// apagados: não tem seção de Uso do Solo, não tem seção de poço de
// infiltração, e tem "Comprovação do tempo de existência" e a nota dos
// 200 m², que o da Regularização não têm.
//
// ── COMO ESTE TEMPLATE FUNCIONA (e por que não escrevemos no laudo) ──
//
// O arquivo tem três camadas encadeadas por fórmula:
//
//   1. aba "Painel do Aceite"  → ENTRADA (é só aqui que escrevemos)
//   2. aba "Aceite", linhas 1-31 → apoio, puxa do Painel
//   3. aba "Aceite", linhas 37-81 → o laudo impresso, puxa do apoio
//
// Escrever direto no laudo impresso (como faz o Slot 1) quebraria as
// fórmulas que o próprio Fábio montou e que EXPLICAM cada campo. Pior:
// várias células do Painel são DERIVADAS e não devem ser sobrescritas:
//
//   L4  = SUM(L5:L8)              Á. do Aceite é a soma das 4 parcelas
//   L14 = IF((L5+L6)=0,…)         Mais de 12m sai das áreas verticais
//   L15 = IF((L5+L7)=0,…)         Ocupa recuo frontal sai das áreas
//   L26 / L27                     as duas multas, mesma derivação
//   H20 = L9-H19                  Á. impermeável = terreno − permeável
//   H21 = H20/200                 volume mínimo da caixa
//   H29 = IF(L4=L9,…)             ocupa a totalidade do lote
//   D29 = L9                      área do lote espelha o terreno
//   H14 = C10 / H15 = C11         CNAEs espelham a identificação
//
// Por isso escrevemos SÓ os valores primitivos e marcamos o workbook
// com `fullCalcOnLoad`: o Excel recalcula tudo ao abrir. Nenhuma conta
// é refeita em TypeScript — a planilha continua sendo a fonte da
// regra, que é o que permite o Fábio ajustar o laudo sem mexer em
// código.
//
// ── DECISÕES DE CONTEÚDO (Fábio, 17/09/2026 — CORRIGIDO 18/09/2026) ──
//
// • Uso do Solo: dispensado no Aceite (Art. 7º § 2º exclui o inciso I). Nunca exigível.
// • ART/RRT: dispensada até 200 m² de área construída (só croqui cotado); ACIMA de 200 m² é
//   EXIGÍVEL (projeto completo + ART/RRT). "Nunca exigível" (registrado em 17/09) estava
//   ERRADO — corrigido pelo Fábio em 18/09: "tem casos que é, acima de 200m2". Ver
//   docs/PLANO_LEITURA_INDIVIDUAL_E_ACEITE_SLOT2.md, D3.
// • Caixa de recarga: não prevista no Título II, então não é COBRADA por padrão — mas se o
//   requerente APRESENTAR, ela tem que estar correta (volume, memorial, ART da caixa). Também
//   corrigido em 18/09: "se ele coloca, tem que colocar certo".
// • Nenhum dos três pontos acima muda código deste gerador: ele só ESCREVE no Painel os valores
//   primitivos que já vieram do LIP (ART/RRT e caixa inclusive, ver mapa de células mais abaixo)
//   — nunca zera nem bloqueia campo por "não exigível". A regra de EXIGIR (ou não) e CONFERIR
//   (se apresentada) é da LEITURA (prompt P2_EXTRACAO/P3_MAC do Aceite), não deste arquivo.
//   Auditado em 18/09/2026: nenhum trecho deste gerador tratava ART/caixa como "nunca" — só o
//   comentário acima (agora corrigido) descrevia a regra errado.
// • "Tipo de Comprovação": a precedência é FOTO primeiro, documento só
//   quando a foto não identifica ("se não puder ser identificado por
//   falta de foto, aí documentação"). A fórmula do template faz o
//   INVERSO — ver `resolverComprovacao` abaixo.
// ============================================================

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

/** Campo do LIP como ele vive em `processos.dados`. */
export type CampoLip = { valor?: string | null; origem?: string | null; fonte?: string | null } | null | undefined;
export type DadosLip = Record<string, CampoLip>;

export type ResultadoLaudoAceite = {
  buffer: Buffer;
  /** Como a comprovação do tempo de existência foi resolvida — vai pro log e pra tela. */
  comprovacao: { tipo: string; origem: "foto" | "documento" | "ausente" };
  /** Chaves primitivas que estavam vazias no LIP — nunca somem em silêncio. */
  camposVazios: string[];
};

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dataExtenso(d: Date): string {
  return `Goiânia, ${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Mapa chave do LIP → célula do "Painel do Aceite".
 *
 * As chaves foram CONFERIDAS contra `lip_campos.chave` do assunto
 * Aceite SEI (cb574aa0-5040-4fd0-aa60-14b64d9a047a) em 17/09/2026 —
 * os 79 campos reais. Não copiar nomes do Slot 1: o Aceite usa
 * `areaAceite`/`areaExistente`, não `areaTotal`/`areaAprovada`.
 *
 * Células DERIVADAS não aparecem aqui de propósito (ver cabeçalho).
 */
const MAPA_PAINEL: Record<string, string> = {
  // ── Identificação (coluna C) ──
  proprietario: "C4",
  logradouro:   "C5",
  processo:     "C6",
  quadra:       "C7",
  lote:         "C8",
  bairro:       "C9",
  cnae1:        "C10",
  cnae2:        "C11",

  // ── Documentos — nº SEI (coluna D) ──
  certidao:                 "D13",
  levantamento:             "D14",
  numero_do_sei_da_onerosa: "D15",
  seiCheadv:                "D16",
  seiEmbargo:               "D17",
  dataEmb:                  "D18",
  tombado:                  "D19",
  artLev:                   "D20",
  artCx:                    "D21",
  laudo:                    "D22",
  remembramento:            "D23",
  vistoria:                 "D24",
  nadaConsta:               "D28",
  certLimites:              "D30",
  nroArtLev:                "D31",
  nroArtCx:                 "D32",
  // D25 (Uso do Solo), D26/D27 (comprovação) são tratados fora do mapa:
  // ver `escreverLaudoAceiteSei`.

  // ── Urbanístico / edificação (coluna H) ──
  numeroUso: "H13",
  corredor:  "H16",
  faixa:     "H17",
  caixa:     "H18",
  /* Área Permeável — campo criado no LIP do Aceite em 18/09/2026 ("2 CRIA", Fábio).
   * H19 alimenta a fórmula H20 = L9 − H19 (Área Impermeável) do template. */
  areaPermeavel: "H19",
  volAt:     "H22",
  caixas:    "H23",
  pav:       "H24",
  unid:      "H25",
  areaExistente: "H26",
  iptu:      "H28",

  // ── Áreas e vistoria (coluna L) ──
  areaVerticalRecuo:        "L5",
  areaVerticalForaRecuo:    "L6",
  areaNaoVerticalRecuo:     "L7",
  areaNaoVerticalForaRecuo: "L8",
  areaTerreno:              "L9",
  areaOcupadaAtivComercial: "L13",
  vistoriaEstruturaConcluida: "L16",
  vistoriaAltMax21m:          "L17",
  vistoriaOcupaPublica:       "L18",
  vistoriaAreaAeroportuaria:  "L19",
  vistoriaAreaMilitar:        "L20",
  vistoriaAguasPluviais:      "L21",
  vistoriaEsquadriaDivisa:    "L22",
  vistoriaCalcadas:           "L23",
  vistoriaLevante:            "L24",
  vistoriaUnidadeTerritorial: "L25",
  edDescaracterizada:         "L29",
  carimboConforme:            "L30",
};

/** Chaves primitivas cuja ausência interessa reportar (as demais são opcionais por lei). */
const CHAVES_ESPERADAS = [
  "proprietario", "logradouro", "processo", "quadra", "lote", "bairro",
  "areaTerreno", "certidao", "levantamento", "laudo", "vistoria",
  "tempoExistencia",
];

function valor(d: DadosLip, chave: string): string {
  const v = d[chave]?.valor;
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.toUpperCase() === "NP" ? "NP" : s;
}

/** Área em número quando dá, texto quando não — o Excel precisa do número pra somar L5:L8. */
function areaNumerica(bruto: string): number | string {
  if (!bruto || bruto === "NP") return bruto;
  let s = bruto.replace(/m²|m2/gi, "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : bruto;
}

const CHAVES_AREA = new Set([
  "areaVerticalRecuo", "areaVerticalForaRecuo", "areaNaoVerticalRecuo",
  "areaNaoVerticalForaRecuo", "areaTerreno", "areaExistente",
  "areaOcupadaAtivComercial", "areaPermeavel", "volAt", "caixas", "pav", "unid",
]);

/**
 * Resolve a comprovação do tempo de existência na ordem que o Fábio
 * definiu: FOTO primeiro; documentação só quando a foto não identifica.
 *
 * A fórmula do template (aba Aceite, M47) faz o contrário —
 * `IF(D26<>"NP","Dec Energia", IF(D25<>0,"Foto Google",""))` — basta ter
 * documento pra ela parar de olhar a foto, e ela só sabe escrever
 * "Dec Energia" ou "Foto Google". Aqui a precedência é corrigida e o
 * tipo sai do que o analista escreveu em `tipoComprovacao`, que a LC nº
 * 314/2018, Art. 7º, § 1º admite em quatro formas: declaração de
 * energização, talão de IPTU anterior a 19/10/1995, averbação em
 * cartório e planta aerofotogramétrica de 1992.
 */
export function resolverComprovacao(d: DadosLip): { tipo: string; origem: "foto" | "documento" | "ausente" } {
  const foto = valor(d, "foto");
  const tipoDeclarado = valor(d, "tipoComprovacao");

  /* Foto primeiro: quando ela existe, ELA é a comprovação, e o rótulo é o
   * dela. Deixar `tipoComprovacao` sobrescrever aqui invertia a regra de
   * novo — no processo 25.5.000016900-4 isso produzia
   * `{tipo:"Vistoria Fiscal", origem:"foto"}`, que se contradiz. E
   * "Vistoria Fiscal" não é nem um dos quatro documentos do Art. 7º, § 1º:
   * a vistoria é exigida ALÉM deles ("comprovar-se-á através da Vistoria
   * Fiscal E, pelo menos um, dos seguintes documentos"). */
  if (foto && foto !== "NP") {
    return { tipo: `Imagem aérea / Google Earth (SEI ${foto})`, origem: "foto" };
  }
  if (tipoDeclarado && tipoDeclarado !== "NP") {
    return { tipo: tipoDeclarado, origem: "documento" };
  }
  const dataEnerg = valor(d, "dataEnergizacao");
  if (dataEnerg && dataEnerg !== "NP") {
    return { tipo: `Declaração de energização (${dataEnerg})`, origem: "documento" };
  }
  return { tipo: "", origem: "ausente" };
}

/**
 * Preenche o "Painel do Aceite" de um workbook já carregado.
 * Separado de `gerarLaudoAceiteSei` para poder ser testado sem
 * depender do arquivo em disco.
 */
export function escreverLaudoAceiteSei(
  wb: ExcelJS.Workbook,
  dados: DadosLip,
  opcoes: { codigoProcesso: string; dataEmissao?: Date; assinatura?: string | null },
): { comprovacao: ReturnType<typeof resolverComprovacao>; camposVazios: string[] } {
  const painel = wb.getWorksheet("Painel do Aceite");
  if (!painel) {
    throw new Error('Aba "Painel do Aceite" não encontrada no template do Aceite.');
  }

  /* ── ASSINATURA DO ANALISTA ──
   * Única escrita fora do Painel, porque o Painel não tem campo para ela.
   * `K73` é a âncora da mesclagem K73:N76 do laudo impresso — o bloco entre
   * "Goiânia, <data>" (K72/M72) e o rótulo "Analista Responsável" (K77:N77).
   * Confirmado nas mesclagens do próprio template, não deduzido.
   *
   * O template traz 27 caixas de texto flutuantes em `xl/drawings/drawing1.xml`,
   * uma com a assinatura pronta de cada analista da diretoria, para o analista
   * arrastar a sua à mão. Duas razões para não depender delas: o ExcelJS não
   * reescreve DrawingML (elas se perdem no arquivo gerado, medido em
   * 17/09/2026), e o URBIS já sabe QUEM está assinando. Decisão do Fábio no
   * mesmo dia: "a assinatura é a nossa do URBIS, do usuário". */
  if (opcoes.assinatura) {
    const laudo = wb.getWorksheet("Aceite");
    if (!laudo) throw new Error('Aba "Aceite" não encontrada no template do Aceite.');
    const cel = laudo.getCell("K73");
    cel.value = opcoes.assinatura;
    cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }

  for (const [chave, celula] of Object.entries(MAPA_PAINEL)) {
    const bruto = valor(dados, chave);
    if (!bruto) continue;
    painel.getCell(celula).value = CHAVES_AREA.has(chave) ? areaNumerica(bruto) : bruto;
  }

  // Processo: o LIP pode não ter o campo preenchido; o código do
  // processo é a fonte que nunca falta.
  if (!valor(dados, "processo")) painel.getCell("C6").value = opcoes.codigoProcesso;

  // Uso do Solo (D25): não é exigível no Aceite, mas quando o
  // interessado apresenta, o número é fato e vai pro Painel. O laudo
  // IMPRESSO não tem seção de Uso do Solo — isto não o faz aparecer.
  const usoSolo = valor(dados, "numeroUso");
  if (usoSolo) painel.getCell("D25").value = usoSolo;

  // Comprovação do tempo de existência — precedência corrigida.
  const comprovacao = resolverComprovacao(dados);
  const tempo = valor(dados, "tempoExistencia");
  if (tempo) painel.getCell("D26").value = tempo;
  if (comprovacao.tipo) painel.getCell("D27").value = comprovacao.tipo;

  /* ── A fórmula do laudo impresso tem de sair do caminho ──
   *
   * Corrigir a precedência só no Painel NÃO resolve: as células impressas
   * M46/M47 (mesclagens M46:N46 e M47:N47) são
   *
   *   M46 = IF(D26<>"NP","OK", IF(D25<>0,"OK",""))
   *   M47 = IF(D26<>"NP","Dec Energia", IF(D25<>0,"Foto Google",""))
   *
   * e leem o APOIO, não o Painel. Como escrevemos o tipo resolvido em D27
   * (→ apoio D26), a condição `D26<>"NP"` passa a ser verdadeira SEMPRE e o
   * laudo imprime literalmente "Dec Energia" — inclusive quando a prova é a
   * foto. Medido no processo 25.5.000016900-4 em 17/09/2026: a correção em
   * TypeScript era descartada pela planilha.
   *
   * Além da precedência invertida, a fórmula só sabe escrever dois rótulos,
   * e a LC nº 314/2018, Art. 7º, § 1º admite quatro documentos (energização,
   * talão de IPTU anterior a 19/10/1995, averbação em cartório e planta
   * aerofotogramétrica de 1992). Por isso o veredito entra como LITERAL: a
   * decisão é do sistema, que leu a regra, não da fórmula.
   *
   * É a única fórmula do template que sobrescrevemos, e só porque está
   * errada. Todas as outras (áreas, multas, ocupação do lote) seguem
   * intactas e continuam sendo a fonte da regra. */
  /* ── Única fórmula do template que sobrescrevemos, e com autorização ──
   *
   * O template veio da CHEFIA do Fábio e ele não muda conteúdo dela. Perguntei
   * antes de manter a sobrescrita destas duas células e ele autorizou
   * explicitamente em 17/09/2026: "tá tudo bem sua modificação... não vejo
   * problema... nas células M46/M47". Sem esse aval, o padrão é NÃO alterar o
   * que um ato oficial imprime.
   *
   * Por que ela precisa sair do caminho: corrigir a precedência só no Painel
   * não resolve. As células impressas M46/M47 (mesclagens M46:N46 e M47:N47)
   * leem o APOIO, não o Painel:
   *
   *   M46 = IF(D26<>"NP","OK", IF(D25<>0,"OK",""))
   *   M47 = IF(D26<>"NP","Dec Energia", IF(D25<>0,"Foto Google",""))
   *
   * Como escrevemos o tipo resolvido em D27 (→ apoio D26), `D26<>"NP"` passa a
   * ser verdadeiro SEMPRE e o laudo imprime literalmente "Dec Energia" —
   * inclusive quando a prova é a foto. Medido no processo 25.5.000016900-4.
   *
   * Além da precedência invertida, a fórmula só sabe escrever dois rótulos, e a
   * LC nº 314/2018, Art. 7º, § 1º admite quatro documentos (energização, talão
   * de IPTU anterior a 19/10/1995, averbação em cartório e planta
   * aerofotogramétrica de 1992). Por isso o veredito entra como LITERAL.
   *
   * Todas as outras fórmulas (áreas, multas, ocupação do lote) seguem intactas
   * e continuam sendo a fonte da regra. */
  const laudoImpresso = wb.getWorksheet("Aceite");
  if (laudoImpresso) {
    laudoImpresso.getCell("M46").value = comprovacao.origem === "ausente" ? "" : "OK";
    laudoImpresso.getCell("M47").value = comprovacao.tipo;
  }

  // Data do laudo (L10) — escrita por extenso, como o laudo imprime.
  painel.getCell("L10").value = dataExtenso(opcoes.dataEmissao ?? new Date());

  /* "Despacho CHEADV" (L11) do laudo espera a REFERÊNCIA do despacho, não o
   * texto dele. A chave `despacho` do LIP do Aceite guarda o CORPO em prosa
   * — no processo 25.5.000016900-4 vale "Dando prosseguimento ao trâmite dos
   * presentes autos, temos a informar que, em vistoria...". Mapear `despacho`
   * aqui jogava um parágrafo inteiro numa célula de referência. O número é o
   * `seiCheadv` (7 dígitos), que também alimenta D16. */
  const refCheadv = valor(dados, "seiCheadv");
  if (refCheadv) painel.getCell("L11").value = refCheadv;

  /* ── LOGO ──
   * Pedido do Fábio, 17/09/2026: "não esquece da logo no despacho e no laudo
   * do slot 2". O despacho (docx) já a embarcava; o laudo NÃO tinha nenhuma —
   * o template da chefia não traz `xl/media`, só as caixas de texto das
   * assinaturas. Então a logo é INSERIDA aqui, não herdada.
   *
   * Qual logo: a do URBIS, `public/logo_prefeitura.png` — decisão dele no
   * mesmo dia ("usa a sua logo"). O modelo de despacho da chefia traz uma
   * variante do mesmo brasão numa tela branca larga (1011×174); a nossa é a
   * versão compacta (244×127), que é a que já vai em todos os .docx.
   *
   * Posição: dentro da mesclagem B37:N37, que é o cabeçalho do laudo
   * impresso (44,75pt de altura), alinhada à esquerda — mesmo arranjo do
   * despacho, brasão à esquerda e o texto da secretaria à direita. As
   * coordenadas do ExcelJS são 0-indexadas, então `row: 36` é a linha 37 e
   * `col: 1` é a coluna B.
   *
   * ⚠ Posicionamento calculado pela geometria da planilha, NÃO conferido
   * visualmente — não há renderizador de xlsx nesta máquina. Precisa de uma
   * olhada do Fábio na primeira emissão. */
  try {
    const logoPath = path.join(process.cwd(), "public", "logo_prefeitura.png");
    if (fs.existsSync(logoPath)) {
      const idImagem = wb.addImage({ buffer: fs.readFileSync(logoPath) as any, extension: "png" });
      const abaImpressa = wb.getWorksheet("Aceite");
      abaImpressa?.addImage(idImagem, {
        tl: { col: 1.1, row: 36.1 },
        ext: { width: 100, height: 52 },
        editAs: "oneCell",
      });
    } else {
      console.warn("[laudo/slot2] logo não encontrada em public/logo_prefeitura.png — laudo sai sem brasão.");
    }
  } catch (e) {
    // Laudo sem logo é melhor que laudo não emitido. Mas não em silêncio.
    console.warn("[laudo/slot2] falha ao inserir a logo:", e);
  }

  /* O Excel tem que recalcular ao abrir: escrevemos só as entradas, e
   * todo o laudo impresso é fórmula. Sem isto o arquivo abriria com os
   * valores em cache do template (zeros e "NP" de exemplo). */
  wb.calcProperties.fullCalcOnLoad = true;

  const camposVazios = CHAVES_ESPERADAS.filter((k) => !valor(dados, k));
  return { comprovacao, camposVazios };
}

export async function gerarLaudoAceiteSei(
  dados: DadosLip,
  opcoes: { codigoProcesso: string; dataEmissao?: Date; assinatura?: string | null },
): Promise<ResultadoLaudoAceite> {
  const templatePath = path.join(
    process.cwd(), "public", "templates", "laudo_aceite_sei.xlsm",
  );
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template do Aceite não encontrado: ${templatePath}\n` +
      `Copie o "ACEITE PARA O CLAUD.xlsm" para public/templates/laudo_aceite_sei.xlsm`,
    );
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const r = escreverLaudoAceiteSei(wb, dados, opcoes);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(arrayBuffer), ...r };
}
