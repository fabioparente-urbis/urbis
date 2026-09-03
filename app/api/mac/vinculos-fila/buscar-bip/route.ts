/**
 * app/api/mac/vinculos-fila/buscar-bip/route.ts — passo 3 do procedimento manual: busca de
 * fragmento real do BIP (bdi_lei_fragmentos). Duas técnicas:
 *
 * - Padrão (`q`, sem `modo`): `ilike` — mesma técnica já usada em
 *   app/api/mac/slot-05/bip-busca (reescrita aqui, não importada, porque aquela rota é
 *   exclusiva do Slot 5). É o que a tela chama a cada digitação (debounce) — zero custo,
 *   automático.
 * - Opt-in (`modo=similaridade`): busca vetorial via RPC
 *   `buscar_bip_fragmentos_similares` (migration 2026_09_03), que gera 1 embedding real da
 *   consulta (custo real, pequeno) — só deve ser chamada por AÇÃO EXPLÍCITA do usuário (um
 *   botão "buscar por similaridade", nunca ligada ao debounce automático). Cai pra `ilike` se
 *   o embedding ou a RPC falharem — nunca vira 500 só por causa disso.
 *
 * "Não citar lei sem consulta BIP citável": nos dois modos, só retorna id de fragmento que
 * existe de verdade — é este id (nunca texto digitado) que vira `bipFragmentoId` na proposta.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { escaparValorFiltroOr } from "@/lib/mac/vinculosFila";
import { gerarEmbeddingConsulta } from "@/lib/bdi/embeddingConsulta";
import { registrarChamadaIA } from "@/lib/iaUso";

export const runtime = "nodejs";

async function buscarPorSimilaridade(q: string): Promise<{ id: string; referencia: string; texto: string; documento_id: string }[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const t0 = Date.now();
  const embedding = await gerarEmbeddingConsulta(q, apiKey);
  if (embedding.status !== "ok") {
    await registrarChamadaIA({ modulo: "BDI", operacao: "bip_embedding_consulta_fila", modelo: "gemini-embedding-001", duracaoMs: Date.now() - t0, status: "erro", motivoErro: embedding.motivo.slice(0, 500) });
    console.error("[vinculos-fila/buscar-bip] embedding falhou, caindo pra ilike:", embedding.motivo);
    return null;
  }
  const { data, error } = await supabaseAdmin.rpc("buscar_bip_fragmentos_similares", {
    query_embedding: embedding.vetor,
    match_count: 20,
    filtro_documento_ids: null,
  });
  await registrarChamadaIA({ modulo: "BDI", operacao: "bip_embedding_consulta_fila", modelo: "gemini-embedding-001", duracaoMs: Date.now() - t0, status: error ? "erro" : "ok", motivoErro: error?.message?.slice(0, 500) });
  if (error) {
    console.error("[vinculos-fila/buscar-bip] RPC de similaridade falhou, caindo pra ilike:", error.message);
    return null;
  }
  return data ?? [];
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ ok: true, resultados: [] });
  const modo = req.nextUrl.searchParams.get("modo");

  let data: { id: string; referencia: string; texto: string; documento_id: string }[] | null = null;
  let porSimilaridade = false;
  if (modo === "similaridade") {
    data = await buscarPorSimilaridade(q);
    if (data) porSimilaridade = true;
  }

  if (!data) {
    const qEscapado = escaparValorFiltroOr(q);
    const { data: viaIlike, error } = await supabaseAdmin
      .from("bdi_lei_fragmentos")
      .select("id, referencia, texto, documento_id")
      .or(`referencia.ilike."%${qEscapado}%",texto.ilike."%${qEscapado}%"`)
      .limit(20);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    data = viaIlike ?? [];
  }

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
  return NextResponse.json({ ok: true, resultados, por_similaridade: porSimilaridade });
}
