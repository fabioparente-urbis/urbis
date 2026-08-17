// ============================================================
// lib/geradores/gerarLaudo.ts
// URBIS — Gerador de Laudo de Regularização (.xlsm)
//
// Dependência: exceljs  →  npm install exceljs
// Template:    public/templates/laudo_regularizacao.xlsm
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
  nomeAnalista: string;               // M65
  dataEmissao?: Date;                 // K65  → "Goiânia, DD de mês de AAAA"

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
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────

export async function gerarLaudo(dados: DadosLaudo): Promise<Buffer> {
  const templatePath = path.join(
    process.cwd(),
    "public", "templates", "laudo_regularizacao.xlsm"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template não encontrado: ${templatePath}\n` +
      `Copie laudo_regularizacao.xlsm para public/templates/`
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
  set(ws, "G22", dados.cnae1 ?? "");
  set(ws, "K22", dados.descCnae1 ?? "");
  set(ws, "G23", dados.cnae2 ?? "");
  set(ws, "K23", dados.descCnae2 ?? "");
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
  set(ws, "K65", dataExtenso(dataEmissao));
  set(ws, "M65", dataExtenso(dataEmissao));
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

  // ── Serializar e retornar ─────────────────────────────────
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}