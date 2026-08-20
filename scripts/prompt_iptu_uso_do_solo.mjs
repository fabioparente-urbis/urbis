/**
 * Fixa a FONTE do IPTU nos prompts P2_EXTRACAO dos Slots 1 e 2.
 *
 * Problema real (processo 25.5.000060235-2, 20/08/2026): o prompt só dizia
 * "IPTU: apenas dígitos" e mandava o esqueleto JSON com fonte "Prancha/IPTU".
 * Sem regra de origem, o modelo tirou o IPTU da prancha e trouxe
 * 41908106000000; o correto, que está no Uso do Solo, era 41908406000000.
 * Um dígito de diferença, imóvel diferente — e é o IPTU que ancora a busca de
 * coordenadas no Mapa Fácil.
 *
 * Uso:
 *   node scripts/prompt_iptu_uso_do_solo.mjs --conferir   (não grava, só mostra)
 *   node scripts/prompt_iptu_uso_do_solo.mjs --aplicar
 *
 * Antes de gravar, guarda o conteúdo ANTIGO em `lip_prompts_historico` e em
 * `conteudo_backup`/`versao_anterior` da própria linha. Para voltar tudo:
 *   node scripts/restaurar_prompts.mjs backups/prompts/<arquivo>.json
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

const REGRA_ANTIGA = "IPTU: apenas dígitos, sem pontos/barras.";

const REGRA_NOVA = `IPTU — REGRA CRÍTICA DE FONTE:
   O número do IPTU (inscrição cadastral) vale o que está no USO DO SOLO
   (Despacho CHEADV). Essa é a fonte oficial e vence qualquer outra.
   ⚠️ NÃO tire o IPTU da prancha nem do carimbo do projeto quando houver Uso do
   Solo no processo: a prancha frequentemente traz inscrição desatualizada, de
   lote vizinho ou de antes do desmembramento — um único dígito trocado aponta
   para outro imóvel.
   Só use a prancha se NÃO houver Uso do Solo no processo; nesse caso registre
   fonte "Prancha" para deixar claro que a origem é secundária.
   Formato: apenas dígitos, sem pontos/barras.`;

/** [id do prompt, nome do slot, linha do esqueleto JSON a trocar] */
const ALVOS = [
  [2, "Slot 1 — Regularização SEI", `"iptu": { "valor": "...", "fonte": "Prancha/IPTU" }`],
  [6, "Slot 2 — Aceite SEI", `"iptu": { "valor": "...", "fonte": "Prancha" }`],
];

const ESQUELETO_NOVO = `"iptu": { "valor": "...", "fonte": "Uso do Solo (Despacho CHEADV)" }`;

let houveErro = false;

for (const [id, slot, esqueletoAntigo] of ALVOS) {
  const { data: p, error } = await supabase
    .from("lip_prompts").select("id, chave, versao, conteudo, assunto_id").eq("id", id).single();
  if (error || !p) { console.error(`✗ ${slot}: não consegui ler o prompt id=${id}`); houveErro = true; continue; }

  console.log(`\n=== ${slot} (prompt id=${id}, versão ${p.versao}) ===`);

  // Confere que o texto esperado está lá antes de mexer — prompt editado à mão
  // no meio-tempo não pode ser sobrescrito às cegas.
  const temRegra = p.conteudo.includes(REGRA_ANTIGA);
  const temEsqueleto = p.conteudo.includes(esqueletoAntigo);
  console.log(`  regra "IPTU: apenas dígitos"  : ${temRegra ? "encontrada" : "NÃO ENCONTRADA"}`);
  console.log(`  linha do esqueleto JSON       : ${temEsqueleto ? "encontrada" : "NÃO ENCONTRADA"}`);
  if (!temRegra || !temEsqueleto) {
    console.error(`  ✗ ABORTADO neste prompt — o texto não está como esperado.`);
    houveErro = true;
    continue;
  }
  if (p.conteudo.includes("REGRA CRÍTICA DE FONTE")) {
    console.log("  · já aplicado anteriormente, nada a fazer.");
    continue;
  }

  const novo = p.conteudo
    .replace(REGRA_ANTIGA, REGRA_NOVA)
    .replace(esqueletoAntigo, ESQUELETO_NOVO);

  console.log(`  tamanho: ${p.conteudo.length} → ${novo.length} chars`);

  if (!APLICAR) { console.log("  (modo conferência — nada gravado)"); continue; }

  const { error: errHist } = await supabase.from("lip_prompts_historico").insert({
    prompt_chave: p.chave,
    conteudo: p.conteudo,
    salvo_por: "iptu-fonte-uso-do-solo (script)",
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
