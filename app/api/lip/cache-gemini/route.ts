import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * app/api/lip/cache-gemini — Fase 8 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md
 * ("não pagar duas vezes"). Chamado por `app/processo/ProcessoClient.tsx:lerLip` ANTES de
 * `/api/lip/s1` — se o hash do arquivo já foi lido, pula S1/S2/S3 inteiros (upload + Gemini).
 *
 * FAIL-SAFE por construção: se a tabela `documentos_ia_cache` não existir ainda (migration
 * `2026_09_10_documentos_ia_cache_fase8.sql` pendente) ou qualquer erro de banco acontecer, GET
 * devolve "não encontrado" e POST devolve `ok:false` sem lançar — a leitura segue exatamente como
 * sempre seguiu (chamando o Gemini de novo). Nunca bloqueia nem atrasa a leitura por causa desta
 * tabela nova, mesmo princípio já usado na Fase 4 (`documentos_sei_regras_identificacao`).
 *
 * Mesmo padrão de ausência de auth explícita que os vizinhos `/api/lip/s1|s2|s3` já têm.
 */

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    return NextResponse.json({ ok: true, encontrado: false });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("documentos_ia_cache").select("resultado").eq("hash", hash).maybeSingle();
    if (error || !data) return NextResponse.json({ ok: true, encontrado: false });
    return NextResponse.json({ ok: true, encontrado: true, ...data.resultado });
  } catch {
    return NextResponse.json({ ok: true, encontrado: false });
  }
}

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({}));
  const hash = String(corpo.hash ?? "");
  if (!/^[0-9a-f]{64}$/i.test(hash) || !corpo.resultado) {
    return NextResponse.json({ ok: false, erro: "hash/resultado ausente" }, { status: 400 });
  }
  try {
    const { error } = await supabaseAdmin.from("documentos_ia_cache").upsert({
      hash, processo_codigo: corpo.processoCodigo ?? null, resultado: corpo.resultado,
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // gravar o cache é melhor esforço — nunca deve derrubar uma leitura que já terminou com sucesso
    return NextResponse.json({ ok: false, erro: e?.message ?? String(e) });
  }
}
