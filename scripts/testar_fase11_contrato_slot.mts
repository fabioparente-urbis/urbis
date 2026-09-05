/**
 * scripts/testar_fase11_contrato_slot.mts — Fase 11 do mandato de 12 fases (05/09/2026):
 * contrato de novo Slot. Esta fase é só documentação (docs/URBIS_CONTRATO_NOVO_SLOT.md) — este
 * teste confirma que os fatos estruturais citados no documento continuam batendo com o código
 * real, pra não deixar o checklist descrever um sistema que já mudou.
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase11_contrato_slot.mts
 */
import { readFileSync } from "node:fs";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);
const ler = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), "utf-8");

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · adaptador de dossiê continua sendo o único ponto de entrada, com fallback seguro");
{
  const codigo = ler("lib/urbi/adaptadores/index.ts");
  t('switch cobre os 3 slots reais', codigo.includes('"regularizacao"') && codigo.includes('"aceite_sei"') && codigo.includes('"slot_05"'));
  t('default degrada pra null (slot sem adaptador não quebra)', /default:\s*return null/.test(codigo));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · Slot type em catalogoSemantico.ts continua os 3 valores reais (precisa crescer com slot novo)");
{
  const codigo = ler("lib/urbi/catalogoSemantico.ts");
  t('union Slot declarado', codigo.includes('export type Slot ='));
  t('3 valores reais presentes', codigo.includes('"regularizacao"') && codigo.includes('"aceite_sei"') && codigo.includes('"slot_05"'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · isolamento de regras determinísticas — nenhum import cruzado Slot 1 × Slot 5");
{
  const caixaSlot1 = ler("lib/caixaRecargaSlot1.ts");
  t('caixaRecargaSlot1 não importa de mac-motor/slot5', !/from\s+["']@?\/?lib\/mac-motor\/slot5/.test(caixaSlot1));
  const arquivosSlot5 = ["lib/mac-motor/slot5/regras/dimensoesTerreno.ts", "lib/mac-motor/slot5/regras/caixaDeRecarga.ts"];
  for (const caminho of arquivosSlot5) {
    const codigo = ler(caminho);
    t(`${caminho} não importa caixaRecargaSlot1`, !codigo.includes("caixaRecargaSlot1"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · permissões continuam slot-agnósticas (nenhuma referência a tipo_processo em autorizacao.ts)");
{
  const codigo = ler("lib/autorizacao.ts");
  t("autorizacao.ts não referencia tipo_processo/slot/regularizacao/aceite_sei/slot_05", !/tipo_processo|regularizacao|aceite_sei|slot_05/.test(codigo));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · Radar e Motor de Produção continuam sem branch por slot");
{
  const radar = ler("lib/urbi/radar.ts");
  t("radar.ts não tem if/switch por tipo_processo literal", !/tipo_processo\s*===\s*["']/.test(radar));
  const motor = ler("lib/urbi/motorProducao.ts");
  t("motorProducao.ts não tem if/switch por tipo_processo literal", !/tipo_processo\s*===\s*["']/.test(motor));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · documento do contrato existe e cobre as 12 camadas");
{
  const doc = ler("docs/URBIS_CONTRATO_NOVO_SLOT.md");
  t("documento existe e não está vazio", doc.length > 1000);
  const camadas = (doc.match(/^### \d+\./gm) ?? []).length;
  t("12 camadas numeradas presentes", camadas === 12, `encontradas=${camadas}`);
  t("declara o princípio de isolamento (nunca abstração compartilhada)", doc.includes("nunca compartilhado"));
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
