/**
 * Testa de verdade o LER PASTA (IA) do MAC Slot 5 — mecanismo pronto desde 17/08, nunca
 * executado (ver memória urbis-slot5-tela-mac-propria). Roda EXATAMENTE o mesmo caminho de
 * `app/api/mac/slot-05/ler-pasta/route.ts` (lerPastaSlot5 → elege vencedor por papel → 1 chamada
 * ao Gemini com todos os itens pendentes), lendo os PDFs reais direto do disco em vez de subir
 * pela tela. NÃO grava nada em analises_mac — só reporta o que o Gemini devolveria.
 *
 *   npx tsx --env-file=.env.local scripts/testar_ler_pasta_ia.mts <codigo>
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { lerPastaSlot5, type ArquivoEntrada } from "../lib/lerPastaSlot5";
import { PROMPT_P3_MAC_SLOT5, VERSAO_PROMPT_P3_SLOT5 } from "../lib/mac-motor/slot5/promptP3";

const codigo = process.argv[2] ?? "50724";
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PAPEIS_UTEIS = ["projeto", "uso_solo", "certidao_matricula", "art_projeto", "art_caixa", "art_execucao", "atendimento"];
const STATUS_OK = new Set(["conforme", "nao_conforme", "nao_aplica"]);

const PASTA = "/Volumes/SSDFabio/Prefeitura/MINHAS APROVAÇÕES DE PROJETO/MINHAS APROVAÇÕES DE PROJETO/RETORNOS/2026/08.18/50724 1.897.496 MVO AGROPECUARIA LTDA. /Arquivos Iniciais";
const ATENDIMENTO = "/Volumes/SSDFabio/Prefeitura/MINHAS APROVAÇÕES DE PROJETO/MINHAS APROVAÇÕES DE PROJETO/RETORNOS/2026/08.18/50724 1.897.496 MVO AGROPECUARIA LTDA. /ATENDIMENTO 18.08.pdf";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function nomeParaHeaderHttp(nome: string): string {
  return nome.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
}

async function subirPdf(bytes: Uint8Array, apiKey: string, nome: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/pdf",
      "X-Goog-File-Name": nomeParaHeaderHttp(nome),
    },
    body: bytes as any,
  });
  if (!r.ok) throw new Error(`upload ao Gemini falhou (${nome}): ${r.status} ${await r.text()}`);
  const j = await r.json();
  if (!j?.file?.uri) throw new Error("Gemini não devolveu URI do arquivo");
  return j.file.uri as string;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY!;
  console.log(`== LER PASTA (IA), processo ${codigo}, modelo ${GEMINI_MODEL} ==\n`);

  // ── 1. arquivos reais do disco, todos rodada 1 (Arquivos Iniciais = leitura principal) ──
  const nomes = readdirSync(PASTA).filter((n) => !n.startsWith("."));
  const arquivos: ArquivoEntrada[] = nomes.map((nome) => {
    const buffer = new Uint8Array(readFileSync(join(PASTA, nome)));
    return { nome, rodada: 1, hash: createHash("sha256").update(buffer).digest("hex"), buffer };
  });
  {
    const buffer = new Uint8Array(readFileSync(ATENDIMENTO));
    arquivos.push({ nome: "ATENDIMENTO 18.08.pdf", rodada: 1, hash: createHash("sha256").update(buffer).digest("hex"), buffer });
  }
  console.log(`arquivos lidos do disco: ${arquivos.length}`);

  // ── 2. catalogação real (mesma função da tela) ──────────────────────────────────────
  // pdfjs (usado dentro de lerPastaSlot5) DETACHA o ArrayBuffer que recebe — passar uma cópia
  // pra catalogação preserva os buffers originais em `arquivos` pro upload ao Gemini depois
  // (mesma armadilha documentada em urbis-mac-slot5-iccap-recorte-proposta: "cada biblioteca
  // precisa da própria cópia dos bytes").
  const paraCatalogar = arquivos.map((a) => ({ ...a, buffer: a.buffer.slice() }));
  const leitura = await lerPastaSlot5(paraCatalogar);
  const vencedorPorPapel = leitura.vigentesPorPapel ?? {};
  const porHash = new Map(arquivos.map((a) => [a.hash, a]));

  const escolhidos: { papel: string; nome: string; bytes: Uint8Array }[] = [];
  for (const papel of PAPEIS_UTEIS) {
    const hash = vencedorPorPapel[papel];
    if (!hash) continue;
    const arq = porHash.get(hash);
    if (!arq || !arq.nome.toLowerCase().endsWith(".pdf")) continue;
    if (escolhidos.some((e) => e.nome === arq.nome)) continue;
    escolhidos.push({ papel, nome: arq.nome, bytes: arq.buffer });
  }
  console.log(`papéis identificados: ${Object.keys(vencedorPorPapel).join(", ")}`);
  console.log(`documentos escolhidos para o Gemini:`);
  for (const e of escolhidos) console.log(`  - ${e.papel}: ${e.nome}`);
  if (!escolhidos.length) throw new Error("nenhum PDF útil encontrado");

  // ── 3. itens pendentes de verdade, do banco ─────────────────────────────────────────
  const [{ data: itensTodos }, { data: analises }] = await Promise.all([
    sb.from("mac_checklist_itens").select("id, texto, grupo").eq("modelo_id", MODELO_SLOT5).eq("ativo", true).order("ordem").limit(2000),
    sb.from("analises_mac").select("id, itens").eq("processo_codigo", codigo).eq("tipo_processo", "slot_05").is("excluido_em", null).order("numero_analise", { ascending: false }).limit(1),
  ]);
  const respondidos = ((analises?.[0] as any)?.itens ?? {}) as Record<string, string>;
  const pendentes = (itensTodos ?? []).filter((i: any) => !respondidos[i.id]);
  console.log(`\nitens ativos: ${itensTodos?.length} | já respondidos: ${Object.keys(respondidos).length} | pendentes: ${pendentes.length}`);

  // ── 4. uma chamada ao Gemini, exatamente como a rota faz ────────────────────────────
  console.log(`\nsubindo ${escolhidos.length} PDF(s) ao Gemini...`);
  const partes: any[] = [];
  for (const e of escolhidos) {
    const uri = await subirPdf(e.bytes, apiKey, e.nome);
    partes.push({ text: `\n[DOCUMENTO: ${e.papel} — ${e.nome}]` });
    partes.push({ fileData: { mimeType: "application/pdf", fileUri: uri } });
  }
  partes.push({
    text: PROMPT_P3_MAC_SLOT5 +
      `\n\n===== CHECKLIST MAC (${pendentes.length} itens pendentes) =====\n` +
      JSON.stringify(pendentes.map((i: any) => ({ id: i.id, texto: i.texto, grupo: i.grupo }))),
  });

  console.log("chamando o Gemini (pode levar 1-3 minutos, é 1 chamada só com tudo)...");
  const t0 = Date.now();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: partes }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
    },
  );
  const segundos = ((Date.now() - t0) / 1000).toFixed(1);
  if (!resp.ok) throw new Error(`Gemini: ${resp.status} ${await resp.text()}`);
  const respJson = await resp.json();
  const usage = respJson?.usageMetadata;
  const bruto = respJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let json: any;
  try { json = JSON.parse(bruto); } catch {
    const m = bruto.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("resposta do Gemini não é JSON: " + bruto.slice(0, 300));
    json = JSON.parse(m[0]);
  }

  const validos = new Set(pendentes.map((i: any) => i.id as string));
  const itens: Record<string, string> = {};
  const fontes: Record<string, string> = {};
  for (const [id, st] of Object.entries(json?.itens ?? {})) {
    const s = String(st ?? "").toLowerCase();
    if (!validos.has(id) || !STATUS_OK.has(s)) continue;
    itens[id] = s;
    fontes[id] = json?.fontes?.[id] ?? "";
  }

  console.log(`\n== RESULTADO (${segundos}s, prompt v${VERSAO_PROMPT_P3_SLOT5}) ==`);
  if (usage) console.log(`tokens: ${usage.promptTokenCount} entrada + ${usage.candidatesTokenCount} saída = ${usage.totalTokenCount}`);
  console.log(`avaliados: ${pendentes.length} | classificados: ${Object.keys(itens).length} (${Math.round(100 * Object.keys(itens).length / pendentes.length)}%)`);

  const porStatus: Record<string, number> = {};
  for (const s of Object.values(itens)) porStatus[s] = (porStatus[s] ?? 0) + 1;
  console.log("por status:", porStatus);

  console.log("\n=== amostra (10 primeiros classificados) ===");
  let i = 0;
  const textoDoId = Object.fromEntries((pendentes as any[]).map((p) => [p.id, p.texto]));
  for (const [id, status] of Object.entries(itens)) {
    if (i++ >= 10) break;
    console.log(`[${status}] ${(textoDoId[id] ?? "").slice(0, 70)}`);
    console.log(`   fonte: ${(fontes[id] ?? "").slice(0, 100)}`);
  }

  if (Array.isArray(json?.incompatibilidades) && json.incompatibilidades.length) {
    console.log("\n=== incompatibilidades apontadas ===");
    for (const inc of json.incompatibilidades) console.log(" -", inc);
  }

  if (json?.temas) {
    console.log("\n=== temas ===");
    for (const [t, v] of Object.entries(json.temas)) console.log(` ${t}:`, v);
  }
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
