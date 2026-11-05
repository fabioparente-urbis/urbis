/**
 * Slots 2 e 4 (Aceite) — prompt P3_MAC (checklist do MAC). Fábio, 05/11/2026, 25.28.000001552-8:
 * "mandei ler e ele aprovou tudo" — 38 conforme, 8 não se aplica, 0 não conforme, incluindo
 * "Anexar Certidão de Limites" (não existe), "Informar memorial da caixa" (não há caixa) e
 * "Comprovar por imagem aérea" (não há). O prompt não exigia prova para "conforme" nem dizia o que
 * fazer com item condicional e com "Anexar X" ausente.
 * Uso:  node scripts/prompt_mac_conforme_com_prova_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "CONFORME SÓ COM PROVA";
const ANC = `O mesmo vale para caixa de recarga e ART/RRT: não são exigíveis no Aceite; se vierem, registre.`;
const NOVO = `${ANC}

===== ${MARCA} — REGRAS QUE VENCEM AS ANTERIORES =====
1. "conforme" exige PROVA POSITIVA no PDF: o documento ou a informação que o item pede está lá e está
   certo. Nunca marque "conforme" porque não achou problema, nem porque o item "não é exigível".
2. ITEM CONDICIONAL ("No caso de…", "Para imóveis situados em…", "Para terrenos de esquina…",
   "Caso estejam previstos…", "Para o imóvel lindeiro ao corredor…", "Os templos religiosos…",
   "No Setor Central/APL…", "No caso de uso econômico…"): primeiro verifique se a CONDIÇÃO acontece neste
   processo. Se não acontece (um lote só; não é esquina; não é templo; fora do Setor Central/APL; não
   há corredor; não há caixa) → "nao_aplica". Se acontece → julgue o item.
3. "ANEXAR X" / "INFORMAR X": se X está no processo e certo → "conforme". Se X não está:
   - X não é exigido neste Aceite (caixa de recarga e seu memorial/locação quando não há caixa, Uso do
     Solo, certidão de remembramento com um lote só, certidão de limites quando a matrícula já traz as
     dimensões) → "nao_aplica";
   - X é exigido → "nao_conforme".
   NUNCA "conforme" para documento que não está no processo.
4. COMPROVAÇÃO DO TEMPO DE EXISTÊNCIA: o item da imagem aérea é "conforme" só se houver imagem aérea
   anterior a 19/10/1995; se a comprovação foi feita por outro documento do Art. 7º, § 1º (ex.:
   declaração de energização), esse item é "nao_aplica" e o item da Vistoria Fiscal + documento é o
   que se julga.
5. ÁREAS: compare prancha × ART/RRT × vistoria × matrícula. Diferença de área entre eles (ex.: prancha
   1.410,13 m² e ART/vistoria 1.416,70 m²) → "nao_conforme" no item de compatibilizar/quadro de áreas
   e registre em "incompatibilidades" com os números.
6. EMBARGO e AUTOS DE INFRAÇÃO ativos (Laudo de Irregularidade da SEFIS) e outorga onerosa possivelmente
   exigível sem documento: sempre registre em "incompatibilidades", mesmo sem item específico no checklist.
7. Na dúvida entre "conforme" e outra resposta, NÃO escolha "conforme": use null.`;
const TROCAS = [[ANC, NOVO]];

const ALVOS = [[5, "Slot 2 — Aceite SEI (P3_MAC)"], [22, "Slot 4 — Aceite PED (P3_MAC)"]];
let erro = false;
for (const [id, slot] of ALVOS) {
  const { data: p, error } = await supabase.from("lip_prompts")
    .select("id, chave, versao, conteudo, assunto_id, ativo").eq("id", id).single();
  if (error || !p) { console.error(`✗ ${slot}: não li o prompt id=${id}`); erro = true; continue; }
  console.log(`\n=== ${slot} (id=${id}, ${p.chave}, versão ${p.versao}, ativo=${p.ativo}) ===`);
  if (p.chave !== "P3_MAC") { console.error("  ✗ não é P3_MAC"); erro = true; continue; }
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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "mac-conforme-com-prova-aceite (script)", assunto_id: p.assunto_id,
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
