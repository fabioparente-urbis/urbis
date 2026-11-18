/**
 * Compara modelos do Gemini na leitura do MAC do Slot 1 (reproduz app/api/regularizacao-sei/mac/p3),
 * por causa do fim do gemini-2.5-flash em 01/12/2026. SÓ LEITURA: não grava nada no banco.
 *   npx tsx --env-file=.env.local scripts/comparar_modelos_gemini_slot1.mts <pasta> <codigo> [modelos] [rodadas]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assuntoIdDoSlot1 } from "../lib/regularizacaoSei/assuntoDoSlot";

const PASTA = process.argv[2]!;
const CODIGO = process.argv[3] ?? "24.5.000028498-2";
const MODELOS = (process.argv[4] ?? "gemini-2.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash").split(",");
const RODADAS = Number(process.argv[5] ?? 2);
const IGNORAR = /^(\._|~\$)|DESPACHO Nº 2583|SEI_|\.xlsx$|\.docx$/i;
const apiKey = process.env.GEMINI_API_KEY!;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ascii = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");

async function subir(nome: string): Promise<string> {
  const buf = readFileSync(join(PASTA, nome));
  const r = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "X-Goog-Upload-Command": "upload, finalize", "X-Goog-File-Name": ascii(nome) },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${nome}: ${await r.text()}`);
  return (await r.json()).file.uri;
}

async function main() {
  const assunto = await assuntoIdDoSlot1();
  const { data: pr } = await sb.from("lip_prompts").select("conteudo,versao").eq("ativo", true).eq("chave", "P3_MAC").eq("assunto_id", assunto!).order("versao", { ascending: false }).limit(1).maybeSingle();
  const { data: its } = await sb.from("mac_checklist_itens").select("id,grupo,texto").eq("modelo_id", "00000000-0000-0000-0000-000000000001").eq("ativo", true);
  const checklist = (its ?? []).map((i: any) => ({ id: i.id, texto: i.texto, grupo: i.grupo }));
  const { data: ans } = await sb.from("analises_mac").select("numero_analise,itens").eq("processo_codigo", CODIGO).is("excluido_em", null).order("numero_analise");
  console.log(`prompt v${pr!.versao}, ${checklist.length} itens, ${ans?.length} análises salvas`);

  const nomes = readdirSync(PASTA).filter((n) => n.toLowerCase().endsWith(".pdf") && !IGNORAR.test(n));
  console.log(`arquivos (${nomes.length}):`, nomes.join(" | "));
  const uris = await Promise.all(nomes.map(subir));
  await new Promise((r) => setTimeout(r, 8000));

  const bloco = `\n\n---\n===== LEITURA DE MÚLTIPLOS DOCUMENTOS — REGRA QUE VENCE AS ANTERIORES =====
Você recebeu ${uris.length} arquivos PDF anexados nesta mesma mensagem, cada um sendo
um documento distinto do mesmo processo: ${nomes.join(", ")}.

Por isso:
1. Considere os arquivos EM CONJUNTO: se um documento não mostra algo mas outro mostra, a
   informação existe no processo — cruze todos antes de decidir um item.
2. Só responda "nao_conforme" quando a irregularidade estiver de fato demonstrada em algum dos
   arquivos. Se nenhum dos arquivos anexados traz a prova (a favor ou contra) de um item, responda
   null — não invente ausência.
3. Ao listar em "documentos" ou "incompatibilidades", identifique de qual arquivo cada achado
   veio (pelo nome do arquivo ou pelo nº SEI que ele contém).
---`;
  const prompt = pr!.conteudo + `\n\n---\nCHECKLIST MAC (analisar cada item contra o PDF e classificar):\n${JSON.stringify(checklist, null, 2)}\n---` + bloco;
  const norm = (v: any) => (v === null || v === undefined ? null : String(v).toLowerCase().trim().replace("não_", "nao_"));

  async function rodar(modelo: string) {
    const t0 = Date.now();
    for (let t = 1; t <= 5; t++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [...uris.map((u) => ({ fileData: { mimeType: "application/pdf", fileUri: u } })), { text: prompt }] }], generationConfig: { maxOutputTokens: 65536, temperature: 0.1 } }),
      });
      if (res.ok) {
        const j = await res.json();
        const txt = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").replace(/```json|```/g, "").trim();
        try {
          const d = JSON.parse(txt); const m = d.itens ?? d; const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(m)) if (checklist.some((c) => c.id === k)) out[k] = norm(v);
          return { itens: out, seg: Math.round((Date.now() - t0) / 1000), tokens: j.usageMetadata?.totalTokenCount };
        } catch { console.log(modelo, "JSON inválido, tentativa", t); }
      } else { console.log(modelo, "erro", res.status, (await res.text()).slice(0, 150)); }
      await new Promise((r) => setTimeout(r, t * 5000));
    }
    return null;
  }

  const trabalhos = MODELOS.flatMap((m) => Array.from({ length: RODADAS }, (_, i) => rodar(m).then((r) => ({ m, i, r }))));
  const res = await Promise.all(trabalhos);
  writeFileSync(process.env.SAIDA ?? "/tmp/slot1_cmp.json", JSON.stringify({ res, ans, checklist }, null, 1));
  const cont = (o: Record<string, any>) => { const c: any = { conforme: 0, nao_conforme: 0, nao_aplica: 0, vazio: 0 }; checklist.forEach((i) => { const v = o[i.id] ?? "vazio"; c[v] = (c[v] ?? 0) + 1; }); return c; };
  const conc = (a: any, b: any) => { let n = 0, t = 0; checklist.forEach((i) => { const x = norm(a[i.id]), y = norm(b[i.id]); t++; if (x === y) n++; }); return `${n}/${t}`; };
  for (const { m, i, r } of res) {
    if (!r) { console.log(m, "rodada", i + 1, "FALHOU"); continue; }
    console.log(`\n${m} #${i + 1} (${r.seg}s, ${r.tokens} tokens)`, JSON.stringify(cont(r.itens)));
    for (const a of ans ?? []) console.log(`   concorda com análise salva #${a.numero_analise}: ${conc(r.itens, a.itens)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
