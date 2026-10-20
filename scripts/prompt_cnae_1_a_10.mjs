/**
 * Leitura dos CNAEs nos prompts P2_EXTRACAO dos Slots 1, 2, 3 e 4 (Slot 5 fora).
 *
 * Pedido do Fábio (20/10/2026): "o URBI tem que procurar o documento de uso do solo, o último
 * anexado que é o válido, e procurar se tem uso específico ou não; se tem vai ter CNAE... se o
 * CNAE for 8 desconsiderar... se não for tem que anotar todos e mandar pro LIP e pro LAUDO".
 *
 * O que muda em cada prompt:
 *   1. CNAE vem SEMPRE do último Uso do Solo anexado (maior SEI);
 *   2. anota TODOS os CNAEs do documento, até 10: código em cnae1..cnae10 e descrição em
 *      descCnae1..descCnae10 (antes: 5 códigos e 2 descrições);
 *   3. CNAE "8" / sem uso definido → todos NP (já era a regra; agora cobre os 10 + descrições);
 *   4. Slots 1 e 3: "usoDefinido" passa a responder a pergunta da ficha como ela está escrita —
 *      "Uso de Solo SEM uso definido?" → "Sim" quando NÃO há uso definido. O prompt antigo
 *      mandava o contrário (medido em 20/10: 17 dos 22 processos com CNAE estavam com "Sim").
 *
 * Uso:
 *   node scripts/prompt_cnae_1_a_10.mjs --conferir   (não grava, só mostra)
 *   node scripts/prompt_cnae_1_a_10.mjs --aplicar
 *
 * Antes de gravar, guarda o conteúdo ANTIGO em `lip_prompts_historico` e em
 * `conteudo_backup`/`versao_anterior` da própria linha (mesmo padrão de
 * scripts/prompt_iptu_uso_do_solo.mjs). Para voltar: scripts/restaurar_prompts.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APLICAR = process.argv.includes("--aplicar");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MARCA = "CNAEs — ÚLTIMO USO DO SOLO";

const linhasJson = (prefixo, de, ate) =>
  Array.from({ length: ate - de + 1 }, (_, i) => `    "${prefixo}${de + i}": { "valor": null, "fonte": null },`).join("\n");

const REGRA_CNAE = `- ${MARCA}: os CNAEs vêm SEMPRE do ÚLTIMO documento de Uso do Solo anexado ao processo (o de maior número SEI) — é o válido; ignore Usos do Solo anteriores.
  Se esse documento indicar USO ESPECÍFICO, anote TODOS os CNAEs listados nele, na ordem em que aparecem, até 10: o código em cnae1..cnae10 (os dígitos como estão no documento) e a descrição da atividade, lida ao lado do código, em descCnae1..descCnae10 (mesmo número do código). Os que sobrarem = "NP". Nunca pule CNAE e nunca resuma vários num campo só.`;

const SEM_USO_ALVO = `então TODOS os campos cnae (cnae1 a cnae10) e descCnae (descCnae1 a descCnae10) = "NP". Trate como se NÃO houvesse CNAE — nunca escreva o código "8"/"000000008" nem o texto "sem uso definido" nos campos cnae.`;

/** Slots 1 e 3 (Regularização). */
const TROCAS_REGULARIZACAO = [
  [
    `   - "descCnae1", "descCnae2": descrição textual da atividade de cada CNAE (ex.: "Atividades de organizações religiosas ou filosóficas"), lida ao lado do código no documento de Uso do Solo; "NP" se o cnae correspondente for "NP"`,
    `   - "descCnae1" a "descCnae10": descrição textual da atividade de cada CNAE (ex.: "Atividades de organizações religiosas ou filosóficas"), lida ao lado do código no último documento de Uso do Solo; "NP" se o cnae correspondente for "NP"`,
  ],
  [
    `- usoDefinido: "Sim" se o uso do solo está definido; "Não" se sem uso definido.`,
    `- usoDefinido: responde à pergunta da ficha "Uso de Solo SEM uso definido?" — "Sim" se o último Uso do Solo indicar SEM USO DEFINIDO (ou CNAE "8"/"000000008"); "Não" se indicar uso específico (CNAE listado).\n${REGRA_CNAE}`,
  ],
  [
    `então usoDefinido="Não" e TODOS os campos cnae (cnae1 a cnae5) = "NP". Trate como se NÃO houvesse CNAE — nunca escreva o código "8"/"000000008" nem o texto "sem uso definido" nos campos cnae.`,
    `então usoDefinido="Sim" e ${SEM_USO_ALVO.replace(/^então /, "")}`,
  ],
  [`    "cnae5": { "valor": null, "fonte": null },`, `    "cnae5": { "valor": null, "fonte": null },\n${linhasJson("cnae", 6, 10)}`],
  [`    "descCnae2": { "valor": null, "fonte": null },`, `    "descCnae2": { "valor": null, "fonte": null },\n${linhasJson("descCnae", 3, 10)}`],
];

/** Slots 2 e 4 (Aceite) — não têm o campo usoDefinido. */
const TROCAS_ACEITE = [
  [
    `retorne null para: numeroUso, cnae1, cnae2, corredor, faixa, vistoriaUnidadeTerritorial.`,
    `retorne null para: numeroUso, cnae1 a cnae10, descCnae1 a descCnae10, corredor, faixa, vistoriaUnidadeTerritorial.`,
  ],
  [
    `então TODOS os campos cnae (cnae1 a cnae5) = "NP". Trate como se NÃO houvesse CNAE — nunca escreva o código "8"/"000000008" nem o texto "sem uso definido" nos campos cnae.`,
    `${SEM_USO_ALVO}\n${REGRA_CNAE}`,
  ],
  [`    "cnae2": { "valor": null, "fonte": null },`, `    "cnae2": { "valor": null, "fonte": null },\n${linhasJson("cnae", 3, 10)}\n${linhasJson("descCnae", 1, 10)}`],
];

/** [id do prompt, slot, trocas]. Slot 3 tem DUAS linhas ativas na versão 1 (cópias das v21 e
 *  v22 do Slot 1) — as duas recebem a mesma troca, para não depender de qual a rota pega. */
const ALVOS = [
  [13, "Slot 1 — Regularização SEI", TROCAS_REGULARIZACAO],
  [15, "Slot 2 — Aceite SEI", TROCAS_ACEITE],
  [16, "Slot 3 — Regularização PED (cópia da v21)", TROCAS_REGULARIZACAO],
  [18, "Slot 3 — Regularização PED (cópia da v22)", TROCAS_REGULARIZACAO],
  [25, "Slot 4 — Aceite PED", TROCAS_ACEITE],
];

let houveErro = false;

for (const [id, slot, trocas] of ALVOS) {
  const { data: p, error } = await supabase
    .from("lip_prompts").select("id, chave, versao, conteudo, assunto_id, ativo").eq("id", id).single();
  if (error || !p) { console.error(`✗ ${slot}: não consegui ler o prompt id=${id}`); houveErro = true; continue; }

  console.log(`\n=== ${slot} (prompt id=${id}, ${p.chave}, versão ${p.versao}, ativo=${p.ativo}) ===`);
  if (p.chave !== "P2_EXTRACAO") { console.error("  ✗ ABORTADO — não é P2_EXTRACAO."); houveErro = true; continue; }
  if (p.conteudo.includes(MARCA)) { console.log("  · já aplicado anteriormente, nada a fazer."); continue; }

  // Confere que cada trecho está lá UMA vez antes de mexer — prompt editado à mão no
  // meio-tempo não pode ser sobrescrito às cegas.
  let novo = p.conteudo;
  let ok = true;
  for (const [antigo, trocado] of trocas) {
    const n = novo.split(antigo).length - 1;
    console.log(`  ${n === 1 ? "encontrado" : `ENCONTRADO ${n}x`}: ${antigo.slice(0, 70).trim()}…`);
    if (n !== 1) { ok = false; continue; }
    novo = novo.replace(antigo, trocado);
  }
  if (!ok) { console.error("  ✗ ABORTADO neste prompt — o texto não está como esperado."); houveErro = true; continue; }

  console.log(`  tamanho: ${p.conteudo.length} → ${novo.length} chars`);
  if (!APLICAR) { console.log("  (modo conferência — nada gravado)"); continue; }

  const { error: errHist } = await supabase.from("lip_prompts_historico").insert({
    prompt_chave: p.chave,
    conteudo: p.conteudo,
    salvo_por: "cnae-1-a-10 (script)",
    assunto_id: p.assunto_id,
  });
  if (errHist) { console.error(`  ✗ histórico falhou: ${errHist.message} — NÃO gravei o prompt.`); houveErro = true; continue; }

  const { error: errUp } = await supabase.from("lip_prompts").update({
    conteudo: novo,
    versao: p.versao + 1,
    versao_anterior: p.versao,
    conteudo_backup: p.conteudo,
  }).eq("id", id);
  if (errUp) { console.error(`  ✗ gravação falhou: ${errUp.message}`); houveErro = true; continue; }

  console.log(`  ✓ gravado — versão ${p.versao} → ${p.versao + 1}`);
}

console.log(APLICAR ? "\nConcluído." : "\nNada foi gravado. Rode com --aplicar para valer.");
process.exit(houveErro ? 1 : 0);
