/**
 * scripts/testar_geradores_slots_3_4_ped.mts — Fase 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md.
 *
 * Prova que os DOCUMENTOS do Slot 3 e do Slot 4 saem idênticos aos do Slot 1 e do Slot 2 na
 * data da cópia: gera o mesmo documento pelos dois geradores, com os mesmos dados, abre o
 * .docx/.xlsm (são zip) e compara cada parte interna byte a byte. Fica de fora só
 * `docProps/core.xml`, que carrega a hora em que o arquivo foi gerado.
 *
 * Antes de comparar Slot 1 × Slot 3, o teste gera o Slot 1 DUAS vezes e confere que sai igual:
 * se o gerador tivesse algo aleatório, a comparação entre slots não provaria nada.
 *
 * Não grava nada no banco e não consome número. Usa a logo e as planilhas de public/.
 *
 *   npx tsx scripts/testar_geradores_slots_3_4_ped.mts
 *
 * Quando um documento do Slot 3/4 for mudado DE PROPÓSITO, a comparação dele passa a falhar —
 * e é para falhar: ajustar este teste junto, dizendo o que mudou.
 */
import JSZip from "jszip";

import * as g1 from "../lib/geradores";
import * as g3 from "../lib/geradores/regularizacaoPed/geradores";
import { gerarLaudo as laudo1, type DadosLaudo } from "../lib/geradores/gerarLaudo";
import { gerarLaudo as laudo3 } from "../lib/geradores/regularizacaoPed/gerarLaudo";

import { gerarDespachoAceiteSei } from "../lib/geradores/aceiteSei/gerarDespachoAceiteSei";
import { gerarDespachoAceitePed } from "../lib/geradores/aceitePed/gerarDespachoAceitePed";
import { gerarDespachoInternoAceiteSei } from "../lib/geradores/aceiteSei/gerarDespachoInternoAceiteSei";
import { gerarDespachoInternoAceitePed } from "../lib/geradores/aceitePed/gerarDespachoInternoAceitePed";
import { gerarIndeferimentoAceiteSei, gerarArquivamentoAceiteSei } from "../lib/geradores/aceiteSei/gerarParecerAceiteSei";
import { gerarIndeferimentoAceitePed, gerarArquivamentoAceitePed } from "../lib/geradores/aceitePed/gerarParecerAceitePed";
import { gerarLaudoAceiteSei } from "../lib/geradores/aceiteSei/gerarLaudoAceiteSei";
import { gerarLaudoAceitePed } from "../lib/geradores/aceitePed/gerarLaudoAceitePed";

let falhas = 0;
let total = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  total++;
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const VOLATEIS = new Set(["docProps/core.xml", "docProps/app.xml"]);

/** Partes do zip que diferem entre dois documentos (ignorando data de geração). */
async function diferencas(a: Buffer, b: Buffer): Promise<string[]> {
  const [za, zb] = [await JSZip.loadAsync(a), await JSZip.loadAsync(b)];
  const nomes = new Set([...Object.keys(za.files), ...Object.keys(zb.files)]);
  const difs: string[] = [];
  for (const n of [...nomes].sort()) {
    if (VOLATEIS.has(n) || za.files[n]?.dir || zb.files[n]?.dir) continue;
    const [fa, fb] = [za.file(n), zb.file(n)];
    if (!fa || !fb) { difs.push(`${n} (só em um)`); continue; }
    const [ba, bb] = [await fa.async("nodebuffer"), await fb.async("nodebuffer")];
    if (!ba.equals(bb)) difs.push(n);
  }
  return difs;
}

async function comparar(nome: string, gerar: () => Promise<Buffer>, gerarCopia: () => Promise<Buffer>) {
  const [o1, o2, c] = [await gerar(), await gerar(), await gerarCopia()];
  const determinismo = await diferencas(o1, o2);
  t(`${nome}: original é determinístico`, determinismo.length === 0, determinismo.join(", "));
  const d = await diferencas(o1, c);
  t(`${nome}: cópia idêntica ao original`, d.length === 0, d.join(", "));
}

// ── Dados de teste (fictícios) ────────────────────────────────────────────────
const assinante = { nome: "Analista de Teste", matricula: "000", cargo: "Analista", registro: "CAU A0000" };
const gerente = { nome: "Gerente de Teste", matricula: "001", cargo: "Gerente" };
const diretora = { nome: "Diretora de Teste", matricula: "002", cargo: "Diretora" };
const analises = [{ numero: 1, data: "01/10/2026" }, { numero: 2, data: "10/10/2026", ultima: true }];
const naoConformesAgrupados = [
  { texto: "Apresentar ART de levantamento.", grupo: "DOCUMENTOS", ordem: 1 },
  { texto: "Corrigir quadro de áreas.", grupo: "PROJETO", ordem: 2 },
];
const base = {
  processo: "00000.000000/2026-00", interessado: "INTERESSADO DE TESTE", numeroProcessoFisico: "123/2026",
  numeroDespacho: "999/2026", naoConformes: ["Item 1", "Item 2"], naoConformesAgrupados,
  observacoes: "Observação de teste.", observacoesPorAba: { "1. Documentos": "obs aba" }, analises,
  assinante, data: "16/10/2026",
};
const foto = { base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", tipo: "png" as const, legenda: "foto de teste" };

// ─────────────────────────────────────────────────────────────────────────────
secao("Slot 3 ≡ Slot 1 — despacho, indeferimento, arquivamento, despacho interno");
for (const corpoPersonalizado of [undefined, "PENDÊNCIA 1\nPENDÊNCIA 2"]) {
  for (const tipo of [null, "regularizacao"] as const) {
    const tipo3 = tipo === null ? null : "slot_03";
    await comparar(`despacho (tipo=${tipo}, padrão=${!!corpoPersonalizado})`,
      () => g1.gerarDespachoRegularizacao({ ...base, tipoProcesso: tipo, corpoPersonalizado }),
      () => g3.gerarDespachoRegularizacao({ ...base, tipoProcesso: tipo3, corpoPersonalizado }));
  }
}
{
  const ind = { processo: base.processo, interessado: base.interessado, analises, observacoes: "obs", assinante, gerente, diretora, numeroParecer: "77/2026", assunto: "ALVARÁ DE REGULARIZAÇÃO", data: base.data };
  await comparar("indeferimento", () => g1.gerarIndeferimento(ind), () => g3.gerarIndeferimento(ind));
  await comparar("indeferimento com foto", () => g1.gerarIndeferimento({ ...ind, fotos: [foto] }), () => g3.gerarIndeferimento({ ...ind, fotos: [foto] }));
  const arq = { processo: base.processo, interessado: base.interessado, assinante, gerente, diretora, numeroParecer: "78/2026", assunto: "ALVARÁ DE REGULARIZAÇÃO", data: base.data };
  await comparar("arquivamento", () => g1.gerarArquivamento(arq), () => g3.gerarArquivamento(arq));
  const di = { processo: base.processo, interessado: base.interessado, numeroDespacho: "55/2026", data: base.data, tipoProcesso: "Regularização", destino: "CHEADV", corpo: "Texto do despacho interno.\nSegunda linha.", assinante };
  await comparar("despacho interno", () => g1.gerarDespachoInterno(di), () => g3.gerarDespachoInterno(di));
}

secao("Slot 3 ≡ Slot 1 — laudo (.xlsm)");
{
  const dados: DadosLaudo = {
    numeroProcesso: base.processo, proprietario: base.interessado, logradouro: "RUA DE TESTE", quadra: "10", lote: "5", bairro: "CENTRO",
    numDespachoCheadv: "12/2026", pagDespachoCheadv: 3, certidaoRegistro: "SIM", levantamentoArquitetonico: "SIM",
    areaConstruida: 180.5, pocoInfiltracao: "NA", areaLote: 360, areaRegularizar: 180.5, areaTotalConstrucao: 180.5,
    numPavimentos: 1, numUnidades: 1, edificacaoEstruturalDef: "SIM", ultrapassaAltura12m: "NAO", ocupaRecuoFrontal: "NAO",
    maxSetePavimentos: "SIM", alturaMaxima21m: "SIM", naoObstruiAreaPublica: "SIM", levantamentoConferido: "SIM",
    aberturaPortasRespeita: "SIM", respeitaPasPublicoVizinhos: "SIM", apresentaCalcadaRegular: "SIM",
    apresentaPocoRecarga: "NA", aberturaPortasNaDivisa: "NAO",
  } as DadosLaudo;
  await comparar("laudo da Regularização", () => laudo1(dados), () => laudo3(dados));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("Slot 4 ≡ Slot 2 — despacho, indeferimento, arquivamento, despacho interno");
for (const corpoPersonalizado of [undefined, "PENDÊNCIA 1\nPENDÊNCIA 2"]) {
  const d = { ...base, assunto: "ALVARÁ DE ACEITE", seiCheadv: "12345678", corpoPersonalizado };
  await comparar(`despacho (padrão=${!!corpoPersonalizado})`,
    async () => (await gerarDespachoAceiteSei(d)).buffer, async () => (await gerarDespachoAceitePed(d)).buffer);
}
{
  const ind = { processo: base.processo, interessado: base.interessado, analises, observacoes: "obs", assinante, gerente, diretora, numeroParecer: "77/2026", assunto: "ALVARÁ DE ACEITE", data: base.data, fotos: [foto] };
  await comparar("indeferimento", () => gerarIndeferimentoAceiteSei(ind), () => gerarIndeferimentoAceitePed(ind));
  const arq = { processo: base.processo, interessado: base.interessado, assinante, gerente, diretora, numeroParecer: "78/2026", assunto: "ALVARÁ DE ACEITE", data: base.data };
  await comparar("arquivamento", () => gerarArquivamentoAceiteSei(arq), () => gerarArquivamentoAceitePed(arq));
  const di = { processo: base.processo, interessado: base.interessado, numeroDespacho: "55/2026", data: base.data, tipoProcesso: "Aceite", destino: "CHEADV", corpo: "Texto.\nLinha 2.", assinante };
  await comparar("despacho interno", () => gerarDespachoInternoAceiteSei(di), () => gerarDespachoInternoAceitePed(di));
}

secao("Slot 4 ≡ Slot 2 — laudo (.xlsm)");
{
  const c = (valor: string) => ({ valor });
  const dados = {
    proprietario: c(base.interessado), logradouro: c("RUA DE TESTE"), quadra: c("10"), lote: c("5"), bairro: c("CENTRO"),
    areaAceite: c("150,00"), areaExistente: c("40,00"), areaLote: c("360,00"), caixa: c("Não"), fotoGoogleEarth: c("98765"),
  };
  const opcoes = { codigoProcesso: base.processo, dataEmissao: new Date("2026-10-16T12:00:00Z"), assinatura: "Analista de Teste" };
  const [r2a, r2b, r4] = [await gerarLaudoAceiteSei(dados, opcoes), await gerarLaudoAceiteSei(dados, opcoes), await gerarLaudoAceitePed(dados, opcoes)];
  const det = await diferencas(r2a.buffer, r2b.buffer);
  t("laudo do Aceite: original é determinístico", det.length === 0, det.join(", "));
  const d = await diferencas(r2a.buffer, r4.buffer);
  t("laudo do Aceite: cópia idêntica ao original", d.length === 0, d.join(", "));
  t("laudo do Aceite: mesma comprovação e mesmos campos vazios",
    JSON.stringify([r2a.comprovacao, r2a.camposVazios]) === JSON.stringify([r4.comprovacao, r4.camposVazios]));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("isolamento — rotas e geradores do Slot 3/4 não usam código do Slot 1/2");
{
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const raiz = new URL("..", import.meta.url).pathname;
  const listar = (dir: string): string[] =>
    readdirSync(join(raiz, dir)).flatMap((n) => {
      const rel = join(dir, n);
      return statSync(join(raiz, rel)).isDirectory() ? listar(rel) : /\.(ts|tsx)$/.test(n) ? [rel] : [];
    });
  const PASTAS = [
    "app/api/analise-regularizacao-ped", "app/api/despacho-regularizacao-ped", "app/api/mac/regularizacao-ped",
    "lib/geradores/regularizacaoPed", "app/api/analise-aceite-ped", "app/api/despacho-aceite-ped",
    "app/api/mac/aceite-ped", "lib/geradores/aceitePed",
    // Fase 3 — telas
    "app/analise-regularizacao-ped", "components/regularizacaoPed", "components/mac/regularizacaoPed",
    "app/analise-aceite-ped", "components/aceitePed", "components/mac/aceitePed",
  ];
  // Código do Slot 1/2 que uma cópia nunca pode chamar (comentário de histórico não conta).
  const PROIBIDO = new RegExp([
    String.raw`@/lib/geradores["']`, String.raw`@/lib/geradores/(gerarLaudo|aceiteSei)`,
    String.raw`@/lib/(caixaRecargaSlot1|compatibilidadeArea|marcoTemporal|carimboAssunto|cheadvAprovado|aceiteSeiDispensas)["']`,
    String.raw`/api/(analise-regularizacao|analise-aceite-sei|despacho-regularizacao|despacho-aceite-sei|despacho-interno|mac/gerar-laudo|mac/aceite-sei)([/"'\x60?]|$)`,
    String.raw`["'](regularizacao|aceite_sei)["']`, String.raw`ehAceiteSei|ehRegularizacaoSei|documentosVivos(Regularizacao|AceiteSei)Ativo`,
    String.raw`laudo_(regularizacao|aceite_sei)\.xlsm`,
    String.raw`@/components/(regularizacao|aceiteSei)/|@/components/mac/(BotaoGerarLaudo["']|aceiteSei/)`,
    String.raw`/analise-(regularizacao|aceite-sei)/`,
    String.raw`documentos_vivos_(regularizacao|aceite_sei)_ativo`,
  ].join("|"));
  for (const arq of PASTAS.flatMap(listar)) {
    const linhas = readFileSync(join(raiz, arq), "utf-8").split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l) && PROIBIDO.test(l));
    t(`${arq} sem código do Slot 1/2`, linhas.length === 0, linhas.map(([n, l]) => `${n}: ${l.trim().slice(0, 120)}`).join(" | "));
  }
}

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ""));
process.exitCode = falhas ? 1 : 0;
