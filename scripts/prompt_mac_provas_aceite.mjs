/**
 * Slots 2 e 4 (Aceite) — prompt P3_MAC: cada "conforme"/"nao_conforme" e cada incompatibilidade
 * devolve a PROVA (documento, SEI, página, trecho). A rota confere a prova contra o rodapé do PDF
 * e o que não tiver prova volta para o analista (Fábio, 05/11/2026 — o Gemini inventou "esgoto
 * ligado à rede pública", que não está no PDF).
 * Uso:  node scripts/prompt_mac_provas_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "PROVA OBRIGATÓRIA";
const ANC = `- NUNCA retorne texto, explicações ou markdown fora do JSON`;
const NOVO = `${ANC}

===== ${MARCA} — cada resposta mostra de onde saiu =====
Acrescente ao JSON a chave "provas" e devolva as incompatibilidades como objetos:
{
  "itens": { ... },
  "provas": {
    "<id do item>": {"documento": "Vistoria Simples", "sei": "8898330", "pagina": 99, "trecho": "A calçada está regular? : Sim"}
  },
  "documentos": [ ... ],
  "incompatibilidades": [
    {"texto": "Área da prancha (1.410,13 m²) diverge da vistoria (1.416,70 m²)", "documento": "Vistoria Simples", "sei": "8898330", "pagina": 99, "trecho": "ÁREA TOTAL ... encontrada no imóvel ... 1416,70m²"}
  ]
}
Regras:
- TODO item "conforme" ou "nao_conforme" precisa de prova em "provas". Item sem prova será devolvido
  ao analista em branco — então, se você não consegue apontar documento, página e trecho, responda null.
- "sei" = os 7 ou 8 dígitos entre parênteses no rodapé da página ("Vistoria Simples (8898330)").
- "pagina" = o número depois de "pg." no rodapé ("SEI 25.28.000001552-8 / pg. 99" → 99). Sem rodapé,
  a página do PDF.
- "trecho" = as palavras do documento que provam a resposta, copiadas como estão (até ~200 caracteres).
  NUNCA escreva trecho que não está no documento.
- "nao_aplica" não precisa de prova (é a condição do item que não acontece), mas pode trazer.
- Incompatibilidade sem documento/página/trecho não é aceita: só aponte o que você consegue mostrar.`;
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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "mac-provas-aceite (script)", assunto_id: p.assunto_id,
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
