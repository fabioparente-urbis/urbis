/**
 * app/api/mac/vinculos-fila/buscar-bip/route.ts — passo 3 do procedimento manual: busca de
 * fragmento real do BIP (bdi_lei_fragmentos), mesma técnica de busca (ilike) já usada em
 * app/api/mac/slot-05/bip-busca — reescrita aqui, não importada de lá, porque aquela rota é
 * exclusiva do Slot 5 (ver comentário no próprio arquivo) e esta fila é de Regularização/Aceite.
 * "Não citar lei sem consulta BIP citável": só retorna id de fragmento que existe de verdade —
 * é este id (nunca texto digitado) que vira `bipFragmentoId` na proposta.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { escaparValorFiltroOr } from "@/lib/mac/vinculosFila";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ ok: true, resultados: [] });
  const qEscapado = escaparValorFiltroOr(q);

  const { data, error } = await supabaseAdmin
    .from("bdi_lei_fragmentos")
    .select("id, referencia, texto, documento_id")
    .or(`referencia.ilike."%${qEscapado}%",texto.ilike."%${qEscapado}%"`)
    .limit(20);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

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
}
