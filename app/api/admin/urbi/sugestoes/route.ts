import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// Estados que um humano pode escolher pela tela. "nova" nunca aparece aqui —
// só o registro automático (lib/urbi/sugestoes.ts) grava "nova"; devolver pra
// esse estado pela tela não faz sentido (não existe "reabrir" nesta rodada).
const ESTADOS_HUMANOS = new Set(["vista", "confirmada", "descartada", "insuficiente"]);

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const estado = searchParams.get("estado");
  const processo = searchParams.get("processo");
  const tipo = searchParams.get("tipo");
  const grauCerteza = searchParams.get("grau_certeza");
  const slot = searchParams.get("slot");
  const limitParam = parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 300) : 100;

  // Filtro por slot precisa resolver os códigos daquele slot ANTES do limit — se filtrasse só
  // depois de buscar, uma página cheia de outro slot esconderia sugestão real deste (achado ao
  // implementar: nunca filtrar por campo que não existe na própria tabela depois do .limit()).
  let codigosDoSlot: string[] | null = null;
  if (slot) {
    const { data: processosDoSlot, error: erroSlot } = await supabaseAdmin.from("processos").select("codigo").eq("tipo_processo", slot);
    if (erroSlot) {
      console.error("[admin/urbi/sugestoes GET] falha ao resolver slot:", erroSlot.message);
      return NextResponse.json({ ok: false, erro: "Falha ao consultar sugestões." }, { status: 500 });
    }
    codigosDoSlot = (processosDoSlot ?? []).map((p: any) => p.codigo);
  }

  let query = supabaseAdmin
    .from("urbi_sugestoes")
    .select("id, processo_codigo, tipo, chave, sugestao, motivo_factual, campos_comparados, fontes, grau_certeza, estado, gerado_em, decidido_por, decidido_em")
    .order("gerado_em", { ascending: false })
    .limit(limit);

  if (estado) query = query.eq("estado", estado);
  if (processo) query = query.eq("processo_codigo", processo.trim());
  if (tipo) query = query.eq("tipo", tipo);
  if (grauCerteza) query = query.eq("grau_certeza", grauCerteza);
  if (codigosDoSlot) query = query.in("processo_codigo", codigosDoSlot.length ? codigosDoSlot : ["__nenhum__"]);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/urbi/sugestoes GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar sugestões." }, { status: 500 });
  }

  const idsDecisor = [...new Set((data ?? []).map((s: any) => s.decidido_por).filter(Boolean))];
  let nomesPorId = new Map<string, string>();
  if (idsDecisor.length) {
    const { data: usuarios } = await supabaseAdmin.from("usuarios").select("id, nome").in("id", idsDecisor);
    nomesPorId = new Map((usuarios ?? []).map((u: any) => [u.id, u.nome]));
  }

  // tipo_processo de cada sugestão — só pra rotular o slot e montar o link seguro pro processo
  // (Fase F: "filtro por slot" e "link pra o processo"). Nunca decide nada com isso, só exibe.
  const codigos = [...new Set((data ?? []).map((s: any) => s.processo_codigo))];
  let slotPorCodigo = new Map<string, string>();
  if (codigos.length) {
    const { data: processos } = await supabaseAdmin.from("processos").select("codigo, tipo_processo").in("codigo", codigos);
    slotPorCodigo = new Map((processos ?? []).map((p: any) => [p.codigo, p.tipo_processo]));
  }

  const comDetalhe = (data ?? []).map((s: any) => ({
    ...s,
    decidido_por_nome: s.decidido_por ? (nomesPorId.get(s.decidido_por) ?? null) : null,
    tipo_processo: slotPorCodigo.get(s.processo_codigo) ?? null,
  }));

  return NextResponse.json({ ok: true, data: comDetalhe });
}

/**
 * Só muda `estado` — nunca toca em sugestao/motivo_factual/fontes/grau_certeza
 * (esses são o fato registrado, imutável), nunca em LIP/MAC/processo. Sempre
 * grava quem decidiu e quando.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  const estado = typeof body?.estado === "string" ? body.estado : null;
  if (!id || !estado) {
    return NextResponse.json({ ok: false, erro: "id e estado são obrigatórios." }, { status: 400 });
  }
  if (!ESTADOS_HUMANOS.has(estado)) {
    return NextResponse.json({ ok: false, erro: `estado inválido — use um de: ${[...ESTADOS_HUMANOS].join(", ")}.` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("urbi_sugestoes")
    .update({ estado, decidido_por: ctx.userId, decidido_em: new Date().toISOString() })
    .eq("id", id)
    .select("id, estado")
    .maybeSingle();

  if (error) {
    console.error("[admin/urbi/sugestoes PATCH] falha ao atualizar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar sugestão." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, erro: "Sugestão não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data });
}
