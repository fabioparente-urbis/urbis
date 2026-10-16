// ============================================================
// scripts/testar_slot5_lip_proprio.mts
//
// Prova da separação do Slot 5 (Aprovação de Projeto), 16/10/2026 — mesmo molde do Slot 2 e da
// Etapa 2 dos Slots 3/4 (docs/URBIS_PLANO_SLOTS_3_4_PED.md, "5 programas independentes"). Só lê
// arquivos; não toca no banco nem chama rota.
//
//   1. a ficha, a tela do MAC e as rotas do Slot 5 não chamam rota comum de LIP;
//   2. nada disso usa regra ou código de outro slot (Slots 1, 2, 3, 4);
//   3. as rotas do Slot 5 que nasceram das do Slot 2 continuam gêmeas delas (fora comentário e
//      nome do slot) — até alguém mudar uma DE PROPÓSITO; aí este teste é atualizado junto;
//   4. o que é só do Slot 5 continua lá: outorga onerosa no salvar, LER PASTA, Organizador,
//      despacho interno próprio, Via/Logradouro e Manual;
//   5. o endereço antigo e o MAC levam para a ficha própria.
//
// Rodar: npx tsx scripts/testar_slot5_lip_proprio.mts
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
  s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).map((l) => l.replace(/\s+\/\/.*$/, "")).join("\n");

const FICHA = "components/aprovacaoProjeto/LipAprovacaoProjeto.tsx";
const MAC = "app/analise-aprovacao-projeto/[codigo]/page.tsx";
const ROTAS_SLOT5 = listar("app/api/aprovacao-projeto");
const PROPRIOS_SLOT5 = [...ROTAS_SLOT5, FICHA, "app/lip-aprovacao-projeto/[id]/page.tsx", MAC, ...listar("lib/aprovacaoProjeto")];

secao("1 · ficha, MAC e rotas do Slot 5 não chamam rota comum de LIP");
t("rotas do Slot 5 existem (19)", ROTAS_SLOT5.length === 19, `achei ${ROTAS_SLOT5.length}`);
const ROTA_COMUM = /["`]\/api\/(lip\/|processo\/(carregar|salvar|historico|restaurar|importar-lip|exportar-lip)|admin\/lip|analise-regularizacao|analise-aceite-sei|despacho-interno)/;
for (const arq of PROPRIOS_SLOT5) {
  const linhas = semComentario(ler(arq)).split("\n").filter((l) => ROTA_COMUM.test(l));
  t(`${arq} sem rota comum de LIP`, linhas.length === 0, linhas.map((l) => l.trim().slice(0, 90)).join(" | "));
}

secao("2 · nada do Slot 5 usa regra ou código de outro slot");
const OUTRO_SLOT = /aceite_sei|"regularizacao"|slot_03|slot_04|regularizacaoPed|aceitePed|aceiteSei|regularizacao-ped|aceite-ped|aceite-sei|caixaRecargaSlot1|compatibilidadeArea|aceiteSeiDispensas|carimboAssunto|cheadvAprovado|documentosSei\/leituraUnicaLipMac|documentosSei\/AlertaFluxo|import \{[^}]*\} from "@\/lib\/marcoTemporal"|@\/lib\/promptCampos"|@\/lib\/lipAjuda"/;
for (const arq of PROPRIOS_SLOT5) {
  if (arq === MAC) continue; // a tela do MAC já era isolada antes desta separação; só os links mudaram
  const linhas = semComentario(ler(arq)).split("\n").filter((l) => OUTRO_SLOT.test(l));
  t(`${arq} sem código de outro slot`, linhas.length === 0, linhas.map((l) => l.trim().slice(0, 90)).join(" | "));
}

secao("3 · rotas do Slot 5 gêmeas das do Slot 2 de que nasceram");
const doSlot2ParaSlot5 = (s: string) => s
  .replaceAll("/api/aceite-sei/", "/api/aprovacao-projeto/")
  .replaceAll("@/lib/aceiteSei/lip/", "@/lib/aprovacaoProjeto/lip/")
  .replaceAll("@/lib/aceiteSei/identidade", "@/lib/aprovacaoProjeto/identidade")
  .replaceAll("@/lib/aceiteSei/assuntoDoSlot", "@/lib/aprovacaoProjeto/assuntoDoSlot")
  .replaceAll("SLUG_ACEITE_SEI", "SLUG_APROVACAO_PROJETO")
  .replaceAll("ehAceiteSeiExato", "ehAprovacaoProjeto")
  .replaceAll("assuntoIdDoSlot2", "assuntoIdDoSlot5")
  .replaceAll("aceite_sei", "slot_05")
  .replaceAll("Aceite SEI", "Aprovação de Projeto")
  .replaceAll("Slot 2", "Slot 5").replaceAll("slot2", "slot5");
const DO_SLOT2 = ["lip/estrutura", "lip/s1", "lip/s2", "lip/s3/status", "lip/s4", "lip/registrar-evento", "lip/legenda-foto",
  "processo/carregar", "processo/historico", "processo/restaurar", "processo/importar-lip", "processo/exportar-lip"];
for (const r of DO_SLOT2) {
  const a = semComentario(ler(`app/api/aprovacao-projeto/${r}/route.ts`));
  const b = semComentario(doSlot2ParaSlot5(ler(`app/api/aceite-sei/${r}/route.ts`)));
  t(`${r} = gêmea do Slot 2`, a === b, "divergiu — se foi de propósito, atualize este teste");
}

secao("4 · o que é só do Slot 5 continua lá");
const salvar = ler("app/api/aprovacao-projeto/processo/salvar/route.ts");
t("salvar grava sempre como slot_05", /const tipoProcesso: string = SLUG_APROVACAO_PROJETO;/.test(salvar));
t("salvar recalcula a outorga onerosa", /recalcularOutorgaOnerosa\(dadosRecebidos\)/.test(salvar));
const s3 = ler("app/api/aprovacao-projeto/lip/s3/route.ts");
t("s3 recusa processo de outro slot", /!ehAprovacaoProjeto\(tipoProcesso\)/.test(s3));
t("s3 sem leitura única LIP+MAC", !/leituraUnicaLipMacAtiva|gravarSugestaoMac/.test(semComentario(s3)));
t("cache sem checagem de leitura única", /async function cacheMataria9B\(_codigo: string\): Promise<boolean> \{[\s\S]{0,400}return false;/.test(ler("app/api/aprovacao-projeto/lip/cache-gemini/route.ts")));
t("ler-pasta usa o assunto do Slot 5", /assuntoIdDoSlot5\(\)/.test(ler("app/api/aprovacao-projeto/lip/ler-pasta/route.ts")));
const ficha = ler(FICHA);
t("ficha com tipo fixo slot_05", /const tipoUrl: string = SLUG_APROVACAO_PROJETO;/.test(ficha));
t("ficha lê a pasta pela rota do Slot 5", ficha.includes('"/api/aprovacao-projeto/lip/ler-pasta"'));
t("ficha mostra o Organizador do Slot 5", /<OrganizadorSlot5 processoCodigo=\{idUrl\} \/>/.test(ficha));
t("ficha gera despacho interno só pela rota do Slot 5",
  ficha.includes('fetch("/api/mac/slot-05/despacho-interno"') && !semComentario(ficha).includes('"/api/despacho-interno"'));
t("ficha abre o MAC do Slot 5", (ficha.match(/= "\/analise-aprovacao-projeto";/g) ?? []).length === 3);
t("ficha volta de Via/Logradouro e do Manual para a ficha própria",
  (ficha.match(/`\/lip-aprovacao-projeto\/\$\{idUrl\}`/g) ?? []).length === 2);

secao("5 · endereço antigo e MAC levam para a ficha própria");
t("/processo/<id>?tipo=slot_05 encaminha para /lip-aprovacao-projeto",
  /slot_05:\s*"\/lip-aprovacao-projeto"/.test(ler("app/processo/[id]/page.tsx")));
const mac = ler(MAC);
t("MAC não aponta mais para /processo/?tipo=slot_05", !/\/processo\/\$\{encodeURIComponent\(codigo\)\}\?tipo=slot_05/.test(mac));
t("MAC volta para a ficha própria (3 links)", (mac.match(/`\/lip-aprovacao-projeto\/\$\{encodeURIComponent\(codigo\)\}`/g) ?? []).length === 3);
t("MAC lê legenda de foto pela rota do Slot 5", mac.includes('"/api/aprovacao-projeto/lip/legenda-foto"'));

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ""));
process.exitCode = falhas ? 1 : 0;
