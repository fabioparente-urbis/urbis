/**
 * Slots 2 e 4 (Aceite SEI / Aceite PED): "Área conforme ART de Levantamento" (areaArt) tem que sair
 * da própria ART/RRT, nunca da prancha/projeto.
 *
 * Pedido do Fábio (05/11/2026, processo 25.28.000001552-8): a RRT dizia "Quantidade: 1.416,700 m²"
 * e a leitura pôs 1.410,13 (área da prancha) em areaArt, com fonte "ART CREA-GO" (era RRT do CAU).
 * O prompt já mandava não copiar da prancha, mas sem dizer ONDE ler nem o que fazer na divergência.
 *
 * Uso:  node scripts/prompt_area_art_aceite.mjs --conferir   |   --aplicar
 * Guarda o conteúdo antigo em `lip_prompts_historico` e `conteudo_backup` (padrão de
 * prompt_cnae_1_a_10.mjs). Para voltar: scripts/restaurar_prompts.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MARCA = "ÁREA DA ART/RRT (areaArt) — REGRA CRÍTICA DE FONTE";
const ANTIGO = `Não calcule, não copie da prancha para esses 3 campos — se o documento não citar, deixe null.`;
const NOVO = `${ANTIGO}
${MARCA}: leia SOMENTE o documento da ART (CREA) ou da RRT (CAU) de levantamento, na QUANTIDADE da atividade técnica (RRT: item "Dados da Atividade Técnica", ex.: "Quantidade: 1.416,700 / Unidade: metro quadrado" → "1.416,70"; ART: campo de quantidade em m² da atividade). Escreva em formato brasileiro, 2 casas decimais. NUNCA use a área da prancha/projeto (quadro de áreas, areaAceite) nem a do Laudo ou da Vistoria nesta chave, mesmo que sejam parecidas. Se a ART/RRT difere da prancha, o valor da ART/RRT é o que vai em areaArt e a diferença vai em "pendencias". Na fonte escreva "ART" (CREA) ou "RRT" (CAU) conforme o documento. Se a ART/RRT não estiver legível ou não citar quantidade em m², areaArt = null — nunca complete com a área da prancha.`;

const ALVOS = [[15, "Slot 2 — Aceite SEI"], [25, "Slot 4 — Aceite PED"]];
let erro = false;
for (const [id, slot] of ALVOS) {
  const { data: p, error } = await supabase.from("lip_prompts")
    .select("id, chave, versao, conteudo, assunto_id, ativo").eq("id", id).single();
  if (error || !p) { console.error(`✗ ${slot}: não li o prompt id=${id}`); erro = true; continue; }
  console.log(`\n=== ${slot} (id=${id}, ${p.chave}, versão ${p.versao}, ativo=${p.ativo}) ===`);
  if (p.chave !== "P2_EXTRACAO") { console.error("  ✗ não é P2_EXTRACAO"); erro = true; continue; }
  if (p.conteudo.includes(MARCA)) { console.log("  · já aplicado."); continue; }
  const n = p.conteudo.split(ANTIGO).length - 1;
  console.log(`  trecho âncora encontrado ${n}x`);
  if (n !== 1) { console.error("  ✗ ABORTADO — texto não está como esperado."); erro = true; continue; }
  const novo = p.conteudo.replace(ANTIGO, NOVO);
  console.log(`  tamanho: ${p.conteudo.length} → ${novo.length}`);
  if (!APLICAR) { console.log("  (conferência — nada gravado)"); continue; }
  const { error: eh } = await supabase.from("lip_prompts_historico").insert({
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "area-art-aceite (script)", assunto_id: p.assunto_id,
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
