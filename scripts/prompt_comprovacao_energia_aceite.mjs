/**
 * Slots 2 e 4 (Aceite): comprovação do tempo de existência — foto aérea só quando existe (senão NP),
 * declaração de energização com a data lida e página; a data vai ao laudo.
 *
 * Pedido do Fábio (05/11/2026, 25.28.000001552-8): sem ortofoto => NP; a declaração de energia
 * (energizada em 10/10/1978, pág. 33 do PDF / fl. 32) comprova a existência e a data vai pro laudo.
 * A IA tinha posto o SEI da vistoria em "Foto do Google".
 *
 * Uso:  node scripts/prompt_comprovacao_energia_aceite.mjs --conferir   |   --aplicar
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

const MARCA = "REGRAS DE PREENCHIMENTO DA COMPROVAÇÃO (Fábio, 05/11/2026)";
const ANC1 = `4. Se NEM a foto NEM nenhum dos 4 documentos forem encontrados:`;
const NOVO1 = `${MARCA}:
   - foto ("DOC SEI — Foto do Google") = SEI do documento de imagem aérea / ortofoto / Google Earth anterior a 19/10/1995 SOMENTE se ele existir no processo. Se não houver imagem aérea, foto = "NP". NUNCA coloque nesse campo o SEI da Vistoria nem do registro fotográfico da vistoria.
   - Sem imagem aérea, mas com Declaração de Energização (ou outro dos 4 documentos): tipoComprovacao = só o NOME do documento (ex.: "Declaração de Energização"), sem acrescentar "/ Vistoria"; dataEnergizacao = a data em que o documento diz que a unidade consumidora foi energizada, em dd/mm/aaaa, lida do texto da declaração (ex.: "foi energizada em 10/10/1978" → "10/10/1978"); seiComprovacao = SEI do documento (ou do processo/pacote que o contém). Na "fonte" de seiComprovacao cite também a página quando o carimbo aparecer (ex.: "pág. 33 do PDF / fl. 32 dos autos físicos").
   - A data de energização vai para o Laudo — leia-a sempre que a energização for o documento usado.
${ANC1}`;
const ANC2 = `"foto": { "valor": "...", "fonte": "Registro Fotográfico" },`;
const NOVO2 = `"foto": { "valor": "...", "fonte": "Imagem aérea/Google Earth anterior a 1995 — NP se não houver" },`;
const TROCAS = [[ANC1, NOVO1], [ANC2, NOVO2]];

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
    prompt_chave: p.chave, conteudo: p.conteudo, salvo_por: "comprovacao-energia-aceite (script)", assunto_id: p.assunto_id,
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
