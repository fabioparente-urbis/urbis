/**
 * Slots 2 e 4 (Aceite): o Termo de Vistoria Fiscal do Aceite é um questionário FIXO e curto. Só os
 * campos que ele pergunta têm a vistoria como fonte; o resto não pode citar a vistoria (Fábio,
 * 05/11/2026, 25.28.000001552-8: militar, aeroportuária, área pública, esquadrias e multas saíram com
 * fonte "Termo de Vistoria Fiscal" sem o termo perguntar nada disso). E Unidade Territorial é do Uso
 * do Solo, que o Aceite não exige → NP sem Uso do Solo.
 * Uso:  node scripts/prompt_vistoria_questionario_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "VISTORIA DO ACEITE — SÓ O QUE O TERMO PERGUNTA";
const ANC = `   CRUZAMENTO OBRIGATÓRIO: para vistoriaEstruturaConcluida`;
const NOVO = `   ${MARCA}: o Termo de Vistoria Fiscal do Aceite (SEFIC/DIRFIS) é um questionário numerado. Mapeie pela PERGUNTA, não pelo assunto:
   - "ÁREA TOTAL (m²) DA EDIFICAÇÃO encontrada no imóvel" → areaVistoria
   - "ÁREA OBJETO DO ALVARÁ DE ACEITE ESTÁ CONCLUÍDA?" → vistoriaEstruturaConcluida
   - "A calçada está regular?" → vistoriaCalcadas
   - "Os lançamentos de águas pluviais atendem as normas?" → vistoriaAguasPluviais
   - "A EDIFICAÇÃO EXISTENTE ... confere integralmente com o Levantamento Arquitetônico?" → vistoriaLevante
   - "Art. 7º da LC 314/2018 ... considera que a edificação: Apta / Não apta" → é a parte da Vistoria no marco temporal (tempoExistencia)
   Campo cuja pergunta NÃO aparece no termo (ex.: área aeroportuária, área militar, ocupa área pública, esquadrias na divisa, multa de recuo, multa de verticalização, unidade territorial, área comercial) NÃO pode ter "Termo de Vistoria Fiscal" como fonte. Se outro documento responder (prancha, cortes, quadro de áreas, laudo), use-o e cite-o na fonte; se nenhum responder, devolva null — nunca invente a fonte. Se a área que o termo diz estar no projeto ("apresentada no Projeto de Levantamento") for diferente da área da prancha (areaAceite), registre a diferença em "pendencias".
${ANC}`;
const ANC2 = `retorne null para: numeroUso, cnae1 a cnae10, descCnae1 a descCnae10, vistoriaUnidadeTerritorial.`;
const NOVO2 = `retorne "NP" para vistoriaUnidadeTerritorial (a unidade territorial é do Uso do Solo, que o Aceite não exige) e null para: numeroUso, cnae1 a cnae10, descCnae1 a descCnae10.`;
const TROCAS = [[ANC, NOVO], [ANC2, NOVO2]];

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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "vistoria-questionario-aceite (script)", assunto_id: p.assunto_id,
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
