/**
 * app/api/mac/slot-05/bip-busca/route.ts — busca de lei/artigo no BIP, EXCLUSIVA do Slot 5.
 *
 * Alimenta o campo "vincular lei/artigo" de cada subitem do checklist. Busca por texto simples
 * (ilike) em `bdi_lei_fragmentos.referencia` e `.texto` — não usa embedding aqui: o analista está
 * digitando um número de artigo ou uma palavra-chave, não fazendo uma pergunta em linguagem
 * natural (isso já existe em outro lugar, para a leitura por IA da acessibilidade).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json({ ok: true, resultados: [] });

    const { data, error } = await supabaseAdmin
      .from("bdi_lei_fragmentos")
      .select("id, referencia, texto, documento_id")
      .or(`referencia.ilike.%${q}%,texto.ilike.%${q}%`)
      .limit(20);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    // "Art. 90" sozinho existe em leis diferentes (Código de Obras, Lei das Calçadas...) — sem
    // dizer QUAL lei, o analista vincularia no escuro.
    const documentoIds = [...new Set((data ?? []).map((f) => f.documento_id as string))];
    const { data: leis } = documentoIds.length
      ? await supabaseAdmin.from("bdi_documentos_lei").select("id, titulo, numero").in("id", documentoIds)
      : { data: [] as { id: string; titulo: string; numero: string }[] };
    const leiPorDocumento = new Map((leis ?? []).map((l) => [l.id as string, l]));

    const resultados = (data ?? []).map((f) => {
      const lei = leiPorDocumento.get(f.documento_id as string);
      return {
        id: f.id as string,
        referencia: (f.referencia as string) ?? "",
        lei: lei ? `${lei.titulo}${lei.numero ? ` (${lei.numero})` : ""}` : "",
        trecho: String(f.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      };
    });
    return NextResponse.json({ ok: true, resultados });
  } catch (e: any) {
    console.error("[MAC/slot-05/bip-busca] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
