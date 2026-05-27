import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { autenticar } from "@/lib/auth";

/**
 * Tags por processo — gravadas no JSONB `processos.tags` (array).
 *
 * Formato de uma tag:
 *   {
 *     tipo: "despacho" | "indeferimento" | "arquivamento" | "laudo",
 *     numero_analise?: number,
 *     numero_despacho?: string,
 *     data: string,           // dd/mm/aaaa
 *     criado_em: string,      // ISO
 *     criado_por: string,     // userId
 *     id: string,             // uuid-ish para deleção precisa
 *   }
 */

type TagInput = {
  tipo: "despacho" | "indeferimento" | "arquivamento" | "laudo";
  numero_analise?: number;
  numero_despacho?: string;
  data?: string;
};

function novoIdLeve() {
  // ID curto suficiente para identificar uma tag dentro do array do processo.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function carregarProcesso(codigo: string) {
  return supabase
    .from("processos")
    .select("id, codigo, tags, analista_id")
    .eq("codigo", codigo)
    .limit(1)
    .maybeSingle();
}

// GET /api/processo/tag?codigo=...    → { ok, tags: [...] }
export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo");
  if (!codigo) {
    return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });
  }

  const { data, error } = await carregarProcesso(codigo);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, erro: "Processo nao encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, tags: (data as any).tags ?? [] });
}

// POST /api/processo/tag    body: { codigo, tag: { tipo, numero_analise?, numero_despacho?, data? } }
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => null);
    const codigo: string | undefined = body?.codigo;
    const tagIn: TagInput | undefined = body?.tag;
    if (!codigo || !tagIn?.tipo) {
      return NextResponse.json({ ok: false, erro: "codigo e tag.tipo obrigatorios" }, { status: 400 });
    }
    const tiposValidos = new Set(["despacho", "indeferimento", "arquivamento", "laudo"]);
    if (!tiposValidos.has(tagIn.tipo)) {
      return NextResponse.json({ ok: false, erro: "tipo de tag invalido" }, { status: 400 });
    }

    const { data: proc, error: erroBusca } = await carregarProcesso(codigo);
    if (erroBusca) return NextResponse.json({ ok: false, erro: erroBusca.message }, { status: 500 });
    if (!proc) return NextResponse.json({ ok: false, erro: "Processo nao encontrado" }, { status: 404 });

    const tagsExistentes = Array.isArray((proc as any).tags) ? [...(proc as any).tags] : [];
    // Dedup: reemissão do mesmo tipo+numero_analise substitui a tag anterior
    const tags = tagsExistentes.filter((t: any) => {
      if (t?.tipo !== tagIn.tipo) return true;
      const mesmaN = (t?.numero_analise ?? null) === (tagIn.numero_analise ?? null);
      return !mesmaN;
    });
    const novaTag = {
      id: novoIdLeve(),
      tipo: tagIn.tipo,
      ...(typeof tagIn.numero_analise === "number" ? { numero_analise: tagIn.numero_analise } : {}),
      ...(tagIn.numero_despacho ? { numero_despacho: String(tagIn.numero_despacho) } : {}),
      data: tagIn.data || new Date().toLocaleDateString("pt-BR"),
      criado_em: new Date().toISOString(),
      criado_por: auth.userId,
    };
    tags.push(novaTag);

    const { error } = await supabase
      .from("processos")
      .update({ tags, atualizado_em: new Date().toISOString() })
      .eq("id", (proc as any).id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, tag: novaTag, tags });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/processo/tag    body: { codigo, tagId }    (somente admin/diretora)
export async function DELETE(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!auth.irrestrito) {
      return NextResponse.json(
        { ok: false, erro: "Apenas Administrador/Diretora pode remover tags" },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    const codigo: string | undefined = body?.codigo;
    const tagId: string | undefined = body?.tagId;
    if (!codigo || !tagId) {
      return NextResponse.json({ ok: false, erro: "codigo e tagId obrigatorios" }, { status: 400 });
    }

    const { data: proc, error: erroBusca } = await carregarProcesso(codigo);
    if (erroBusca) return NextResponse.json({ ok: false, erro: erroBusca.message }, { status: 500 });
    if (!proc) return NextResponse.json({ ok: false, erro: "Processo nao encontrado" }, { status: 404 });

    const tagsAtuais = Array.isArray((proc as any).tags) ? (proc as any).tags : [];
    const tags = tagsAtuais.filter((t: any) => t?.id !== tagId);

    const { error } = await supabase
      .from("processos")
      .update({ tags, atualizado_em: new Date().toISOString() })
      .eq("id", (proc as any).id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, tags });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
