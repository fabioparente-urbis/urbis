/**
 * scripts/testar_regras_slots_3_4_ped.mts — Fase 1 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md.
 *
 * Prova três coisas sobre as regras determinísticas copiadas para o Slot 3 (Regularização PED,
 * `lib/regularizacaoPed/`) e o Slot 4 (Aceite PED, `lib/aceitePed/`):
 *
 *   1. EQUIVALÊNCIA — na data da cópia, a regra do Slot 3 dá o mesmo resultado que a do Slot 1,
 *      e a do Slot 4 o mesmo que a do Slot 2, para as mesmas entradas. A única diferença tolerada
 *      é o nome do slot no texto ("Regularização SEI" → "Regularização PED", "Aceite SEI" →
 *      "Aceite PED").
 *   2. SEM VAZAMENTO — a regra de um slot não reage a processo de outro slot. Em especial, as
 *      regras antigas (que decidem por PREFIXO) não pegam `slot_03`/`slot_04`, e as novas (que
 *      decidem por slug EXATO) não pegam nada além do próprio slot.
 *   3. ISOLAMENTO DE IMPORT — nenhum arquivo do Slot 3/4 importa de fora da própria pasta, e
 *      nenhum arquivo do Slot 1/2/5 importa das pastas do Slot 3/4.
 *
 * Quando as regras do Slot 3/4 forem mudadas DE PROPÓSITO (lei da PED diferente), a seção 1
 * deste teste passa a falhar — e é para falhar: atualizar o teste junto, dizendo o que mudou.
 *
 *   npx tsx scripts/testar_regras_slots_3_4_ped.mts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import * as caixa1 from "../lib/caixaRecargaSlot1";
import * as area1 from "../lib/compatibilidadeArea";
import * as marco12 from "../lib/marcoTemporal";
import * as carimbo12 from "../lib/carimboAssunto";
import * as cheadv12 from "../lib/cheadvAprovado";
import * as dispensas2 from "../lib/aceiteSeiDispensas";

import * as caixa3 from "../lib/regularizacaoPed/caixaRecarga";
import * as area3 from "../lib/regularizacaoPed/compatibilidadeArea";
import * as marco3 from "../lib/regularizacaoPed/marcoTemporal";
import * as carimbo3 from "../lib/regularizacaoPed/carimboAssunto";
import * as cheadv3 from "../lib/regularizacaoPed/cheadvAprovado";
import * as id3 from "../lib/regularizacaoPed/identidade";

import * as dispensas4 from "../lib/aceitePed/dispensas";
import * as marco4 from "../lib/aceitePed/marcoTemporal";
import * as carimbo4 from "../lib/aceitePed/carimboAssunto";
import * as cheadv4 from "../lib/aceitePed/cheadvAprovado";
import * as id4 from "../lib/aceitePed/identidade";

let falhas = 0;
let total = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  total++;
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

/** Troca o nome do slot no texto, para comparar o resto byte a byte. */
const como3 = (v: unknown) => JSON.stringify(v).replaceAll("Regularização SEI", "Regularização PED");
const como4 = (v: unknown) => JSON.stringify(v).replaceAll("Aceite SEI", "Aceite PED");

const S1 = "regularizacao", S2 = "aceite_sei", S3 = "slot_03", S4 = "slot_04", S5 = "slot_05";
const OUTROS_DO_3 = [S1, S2, S4, S5, "regularizacao_ped", "REGULARIZACAO", "slot_3", "", null, undefined];
const OUTROS_DO_4 = [S1, S2, S3, S5, "aceite_ped", "ACEITE", "slot_4", "", null, undefined];

const campo = (valor: string | null) => ({ valor });

// Áreas de teste: sem área, abaixo, no limite, acima, com área aprovada, formatos variados, lixo.
const AREAS: [string | null, string | null][] = [
  [null, null], ["NP", null], ["0", null], ["120,50", null], ["200,00", null], ["200,01", null],
  ["250,00", null], ["250,01", null], ["1.234,56", null], ["1234.56", null], ["180", "80"],
  ["150 m²", "100,00"], ["abc", null], ["300", "NP"],
];

// ─────────────────────────────────────────────────────────────────────────────
secao("1a · Slot 3 ≡ Slot 1 — caixa de recarga");
{
  t("mesmo limite (250 m²)", caixa3.LIMITE_AREA_CAIXA_M2 === caixa1.LIMITE_AREA_CAIXA_M2);
  t("mesmas chaves do LIP", JSON.stringify(caixa3.CHAVES_LIP_CAIXA) === JSON.stringify(caixa1.CHAVES_LIP_CAIXA));
  for (const [tot, apr] of AREAS) {
    const dados = { areaTotal: campo(tot), areaAprovada: campo(apr) };
    t(`avaliarCaixaRecargaDosDados(${tot} + ${apr})`,
      como3(caixa3.avaliarCaixaRecargaDosDados(dados)) === como3(caixa1.avaliarCaixaRecargaDosDados(dados)));
    t(`chavesCaixaDispensadas(${tot} + ${apr})`,
      como3(caixa3.chavesCaixaDispensadasSlot3(S3, dados)) === como3(caixa1.chavesCaixaDispensadasSlot1(S1, dados)));
  }
  t("bloco de prompt da caixa", caixa3.blocoPromptCaixaRecarga(S3) === caixa1.blocoPromptCaixaRecarga(S1).replace("(Regularização SEI)", "(Regularização PED)"));
}

secao("1b · Slot 3 ≡ Slot 1 — compatibilidade de área");
{
  t("mesmos rótulos", JSON.stringify(area3.ROTULOS_AREA) === JSON.stringify(area1.ROTULOS_AREA));
  const casos = [
    {}, { projeto: campo("100,00") }, { projeto: campo("100,00"), laudo: campo("100,00") },
    { projeto: campo("100,00"), laudo: campo("100,01") }, { projeto: campo("100"), vistoria: campo("99") },
    { projeto: campo("1.234,56"), laudo: campo("1234.56"), art: campo("1234,56"), vistoria: campo("1234,56") },
    { projeto: campo("NP"), laudo: campo("50"), art: campo("60"), vistoria: campo(null) },
  ];
  casos.forEach((c, i) => t(`compararAreas caso ${i + 1}`, JSON.stringify(area3.compararAreas(c)) === JSON.stringify(area1.compararAreas(c))));
  t("bloco de prompt da área", area3.blocoPromptCompatibilidadeArea(S3) === area1.blocoPromptCompatibilidadeArea(S1).replace("(Regularização SEI)", "(Regularização PED)"));
}

secao("1c · Slot 3 ≡ Slot 1 e Slot 4 ≡ Slot 2 — marco temporal");
{
  t("marco do Slot 3 = data do Slot 1", marco3.marcoTemporalDoTipo(S3)?.data === marco12.marcoTemporalDoTipo(S1)?.data);
  t("marco do Slot 4 = data do Slot 2", marco4.marcoTemporalDoTipo(S4)?.data === marco12.marcoTemporalDoTipo(S2)?.data);
  t("rótulo do Slot 3", marco3.marcoTemporalDoTipo(S3)?.rotulo === "Regularização PED");
  t("rótulo do Slot 4", marco4.marcoTemporalDoTipo(S4)?.rotulo === "Aceite PED");
  const leituras = [
    null, {}, { parecerFiscal: "Apta" }, { parecerFiscal: "Não apta" }, { estruturaConcluidaAntesDoMarco: "Sim" },
    { estruturaConcluidaAntesDoMarco: "Não" }, { parecerFiscal: "Não informado" }, { parecerFiscal: "inapta", estruturaConcluidaAntesDoMarco: "Sim" },
  ];
  leituras.forEach((l, i) => {
    t(`avaliarMarcoTemporal Slot 3 caso ${i + 1}`, como3(marco3.avaliarMarcoTemporal(S3, l)) === como3(marco12.avaliarMarcoTemporal(S1, l)));
    t(`avaliarMarcoTemporal Slot 4 caso ${i + 1}`, como4(marco4.avaliarMarcoTemporal(S4, l)) === como4(marco12.avaliarMarcoTemporal(S2, l)));
  });
  t("bloco de prompt do marco — Slot 3", marco3.blocoPromptMarcoTemporal(S3) === marco12.blocoPromptMarcoTemporal(S1).replace("(Regularização SEI)", "(Regularização PED)"));
  t("bloco de prompt do marco — Slot 4", marco4.blocoPromptMarcoTemporal(S4) === marco12.blocoPromptMarcoTemporal(S2).replace("(Aceite SEI)", "(Aceite PED)"));
}

secao("1d · carimbo e CHEADV — texto idêntico");
{
  t("carimbo Slot 3 = Slot 1", carimbo3.blocoPromptCarimboAssunto(S3) === carimbo12.blocoPromptCarimboAssunto(S1) && carimbo3.blocoPromptCarimboAssunto(S3) !== "");
  t("carimbo Slot 4 = Slot 2", carimbo4.blocoPromptCarimboAssunto(S4) === carimbo12.blocoPromptCarimboAssunto(S2) && carimbo4.blocoPromptCarimboAssunto(S4) !== "");
  t("CHEADV Slot 3 = Slot 1", cheadv3.blocoPromptCheadvAprovado(S3) === cheadv12.blocoPromptCheadvAprovado(S1) && cheadv3.blocoPromptCheadvAprovado(S3) !== "");
  t("CHEADV Slot 4 = Slot 2", cheadv4.blocoPromptCheadvAprovado(S4) === cheadv12.blocoPromptCheadvAprovado(S2) && cheadv4.blocoPromptCheadvAprovado(S4) !== "");
}

secao("1e · Slot 4 ≡ Slot 2 — dispensas do Aceite");
{
  t("mesmo limite da ART (200 m²)", dispensas4.LIMITE_AREA_ART_M2 === dispensas2.LIMITE_AREA_ART_M2);
  t("mesmas chaves de Uso do Solo", JSON.stringify(dispensas4.CHAVES_LIP_USO_SOLO) === JSON.stringify(dispensas2.CHAVES_LIP_USO_SOLO));
  t("mesmas chaves de caixa", JSON.stringify(dispensas4.CHAVES_LIP_CAIXA) === JSON.stringify(dispensas2.CHAVES_LIP_CAIXA));
  t("mesmas chaves de ART", JSON.stringify(dispensas4.CHAVES_LIP_ART_LEVANTAMENTO) === JSON.stringify(dispensas2.CHAVES_LIP_ART_LEVANTAMENTO));
  for (const [ac, ex] of AREAS) {
    const dados = { areaAceite: campo(ac), areaExistente: campo(ex) };
    t(`chavesDispensadas(${ac} + ${ex})`,
      como4(dispensas4.chavesDispensadasAceitePed(S4, dados)) === como4(dispensas2.chavesDispensadasAceiteSei(S2, dados)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2a · regras do Slot 3 não reagem a outro slot");
for (const o of OUTROS_DO_3) {
  const r = String(o);
  t(`ehRegularizacaoPed(${r}) = false`, id3.ehRegularizacaoPed(o) === false);
  t(`marco Slot 3 ignora ${r}`, marco3.marcoTemporalDoTipo(o) === null && marco3.avaliarMarcoTemporal(o, {}) === null);
  t(`blocos Slot 3 vazios para ${r}`,
    caixa3.blocoPromptCaixaRecarga(o) === "" && area3.blocoPromptCompatibilidadeArea(o) === "" &&
    marco3.blocoPromptMarcoTemporal(o) === "" && carimbo3.blocoPromptCarimboAssunto(o) === "" &&
    cheadv3.blocoPromptCheadvAprovado(o) === "");
  t(`caixa Slot 3 não dispensa nada para ${r}`, caixa3.chavesCaixaDispensadasSlot3(o, {}).chaves.length === 0);
}
t("ehRegularizacaoPed aceita caixa alta e espaço (' SLOT_03 ')", id3.ehRegularizacaoPed(" SLOT_03 ") === true);

secao("2b · regras do Slot 4 não reagem a outro slot");
for (const o of OUTROS_DO_4) {
  const r = String(o);
  t(`ehAceitePed(${r}) = false`, id4.ehAceitePed(o) === false);
  t(`marco Slot 4 ignora ${r}`, marco4.marcoTemporalDoTipo(o) === null && marco4.avaliarMarcoTemporal(o, {}) === null);
  t(`blocos Slot 4 vazios para ${r}`,
    marco4.blocoPromptMarcoTemporal(o) === "" && carimbo4.blocoPromptCarimboAssunto(o) === "" &&
    cheadv4.blocoPromptCheadvAprovado(o) === "");
  t(`dispensas Slot 4 vazias para ${r}`, dispensas4.chavesDispensadasAceitePed(o, {}).chaves.length === 0);
}

secao("2c · regras antigas (por prefixo) NÃO pegam slot_03 / slot_04");
for (const o of [S3, S4]) {
  t(`marcoTemporal antigo ignora ${o}`, marco12.marcoTemporalDoTipo(o) === null);
  t(`ehRegularizacaoSei(${o}) = false`, area1.ehRegularizacaoSei(o) === false);
  t(`ehAceiteSei(${o}) = false`, dispensas2.ehAceiteSei(o) === false);
  t(`carimbo/CHEADV antigos ignoram ${o}`, carimbo12.ehCandidatoCarimboAssunto(o) === false && cheadv12.ehCandidatoCheadvAprovado(o) === false);
  t(`caixa do Slot 1 ignora ${o}`, caixa1.chavesCaixaDispensadasSlot1(o, {}).chaves.length === 0);
  t(`dispensas do Slot 2 ignoram ${o}`, dispensas2.chavesDispensadasAceiteSei(o, {}).chaves.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · isolamento de import");
{
  const raiz = new URL("..", import.meta.url).pathname;
  const listar = (dir: string): string[] =>
    readdirSync(join(raiz, dir)).flatMap((n) => {
      const rel = join(dir, n);
      if (n === "node_modules" || n.startsWith(".")) return [];
      return statSync(join(raiz, rel)).isDirectory() ? listar(rel) : /\.(ts|tsx)$/.test(n) ? [rel] : [];
    });
  const imports = (arq: string) =>
    [...readFileSync(join(raiz, arq), "utf-8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

  for (const [pasta, propria] of [["lib/regularizacaoPed", "@/lib/regularizacaoPed/"], ["lib/aceitePed", "@/lib/aceitePed/"]]) {
    for (const arq of listar(pasta)) {
      const fora = imports(arq).filter((i) => !i.startsWith(propria));
      t(`${arq} só importa da própria pasta`, fora.length === 0, `importa: ${fora.join(", ")}`);
    }
  }

  // Quem pode importar do Slot 3/4: só arquivos do próprio Slot 3/4 e os pontos de desvio
  // compartilhados (Fase 4). Arquivo do Slot 1, 2 ou 5 nunca.
  const PROIBIDOS = [
    /^lib\/(caixaRecargaSlot1|compatibilidadeArea|marcoTemporal|carimboAssunto|cheadvAprovado|aceiteSeiDispensas)\.ts$/,
    /^lib\/mac-motor\/slot5\//, /^lib\/geradores\/aceiteSei\//, /^components\/(regularizacao|aceiteSei)\//,
    /^components\/mac\/aceiteSei\//, /^app\/analise-(regularizacao|aceite-sei|aprovacao-projeto)\//,
    /^app\/api\/(analise-regularizacao|analise-aceite-sei|despacho-regularizacao|despacho-aceite-sei)\//,
    /^app\/api\/mac\/(aceite-sei|slot-05)\//,
  ];
  const todos = ["app", "lib", "components"].flatMap(listar);
  for (const arq of todos.filter((a) => PROIBIDOS.some((p) => p.test(a)))) {
    const ped = imports(arq).filter((i) => /regularizacaoPed|aceitePed/.test(i));
    if (ped.length) t(`${arq} NÃO importa Slot 3/4`, false, ped.join(", "));
  }
  t("nenhum arquivo do Slot 1/2/5 importa do Slot 3/4", true);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · Vigia — condições bloqueantes do Slot 3/4 espelham as do Slot 1/2");
{
  // regrasBloqueio cria o cliente do Supabase ao ser importado; o teste não chama o banco, então
  // basta um endereço fictício para o import não falhar quando rodado sem .env.local.
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://banco-ficticio.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "chave-ficticia";
  const { montarAvisos } = await import("../lib/bdi/vigia");
  const { temRegrasProprias } = await import("../lib/urbi/regrasBloqueio");
  const LIGADAS = Object.fromEntries([
    "COND_180_DIAS", "COND_FISCAL_DIVERGE", "COND_MARCO_TEMPORAL", "COND_USO_SOLO",
    "COND_BUSCA_ENDERECO", "COND_ASSUNTO_ERRADO", "COND_CHEADV_APTO", "COND_IMOVEL_DUPLICADO",
  ].map((k) => [k, { ativo: true, parametros: k === "COND_180_DIAS" ? { diasBloqueio: 180, diasAviso: 170 } : {} }]));
  const v = (valor: string) => ({ valor });
  // Dados que disparam todas as condições ao mesmo tempo.
  const dados = {
    vistoriaLevante: v("Não"), areaTotal: v("100,00"), areaVistoria: v("90,00"), carimboTipoProjeto: v("APROVAÇÃO"),
    cheadvAprovado: v("Não"), qualquer: v("x"),
  };
  const comum = {
    regras: LIGADAS as any, marcoTemporalReprovado: true, marcoTemporalEvidencia: { marco: "4 de março de 2022", trecho: "obra" },
    diasSemUltimaEmissao: 200,
  };
  const ids = (tipo: string, conflitoTipo: string) =>
    montarAvisos({ processo: { codigo: "X", tipo_processo: tipo, dados }, ...comum,
      imovelConflito: { codigo: "Y", tipoProcesso: conflitoTipo, status: "aprovado", criterio: "iptu" } as any })
      .filter((a) => a.id.startsWith("cond_")).map((a) => `${a.id}|${a.titulo}|${a.bloqueante}`);
  const a1 = ids(S1, S2), a3 = ids(S3, S4), a2 = ids(S2, S1), a4 = ids(S4, S3), a5 = ids(S5, S1);
  t("Slot 1 dispara condições (controle)", a1.length >= 8, a1.join(", "));
  t("Slot 3 dispara as MESMAS condições do Slot 1", JSON.stringify(a3) === JSON.stringify(a1), `1: ${a1.join(", ")}\n           3: ${a3.join(", ")}`);
  t("Slot 4 dispara as MESMAS condições do Slot 2", JSON.stringify(a4) === JSON.stringify(a2), `2: ${a2.join(", ")}\n           4: ${a4.join(", ")}`);
  t("Slot 5 continua fora das condições", a5.length === 0, a5.join(", "));
  const semRegras = montarAvisos({ processo: { codigo: "X", tipo_processo: S3, dados }, ...comum, regras: {} })
    .filter((a) => a.id.startsWith("cond_"));
  t("Slot 3 com interruptores desligados não dispara nada", semRegras.length === 0);
  t("temRegrasProprias: só slot_03 e slot_04", temRegrasProprias(S3) && temRegrasProprias(S4)
    && ![S1, S2, S5, "regularizacao_ped", "", null].some((x) => temRegrasProprias(x)));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · URBI — navegação, catálogo semântico, nome e dossiê do Slot 3/4");
{
  const { interpretar } = await import("../lib/urbi/navegacao");
  const { dominioDoCampo, rotuloDoCampo } = await import("../lib/urbi/catalogoSemantico");
  const { nomeHumanoDoSlot } = await import("../lib/urbi/contratoResposta");
  const { montarDossieTecnico } = await import("../lib/urbi/adaptadores");
  const tipoDe = (f: string) => (interpretar(f) as any)?.filtros?.tipo ?? null;
  const frases: [string, string][] = [
    ["processos de regularização", S1], ["processos de regularização PED", S3], ["processos do slot 3", S3],
    ["processos de aceite", S2], ["processos de aceite SEI", S2], ["processos de aceite PED", S4],
    ["processos do slot 4", S4], ["processos de aprovação de projeto", S5],
  ];
  for (const [f, esperado] of frases) t(`voz: "${f}" → ${esperado}`, tipoDe(f) === esperado, `veio ${tipoDe(f)}`);

  for (const chave of ["areaTerreno", "areaImpermeavel", "areaAprovada", "areaTotal", "areaRecuo", "vistoriaMais12m", "volMin", "volAt"]) {
    t(`catálogo: ${chave} do Slot 3 = do Slot 1`,
      dominioDoCampo("slot_03", chave) === dominioDoCampo("regularizacao", chave) && rotuloDoCampo("slot_03", chave) === rotuloDoCampo("regularizacao", chave));
  }
  for (const chave of ["areaTerreno", "areaImpermeavel", "areaExistente", "areaAceite", "areaNaoVerticalRecuo", "areaVerticalRecuo", "vistoriaMais12m", "volMin", "volAt"]) {
    t(`catálogo: ${chave} do Slot 4 = do Slot 2`,
      dominioDoCampo("slot_04", chave) === dominioDoCampo("aceite_sei", chave) && rotuloDoCampo("slot_04", chave) === rotuloDoCampo("aceite_sei", chave));
  }
  t("nome humano do Slot 3/4", nomeHumanoDoSlot(S3) === "Regularização PED" && nomeHumanoDoSlot(S4) === "Aceite PED");

  const entrada: any = {
    historicoMac: [], itemAtualPorId: new Map(), itensAtivosNoModelo: 60, resultadosDocumento: [], erroResultadosDocumento: null,
    itensComVinculoBipAprovado: 0, erroCoberturaBip: null, mdpRegistros: [], mrpRegistros: [], eventosCatalogo: [],
  };
  const d3 = montarDossieTecnico(S3, entrada), d4 = montarDossieTecnico(S4, entrada), d1 = montarDossieTecnico(S1, entrada);
  t("dossiê do Slot 3 é do Slot 3", d3?.slot === S3 && d3?.nome_slot === "Regularização PED");
  t("dossiê do Slot 4 é do Slot 4", d4?.slot === S4 && d4?.nome_slot === "Aceite PED");
  t("dossiê do Slot 1 continua do Slot 1", d1?.slot === S1 && d1?.nome_slot === "Regularização SEI");
  t("dossiê do Slot 3/4 não repete auditoria do Slot 1/2",
    ![...(d3?.observacoes_do_slot ?? []), ...(d4?.observacoes_do_slot ?? [])].some((o) => o.includes("auditoria de 03/09")));
}

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ""));
process.exitCode = falhas ? 1 : 0;
