/**
 * Slots 2 e 4 (Aceite): nadaConsta e pag = SEI de 7 dígitos do ENCAMINHAMENTO da busca de processos
 * no endereço (Fábio, 05/11/2026, 25.28.000001552-8: o correto era 9068668; a leitura pôs "52" em
 * pag e "Consta" em nadaConsta).
 * Uso:  node scripts/prompt_busca_arquivo_sei_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "ENCAMINHAMENTO DA BUSCA — SEI DE 7 DÍGITOS";
const ANC = `7. ENCAMINHAMENTO de busca de processos pelo endereço: SEI para os campos nadaConsta e pag.`;
const NOVO = `7. ENCAMINHAMENTO de busca de processos pelo endereço — ${MARCA}: é o Encaminhamento (documento da Prefeitura, com número SEI próprio) que informa o resultado da busca no endereço do imóvel (ex.: "após buscas no endereço do imóvel não foi localizado nenhum processo anteriormente aprovado"). nadaConsta e pag recebem os MESMOS 7 dígitos: o número SEI desse Encaminhamento, lido no título/árvore ("Encaminhamento 9068668") ou no rodapé ("SEI nº 9068668v1" → "9068668"). NUNCA número de página ("52"), NUNCA texto como "Consta"/"Não"/"Nada consta". Se houver mais de um Encaminhamento, use o da busca por endereço; sem ele, deixe null.`;
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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "busca-arquivo-sei-aceite (script)", assunto_id: p.assunto_id,
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
