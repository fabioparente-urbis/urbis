/**
 * Compara modelos do Gemini na MESMA leitura real (Ler Pasta do MAC Slot 5, processo de teste),
 * por causa do fim do gemini-2.5-flash em 01/12/2026 (vira gemini-3.5-flash-lite sozinho).
 * SÓ LEITURA: não grava nada no banco; só faz chamadas ao Gemini (custo de centavos).
 *
 * Mede, para cada modelo: tempo, tokens, quantos itens classificou, e quanto concorda com o
 * 2.5-flash (o primeiro da lista = referência). Cada modelo roda N vezes para separar
 * "mudou de modelo" de "o próprio modelo varia de uma rodada pra outra".
 *
 *   npx tsx --env-file=.env.local scripts/comparar_modelos_gemini.mts [codigo] [modelo1,modelo2,...] [rodadas]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { lerPastaSlot5, type ArquivoEntrada } from "../lib/lerPastaSlot5";
import { PROMPT_P3_MAC_SLOT5, VERSAO_PROMPT_P3_SLOT5 } from "../lib/mac-motor/slot5/promptP3";

const codigo = process.argv[2] ?? "50724";
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";
const MODELOS = (process.argv[3] ?? "gemini-2.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash").split(",");
const RODADAS = Number(process.argv[4] ?? 2);
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
  console.log(`== LER PASTA (IA), processo ${codigo}, modelos ${MODELOS.join(" | ")} x ${RODADAS} rodadas ==\n`);

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

  console.log("\nsubindo PDFs ao Gemini (uma vez, reaproveitado por todos os modelos)...");
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
  const validos = new Set(pendentes.map((i: any) => i.id as string));
  const textoDoId = Object.fromEntries((pendentes as any[]).map((p) => [p.id, p.texto]));

  type Rodada = { modelo: string; n: number; erro?: string; segundos?: number; tokens?: number; itens?: Record<string, string> };
  const rodadas: Rodada[] = [];

  for (const modelo of MODELOS) {
    for (let n = 1; n <= RODADAS; n++) {
      process.stdout.write(`${modelo} rodada ${n}... `);
      const t0 = Date.now();
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
          {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: partes }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
          },
        );
        if (!resp.ok) throw new Error(`${resp.status} ${(await resp.text()).slice(0, 200)}`);
        const rj = await resp.json();
        const bruto = rj?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        let json: any;
        try { json = JSON.parse(bruto); } catch {
          const m = bruto.match(/\{[\s\S]*\}/);
          if (!m) throw new Error("resposta não é JSON");
          json = JSON.parse(m[0]);
        }
        const itens: Record<string, string> = {};
        for (const [id, st] of Object.entries(json?.itens ?? {})) {
          const s = String(st ?? "").toLowerCase();
          if (validos.has(id) && STATUS_OK.has(s)) itens[id] = s;
        }
        const segundos = (Date.now() - t0) / 1000;
        rodadas.push({ modelo, n, segundos, tokens: rj?.usageMetadata?.totalTokenCount, itens });
        console.log(`ok ${segundos.toFixed(1)}s, ${Object.keys(itens).length} itens`);
      } catch (e: any) {
        rodadas.push({ modelo, n, erro: e.message });
        console.log(`ERRO ${e.message}`);
      }
    }
  }

  // ── relatório ──────────────────────────────────────────────────────────────────────
  const ref = rodadas.find((r) => r.modelo === MODELOS[0] && r.itens)?.itens;
  if (!ref) throw new Error("o modelo de referência não devolveu resultado");
  const concordancia = (a: Record<string, string>, b: Record<string, string>) => {
    const ids = Object.keys(ref).length ? [...new Set([...Object.keys(a), ...Object.keys(b)])] : [];
    const iguais = ids.filter((id) => a[id] && a[id] === b[id]).length;
    return ids.length ? Math.round((100 * iguais) / ids.length) : 0;
  };

  console.log(`\n== RESUMO (${pendentes.length} itens pendentes; referência = ${MODELOS[0]} rodada 1) ==`);
  for (const r of rodadas) {
    if (r.erro) { console.log(`${r.modelo} #${r.n}: ERRO ${r.erro}`); continue; }
    const cls = Object.keys(r.itens!).length;
    const conc = concordancia(ref, r.itens!);
    const tag = r.modelo === MODELOS[0] && r.n === 1 ? "(referência)" : `concorda ${conc}% com a referência`;
    console.log(`${r.modelo} #${r.n}: ${r.segundos!.toFixed(1)}s | ${r.tokens} tokens | classificou ${cls}/${pendentes.length} | ${tag}`);
  }

  console.log("\n== divergências de cada modelo novo contra a referência (1ª rodada, até 8) ==");
  for (const modelo of MODELOS.slice(1)) {
    const r = rodadas.find((x) => x.modelo === modelo && x.itens);
    if (!r) continue;
    const difs = Object.keys(ref).filter((id) => r.itens![id] !== ref[id]);
    console.log(`\n${modelo}: ${difs.length} diferem de ${Object.keys(ref).length}`);
    for (const id of difs.slice(0, 8))
      console.log(`  ref=${ref[id]} novo=${r.itens![id] ?? "(sem resposta)"} :: ${(textoDoId[id] ?? "").slice(0, 80)}`);
  }
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
