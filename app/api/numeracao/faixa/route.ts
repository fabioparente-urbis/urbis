import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUsuarioId(req: NextRequest): Promise<string | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = cookieHeader.match(/urbis_token=([^;]+)/)?.[1];
  const userId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1];
  if (!token || !userId) return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const ano = new Date().getFullYear();
  const { data, error } = await supabase
    .from("urbis_numeracao_faixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("ano", ano)
    .order("tipo", { ascending: true })
    .order("criado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const { tipo, numero_inicial, numero_final } = await req.json();
  if (!["despacho", "parecer"].includes(tipo))
    return NextResponse.json({ ok: false, erro: "tipo inválido" }, { status: 400 });

  const ni = Number(numero_inicial);
  const nf = Number(numero_final);
  if (!Number.isInteger(ni) || !Number.isInteger(nf) || ni > nf)
    return NextResponse.json({ ok: false, erro: "Faixa inválida" }, { status: 400 });

  const ano = new Date().getFullYear();

  const { data: existentes } = await supabase
    .from("urbis_numeracao_faixas")
    .select("numero_inicial, numero_final")
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo)
    .eq("ano", ano);

  if (existentes) {
    for (const f of existentes) {
      if (ni <= f.numero_final && nf >= f.numero_inicial)
        return NextResponse.json({ ok: false, erro: `Faixa sobrepõe intervalo já cadastrado (${f.numero_inicial}–${f.numero_final})` }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("urbis_numeracao_faixas")
    .insert({ usuario_id: usuarioId, tipo, numero_inicial: ni, numero_final: nf, proximo: ni, ano })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("urbis_numeracao_faixas")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
