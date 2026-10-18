// ============================================================
// scripts/testar_slot1_lip_proprio.mts
//
// Prova da separação do Slot 1 (Regularização SEI), 16/10/2026 — mesmo molde dos Slots 2 e 5 e da
// Etapa 2 dos Slots 3/4 (docs/URBIS_PLANO_SLOTS_3_4_PED.md, "5 programas independentes"). Só lê
// arquivos; não toca no banco nem chama rota.
//
//   1. a ficha, a tela do MAC e as rotas do Slot 1 chamam SÓ rotas de LIP/MAC do Slot 1;
//   2. nada disso cita outro slot (Slots 2, 3, 4 ou 5);
//   3. as rotas do Slot 1 são gêmeas das do Slot 3 (as duas são cópia do Slot 1), fora os
//      comentários, o nome do slot e as bibliotecas de regra (o Slot 1 usa as de sempre, o Slot 3
//      as cópias dele) — até alguém mudar uma delas DE PROPÓSITO; aí este teste é atualizado junto;
//   4. o endereço antigo (com e sem ?tipo=), o Fatiador e a leitura do Fatiador levam o Slot 1
//      para as rotas dele;
//   5. as regras de sempre do Slot 1 continuam: caixa de 250 m², área, marco, carimbo, CHEADV,
//      leitura única no interruptor de sempre, despacho interno na rota de sempre.
//
// Rodar: npx tsx scripts/testar_slot1_lip_proprio.mts
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

const FICHA = "components/regularizacao/LipRegularizacaoSei.tsx";
const MAC = "app/analise-regularizacao/[codigo]/page.tsx";
const ROTAS_SLOT1 = listar("app/api/regularizacao-sei");
const PROPRIOS_SLOT1 = [
  ...ROTAS_SLOT1, FICHA, "components/regularizacao/AlertaFluxo.tsx",
  "app/lip-regularizacao-sei/[id]/page.tsx", MAC, ...listar("lib/regularizacaoSei"),
];

secao("1 · ficha, MAC e rotas do Slot 1 chamam só rotas de LIP/MAC do Slot 1");
t("rotas do Slot 1 existem (25)", ROTAS_SLOT1.length === 25, `achei ${ROTAS_SLOT1.length}`);
const ROTA_COMUM = /["`]\/api\/(lip\/|processo\/(carregar|salvar|historico|restaurar|importar-lip|exportar-lip)|mac\/(p3|leitura-unica|checklists|historico|importar-mac|exportar-mac|buscar)|admin\/lip)/;
for (const arq of PROPRIOS_SLOT1) {
  const linhas = semComentario(ler(arq)).split("\n").filter((l) => ROTA_COMUM.test(l));
  t(`${arq} sem rota comum de LIP/MAC`, linhas.length === 0, linhas.map((l) => l.trim().slice(0, 90)).join(" | "));
}

secao("2 · nada do Slot 1 cita outro slot");
const OUTRO_SLOT = /aceite_sei|slot_03|slot_04|slot_05|regularizacaoPed|aceitePed|aceiteSei|aprovacaoProjeto|regularizacao-ped|aceite-ped|aceite-sei|aprovacao-projeto|aceiteSeiDispensas|mac-motor\/slot5|OrganizadorSlot5|lerPastaSlot5/;
for (const arq of PROPRIOS_SLOT1) {
  const linhas = semComentario(ler(arq)).split("\n").filter((l) => OUTRO_SLOT.test(l));
  t(`${arq} sem código de outro slot`, linhas.length === 0, linhas.map((l) => l.trim().slice(0, 90)).join(" | "));
}

secao("3 · rotas do Slot 1 gêmeas das do Slot 3 (fora comentário, nome do slot e bibliotecas de regra)");
const doSlot3ParaSlot1 = (s: string) => s
  .replaceAll("/api/regularizacao-ped/", "/api/regularizacao-sei/")
  .replaceAll("@/lib/regularizacaoPed/lip/", "@/lib/regularizacaoSei/lip/")
  .replaceAll("@/lib/regularizacaoPed/identidade", "@/lib/regularizacaoSei/identidade")
  .replaceAll("@/lib/regularizacaoPed/assuntoDoSlot", "@/lib/regularizacaoSei/assuntoDoSlot")
  .replaceAll("@/lib/regularizacaoPed/marcoTemporal", "@/lib/marcoTemporal")
  .replaceAll("@/lib/regularizacaoPed/carimboAssunto", "@/lib/carimboAssunto")
  .replaceAll("@/lib/regularizacaoPed/cheadvAprovado", "@/lib/cheadvAprovado")
  .replaceAll("@/lib/regularizacaoPed/caixaRecarga", "@/lib/caixaRecargaSlot1")
  .replaceAll("@/lib/regularizacaoPed/compatibilidadeArea", "@/lib/compatibilidadeArea")
  .replaceAll("chavesCaixaDispensadasSlot3", "chavesCaixaDispensadasSlot1")
  .replaceAll("dispensaCaixaSlot3", "dispensaCaixaSlot1")
  .replaceAll("caixaSlot3", "caixaSlot1")
  .replaceAll("SLUG_REGULARIZACAO_PED", "SLUG_REGULARIZACAO_SEI")
  .replaceAll("ehRegularizacaoPed", "ehRegularizacaoSeiExato")
  .replaceAll("assuntoIdDoSlot3", "assuntoIdDoSlot1")
  .replaceAll("slot_03", "regularizacao")
  .replaceAll("Regularização PED", "Regularização SEI")
  .replaceAll("Slot 3", "Slot 1").replaceAll("slot3", "slot1").replaceAll("Slot3", "Slot1");
for (const arq of ROTAS_SLOT1) {
  const gemeo = arq.replace("app/api/regularizacao-sei/", "app/api/regularizacao-ped/");
  if (!existsSync(join(raiz, gemeo))) { t(`${arq} tem gêmeo no Slot 3`, false, gemeo); continue; }
  const a = semComentario(ler(arq));
  const b = semComentario(doSlot3ParaSlot1(ler(gemeo)));
  t(`${arq} = ${gemeo}`, a === b, "divergiu — se foi de propósito, atualize este teste");
}

secao("4 · endereço antigo, Fatiador e leitura do Fatiador levam o Slot 1 para as rotas dele");
const redir = ler("app/processo/[id]/page.tsx");
t("/processo/<id>?tipo=regularizacao encaminha para /lip-regularizacao-sei",
  /regularizacao:\s*"\/lip-regularizacao-sei"/.test(redir));
t("/processo/<id> sem ?tipo= também encaminha (a ficha comum abria como Regularização)",
  /sp\.tipo : "regularizacao";/.test(redir));
t("/lip-regularizacao-sei/<id> abre a ficha própria",
  /import LipRegularizacaoSei from "@\/components\/regularizacao\/LipRegularizacaoSei"/.test(ler("app/lip-regularizacao-sei/[id]/page.tsx")));
t("Fatiador carrega/salva o Slot 1 pelas rotas dele",
  /regularizacao: \{ carregar: "\/api\/regularizacao-sei\/processo\/carregar", salvar: "\/api\/regularizacao-sei\/processo\/salvar", ultimaLeitura: "\/api\/regularizacao-sei\/lip\/ultima-leitura" \}/
    .test(ler("components/fatiadorSei/TelaFatiamento.tsx")));
t("leitura do Fatiador (s1-s3) do Slot 1 pelas rotas dele",
  /slot === "regularizacao"\) return "\/api\/regularizacao-sei\/lip"/.test(ler("lib/documentosSei/lerComGemini.ts")));
const ficha = ler(FICHA);
t("ficha do Slot 1 com tipo fixo regularizacao", /const tipoUrl: string = SLUG_REGULARIZACAO_SEI;/.test(ficha));
t("ficha do Slot 1 abre o MAC do Slot 1", /return "\/analise-regularizacao";/.test(ficha));
const mac = ler(MAC);
t("MAC volta para a ficha própria (3 links)", (mac.match(/`\/lip-regularizacao-sei\/\$\{(encodeURIComponent\(codigo\)|codigo)\}`/g) ?? []).length === 3);

secao("5 · regras de sempre do Slot 1 continuam");
const s3 = ler("app/api/regularizacao-sei/lip/s3/route.ts");
for (const b of ["blocoPromptMarcoTemporal", "blocoPromptCompatibilidadeArea", "blocoPromptCaixaRecarga", "blocoPromptCarimboAssunto", "blocoPromptCheadvAprovado"]) {
  t(`s3 monta ${b}`, new RegExp(`${b}\\(tipoProcesso\\)`).test(s3));
}
t("s4 confere a caixa de 250 m² pela regra do Slot 1",
  /import \* as caixaSlot1 from "@\/lib\/caixaRecargaSlot1";/.test(ler("app/api/regularizacao-sei/lip/s4/route.ts")));
t("salvar dispensa a caixa pela regra do Slot 1",
  /chavesCaixaDispensadasSlot1\(tipoProcesso, dados\)/.test(ler("app/api/regularizacao-sei/processo/salvar/route.ts")));
t("ficha mostra a nota da caixa", /avaliarCaixaRecargaDosDados\(d\)/.test(ficha));
t("ficha mostra o aviso de laudo emitido", /\{laudoEmitido && \(/.test(ficha));
t("ficha gera despacho interno pela rota de sempre (/api/despacho-interno)", ficha.includes('fetch("/api/despacho-interno"'));
const lu = ler("lib/regularizacaoSei/lip/leituraUnicaLipMac.ts");
t("leitura única no interruptor de sempre (leitura_unica_lip_mac_ativo)", /select\("leitura_unica_lip_mac_ativo"\)/.test(lu));
t("leitura única idêntica à original (fora o cabeçalho)",
  lu.split("\n").slice(6).join("\n") === ler("lib/documentosSei/leituraUnicaLipMac.ts"));

console.log(`\n${total - falhas}/${total} ok` + (falhas ? ` — ${falhas} FALHA(S)` : ""));
process.exitCode = falhas ? 1 : 0;
