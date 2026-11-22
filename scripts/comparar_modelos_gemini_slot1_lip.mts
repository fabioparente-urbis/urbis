/**
 * Compara modelos do Gemini na leitura do LIP do Slot 1 (reproduz app/api/regularizacao-sei/lip/s3,
 * SEM a leitura combinada com o MAC). SÓ LEITURA: não grava nada. Referência = ficha salva (processos.dados).
 *   npx tsx --env-file=.env.local scripts/comparar_modelos_gemini_slot1_lip.mts <pdf-do-processo> <codigo> [modelos] [rodadas]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { blocoPromptMarcoTemporal } from "../lib/marcoTemporal";
import { blocoPromptCompatibilidadeArea } from "../lib/compatibilidadeArea";
import { blocoPromptCaixaRecarga } from "../lib/caixaRecargaSlot1";
import { blocoPromptCarimboAssunto } from "../lib/carimboAssunto";
import { blocoPromptCheadvAprovado } from "../lib/cheadvAprovado";
import { aplicarMarcadores } from "../lib/regularizacaoSei/lip/promptCampos";

const PDF = process.argv[2]!, CODIGO = process.argv[3]!;
const MODELOS = (process.argv[4] ?? "gemini-2.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash").split(",");
const RODADAS = Number(process.argv[5] ?? 2);
const apiKey = process.env.GEMINI_API_KEY!;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const norm = (v: any) => String(v ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const { data: proc } = await sb.from("processos").select("tipo_processo,assunto_id,dados").eq("codigo", CODIGO).maybeSingle();
  const tipo = proc!.tipo_processo as string;
  const { data: pr } = await sb.from("lip_prompts").select("conteudo,versao").eq("ativo", true).eq("chave", "P2_EXTRACAO").eq("assunto_id", proc!.assunto_id).order("versao", { ascending: false }).limit(1).maybeSingle();
  const base = await aplicarMarcadores(pr!.conteudo, { assunto_id: proc!.assunto_id, codigo: CODIGO });
  const prompt = base + blocoPromptMarcoTemporal(tipo) + blocoPromptCompatibilidadeArea(tipo) + blocoPromptCaixaRecarga(tipo) + blocoPromptCarimboAssunto(tipo) + blocoPromptCheadvAprovado(tipo);
  console.log(`prompt P2 v${pr!.versao}, tipo ${tipo}`);

  const buf = readFileSync(PDF);
  const up = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/pdf", "X-Goog-Upload-Command": "upload, finalize" }, body: buf });
  if (!up.ok) throw new Error(await up.text());
  const uri = (await up.json()).file.uri as string;
  await new Promise((r) => setTimeout(r, 15000));

  async function rodar(modelo: string) {
    const t0 = Date.now();
    for (let t = 1; t <= 5; t++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ fileData: { mimeType: "application/pdf", fileUri: uri } }, { text: prompt }] }], generationConfig: { maxOutputTokens: 65536, temperature: 0.1 } }),
      });
      if (res.ok) {
        const j = await res.json();
        const txt = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").replace(/```json|```/g, "").trim();
        try { const d = JSON.parse(txt); const c: Record<string, string> = {};
          for (const [k, it] of Object.entries(d.campos ?? {})) c[k] = (it as any)?.valor ?? (typeof it === "string" ? it : "");
          return { campos: c, seg: Math.round((Date.now() - t0) / 1000), tokens: j.usageMetadata?.totalTokenCount };
        } catch { console.log(modelo, "JSON inválido, tentativa", t); }
      } else console.log(modelo, "erro", res.status, (await res.text()).slice(0, 150));
      await new Promise((r) => setTimeout(r, t * 5000));
    }
    return null;
  }
  const res = await Promise.all(MODELOS.flatMap((m) => Array.from({ length: RODADAS }, (_, i) => rodar(m).then((r) => ({ m, i, r })))));
  const ref: Record<string, any> = proc!.dados ?? {};
  const chaves = Object.keys(ref).filter((k) => norm(ref[k]?.valor) !== "");
  writeFileSync(process.env.SAIDA ?? "/tmp/slot1_lip_cmp.json", JSON.stringify({ res, ref }, null, 1));
  console.log(`campos preenchidos na ficha salva (referência): ${chaves.length}`);
  for (const { m, i, r } of res) {
    if (!r) { console.log(m, i + 1, "FALHOU"); continue; }
    const lidos = Object.values(r.campos).filter((v) => norm(v) !== "").length;
    const igual = chaves.filter((k) => norm(r.campos[k]) === norm(ref[k]?.valor)).length;
    console.log(`${m} #${i + 1} (${r.seg}s, ${r.tokens} tokens): leu ${lidos} campos; ${igual}/${chaves.length} iguais à ficha salva`);
  }
  // acordo entre rodadas
  for (const m of MODELOS) { const rs = res.filter((x) => x.m === m && x.r); if (rs.length === 2) { const ks = Object.keys(rs[0].r!.campos); const eq = ks.filter((k) => norm(rs[0].r!.campos[k]) === norm(rs[1].r!.campos[k])).length; console.log(`${m}: rodada 1 = rodada 2 em ${eq}/${ks.length} campos`); } }
}
main().catch((e) => { console.error(e); process.exit(1); });
