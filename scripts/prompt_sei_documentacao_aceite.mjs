/**
 * Slots 2 e 4 (Aceite): número SEI dos documentos — Prefeitura tem número próprio; o que o
 * interessado junta vai dentro de "Documentação (N)".
 *
 * Pedido do Fábio (05/11/2026, 25.28.000001552-8): artLev saiu como "ART CREA-GO nº …" em vez do SEI.
 *
 * Uso:  node scripts/prompt_sei_documentacao_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "SEI DOS DOCUMENTOS — QUEM EMITIU";
const ANTIGO = `NUNCA use número de ART/RRT como SEI.`;
const NOVO = `${ANTIGO}
${MARCA} (regra do Fábio, 05/11/2026): no SEI, o que a PREFEITURA emite (Termo de Vistoria, Despachos, Certidão de Uso do Solo, Encaminhamentos, e-mails) tem número SEI PRÓPRIO — aparece na árvore do processo e no rodapé como "Vistoria Simples (8898330)". Já o que o INTERESSADO junta NÃO ganha número por documento: tudo vem dentro de um pacote "Documentação (NNNNNNN)". Por isso certidao (matrícula), levantamento (prancha), laudo, artLev (ART/RRT), artCx e demais anexos do interessado levam o número SEI do PACOTE "Documentação" que contém aquele documento — o número entre parênteses do pacote, lido do rodapé/cabeçalho de quem o envolve. Se houver mais de um pacote "Documentação", use o que de fato contém o documento (e, na versão mais recente, o de maior número). Os documentos da Prefeitura (vistoria, seiCheadv, despachos) continuam com o número próprio de cada um.
  - artLev é SÓ o número SEI (7 dígitos) do pacote que contém a ART/RRT; NUNCA escreva "ART CREA-GO nº …" nem o número da ART nesse campo — o número da ART/RRT vai em nroArtLev (ART/RRT do CREA ou do CAU, exatamente como no documento).
  - Confira cada dígito do SEI (ex.: 10997249 ≠ 10597249); se não tiver certeza de um dígito, deixe o campo vazio e registre em "pendencias" em vez de adivinhar.`;

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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "sei-documentacao-aceite (script)", assunto_id: p.assunto_id,
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
