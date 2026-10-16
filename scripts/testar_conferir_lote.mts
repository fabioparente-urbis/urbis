/**
 * Teste da decisão "dimensões do lote × certidão" (lib/visao/conferirLote.ts). Puro: sem IA, sem banco.
 *   npx tsx scripts/testar_conferir_lote.mts
 */
import { conferirLote, numero } from "../lib/visao/conferirLote";

let falhas = 0;
const t = (nome: string, ok: boolean, extra = "") => { if (!ok) falhas++; console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : "  " + extra}`); };

const certOk = { lote: "07", quadra: "03", area: "360,00", frente: "12,00", lateralDireita: "30,00", lateralEsquerda: "30,00", fundos: "12,00" };
const sitOk = { area: "360,00", menorCota: "12,00", maiorCota: "30,00" };
const carimbo = { areaTerreno: "360", lote: "7", quadra: "Q03" };

t("47737: tudo confere → SIM", conferirLote({ certidao: certOk, situacao: sitOk, carimbo }).veredito === "SIM");
t("lados trocados de ordem não importam", conferirLote({ certidao: { ...certOk, frente: "30,00", lateralDireita: "12,00", lateralEsquerda: "12,00", fundos: "30,00" }, situacao: sitOk, carimbo }).veredito === "SIM");
t("tolerância de 0,10 m nas cotas", conferirLote({ certidao: certOk, situacao: { ...sitOk, menorCota: "12,08" }, carimbo }).veredito === "SIM");
t("cota 0,5 m diferente → NÃO", conferirLote({ certidao: certOk, situacao: { ...sitOk, menorCota: "11,50" }, carimbo }).veredito === "NÃO");
t("área diferente (437,50 × 360) → NÃO", conferirLote({ certidao: { ...certOk, area: "437,50" }, situacao: sitOk, carimbo }).veredito === "NÃO");
t("quadra diferente → NÃO", conferirLote({ certidao: { ...certOk, quadra: "04" }, situacao: sitOk, carimbo }).veredito === "NÃO");
t("lote 'L-07' × '07' → SIM (rótulo e zeros não contam)", conferirLote({ certidao: { ...certOk, lote: "07" }, situacao: sitOk, carimbo: { ...carimbo, lote: "L07" } }).veredito === "SIM");
t("sem planta de situação → sem veredito (nunca estimado)", conferirLote({ certidao: certOk, situacao: {}, carimbo }).veredito === null);
t("sem nada lido → sem veredito", conferirLote({ certidao: {}, situacao: {}, carimbo }).veredito === null);
t("lote irregular (3 lados) → só área/lote/quadra, e a planta decide pela área", (() => {
  const r = conferirLote({ certidao: { ...certOk, fundos: null }, situacao: { area: "360,00" }, carimbo });
  return r.veredito === "SIM" && !r.comparacoes.some((c) => c.nome.includes("cota"));
})());
t("lote irregular com área diferente → NÃO", conferirLote({ certidao: { ...certOk, fundos: null, area: "4.876,59" }, situacao: { area: "811,76" }, carimbo: { ...carimbo, areaTerreno: "811,76" } }).veredito === "NÃO");
t("numero(): formatos", numero("4.876,59") === 4876.59 && numero("59,960") === 59.96 && numero("360.00") === 360 && numero("x") === null);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
