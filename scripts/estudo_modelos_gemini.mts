/**
 * ESTUDO DE MODELOS DO GEMINI POR SLOT (17/11/2026) — fim do gemini-2.5-flash em 01/12/2026.
 *
 * Roda as ROTAS REAIS de leitura (LIP s3 e MAC p3 de cada slot), importadas daqui, sem mudar uma
 * linha delas. Duas coisas são trocadas por fora, interceptando o `fetch`:
 *   1. o modelo da chamada ao Gemini (`/models/<x>:generateContent`) → o modelo em teste;
 *   2. TODA escrita no Supabase (POST/PATCH/PUT/DELETE em /rest/v1) é BLOQUEADA e só registrada —
 *      nada é gravado no banco. Leituras (GET/HEAD) passam normalmente.
 * Mede tokens (entrada, saída, raciocínio) de cada chamada e devolve o que a rota devolveria.
 *
 *   npx tsx --env-file=.env.local scripts/estudo_modelos_gemini.mts <caso> [modelos] [rodadas]
 *   casos: s1-lip s1-mac s2-lip s2-mac s5-lip   (saída JSON em $SAIDA_DIR)
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RAIZ = "/Volumes/SSDFabio/Prefeitura/MINHAS APROVAÇÕES DE PROJETO/MINHAS APROVAÇÕES DE PROJETO/RETORNOS/2026";
const CASOS: Record<string, { codigo: string; tipo: "lip" | "mac"; rota: string; pasta: string; lipPdf?: string; ignorar?: RegExp }> = {
  "s1-lip": { codigo: "24.5.000028498-2", tipo: "lip", rota: "regularizacao-sei/lip/s3", pasta: `${RAIZ}/11.12/SEBASTIAO ROCHA 24.5.000028498-2 e 92208911`, lipPdf: "SEI_24.5.000028498_2.pdf" },
  "s1-mac": { codigo: "24.5.000028498-2", tipo: "mac", rota: "regularizacao-sei/mac/p3", pasta: `${RAIZ}/11.12/SEBASTIAO ROCHA 24.5.000028498-2 e 92208911`, ignorar: /DESPACHO Nº 2583|^SEI_/i },
  "s2-lip": { codigo: "25.28.000001552-8", tipo: "lip", rota: "aceite-sei/lip/s3", pasta: `${RAIZ}/11.17/retornos/CONSELHO CENTRAL NOSSA SENHORA DE FATIMA DE GOIANIA 25.28.000001552-8 e 92011931`, lipPdf: "SEI2_25.28.000001552_8_compressed.pdf" },
  "s2-mac": { codigo: "25.28.000001552-8", tipo: "mac", rota: "aceite-sei/mac/p3", pasta: `${RAIZ}/11.17/retornos/CONSELHO CENTRAL NOSSA SENHORA DE FATIMA DE GOIANIA 25.28.000001552-8 e 92011931`, ignorar: /DESPACHO Nº 604|^SEI/i },
  "s5-lip": { codigo: "47737", tipo: "lip", rota: "aprovacao-projeto/lip/s3", pasta: `${RAIZ}/10.02/JOAQUINA SOARES DA SILVA 47737 1779666/Arquivos Iniciais`, lipPdf: "Projeto em DWG.pdf" },
};

const caso = process.argv[2]!;
const cfg = CASOS[caso];
if (!cfg) throw new Error(`caso desconhecido: ${caso}`);
const MODELOS = (process.argv[3] ?? "gemini-2.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash").split(",");
const RODADAS = Number(process.argv[4] ?? 2);
const SAIDA_DIR = process.env.SAIDA_DIR ?? "/tmp/estudo_gemini";
mkdirSync(SAIDA_DIR, { recursive: true });
const apiKey = process.env.GEMINI_API_KEY!;
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// ── interceptação do fetch ──────────────────────────────────────────────────────────────
type Ctx = { modelo: string; usos: any[]; escritas: { url: string; metodo: string; corpo: any }[]; fimJob?: (v: any) => void };
const als = new AsyncLocalStorage<Ctx>();
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const metodo = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const ctx = als.getStore();
  if (ctx && url.includes("generativelanguage.googleapis.com") && url.includes(":generateContent")) {
    const novo = url.replace(/\/models\/[^:/]+:generateContent/, `/models/${ctx.modelo}:generateContent`);
    const res = await fetchOriginal(novo, init);
    const copia = res.clone();
    try { const j = await copia.json(); ctx.usos.push({ ok: res.ok, status: res.status, uso: j.usageMetadata ?? null }); } catch { ctx.usos.push({ ok: res.ok, status: res.status, uso: null }); }
    return res;
  }
  if (url.startsWith(SUPA) && url.includes("/rest/v1/") && !["GET", "HEAD"].includes(metodo)) {
    let corpo: any = init?.body;
    try { corpo = JSON.parse(String(init?.body)); } catch {}
    ctx?.escritas.push({ url: url.replace(SUPA, ""), metodo, corpo });
    // fim do job em segundo plano do LIP: o UPDATE em lip_jobs com status final
    if (ctx && url.includes("/lip_jobs") && metodo === "PATCH" && corpo && corpo.status && corpo.status !== "processando") ctx.fimJob?.(corpo);
    const aceita = String(init?.headers?.["Accept"] ?? init?.headers?.accept ?? (init?.headers?.get?.("Accept") ?? ""));
    const linha = { id: randomUUID() };
    const body = aceita.includes("vnd.pgrst.object") ? JSON.stringify(linha) : JSON.stringify([linha]);
    return new Response(body, { status: 201, headers: { "Content-Type": "application/json" } });
  }
  return fetchOriginal(input, init);
}) as typeof fetch;

const PRECO: Record<string, { e: number; s: number }> = {
  "gemini-2.5-flash": { e: 0.30, s: 2.50 }, "gemini-3.5-flash-lite": { e: 0.30, s: 2.50 }, "gemini-3.6-flash": { e: 0.75, s: 3.75 },
};
function custo(modelo: string, usos: any[]) {
  let ent = 0, sai = 0, rac = 0;
  for (const u of usos) { ent += u.uso?.promptTokenCount ?? 0; sai += u.uso?.candidatesTokenCount ?? 0; rac += u.uso?.thoughtsTokenCount ?? 0; }
  const p = PRECO[modelo] ?? { e: 0, s: 0 };
  return { entrada: ent, saida: sai, raciocinio: rac, chamadas: usos.length, usd: (ent * p.e + (sai + rac) * p.s) / 1e6 };
}

async function subirGemini(caminho: string): Promise<string> {
  const buf = readFileSync(caminho);
  const r = await fetchOriginal(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/pdf", "X-Goog-Upload-Command": "upload, finalize" }, body: buf,
  });
  if (!r.ok) throw new Error(`upload ${basename(caminho)}: ${await r.text()}`);
  const j = await r.json();
  // espera ficar ACTIVE (igual ao S1)
  for (let i = 0; i < 30 && j.file.state !== "ACTIVE"; i++) {
    await new Promise((x) => setTimeout(x, 2000));
    const s = await (await fetchOriginal(`https://generativelanguage.googleapis.com/v1beta/${j.file.name}?key=${apiKey}`)).json();
    j.file.state = s.state;
  }
  return j.file.uri;
}

async function main() {
  const sb = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const mod = await import(`../app/api/${cfg.rota}/route.ts`);
  const POST = mod.POST as (r: NextRequest) => Promise<Response>;
  const resultados: any[] = [];

  if (cfg.tipo === "lip") {
    const caminho = join(cfg.pasta, cfg.lipPdf!);
    const tamanho = readFileSync(caminho).length;
    const uri = await subirGemini(caminho);
    console.log(`[${caso}] PDF ${cfg.lipPdf} (${(tamanho / 1048576).toFixed(1)}MB) subido`);
    const rodar = (modelo: string, n: number) => {
      const ctx: Ctx = { modelo, usos: [], escritas: [] };
      return als.run(ctx, async () => {
        const t0 = Date.now();
        const fim = new Promise<any>((ok) => { ctx.fimJob = ok; setTimeout(() => ok({ status: "timeout" }), 540000); });
        const req = new NextRequest("http://local/api/" + cfg.rota, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileUri: uri, documentos: [], codigo: cfg.codigo, fileName: cfg.lipPdf, tamanhoBytes: tamanho }) });
        const r = await POST(req); const j = await r.json();
        if (!j.ok) return { modelo, n, erro: j.erro ?? j.detalhe };
        const job = await fim;
        return { modelo, n, segundos: Math.round((Date.now() - t0) / 1000), custo: custo(modelo, ctx.usos), job };
      });
    };
    const tarefas = MODELOS.flatMap((m) => Array.from({ length: RODADAS }, (_, i) => rodar(m, i + 1)));
    resultados.push(...(await Promise.all(tarefas)));
  } else {
    const nomes = readdirSync(cfg.pasta).filter((n) => n.toLowerCase().endsWith(".pdf") && !n.startsWith("._") && !(cfg.ignorar?.test(n)));
    const { data: an } = await sb.from("analises_mac").select("id,modelo_id").eq("processo_codigo", cfg.codigo).is("excluido_em", null).order("numero_analise", { ascending: false }).limit(1);
    const { data: its } = await sb.from("mac_checklist_itens").select("id,grupo,texto").eq("modelo_id", an![0].modelo_id).eq("ativo", true);
    const checklist = (its ?? []).map((i: any) => ({ id: i.id, texto: i.texto, grupo: i.grupo }));
    console.log(`[${caso}] ${nomes.length} PDFs, ${checklist.length} itens`);
    const rodar = (modelo: string, n: number) => {
      const ctx: Ctx = { modelo, usos: [], escritas: [] };
      return als.run(ctx, async () => {
        const t0 = Date.now();
        const fd = new FormData();
        for (const nome of nomes) fd.append("files", new File([readFileSync(join(cfg.pasta, nome))], nome, { type: "application/pdf" }));
        fd.append("codigo", cfg.codigo); fd.append("analiseId", an![0].id); fd.append("checklistItens", JSON.stringify(checklist));
        const r = await POST(new NextRequest("http://local/api/" + cfg.rota, { method: "POST", body: fd as any }));
        const j = await r.json();
        return { modelo, n, segundos: Math.round((Date.now() - t0) / 1000), custo: custo(modelo, ctx.usos), resposta: j };
      });
    };
    const tarefas = MODELOS.flatMap((m) => Array.from({ length: RODADAS }, (_, i) => rodar(m, i + 1)));
    resultados.push(...(await Promise.all(tarefas)));
  }
  const arq = join(SAIDA_DIR, `${caso}.json`);
  writeFileSync(arq, JSON.stringify(resultados, null, 1));
  for (const r of resultados) console.log(`${r.modelo} #${r.n}: ${r.erro ? "ERRO " + r.erro : `${r.segundos}s, US$ ${r.custo.usd.toFixed(4)}, ${r.custo.chamadas} chamada(s), tokens ent ${r.custo.entrada} sai ${r.custo.saida} rac ${r.custo.raciocinio}`}`);
  console.log("salvo em", arq);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
