/**
 * app/api/mac/slot-05/ler-pasta/route.ts — LER PASTA do MAC do Slot 5.
 *
 * Recebe a pasta inteira do processo (com subpastas e compactados), descobre sozinha qual é o
 * ÚLTIMO de cada documento — último projeto, última ART, último uso do solo, última certidão —
 * e manda só esses para o Gemini avaliar os itens do checklist ainda pendentes.
 *
 * Isolada do Slot 1: reusa `lib/lerPastaSlot5.ts` (que é do Slot 5, usado pelo LIP) e o prompt
 * de `lib/mac-motor/slot5/promptP3.ts`; não toca em app/api/mac/p3 nem lê `lip_prompts`.
 *
 * Por que ler a pasta em vez do texto que o MHD já guardou: o Gemini precisa do PDF — as cotas,
 * as vagas e o quadro de áreas estão no DESENHO, não no texto extraível. E a eleição do vencedor
 * por papel evita mandar versão velha, que é o erro que o usuário apontou.
 *
 * Resposta em NDJSON (mesmo formato de /api/lip/ler-pasta) — uma linha "progresso" por evento
 * (catalogando → enviando cada PDF → analisando, enquanto o Gemini processa) e a última linha
 * "resultado" ou "erro". Pedido do usuário: a tela do MAC não mostrava andamento/tempo/% como a
 * do LIP já mostra.
 */

import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lerPastaSlot5, type ArquivoEntrada } from "@/lib/lerPastaSlot5";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { contextoNbrAcessibilidade } from "@/lib/mac-motor/slot5/contextoAcessibilidade";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { PROMPT_P3_MAC_SLOT5, VERSAO_PROMPT_P3_SLOT5 } from "@/lib/mac-motor/slot5/promptP3";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODELO = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const STATUS_OK = new Set(["conforme", "nao_conforme", "nao_aplica"]);

/** Papéis que o Gemini precisa VER. Documentos pessoais e requerimento não decidem item do MAC.
 * "atendimento" (print do sistema Alvará Mais Fácil) é opcional — só entra quando o analista
 * anexa; alimenta principalmente o item 1 do checklist, mas fica visível pro modelo todo. */
const PAPEIS_UTEIS = ["projeto", "uso_solo", "certidao_matricula", "art_projeto", "art_caixa", "art_execucao", "atendimento"];

/** A rodada vem do caminho: raiz = 1ª análise, cada subpasta a seguinte (mesma regra do LIP). */
function rodadaDoCaminho(caminho: string): number {
  const partes = caminho.split("/").filter(Boolean);
  return Math.max(1, partes.length - 1);
}

/** Header HTTP só aceita ByteString (0-255) — nome de arquivo em português ("Certidão",
 * "Execução...") tem acento fora dessa faixa e quebra a chamada. Achado testando esta rota pela
 * primeira vez contra uma pasta real. Sanitiza só pro header; o nome original segue intacto no
 * resto da rota (log, identificação de papel). */
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
  if (!r.ok) throw new Error(`upload ao Gemini falhou: ${r.status}`);
  const j = await r.json();
  if (!j?.file?.uri) throw new Error("Gemini não devolveu URI do arquivo");
  return j.file.uri as string;
}

/** NDJSON — mesmo formato do /api/lip/ler-pasta: uma linha "progresso" por evento, última linha
 * "resultado" ou "erro". Sem isto a barra da tela só podia FINGIR progresso por tempo, travada
 * até a resposta inteira chegar — pedido do usuário: "não mostra progressão, tempo e % como no
 * LIP". */
function linha(o: unknown) {
  return new TextEncoder().encode(JSON.stringify(o) + "\n");
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const fluxo = new TransformStream();
  const escritor = fluxo.writable.getWriter();

  processar(req, form, escritor).catch(async (e: any) => {
    console.error("[MAC/slot-05/ler-pasta]", e?.message);
    try { await escritor.write(linha({ tipo: "erro", ok: false, erro: e?.message || "erro interno" })); } catch {}
  }).finally(() => { escritor.close().catch(() => {}); });

  return new Response(fluxo.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function processar(
  req: NextRequest,
  form: FormData,
  escritor: WritableStreamDefaultWriter<Uint8Array>,
) {
  const enviar = (o: unknown) => escritor.write(linha(o));
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return enviar({ tipo: "erro", ok: false, erro: "GEMINI_API_KEY não configurada" });

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return enviar({ tipo: "erro", ok: false, erro: "Sessão não encontrada" });

    const codigo = String(form.get("codigo") ?? "").trim();
    if (!codigo) return enviar({ tipo: "erro", ok: false, erro: "codigo obrigatório" });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return enviar({ tipo: "erro", ok: false, erro: resolucao.erro });
    }

    // ── 1. Monta a pasta: todos os arquivos, com a rodada tirada do caminho ──────────────
    const arquivos: ArquivoEntrada[] = [];
    for (const [chave, valor] of form.entries()) {
      if (!chave.startsWith("arquivo_") || !(valor instanceof File)) continue;
      const caminho = String(form.get(`caminho_${chave.slice(8)}`) ?? valor.name);
      const buffer = new Uint8Array(await valor.arrayBuffer());
      arquivos.push({
        nome: valor.name,
        rodada: rodadaDoCaminho(caminho),
        hash: createHash("sha256").update(buffer).digest("hex"),
        buffer,
      });
    }
    if (!arquivos.length) {
      return enviar({ tipo: "erro", ok: false, erro: "nenhum arquivo recebido" });
    }
    await enviar({ tipo: "progresso", fase: "catalogando", atual: 0, total: arquivos.length, documento: `catalogando ${arquivos.length} arquivo(s)...` });

    // ── 2. Catalogação: identifica papel, rodada e elege o VENCEDOR de cada papel ────────
    // pdfjs (usado dentro de lerPastaSlot5) DETACHA o ArrayBuffer que recebe — sem clonar antes,
    // o passo 4 (subir o PDF vencedor pro Gemini) quebrava com "Cannot perform slice on a
    // detached ArrayBuffer". Achado testando esta rota pela primeira vez, nunca executada antes
    // (mesma armadilha documentada em urbis-mac-slot5-iccap-recorte-proposta).
    const paraCatalogar = arquivos.map((a) => ({ ...a, buffer: a.buffer.slice() }));
    const leitura = await lerPastaSlot5(paraCatalogar);
    const vencedorPorPapel = leitura.vigentesPorPapel ?? {};
    const porHash = new Map(arquivos.map((a) => [a.hash, a]));

    const escolhidos: { papel: string; nome: string; bytes: Uint8Array }[] = [];
    for (const papel of PAPEIS_UTEIS) {
      const hash = vencedorPorPapel[papel];
      if (!hash) continue;
      const arq = porHash.get(hash);
      // Só PDF vai para o Gemini: o que veio de .rar/.zip já foi expandido pela catalogação,
      // mas imagem solta e CAD não servem para esta leitura.
      if (!arq || !arq.nome.toLowerCase().endsWith(".pdf")) continue;
      if (escolhidos.some((e) => e.nome === arq.nome)) continue; // mesma folha em dois papéis
      escolhidos.push({ papel, nome: arq.nome, bytes: arq.buffer });
    }

    if (!escolhidos.length) {
      return enviar({
        tipo: "erro", ok: false,
        erro: "nenhum PDF útil encontrado na pasta (esperado ao menos o projeto)",
        papeisEncontrados: Object.keys(vencedorPorPapel),
      });
    }

    // ── 3. Itens ainda pendentes ────────────────────────────────────────────────────────
    const modeloId = await modeloDoSlot5();
    if (!modeloId) return enviar({ tipo: "erro", ok: false, erro: "sem modelo de checklist do Slot 5" });

    // "Pendente" é pendente NA ANÁLISE ABERTA. Sem o `analiseId` da tela a rota olhava sempre a
    // de maior número: quem estivesse revisando a Análise 1 mandava para o Gemini a lista de
    // pendências da 3 — e pagava a leitura para responder o item errado.
    const analiseId = String(form.get("analiseId") ?? "").trim();
    let qAnalise = supabaseAdmin.from("analises_mac").select("id, itens")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .is("excluido_em", null);
    if (analiseId) qAnalise = qAnalise.eq("id", analiseId);
    const [{ data: itensTodos }, { data: analises }] = await Promise.all([
      supabaseAdmin.from("mac_checklist_itens").select("id, texto, grupo")
        .eq("modelo_id", modeloId).eq("ativo", true).order("ordem").limit(2000),
      qAnalise.order("numero_analise", { ascending: false }).limit(1),
    ]);
    const respondidos = ((analises?.[0] as any)?.itens ?? {}) as Record<string, string>;
    const pendentes = (itensTodos ?? []).filter((i: any) => !respondidos[i.id]);
    if (!pendentes.length) {
      return enviar({ tipo: "erro", ok: false, erro: "nenhum item pendente no MAC" });
    }

    const temas: string[] = (() => {
      try { return JSON.parse(String(form.get("temas") ?? "[]")); } catch { return []; }
    })();

    // ── 4. Uma chamada ao Gemini com TODOS os documentos vencedores ─────────────────────
    const partes: any[] = [];
    let i = 0;
    for (const e of escolhidos) {
      i++;
      await enviar({ tipo: "progresso", fase: "enviando", atual: i, total: escolhidos.length, documento: `${e.papel} — ${e.nome}` });
      const uri = await subirPdf(e.bytes, apiKey, e.nome);
      partes.push({ text: `\n[DOCUMENTO: ${e.papel} — ${e.nome}]` });
      partes.push({ fileData: { mimeType: "application/pdf", fileUri: uri } });
    }
    // ÍTEM 48 (ACESSIBILIDADE - NBR9050): a norma inteira, não a memória do modelo dela.
    const nbrAcessibilidade = await contextoNbrAcessibilidade(pendentes as any);

    await enviar({
      tipo: "progresso", fase: "analisando", atual: escolhidos.length, total: escolhidos.length,
      documento: `Gemini avaliando ${pendentes.length} item(ns) pendentes...`,
    });
    partes.push({
      text: PROMPT_P3_MAC_SLOT5 +
        (nbrAcessibilidade ? `\n\n${nbrAcessibilidade}` : "") +
        `\n\n===== CHECKLIST MAC (${pendentes.length} itens pendentes) =====\n` +
        JSON.stringify(pendentes.map((i: any) => ({ id: i.id, texto: i.texto, grupo: i.grupo }))) +
        (temas.length ? `\n\n===== TEMAS =====\n${JSON.stringify(temas)}` : ""),
    });

    /* Sobrecarga do Gemini (503) e limite de taxa (429) são passageiros e frequentes numa
     * chamada deste tamanho. Sem repetição, um 503 jogava fora a pasta inteira que acabou de ser
     * enviada e o analista tinha que subir tudo de novo — foi o que impediu a primeira leitura
     * real desta rota de terminar. Três tentativas, com espera crescente. */
    const RECUPERAVEIS = new Set([429, 500, 502, 503, 504]);
    let resp: Response | null = null;
    let ultimoErro = "";
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if (tentativa > 1) {
        await enviar({
          tipo: "progresso", fase: "analisando", atual: escolhidos.length, total: escolhidos.length,
          documento: `Gemini ocupado (${ultimoErro}) — tentativa ${tentativa} de 3...`,
        });
        await new Promise((r) => setTimeout(r, (tentativa - 1) * 8000));
      }
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: partes }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              // Explícito: a resposta traz um status por item pendente e cortar no meio devolve
              // JSON quebrado, que aqui vira "resposta do Gemini não é JSON" sem explicação.
              maxOutputTokens: 65536,
            },
          }),
        },
      );
      if (r.ok) { resp = r; break; }
      ultimoErro = `HTTP ${r.status}`;
      const corpo = await r.text();
      if (!RECUPERAVEIS.has(r.status)) {
        return enviar({ tipo: "erro", ok: false, erro: `Gemini: ${r.status} ${corpo}` });
      }
      if (tentativa === 3) {
        return enviar({
          tipo: "erro", ok: false,
          erro: `Gemini indisponível (${r.status}) depois de 3 tentativas. Os documentos já foram `
            + `enviados; tente de novo em alguns minutos. Detalhe: ${corpo.slice(0, 300)}`,
        });
      }
    }
    if (!resp) return enviar({ tipo: "erro", ok: false, erro: "Gemini não respondeu" });

    const respJson = await resp.json();
    const candidato = respJson?.candidates?.[0];
    const bruto = candidato?.content?.parts?.[0]?.text ?? "";
    if (!bruto) {
      // Sem texto: quase sempre é corte por tamanho ou bloqueio. Dizer QUAL evita o analista
      // repetir a leitura inteira sem saber o que mudar.
      const motivo = candidato?.finishReason ?? respJson?.promptFeedback?.blockReason ?? "sem motivo declarado";
      return enviar({
        tipo: "erro", ok: false,
        erro: `Gemini devolveu resposta vazia (${motivo}). `
          + (String(motivo) === "MAX_TOKENS"
            ? "A lista de pendências é grande demais para uma resposta só — responda parte dos itens à mão ou aplique os filtros antes de reler a pasta."
            : "Tente de novo; se repetir, confira se algum PDF está corrompido."),
      });
    }
    let json: any;
    try { json = JSON.parse(bruto); } catch {
      const m = bruto.match(/\{[\s\S]*\}/);
      if (!m) return enviar({ tipo: "erro", ok: false, erro: "resposta do Gemini não é JSON" });
      json = JSON.parse(m[0]);
    }

    // ── 5. Só aceita id do checklist e status válido — nunca confia no que voltou ───────
    const validos = new Set(pendentes.map((i: any) => i.id as string));
    const itens: Record<string, string> = {};
    const fontes: Record<string, string> = {};
    for (const [id, st] of Object.entries(json?.itens ?? {})) {
      const s = String(st ?? "").toLowerCase();
      if (!validos.has(id) || !STATUS_OK.has(s)) continue;
      itens[id] = s;
      const f = json?.fontes?.[id];
      fontes[id] = `IA · ${f ? String(f).slice(0, 300) : "sem detalhe"}`;
    }

    /* Unidade territorial lida no Uso do Solo desta pasta. O campo da tela nasce vazio e só é
     * preenchido por uma leitura de documento — nunca pelo LIP, a pedido do Fábio: o que vale é o
     * que ESTA leitura viu. Sigla só: 2 a 6 letras, sem acento. */
    const utBruta = String(json?.unidadeTerritorial ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    const unidadeTerritorial = /^[A-Z]{2,6}$/.test(utBruta) ? utBruta : null;
    const usoDoSoloLido = escolhidos.some((e) => e.papel === "uso_solo");

    return enviar({
      tipo: "resultado",
      ok: true,
      unidadeTerritorial,
      usoDoSoloLido,
      nbrAcessibilidadeUsada: !!nbrAcessibilidade,
      versaoPrompt: VERSAO_PROMPT_P3_SLOT5,
      modelo: MODELO,
      documentosLidos: escolhidos.map((e) => ({ papel: e.papel, arquivo: e.nome })),
      arquivosNaPasta: arquivos.length,
      papeisEncontrados: Object.keys(vencedorPorPapel),
      avaliados: pendentes.length,
      classificados: Object.keys(itens).length,
      itens, fontes,
      temas: json?.temas ?? {},
      incompatibilidades: Array.isArray(json?.incompatibilidades) ? json.incompatibilidades : [],
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/ler-pasta]", e?.message);
    return enviar({ tipo: "erro", ok: false, erro: e?.message || "erro interno" });
  }
}
