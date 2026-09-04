/**
 * app/api/mac/vinculos-fila/candidatos-bip/route.ts — Fase Q (05/09/2026): "buscar o máximo de
 * candidatos usando a busca vetorial já criada, mas somente como proposta na fila". Roda a MESMA
 * busca por similaridade que já existia (buscar-bip?modo=similaridade,
 * app/api/bdi/embeddingConsulta.ts + RPC buscar_bip_fragmentos_similares), só que em lote — um
 * embedding real por item, usando o próprio texto do item de checklist como consulta.
 *
 * Fase T (05/09/2026): passou de 1 candidato por item pra ATÉ 3 ("apresente até três candidatos
 * BIP" — pedido explícito), com sinalização de "base insuficiente" quando NENHUM dos 3 tem
 * distância que sustente indicar um deles — não força certeza que a leitura vetorial não tem.
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
const CANDIDATOS_POR_ITEM = 3;
// Distância de cosseno (0 = idêntico, 2 = oposto). Três faixas, nenhuma delas vira ALTA
// automaticamente — isso é sempre decisão de quem lê o trecho:
//   < MEDIA   → sugere confiança MEDIA
//   < BAIXA   → sugere confiança BAIXA
//   >= BAIXA  → nenhum candidato claro; item marcado "base insuficiente" em vez de forçar palpite
const LIMIAR_DISTANCIA_MEDIA = 0.35;
const LIMIAR_DISTANCIA_BAIXA = 0.55;

type ItemParaBusca = { itemId: string; grupo: string; texto: string };
type CandidatoBip = { id: string; referencia: string; lei: string; trecho: string; distancia: number; confiancaSugerida: "MEDIA" | "BAIXA" };

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

  const resultado: {
    itemId: string;
    candidatos: CandidatoBip[];
    baseInsuficiente: boolean;
    erro?: string;
  }[] = [];

  for (const item of itens) {
    const consulta = `${item.grupo} — ${item.texto}`.slice(0, 400);
    const t0 = Date.now();
    const embedding = await gerarEmbeddingConsulta(consulta, apiKey);
    if (embedding.status !== "ok") {
      await registrarChamadaIA({ modulo: "BDI", operacao: "bip_embedding_candidatos_fila", modelo: "gemini-embedding-001", duracaoMs: Date.now() - t0, status: "erro", motivoErro: embedding.motivo.slice(0, 500) });
      resultado.push({ itemId: item.itemId, candidatos: [], baseInsuficiente: true, erro: embedding.motivo });
      continue;
    }
    const { data, error } = await supabaseAdmin.rpc("buscar_bip_fragmentos_similares", {
      query_embedding: embedding.vetor,
      match_count: CANDIDATOS_POR_ITEM,
      filtro_documento_ids: null,
    });
    await registrarChamadaIA({ modulo: "BDI", operacao: "bip_embedding_candidatos_fila", modelo: "gemini-embedding-001", duracaoMs: Date.now() - t0, status: error ? "erro" : "ok", motivoErro: error?.message?.slice(0, 500) });
    if (error || !data || data.length === 0) {
      resultado.push({ itemId: item.itemId, candidatos: [], baseInsuficiente: true, erro: error?.message ?? "nenhum fragmento indexado" });
      continue;
    }
    const linhas = data as { id: string; documento_id: string; referencia: string; texto: string; distancia: number }[];
    const documentoIds = [...new Set(linhas.map((f) => f.documento_id))];
    const { data: leis } = documentoIds.length
      ? await supabaseAdmin.from("bdi_documentos_lei").select("id, titulo, numero").in("id", documentoIds)
      : { data: [] as any[] };
    const leiPorDocumento = new Map((leis ?? []).map((l: any) => [l.id, l]));

    const candidatos: CandidatoBip[] = linhas.map((f) => {
      const lei = leiPorDocumento.get(f.documento_id);
      return {
        id: f.id,
        referencia: f.referencia ?? "",
        lei: lei ? `${lei.titulo}${lei.numero ? ` (${lei.numero})` : ""}` : "",
        trecho: String(f.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
        distancia: f.distancia,
        confiancaSugerida: f.distancia < LIMIAR_DISTANCIA_MEDIA ? "MEDIA" : "BAIXA",
      };
    });
    // "Base insuficiente" é sobre o MELHOR candidato, não sobre todos — se nem o mais próximo
    // passa do limiar, os outros 2 (ainda mais distantes) não ajudam ninguém a decidir.
    const baseInsuficiente = candidatos.length === 0 || candidatos[0].distancia >= LIMIAR_DISTANCIA_BAIXA;
    resultado.push({ itemId: item.itemId, candidatos, baseInsuficiente });
  }

  return NextResponse.json({ ok: true, candidatos: resultado });
}
