/**
 * Slots 2 e 4 (Aceite), aba "8. Vistoria e Uso" (Fábio, 06/11/2026):
 *  - DESATIVA o campo folhaComprovacao (ativo=false; o valor já salvo nas fichas fica guardado);
 *  - CRIA docSeiEnergizacao "DOC SEI — Energização ou Outros", ao lado de dataEnergizacao (ordem 19);
 *  - acrescenta o campo ao P2_EXTRACAO (prompts 15 e 25) com backup no lip_prompts_historico.
 * Uso: node scripts/aceite_campo_doc_sei_energizacao.mjs --conferir | --aplicar
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("="))
  .map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1)]}));
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ABAS = [["f5685c08-7e5e-42d9-8a71-c9f821bc100d","Slot 2"],["fa2d3bed-4088-43af-b6c9-8757dfc8b8ba","Slot 4"]];
const CHAVE = "docSeiEnergizacao";
let erro = false;
for (const [aba, nome] of ABAS) {
  const { data: ja } = await s.from("lip_campos").select("id").eq("aba_id", aba).eq("chave", CHAVE);
  const { data: fo } = await s.from("lip_campos").select("id,ativo").eq("aba_id", aba).eq("chave", "folhaComprovacao");
  console.log(`${nome}: folha ${fo?.length ? (fo[0].ativo ? "ativa → desativar" : "já inativa") : "não existe"}; novo campo ${ja?.length ? "já existe" : "criar"}`);
  if (!APLICAR) continue;
  if (fo?.length && fo[0].ativo) {
    const { error } = await s.from("lip_campos").update({ ativo: false }).eq("id", fo[0].id);
    if (error) { console.error("  ✗", error.message); erro = true; }
  }
  if (!ja?.length) {
    const { error } = await s.from("lip_campos").insert({ aba_id: aba, chave: CHAVE,
      label: "DOC SEI — Energização ou Outros", tipo: "texto", opcoes: null,
      placeholder: "SEI da Declaração de Energização ou do outro documento usado", valor_padrao: "", ordem: 19, ativo: true });
    if (error) { console.error("  ✗", error.message); erro = true; }
  }
}

const ANC1 = `   - A data de energização vai para o Laudo — leia-a sempre que a energização for o documento usado.`;
const NOVO1 = `${ANC1}\n   - ${CHAVE} = o número SEI (7 ou 8 dígitos) da Declaração de Energização ou do outro documento usado na comprovação (os 4 documentos, exceto a foto aérea, que tem campo próprio). Sem documento, null.`;
const ANC2 = `    "dataEnergizacao": { "valor": null, "fonte": null },`;
const NOVO2 = `${ANC2}\n    "${CHAVE}": { "valor": null, "fonte": null },`;
for (const [id, nome] of [[15,"Slot 2"],[25,"Slot 4"]]) {
  const { data: p } = await s.from("lip_prompts").select("id,chave,versao,conteudo,assunto_id").eq("id", id).single();
  if (!p || p.chave !== "P2_EXTRACAO") { console.error(`✗ ${nome}: prompt inesperado`); erro = true; continue; }
  if (p.conteudo.includes(CHAVE)) { console.log(`${nome} prompt: já tem o campo`); continue; }
  const n1 = p.conteudo.split(ANC1).length-1, n2 = p.conteudo.split(ANC2).length-1;
  console.log(`${nome} prompt: âncoras ${n1}x/${n2}x`);
  if (n1 !== 1 || n2 !== 1) { console.error("  ✗ abortado"); erro = true; continue; }
  if (!APLICAR) continue;
  const novo = p.conteudo.replace(ANC1, NOVO1).replace(ANC2, NOVO2);
  const { error: eh } = await s.from("lip_prompts_historico").insert({ prompt_chave: p.chave, conteudo: p.conteudo,
    salvo_por: "doc-sei-energizacao (script)", assunto_id: p.assunto_id });
  if (eh) { console.error("  ✗ histórico:", eh.message); erro = true; continue; }
  const { error: eu } = await s.from("lip_prompts").update({ conteudo: novo, versao: p.versao+1, versao_anterior: p.versao, conteudo_backup: p.conteudo }).eq("id", id);
  if (eu) { console.error("  ✗", eu.message); erro = true; } else console.log(`  ✓ versão ${p.versao} → ${p.versao+1}`);
}
console.log(APLICAR ? "Concluído." : "Nada gravado. Rode com --aplicar.");
process.exit(erro ? 1 : 0);
