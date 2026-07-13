import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPerfilIrrestrito, gerenciaDoPerfil } from "@/lib/perfis";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUsuario(req: NextRequest) {
  const cookie = req.headers.get("cookie") ?? "";
  const userId = cookie.match(/urbis_id=([^;]+)/)?.[1];
  if (!userId) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id, perfis, gerencia")
    .eq("id", userId)
    .maybeSingle();
  return data as { id: string; perfis: string[]; gerencia: string | null } | null;
}

// POST — salva registro MDP (chamado após geração do documento)
export async function POST(req: NextRequest) {
  const usuario = await getUsuario(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { processo_codigo, assunto_id, tipo, numero, destinatario, data_despacho, conteudo } = body;

  if (!processo_codigo || !tipo)
    return NextResponse.json({ ok: false, erro: "processo_codigo e tipo obrigatórios" }, { status: 400 });

  const { data, error } = await supabase
    .from("mdp_registros")
    .insert({
      processo_codigo,
      assunto_id: assunto_id || null,
      tipo,
      numero: numero || null,
      destinatario: destinatario || null,
      data_despacho: data_despacho || null,
      conteudo: conteudo || {},
      usuario_id: usuario.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// GET — lista registros (com filtro de acesso por perfil)
export async function GET(req: NextRequest) {
  const usuario = await getUsuario(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const processo = url.searchParams.get("processo") || null;
  const search = url.searchParams.get("search") || null;
  const page = parseInt(url.searchParams.get("page") || "0");
  const PAGE_SIZE = 30;

  const irrestrito = isPerfilIrrestrito(usuario.perfis);
  const gerencia = gerenciaDoPerfil(usuario.perfis);

  let query = supabase
    .from("mdp_registros")
    .select(`
      id, processo_codigo, tipo, numero, destinatario, data_despacho, conteudo, criado_em,
      usuario:usuario_id ( nome, gerencia )
    `, { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (processo) {
    query = query.eq("processo_codigo", processo);
  }

  if (!irrestrito) {
    if (gerencia) {
      // Gerência: vê registros dos analistas da sua gerência + os seus próprios
      const { data: analistas } = await supabase
        .from("usuarios")
        .select("id")
        .eq("gerencia", gerencia);
      const ids = (analistas || []).map((u: any) => u.id);
      if (ids.length > 0) {
        query = query.in("usuario_id", ids);
      } else {
        query = query.eq("usuario_id", usuario.id);
      }
    } else {
      // Analista: só os seus
      query = query.eq("usuario_id", usuario.id);
    }
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data || [], total: count || 0 });
}
