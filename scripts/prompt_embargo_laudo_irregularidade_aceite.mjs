/**
 * Slots 2 e 4 (Aceite): embargo ativo registrado em LAUDO DE IRREGULARIDADE (SEFIS) conta como prova
 * de "SIM" (Fábio, 05/11/2026, 25.28.000001552-8: os laudos de 06/03/2024, 10/10/2024 e 20/03/2025
 * apontam "Termo de Embargo Ativo: Processo nº 91996002" e a leitura marcou NÃO).
 * Uso:  node scripts/prompt_embargo_laudo_irregularidade_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "EMBARGO EM LAUDO DE IRREGULARIDADE";
const ANC = `- embargo: null | "SIM" | "NÃO". Se NÃO ou null → seiEmbargo=null, dataEmb="NP".`;
const NOVO = `${ANC}
  ${MARCA}: o Laudo de Irregularidade da SEFIS (e a consulta aos sistemas que ele traz) é documento que MOSTRA embargo. Se qualquer laudo/vistoria do processo registrar "Termo de Embargo Ativo" (ou embargo vigente/não baixado) para o imóvel → embargo = "SIM", mesmo que a vistoria atual ou o carimbo nada digam. Leia todos os laudos de irregularidade, não só o último; embargo registrado e ainda não baixado vale. Nesse caso: seiEmbargo = SEI de 7 dígitos do documento que registra o embargo (o Laudo de Irregularidade mais recente que o cita ativo); dataEmb = a data do Termo de Embargo se constar, senão a data desse laudo (diga isso na fonte); e registre em "pendencias" o número do processo do embargo, os autos de infração não baixados citados e as páginas dos laudos (ex.: "Embargo ativo — processo 91996002; laudos nas págs. 55, 75 e 89"). Nunca marque "NÃO" quando um laudo de irregularidade cita embargo ativo; só marque "NÃO" com prova de ausência (laudo que diga que não há embargo ou que ele foi baixado).`;
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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "embargo-laudo-irregularidade-aceite (script)", assunto_id: p.assunto_id,
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
