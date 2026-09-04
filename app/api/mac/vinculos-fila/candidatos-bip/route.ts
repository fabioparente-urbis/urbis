/**
 * app/api/mac/vinculos-fila/candidatos-bip/route.ts — Fase Q da Inteligência URBIS (05/09/2026):
 * "buscar o máximo de candidatos usando a busca vetorial já criada, mas somente como proposta
 * na fila". Roda a MESMA busca por similaridade que já existia (buscar-bip?modo=similaridade,
 * app/api/bdi/embeddingConsulta.ts + RPC buscar_bip_fragmentos_similares), só que em lote — um
 * embedding real por item, usando o próprio texto do item de checklist como consulta.
 *
 * NUNCA grava nada: devolve candidato pra EXIBIÇÃO na fila (rótulo "proposta — exige revisão
 * humana" fica na tela). Propor de verdade continua exigindo o clique explícito em "enviar
 * proposta" no modal já existente (app/admin/vinculos-lip-bip/page.tsx), que grava em
 * mac_vinculos_propostas com criado_por = quem clicou — nunca um usuário "sistema".
 *
 * Custo real (um embedding por item) — só roda por AÇÃO EXPLÍCITA (botão "Buscar candidatos"),
 * nunca automático ao abrir a tela. Lote limitado a 25 itens por chamada pra manter o custo de
 * um clique previsível.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { gerarEmbeddingConsulta } from "@/lib/bdi/embeddingConsulta";
import { registrarChamadaIA } from "@/lib/iaUso";

export const runtime = "nodejs";

const LOTE_MAXIMO = 25;
// Distância de cosseno (0 = idêntico, 2 = oposto) — abaixo disso, sugere confiança MEDIA em vez
// de BAIXA. Nunca sugere ALTA automaticamente: isso é sempre decisão de quem lê o trecho.
const LIMIAR_DISTANCIA_MEDIA = 0.35;

type ItemParaBusca = { itemId: string; grupo: string; texto: string };

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, candidatos: [], aviso: "Busca por similaridade indisponível (GEMINI_API_KEY não configurada) — use a busca textual manual no modal de proposta." });
  }

  const body = await req.json().catch(() => null);
  const itens: ItemParaBusca[] = Array.isArray(body?.itens) ? body.itens : [];
  if (itens.length === 0) return NextResponse.json({ ok: false, erro: "itens obrigatório (lista não vazia)" }, { status: 400 });
  if (itens.length > LOTE_MAXIMO) {
    return NextResponse.json({ ok: false, erro: `no máximo ${LOTE_MAXIMO} itens por chamada — peça em lotes menores` }, { status: 400 });
  }

  const candidatos: {
    itemId: string;
    candidato: { id: string; referencia: string; lei: string; trecho: string; distancia: number; confiancaSugerida: "MEDIA" | "BAIXA" } | null;
    erro?: string;
  }[] = [];

  for (const item of itens) {
    const consulta = `${item.grupo} — ${item.texto}`.slice(0, 400);
    const t0 = Date.now();
    const embedding = await gerarEmbeddingConsulta(consulta, apiKey);
    if (embedding.status !== "ok") {
      await registrarChamadaIA({ modulo: "BDI", operacao: "bip_embedding_candidatos_fila", modelo: "gemini-embedding-001", duracaoMs: Date.now() - t0, status: "erro", motivoErro: embedding.motivo.slice(0, 500) });
      candidatos.push({ itemId: item.itemId, candidato: null, erro: embedding.motivo });
      continue;
    }
    const { data, error } = await supabaseAdmin.rpc("buscar_bip_fragmentos_similares", {
      query_embedding: embedding.vetor,
      match_count: 1,
      filtro_documento_ids: null,
    });
    await registrarChamadaIA({ modulo: "BDI", operacao: "bip_embedding_candidatos_fila", modelo: "gemini-embedding-001", duracaoMs: Date.now() - t0, status: error ? "erro" : "ok", motivoErro: error?.message?.slice(0, 500) });
    if (error || !data || data.length === 0) {
      candidatos.push({ itemId: item.itemId, candidato: null, erro: error?.message ?? "nenhum fragmento indexado" });
      continue;
    }
    const f = data[0] as { id: string; documento_id: string; referencia: string; texto: string; distancia: number };
    const { data: lei } = await supabaseAdmin.from("bdi_documentos_lei").select("titulo, numero").eq("id", f.documento_id).maybeSingle();
    candidatos.push({
      itemId: item.itemId,
      candidato: {
        id: f.id,
        referencia: f.referencia ?? "",
        lei: lei ? `${lei.titulo}${lei.numero ? ` (${lei.numero})` : ""}` : "",
        trecho: String(f.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
        distancia: f.distancia,
        confiancaSugerida: f.distancia < LIMIAR_DISTANCIA_MEDIA ? "MEDIA" : "BAIXA",
      },
    });
  }

  return NextResponse.json({ ok: true, candidatos });
}
