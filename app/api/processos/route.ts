import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Perfis com visibilidade total da lista de processos.
// Demais perfis (Analista, etc.) so enxergam processos atribuidos a eles.
const PERFIS_IRRESTRITOS = ["Administrador", "Gerente", "Diretor"];

export async function GET(req: NextRequest) {
  try {
    // 1) Identifica o usuario logado pelos cookies setados em /api/auth/login
    const cookieHeader = req.headers.get("cookie") || "";
    const userId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1];
    if (!userId) {
      return NextResponse.json({ ok: false, erro: "Nao autenticado" }, { status: 401 });
    }

    // 2) Le o perfil direto do banco (cookie urbis_perfil e httpOnly:false e nao confiavel)
    const { data: usuario, error: usuarioErro } = await supabase
      .from("usuarios")
      .select("perfil")
      .eq("id", userId)
      .maybeSingle();
    if (usuarioErro || !usuario) {
      return NextResponse.json({ ok: false, erro: "Usuario nao encontrado" }, { status: 401 });
    }

    const irrestrito = PERFIS_IRRESTRITOS.includes(usuario.perfil);

    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca") || "";
    const tipo = searchParams.get("tipo") || "";
    const status = searchParams.get("status") || "";
    const analista = searchParams.get("analista") || "";

    let query = supabase
      .from("processos")
      .select("id, codigo, numero_sei, tipo_processo, status, criado_em, atualizado_em, dados, analista_id")
      .order("atualizado_em", { ascending: false })
      .limit(200);

    if (busca) query = query.or(`codigo.ilike.%${busca}%,numero_sei.ilike.%${busca}%`);
    if (tipo) query = query.eq("tipo_processo", tipo);
    if (status) query = query.eq("status", status);

    if (irrestrito) {
      // Admin/Gerente/Diretor podem usar o filtro opcional ?analista
      if (analista) query = query.eq("analista_id", analista);
    } else {
      // Analista (e demais) veem apenas o que esta atribuido a eles,
      // ignorando qualquer ?analista vindo do cliente
      query = query.eq("analista_id", userId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, status, analista_id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });

    const atualizacao: any = { atualizado_em: new Date().toISOString() };
    if (status !== undefined) atualizacao.status = status;
    if (analista_id !== undefined) atualizacao.analista_id = analista_id;

    const { error } = await supabase.from("processos").update(atualizacao).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });
    const { error } = await supabase.from("processos").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
