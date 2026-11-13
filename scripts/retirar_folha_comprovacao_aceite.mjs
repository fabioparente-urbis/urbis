/**
 * Slots 2 e 4 (Aceite): RETIRA o campo folhaComprovacao do prompt P2 (Fábio, 06/11/2026) — desfaz
 * o que scripts/prompt_folha_comprovacao_aceite.mjs pôs em 05/11/2026.
 * Uso:  node scripts/retirar_folha_comprovacao_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "folhaComprovacao = a FOLHA dos autos";
const ANC1 = `   - A data de energização vai para o Laudo — leia-a sempre que a energização for o documento usado.`;
const NOVO1 = `${ANC1}
   - ${MARCA} onde está o documento usado na comprovação (foto aérea ou um dos 4 documentos): o número do carimbo de folha ("Fls. 32") — só o número, ex.: "32". Sem carimbo de folha, use a página do PDF do SEI precedida de "pág." (ex.: "pág. 33"). Vai para o Laudo junto com o SEI.`;
const ANC2 = `    "seiComprovacao": { "valor": "...", "fonte": "..." },`;
const NOVO2 = `${ANC2}
    "folhaComprovacao": { "valor": null, "fonte": null },`;
const TROCAS = [[NOVO1, ANC1], [NOVO2, ANC2]];

const ALVOS = [[15, "Slot 2 — Aceite SEI"], [25, "Slot 4 — Aceite PED"]];
let erro = false;
for (const [id, slot] of ALVOS) {
  const { data: p, error } = await supabase.from("lip_prompts")
    .select("id, chave, versao, conteudo, assunto_id, ativo").eq("id", id).single();
  if (error || !p) { console.error(`✗ ${slot}: não li o prompt id=${id}`); erro = true; continue; }
  console.log(`\n=== ${slot} (id=${id}, ${p.chave}, versão ${p.versao}, ativo=${p.ativo}) ===`);
  if (p.chave !== "P2_EXTRACAO") { console.error("  ✗ não é P2_EXTRACAO"); erro = true; continue; }
  if (!p.conteudo.includes(MARCA)) { console.log("  · campo já não está no prompt."); continue; }
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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "retirar-folha-comprovacao-aceite (script)", assunto_id: p.assunto_id,
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
