/**
 * Slots 2 e 4 (Aceite): "Tem Onerosa?" é FATO (há documento da outorga onerosa no processo?), não
 * cálculo (Fábio, 05/11/2026, 25.28.000001552-8: SEI da onerosa NP e o campo saiu SIM porque o
 * prompt mandava calcular construída > terreno e altura > 7,5 m). O cálculo vira alerta em pendências.
 * Uso:  node scripts/prompt_onerosa_fato_aceite.mjs --conferir   |   --aplicar
 * Backup em lip_prompts_historico/conteudo_backup; voltar com scripts/restaurar_prompts.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MARCA = "ONEROSA É FATO, NÃO CÁLCULO";
const ANC = `- onerosa: "SIM" se área construída > área do terreno E altura > 7,5m (isso É calculável, sempre preencha); "NÃO" caso as áreas mostrem o contrário.`;
const NOVO = `- onerosa (${MARCA}): responde "o processo TEM o documento da outorga onerosa?". "SIM" só se houver no processo o documento da outorga onerosa (cálculo/guia/termo/comprovante) — e então numero_do_sei_da_onerosa = SEI de 7 dígitos dele. Se não houver esse documento: onerosa = "NÃO" e numero_do_sei_da_onerosa = "NP" (aqui a ausência do documento É a resposta). NÃO calcule a onerosa para preencher este campo. Se as áreas indicarem que ela pode ser exigível (área construída > área do terreno E altura > 7,5 m) e não houver documento, registre em "pendencias": "Onerosa possivelmente exigível (área construída X m² > terreno Y m² e altura > 7,5 m) e não encontrada no processo — conferir."`;
const TROCAS = [[ANC, NOVO]];

const ALVOS = [[15, "Slot 2 — Aceite SEI"], [25, "Slot 4 — Aceite PED"]];
let erro = false;
for (const [id, slot] of ALVOS) {
  const { data: p, error } = await supabase.from("lip_prompts")
    .select("id, chave, versao, conteudo, assunto_id, ativo").eq("id", id).single();
  if (error || !p) { console.error(`✗ ${slot}: não li o prompt id=${id}`); erro = true; continue; }
  console.log(`\n=== ${slot} (id=${id}, ${p.chave}, versão ${p.versao}, ativo=${p.ativo}) ===`);
  if (p.chave !== "P2_EXTRACAO") { console.error("  ✗ não é P2_EXTRACAO"); erro = true; continue; }
  if (p.conteudo.includes(MARCA)) { console.log("  · já aplicado."); continue; }
  let novo = p.conteudo, ok = true;
  for (const [ant, nv] of TROCAS) {
    const n = novo.split(ant).length - 1;
    console.log(`  âncora ${n === 1 ? "ok" : `ENCONTRADA ${n}x`}: ${ant.slice(0, 50)}…`);
    if (n !== 1) { ok = false; continue; }
    novo = novo.replace(ant, nv);
  }
  if (!ok) { console.error("  ✗ ABORTADO — texto não está como esperado."); erro = true; continue; }
  console.log(`  tamanho: ${p.conteudo.length} → ${novo.length}`);
  if (!APLICAR) { console.log("  (conferência — nada gravado)"); continue; }
  const { error: eh } = await supabase.from("lip_prompts_historico").insert({
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "onerosa-fato-aceite (script)", assunto_id: p.assunto_id,
  });
  if (eh) { console.error(`  ✗ histórico falhou: ${eh.message} — não gravei.`); erro = true; continue; }
  const { error: eu } = await supabase.from("lip_prompts").update({
    conteudo: novo, versao: p.versao + 1, versao_anterior: p.versao, conteudo_backup: p.conteudo,
  }).eq("id", id);
  if (eu) { console.error(`  ✗ gravação falhou: ${eu.message}`); erro = true; continue; }
  console.log(`  ✓ gravado — versão ${p.versao} → ${p.versao + 1}`);
}
console.log(APLICAR ? "\nConcluído." : "\nNada gravado. Rode com --aplicar.");
process.exit(erro ? 1 : 0);
