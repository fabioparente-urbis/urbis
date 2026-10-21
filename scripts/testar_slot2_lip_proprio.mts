// ============================================================
// scripts/testar_slot2_lip_proprio.mts
//
// Prova da separação do Slot 2 (Aceite SEI), 16/10/2026 — mesmo molde da Etapa 2 dos Slots 3/4
// (docs/URBIS_PLANO_SLOTS_3_4_PED.md, "5 programas independentes"). Só lê arquivos; não toca no
// banco nem chama rota.
//
//   1. a ficha, a tela do MAC e as rotas do Slot 2 chamam SÓ rotas de LIP/MAC do Slot 2;
//   2. nada disso cita outro slot (PED, Slot 1 ou Slot 5);
//   3. as rotas do Slot 2 são gêmeas das do Slot 4 (as duas são cópia do Slot 2), fora os
//      comentários e o nome do slot — até alguém mudar uma delas DE PROPÓSITO; aí este teste é
//      atualizado junto;
//   4. o endereço antigo, o Fatiador e a leitura do Fatiador mandam o Slot 2 para as rotas dele;
//   5. a leitura única lê o interruptor PRÓPRIO do Slot 2.
//
// Rodar: npx tsx scripts/testar_slot2_lip_proprio.mts
// ============================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const raiz = new URL("..", import.meta.url).pathname;
let total = 0;
let falhas = 0;
function t(nome: string, ok: boolean, detalhe = "") {
  total++;
  if (!ok) falhas++;
  console.log(`  ${ok ? "ok  " : "FALHA"}  ${nome}${!ok && detalhe ? ` — ${detalhe}` : ""}`);
}
const secao = (s: string) => console.log(`\n── ${s}\n`);
const ler = (rel: string) => readFileSync(join(raiz, rel), "utf-8");
const listar = (dir: string): string[] =>
  !existsSync(join(raiz, dir)) ? [] : statSync(join(raiz, dir)).isFile() ? [dir] :
  readdirSync(join(raiz, dir)).flatMap((n) => {
    const rel = join(dir, n);
    return statSync(join(raiz, rel)).isDirectory() ? listar(rel) : /\.(ts|tsx)$/.test(n) ? [rel] : [];
  });
const semComentario = (s: string) =>
  s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s+\/\/.*$/, "")).join("\n");

const ROTAS_SLOT2 = listar("app/api/aceite-sei");
const PROPRIOS_SLOT2 = [
  ...ROTAS_SLOT2,
  "components/aceiteSei/LipAceiteSei.tsx",
  "components/aceiteSei/AlertaFluxo.tsx",
  "app/lip-aceite-sei/[id]/page.tsx",
  "app/analise-aceite-sei/[codigo]/page.tsx",
  ...listar("lib/aceiteSei"),
];

secao("1 · ficha, MAC e rotas do Slot 2 chamam só rotas de LIP/MAC do Slot 2");
t("rotas do Slot 2 existem (25)", ROTAS_SLOT2.length === 25, `achei ${ROTAS_SLOT2.length}`);
const ROTA_COMUM = /["`]\/api\/(lip\/|processo\/(carregar|salvar|historico|restaurar|importar-lip|exportar-lip)|mac\/(p3|leitura-unica|checklists|historico|importar-mac|exportar-mac|buscar)|admin\/lip)/;
for (const arq of PROPRIOS_SLOT2) {
  const linhas = semComentario(ler(arq)).split("\n").filter((l) => ROTA_COMUM.test(l));
  t(`${arq} sem rota comum de LIP/MAC`, linhas.length === 0, linhas.map((l) => l.trim().slice(0, 90)).join(" | "));
}

secao("2 · nada do Slot 2 cita outro slot");
const OUTRO_SLOT = /slot_03|slot_04|slot_05|regularizacaoPed|aceitePed|regularizacao-ped|aceite-ped|caixaRecargaSlot1|compatibilidadeArea|mac-motor\/slot5|OrganizadorSlot5/;
for (const arq of PROPRIOS_SLOT2) {
  const linhas = semComentario(ler(arq)).split("\n").filter((l) => OUTRO_SLOT.test(l));
  t(`${arq} sem código de outro slot`, linhas.length === 0, linhas.map((l) => l.trim().slice(0, 90)).join(" | "));
}

secao("3 · rotas do Slot 2 gêmeas das do Slot 4 (fora comentário e nome do slot)");
const doSlot4ParaSlot2 = (s: string) => s
  .replaceAll("/api/aceite-ped/", "/api/aceite-sei/")
  .replaceAll("@/lib/aceitePed/lip/", "@/lib/aceiteSei/lip/")
  .replaceAll("@/lib/aceitePed/identidade", "@/lib/aceiteSei/identidade")
  .replaceAll("@/lib/aceitePed/assuntoDoSlot", "@/lib/aceiteSei/assuntoDoSlot")
  .replaceAll("@/lib/aceitePed/marcoTemporal", "@/lib/marcoTemporal")
  .replaceAll("@/lib/aceitePed/carimboAssunto", "@/lib/carimboAssunto")
  .replaceAll("@/lib/aceitePed/cheadvAprovado", "@/lib/cheadvAprovado")
  .replaceAll("@/lib/aceitePed/dispensas", "@/lib/aceiteSeiDispensas")
  .replaceAll("chavesDispensadasAceitePed", "chavesDispensadasAceiteSei")
  .replaceAll("SLUG_ACEITE_PED", "SLUG_ACEITE_SEI")
  .replaceAll("ehAceitePed", "ehAceiteSeiExato")
  .replaceAll("assuntoIdDoSlot4", "assuntoIdDoSlot2")
  .replaceAll("slot_04", "aceite_sei")
  .replaceAll("Aceite PED", "Aceite SEI")
  .replaceAll("Slot 4", "Slot 2").replaceAll("slot4", "slot2").replaceAll("Slot4", "Slot2");
for (const arq of ROTAS_SLOT2) {
  const gemeo = arq.replace("app/api/aceite-sei/", "app/api/aceite-ped/");
  if (!existsSync(join(raiz, gemeo))) { t(`${arq} tem gêmeo no Slot 4`, false, gemeo); continue; }
  const a = semComentario(ler(arq));
  const b = semComentario(doSlot4ParaSlot2(ler(gemeo)));
  t(`${arq} = ${gemeo}`, a === b, "divergiu — se foi de propósito, atualize este teste");
}

secao("4 · endereço antigo, Fatiador e leitura do Fatiador levam o Slot 2 para as rotas dele");
t("/processo/<id>?tipo=aceite_sei encaminha para /lip-aceite-sei",
  /aceite_sei:\s*"\/lip-aceite-sei"/.test(ler("app/processo/[id]/page.tsx")));
t("/lip-aceite-sei/<id> abre a ficha própria",
  /import LipAceiteSei from "@\/components\/aceiteSei\/LipAceiteSei"/.test(ler("app/lip-aceite-sei/[id]/page.tsx")));
t("Fatiador carrega/salva o Slot 2 pelas rotas dele",
  /aceite_sei: \{ carregar: "\/api\/aceite-sei\/processo\/carregar", salvar: "\/api\/aceite-sei\/processo\/salvar", ultimaLeitura: "\/api\/aceite-sei\/lip\/ultima-leitura" \}/
    .test(ler("components/fatiadorSei/TelaFatiamento.tsx")));
t("leitura do Fatiador (s1-s3) do Slot 2 pelas rotas dele",
  /slot === "aceite_sei"\) return "\/api\/aceite-sei\/lip"/.test(ler("lib/documentosSei/lerComGemini.ts")));
const ficha = ler("components/aceiteSei/LipAceiteSei.tsx");
t("ficha do Slot 2 com tipo fixo aceite_sei", /const tipoUrl: string = SLUG_ACEITE_SEI;/.test(ficha));
t("ficha do Slot 2 abre o MAC do Slot 2", /return "\/analise-aceite-sei";/.test(ficha));
t("ficha do Slot 2 gera despacho interno pela rota do Slot 2", ficha.includes('"/api/mac/aceite-sei/despacho-interno"'));

secao("5 · leitura única com interruptor PRÓPRIO do Slot 2");
const lu = ler("lib/aceiteSei/lip/leituraUnicaLipMac.ts");
t("lê leitura_unica_aceite_sei_ativo", /select\("leitura_unica_aceite_sei_ativo"\)/.test(lu));
t("não lê o interruptor comum do Slot 1", !/leitura_unica_lip_mac_ativo/.test(semComentario(lu)));
t("migration 2026_10_16d copia o valor do interruptor comum",
  /SET leitura_unica_aceite_sei_ativo = leitura_unica_lip_mac_ativo/
    .test(ler("supabase/migrations/2026_10_16d_slot2_interruptor_leitura_unica.sql")));

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ""));
process.exitCode = falhas ? 1 : 0;
