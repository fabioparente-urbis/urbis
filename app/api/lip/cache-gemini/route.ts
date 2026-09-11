import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { leituraUnicaLipMacAtiva } from "@/lib/documentosSei/leituraUnicaLipMac";

/**
 * app/api/lip/cache-gemini — Fase 8 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md
 * ("não pagar duas vezes"). Chamado por `app/processo/ProcessoClient.tsx:lerLip` ANTES de
 * `/api/lip/s1` — se a mesma leitura já foi feita, pula S1/S2/S3 inteiros (upload + Gemini).
 *
 * FAIL-SAFE por construção: qualquer erro de banco ou tabela ainda não migrada faz o GET devolver
 * "não encontrado" e o POST devolver `ok:false` sem lançar — a leitura segue como sempre seguiu.
 *
 * ── Três correções da auditoria de 11/09/2026 ──────────────────────────────────────────────────
 *
 * 1. AUTENTICAÇÃO. O `middleware.ts` só renova token, não autoriza; quem autoriza é `autenticar()`
 *    em cada rota, e esta não chamava. POST anônimo permitia envenenar o cache que alimenta o LIP.
 *
 * 2. A CHAVE NÃO PODE SER SÓ O HASH DO ARQUIVO. O resultado da leitura depende também do assunto
 *    (prompt P2 próprio), do slot (`tipoProcesso` decide os blocos de marco temporal, área, caixa
 *    de recarga, carimbo e CHEADV em `/api/lip/s3`) e do TEXTO do prompt. Com a chave antiga: o
 *    mesmo PDF lido no Slot 1 e depois no Slot 2 devolvia a extração do Slot 1 — contaminação entre
 *    slots, contra a regra de isolamento do CLAUDE.md — e editar um prompt não surtia efeito nenhum
 *    em arquivo já lido, sem tela para limpar o cache. A chave agora carrega os quatro.
 *
 * 3. NÃO SERVIR CACHE QUANDO ISSO MATARIA A FASE 9B. O prompt combinado LIP+MAC e a gravação em
 *    `mac_sugestoes_leitura_unica` moram dentro do S3; um acerto de cache retorna antes dele. Com
 *    a Fase 9B ligada, todo PDF já lido nunca mais geraria sugestão para o MAC — as duas economias
 *    do plano se anulavam. Se falta a sugestão para este processo, o cache se cala e deixa o S3
 *    rodar.
 */

/**
 * Compõe a chave real do cache. O conteúdo do prompt entra por hash, e não pela coluna `versao`:
 * assim uma edição feita direto no banco (que pode não bumpar a versão) invalida o cache do mesmo
 * jeito. Continua cabendo em 64 hex, então nada muda no schema.
 *
 * Limite conhecido: `aplicarMarcadores` (s3) ainda pode resolver marcadores que dependem do estado
 * do processo. Hoje os prompts em uso não têm marcador e passam intactos; se algum passar a ter,
 * este cache precisa considerar isso também.
 */
function comporChave(hashArquivo: string, assuntoId: string, tipoProcesso: string, promptConteudo: string): string {
  const promptHash = createHash("sha256").update(promptConteudo).digest("hex");
  return createHash("sha256")
    .update(`${hashArquivo.toLowerCase()}|${assuntoId}|${tipoProcesso}|${promptHash}`)
    .digest("hex");
}

/** Mesma busca de prompt que `/api/lip/s3` faz: o do assunto, senão o global. */
async function conteudoPromptP2(assuntoId: string): Promise<string> {
  const valido = /^[0-9a-f-]{36}$/i.test(assuntoId);
  if (valido) {
    const { data } = await supabaseAdmin
      .from("lip_prompts").select("conteudo")
      .eq("ativo", true).eq("chave", "P2_EXTRACAO").eq("assunto_id", assuntoId)
      .order("versao", { ascending: false }).limit(1).maybeSingle();
    if (data?.conteudo) return data.conteudo;
  }
  const { data } = await supabaseAdmin
    .from("lip_prompts").select("conteudo")
    .eq("ativo", true).eq("chave", "P2_EXTRACAO")
    .order("versao", { ascending: false }).limit(1).maybeSingle();
  return data?.conteudo ?? "";
}

/**
 * A Fase 9B precisa que o S3 rode para produzir o bloco MAC. Devolve true quando servir cache
 * deixaria o processo sem a sugestão que ele deveria ganhar.
 */
async function cacheMataria9B(codigo: string): Promise<boolean> {
  if (!codigo) return false;
  try {
    if (!(await leituraUnicaLipMacAtiva())) return false;
    const { data: analise } = await supabaseAdmin
      .from("analises_mac").select("id")
      .eq("processo_codigo", codigo).is("excluido_em", null).limit(1).maybeSingle();
    if (!analise) return false; // sem análise MAC o S3 também não geraria bloco MAC
    const { data: sugestao } = await supabaseAdmin
      .from("mac_sugestoes_leitura_unica").select("processo_codigo")
      .eq("processo_codigo", codigo).maybeSingle();
    return !sugestao;
  } catch {
    return false; // na dúvida, mantém o comportamento barato de sempre
  }
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const p = req.nextUrl.searchParams;
  const hash = p.get("hash") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    return NextResponse.json({ ok: true, encontrado: false });
  }

  try {
    if (await cacheMataria9B(p.get("codigo") ?? "")) {
      return NextResponse.json({ ok: true, encontrado: false, motivo: "leitura_unica_pendente" });
    }
    const chave = comporChave(
      hash,
      p.get("assuntoId") ?? "",
      p.get("tipoProcesso") ?? "",
      await conteudoPromptP2(p.get("assuntoId") ?? ""),
    );
    const { data, error } = await supabaseAdmin
      .from("documentos_ia_cache").select("resultado").eq("hash", chave).maybeSingle();
    if (error || !data) return NextResponse.json({ ok: true, encontrado: false });
    return NextResponse.json({ ok: true, encontrado: true, ...data.resultado });
  } catch {
    return NextResponse.json({ ok: true, encontrado: false });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const corpo = await req.json().catch(() => ({}));
  const hash = String(corpo.hash ?? "");
  if (!/^[0-9a-f]{64}$/i.test(hash) || !corpo.resultado) {
    return NextResponse.json({ ok: false, erro: "hash/resultado ausente" }, { status: 400 });
  }
  try {
    const chave = comporChave(
      hash,
      String(corpo.assuntoId ?? ""),
      String(corpo.tipoProcesso ?? ""),
      await conteudoPromptP2(String(corpo.assuntoId ?? "")),
    );
    const { error } = await supabaseAdmin.from("documentos_ia_cache").upsert({
      hash: chave, processo_codigo: corpo.processoCodigo ?? null, resultado: corpo.resultado,
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // gravar o cache é melhor esforço — nunca deve derrubar uma leitura que já terminou com sucesso
    return NextResponse.json({ ok: false, erro: e?.message ?? String(e) });
  }
}
