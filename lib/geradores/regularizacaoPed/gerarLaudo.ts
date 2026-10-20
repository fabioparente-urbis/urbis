// ============================================================
// SLOT 3 — REGULARIZAÇÃO PED. CÓPIA POR LEITURA de lib/geradores/gerarLaudo.ts
// (Slot 1), feita em 16/10/2026 a pedido do Fábio ("o Slot 3 começa copiando 100%
// o Slot 1"). Laudo idêntico ao do Slot 1 na data da cópia, sobre planilha
// PRÓPRIA (public/templates/laudo_regularizacao_ped.xlsm, cópia byte a byte de
// laudo_regularizacao.xlsm). Mudar a planilha ou o código de um slot NÃO muda o outro.
// ============================================================
// ============================================================
// lib/geradores/gerarLaudo.ts
// URBIS — Gerador de Laudo de Regularização (.xlsm)
//
// Dependência: exceljs  →  npm install exceljs
// Template:    public/templates/laudo_regularizacao_ped.xlsm
//
// LÓGICA DE PREENCHIMENTO:
//   Células com "0"      → substituídas pelo valor do processo
//   Células com "(   )"  → "(X)" se marcado / "(   )" se não
//   Células com "Pag:0"  → "Pag:<número>"
//   Data/hora linha 65   → nome do analista + data por extenso
// ============================================================

import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

/** SIM / NÃO / Não Aplicável — para checkboxes do laudo */
export type SimNao = "SIM" | "NAO" | "NA";

export interface DadosLaudo {
  // ── Identificação ──────────────────────────────────────────
  numeroProcesso: string;             // D6
  proprietario: string;               // D7
  logradouro: string;                 // E8
  quadra: string;                     // E9
  lote: string;                       // H9
  bairro: string;                     // K9

  // ── Despacho CHEADV ────────────────────────────────────────
  numDespachoCheadv?: string;         // M10
  pagDespachoCheadv?: string | number;// N10  → renderiza "Pag:X"

  // ── Documentação ───────────────────────────────────────────
  // col D = status (ex: "SIM", "NÃO", "N.A.")
  // col K = número do documento ou observação
  certidaoRegistro?: string;          // D12
  artRrtLevantamento?: string;        // K12
  levantamentoArquitetonico?: string; // D13
  laudoTecnico?: string;              // K13
  areaBemTombado?: string;            // D14
  certidaoRememDesm?: string;         // K14
  areaAeroportuaria?: string;         // D15
  vistoriaFiscalFotografica?: string; // K15
  embargo?: string;                   // D16
  dataEmbargo?: string;               // K16
  outorgaOnerosa?: string;            // D17
  despachoCheadvDoc?: string;         // K17
  imagemGoogleEarth?: string;         // K18

  // ── Uso do Solo ────────────────────────────────────────────
  numUsoSolo?: string;                // D20
  tipoUsoSolo?: string;               // K20
  unidadeTerritorial?: string;        // D21  ex: "ZR-1"
  certCorredorViario?: string;        // K21
  cnae1?: string;                     // G22
  descCnae1?: string;                 // K22
  cnae2?: string;                     // G23
  descCnae2?: string;                 // K23
  /** CNAE 1 a 10 do LIP (código + descrição). O laudo cita só os que não
   *  forem NP. Ver montarBlocoCnae. */
  cnaes?: { codigo?: string; descricao?: string }[];
  corredorViario?: string;            // D24
  obsCorredorViario?: string;         // K24

  // ── Poço de Infiltração / Cx. de Recarga ───────────────────
  areaConstruida: number;             // E27  m²
  pocoInfiltracao: SimNao;            // K27(SIM) / N27(NÃO)
  indiceCaptacao?: number;            // E30
  areaImpermeabilizada?: number;      // I30  m²
  volumeCaixas?: number;              // L30  m³
  numCaixas?: number;                 // L31

  // ── Da Análise — Áreas ─────────────────────────────────────
  areaLote: number;                   // D33  m²
  areaRegularizar: number;            // K33  m²
  areaExistenteAprovada?: number;     // K34  m²
  areaTotalConstrucao: number;        // K35  m²
  numPavimentos: number;              // K36
  numUnidades: number;                // N36
  areaAtividadeEconomica?: number;    // I37  m² (uso definido)

  // ── Da Análise — Checkboxes ────────────────────────────────
  // col J = SIM(   ) / (X)  |  col M = NÃO(   ) / (X)
  edificacaoEstruturalDef: SimNao;    // lin 38
  ultrapassaAltura12m: SimNao;        // lin 39
  ocupaRecuoFrontal: SimNao;          // lin 40
  maxSetePavimentos: SimNao;          // lin 41
  alturaMaxima21m: SimNao;            // lin 42
  naoObstruiAreaPublica: SimNao;      // lin 43

  // ── Vistoria Fiscal — Checkboxes ───────────────────────────
  levantamentoConferido: SimNao;      // lin 46
  aberturaPortasRespeita: SimNao;     // lin 47
  respeitaPasPublicoVizinhos: SimNao; // lin 48
  apresentaCalcadaRegular: SimNao;    // lin 49
  apresentaPocoRecarga: SimNao;       // lin 50
  aberturaPortasNaDivisa: SimNao;     // lin 51
  lancaAguasPluviais: SimNao;         // lin 59

  // ── ANAC / Exército ────────────────────────────────────────
  // Número da folha no processo, ou "N.A."
  flAnac?: string;                    // N52
  flExercito?: string;                // N53

  // ── Taxa de Regularização ──────────────────────────────────
  areaTotalRegularizar: number;       // K61  m²
  areaMultaRecuoFrontal?: number;     // B64  m²
  areaMultaVertical?: number;         // F64  m²
  areaMultaGeral?: number;            // K64  m²

  // ── Áreas do Projeto (rodapé) ──────────────────────────────
  areaTerreno: number;                // E66  m²
  areaAprovadaRodape?: number;        // E67  m²
  areaTotalRegRodape: number;         // E68  m²
  areaTotalConstruida: number;        // E69  m²

  // ── Emissão ────────────────────────────────────────────────
  nomeAnalista: string;               // K66 (mesclada K66:N72)
  dataEmissao?: Date;                 // K65 (mesclada K65:N65) → "Goiânia, DD de mês de AAAA"

  // ── Observações finais (área livre linhas 70-72) ───────────
  observacoesFinais?: string;         // B70 (mescla B70:J70)
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const MESES_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function dataExtenso(d: Date): string {
  return `Goiânia, ${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Checkbox: retorna "(X)" se val === alvo, senão "(   )" */
function ck(val: SimNao, alvo: "SIM" | "NAO"): string {
  return val === alvo ? "(X)" : "(   )";
}

function set(ws: ExcelJS.Worksheet, coord: string, value: unknown) {
  if (value === undefined || value === null) return;
  ws.getCell(coord).value = value as ExcelJS.CellValue;
}

function setRC(ws: ExcelJS.Worksheet, row: number, col: number, value: unknown) {
  if (value === undefined || value === null) return;
  ws.getCell(row, col).value = value as ExcelJS.CellValue;
}

// ─────────────────────────────────────────────────────────────
// BLOCO "ATIVIDADE ECONÔMICA" (CNAEs) — pedido do Fábio, 20/10/2026
//
// O laudo cita SÓ os CNAEs que não forem NP (de 1 a 10), renumerados 1, 2, 3…
// na ordem do LIP. Quem decide é o CNAE, não a pergunta "Uso de Solo sem uso
// definido?": sem uso definido (CNAE 8) a leitura já deixa todos em NP, e o
// laudo sai como sempre saiu. (Na 1ª versão, de 20/10, a pergunta decidia —
// mas a leitura automática respondia ela ao contrário até a mesma data.)
//   – até 2 → mesmo layout de sempre (falta = "NP");
//   – 3 ou 4 → as mesmas 2 linhas, mas com 2 CNAEs por linha (um de cada lado);
//   – 5 a 10 → 2 CNAEs por linha e o bloco ganha linhas (3, 4 ou 5). Sempre
//     em par: com número ímpar sobra a caixa da direita vazia.
// ─────────────────────────────────────────────────────────────

const BLOCO_CNAE_LINHA = 22;      // primeira linha do bloco no template
const BLOCO_CNAE_LINHAS_HOJE = 2; // 22 e 23
const ULTIMA_LINHA_IMPRESSAO = 73; // área de impressão B5:N73

function ehNP(v?: string): boolean {
  const t = (v ?? "").trim().toUpperCase();
  return t === "" || t === "NP" || t === "N.P." || t === "N/P";
}

/** CNAEs que o laudo cita quando a caixa é "Não". */
export function cnaesCitados(dados: Pick<DadosLaudo, "cnaes">): { codigo: string; descricao: string }[] {
  return (dados.cnaes ?? [])
    .filter((c) => !ehNP(c.codigo) || !ehNP(c.descricao))
    .map((c) => ({
      codigo: ehNP(c.codigo) ? "NP" : c.codigo!.trim(),
      descricao: ehNP(c.descricao) ? "NP" : c.descricao!.trim(),
    }));
}

function montarBlocoCnae(ws: ExcelJS.Worksheet, dados: DadosLaudo) {
  const L = BLOCO_CNAE_LINHA;
  // Sem a lista (chamador antigo), cai nos dois campos de sempre.
  const lista = cnaesCitados({
    cnaes: dados.cnaes ?? [
      { codigo: dados.cnae1, descricao: dados.descCnae1 },
      { codigo: dados.cnae2, descricao: dados.descCnae2 },
    ],
  });
  if (lista.length <= 2) {
    set(ws, `G${L}`, lista[0]?.codigo ?? "NP");
    set(ws, `K${L}`, lista[0]?.descricao ?? "NP");
    set(ws, `G${L + 1}`, lista[1]?.codigo ?? "NP");
    set(ws, `K${L + 1}`, lista[1]?.descricao ?? "NP");
    return;
  }

  const linhas = Math.max(BLOCO_CNAE_LINHAS_HOJE, Math.ceil(lista.length / 2));
  const extra = linhas - BLOCO_CNAE_LINHAS_HOJE;

  // Estilos de referência, lidos antes de qualquer mudança.
  const estiloRotulo = ws.getCell(`F${L}`).style;
  const estiloValor = ws.getCell(`K${L}`).style;

  // ExcelJS move valores/estilos no spliceRows mas NÃO move as mesclagens:
  // desfaz tudo do bloco para baixo e refaz deslocado.
  const merges: string[] = [...((ws.model as unknown as { merges: string[] }).merges ?? [])];
  const abaixo: string[] = [];
  for (const m of merges) {
    const top = Number(/^[A-Z]+(\d+)/.exec(m)?.[1] ?? 0);
    if (top < L) continue;
    ws.unMergeCells(m);
    if (top >= L + BLOCO_CNAE_LINHAS_HOJE) abaixo.push(m);
  }
  if (extra > 0) {
    ws.spliceRows(L + BLOCO_CNAE_LINHAS_HOJE, 0, ...Array.from({ length: extra }, () => []));
    for (const m of abaixo) {
      ws.mergeCells(m.replace(/(\d+)/g, (n) => String(Number(n) + extra)));
    }
    ws.pageSetup.printArea = `B5:N${ULTIMA_LINHA_IMPRESSAO + extra}`;
  } else {
    for (const m of abaixo) ws.mergeCells(m);
  }

  // Rótulo "Atividade Econômica:" ocupando o bloco todo (B:C).
  const fim = L + linhas - 1;
  const rotuloBloco = ws.getCell(`B${L}`).style;
  for (let r = L; r <= fim; r++) {
    for (let c = 2; c <= 14; c++) ws.getCell(r, c).value = null;
    ws.getCell(r, 2).style = rotuloBloco;
    ws.getCell(r, 3).style = rotuloBloco;
  }
  ws.getCell(`B${L}`).value = "Atividade Econômica:";
  ws.mergeCells(`B${L}:C${fim}`);

  // Cada linha: D rótulo | E código | F:I descrição || J rótulo | K código | L:N descrição
  const lados = [
    { rot: 4, cod: 5, desc: [6, 9] },
    { rot: 10, cod: 11, desc: [12, 14] },
  ];
  const borda: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
  };
  for (let i = 0; i < linhas; i++) {
    const r = L + i;
    ws.getRow(r).height = 40;
    lados.forEach((lado, j) => {
      const idx = i * 2 + j;
      const item = lista[idx];
      const rot = ws.getCell(r, lado.rot);
      rot.style = { ...estiloRotulo, border: borda, alignment: { horizontal: "right", vertical: "middle" } };
      rot.value = item ? `CNAE (${idx + 1}):` : null;
      const cod = ws.getCell(r, lado.cod);
      cod.style = { ...estiloValor, border: borda, alignment: { horizontal: "center", vertical: "middle" } };
      cod.value = item?.codigo ?? null;
      for (let c = lado.desc[0]; c <= lado.desc[1]; c++) {
        ws.getCell(r, c).style = {
          ...estiloValor, border: borda,
          font: { ...estiloValor.font, size: 10 },
          alignment: { horizontal: "left", vertical: "middle", wrapText: true },
        };
      }
      ws.getCell(r, lado.desc[0]).value = item?.descricao ?? null;
      ws.mergeCells(r, lado.desc[0], r, lado.desc[1]);
    });
  }
}

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

export async function gerarLaudo(dados: DadosLaudo): Promise<Buffer> {
  const templatePath = path.join(
    process.cwd(),
    "public", "templates", "laudo_regularizacao_ped.xlsm"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template não encontrado: ${templatePath}\n` +
      `Copie laudo_regularizacao_ped.xlsm para public/templates/`
    );
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  const ws = wb.getWorksheet("Regularização");
  if (!ws) throw new Error('Aba "Regularização" não encontrada no template.');

  // ── IDENTIFICAÇÃO ─────────────────────────────────────────
  set(ws, "D6", dados.numeroProcesso);
  set(ws, "D7", dados.proprietario);
  set(ws, "E8", dados.logradouro);
  set(ws, "E9", dados.quadra);
  set(ws, "H9", dados.lote);
  set(ws, "K9", dados.bairro);

  // ── DESPACHO CHEADV ───────────────────────────────────────
  set(ws, "M10", dados.numDespachoCheadv ?? "");
  if (dados.pagDespachoCheadv !== undefined) {
    set(ws, "N10", `Pag:${dados.pagDespachoCheadv}`);
  }

  // ── DOCUMENTAÇÃO ─────────────────────────────────────────
  set(ws, "D12", dados.certidaoRegistro ?? "");
  set(ws, "K12", dados.artRrtLevantamento ?? "");
  set(ws, "D13", dados.levantamentoArquitetonico ?? "");
  set(ws, "K13", dados.laudoTecnico ?? "");
  set(ws, "D14", dados.areaBemTombado ?? "");
  set(ws, "K14", dados.certidaoRememDesm ?? "");
  set(ws, "D15", dados.areaAeroportuaria ?? "");
  set(ws, "K15", dados.vistoriaFiscalFotografica ?? "");
  set(ws, "D16", dados.embargo ?? "");
  set(ws, "K16", dados.dataEmbargo ?? "");
  set(ws, "D17", dados.outorgaOnerosa ?? "");
  set(ws, "K17", dados.despachoCheadvDoc ?? "");
  set(ws, "K18", dados.imagemGoogleEarth ?? "");

  // ── USO DO SOLO ───────────────────────────────────────────
  set(ws, "D20", dados.numUsoSolo ?? "");
  set(ws, "K20", dados.tipoUsoSolo ?? "");
  set(ws, "D21", dados.unidadeTerritorial ?? "");
  set(ws, "K21", dados.certCorredorViario ?? "");
  // G22/K22/G23/K23 (CNAEs) → montarBlocoCnae, no fim: ele pode inserir linhas.
  set(ws, "D24", dados.corredorViario ?? "");
  set(ws, "K24", dados.obsCorredorViario ?? "");

  // ── POÇO DE INFILTRAÇÃO ───────────────────────────────────
  set(ws, "E27", dados.areaConstruida);
  set(ws, "K27", ck(dados.pocoInfiltracao, "SIM")); // SIM
  set(ws, "N27", ck(dados.pocoInfiltracao, "NAO")); // NÃO
  set(ws, "E30", dados.indiceCaptacao ?? 0);
  set(ws, "I30", dados.areaImpermeabilizada ?? 0);
  set(ws, "L30", dados.volumeCaixas ?? 0);
  set(ws, "L31", dados.numCaixas ?? 0);

  // ── DA ANÁLISE — ÁREAS ────────────────────────────────────
  set(ws, "D33", dados.areaLote);
  set(ws, "K33", dados.areaRegularizar);
  set(ws, "K34", dados.areaExistenteAprovada ?? 0);
  set(ws, "K35", dados.areaTotalConstrucao);
  set(ws, "K36", dados.numPavimentos);
  set(ws, "N36", dados.numUnidades);
  set(ws, "I37", dados.areaAtividadeEconomica ?? 0);

  // ── DA ANÁLISE — CHECKBOXES ───────────────────────────────
  // col J(10) = SIM checkbox  |  col M(13) = NÃO checkbox
  const checksAnalise: [number, SimNao][] = [
    [38, dados.edificacaoEstruturalDef],
    [39, dados.ultrapassaAltura12m],
    [40, dados.ocupaRecuoFrontal],
    [41, dados.maxSetePavimentos],
    [42, dados.alturaMaxima21m],
    [43, dados.naoObstruiAreaPublica],
  ];
  for (const [linha, val] of checksAnalise) {
    setRC(ws, linha, 10, ck(val, "SIM")); // J
    setRC(ws, linha, 13, ck(val, "NAO")); // M
  }

  // ── VISTORIA FISCAL — CHECKBOXES ─────────────────────────
  const checksVistoria: [number, SimNao][] = [
    [46, dados.levantamentoConferido],
    [47, dados.aberturaPortasRespeita],
    [48, dados.respeitaPasPublicoVizinhos],
    [49, dados.apresentaCalcadaRegular],
    [50, dados.apresentaPocoRecarga],
    [51, dados.aberturaPortasNaDivisa],
    [59, dados.lancaAguasPluviais],
  ];
  for (const [linha, val] of checksVistoria) {
    setRC(ws, linha, 10, ck(val, "SIM")); // J
    setRC(ws, linha, 13, ck(val, "NAO")); // M
  }

  // ── ANAC / EXÉRCITO ───────────────────────────────────────
  set(ws, "N52", dados.flAnac ?? "");
  set(ws, "N53", dados.flExercito ?? "");

  // ── TAXA DE REGULARIZAÇÃO ─────────────────────────────────
  set(ws, "K61", dados.areaTotalRegularizar);
  set(ws, "B64", dados.areaMultaRecuoFrontal ?? 0);
  set(ws, "F64", dados.areaMultaVertical ?? 0);
  set(ws, "K64", dados.areaMultaGeral ?? 0);

  // ── ÁREAS DO PROJETO — RODAPÉ ────────────────────────────
  set(ws, "E66", dados.areaTerreno);
  set(ws, "E67", dados.areaAprovadaRodape ?? 0);
  set(ws, "E68", dados.areaTotalRegRodape);
  set(ws, "E69", dados.areaTotalConstruida);

  // ── EMISSÃO ───────────────────────────────────────────────
  const dataEmissao = dados.dataEmissao ?? new Date();
  // K65 é a âncora da mesclagem K65:N65. Até 26/08/2026 o template trazia duas
  // mesclagens separadas — K65:L65 com o texto "Goiânia, " e M65:N65 com a data
  // em formato de data (`d"  "mmmm", "yyyy`). Escrever a frase por extenso nas
  // duas fazia a data sair duplicada no laudo; deixar M65 vazia fazia o formato
  // de data render "00/01/1900". Agora é uma célula só, uma escrita só.
  set(ws, "K65", dataExtenso(dataEmissao));
  ws.getCell("K65").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  set(ws, "K66", dados.nomeAnalista);
  ws.getCell("K66").alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
  // No template original, K66 (mesclada K66:N72) trazia um texto de nota
  // em tamanho 8 — ilegível quando impresso, e agora essa célula carrega
  // a assinatura de verdade (nome, cargo, CAU/CREA), não uma nota de
  // rodapé. Sobe pra 12, igual ao resto do corpo do laudo (D6, D7, D12,
  // "Área do terreno:" etc.).
  ws.getCell("K66").font = { ...ws.getCell("K66").font, size: 12 };

  // ── OBSERVAÇÕES FINAIS ────────────────────────────────────
  // Célula B70 é a âncora da mesclagem B70:J70 — escrever em D70 (célula
  // "escrava" da mesclagem) deixava o valor fora do range visível/mesclado
  // do Excel, produzindo a desconfiguração relatada na linha 70.
  if (dados.observacoesFinais) {
    set(ws, "B70", dados.observacoesFinais);
  }

  // ── ATIVIDADE ECONÔMICA (CNAEs) ───────────────────────────
  // Por último de propósito: com mais de 4 CNAEs o bloco ganha linhas e
  // empurra tudo o que vem abaixo — os endereços fixos acima (E27, K61,
  // B70…) já foram escritos.
  montarBlocoCnae(ws, dados);

  // ── Serializar e retornar ─────────────────────────────────
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}