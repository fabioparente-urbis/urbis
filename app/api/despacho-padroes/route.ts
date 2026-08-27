import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f-]{36}$/i;

function validarBucket(assunto_id: unknown, modulo: unknown, tipo_despacho: unknown) {
  if (typeof assunto_id !== "string" || !UUID_RE.test(assunto_id)) return "assunto_id inválido";
  if (modulo !== "LIP" && modulo !== "MAC") return "modulo deve ser LIP ou MAC";
  if (tipo_despacho !== "interno" && tipo_despacho !== "externo") return "tipo_despacho deve ser interno ou externo";
  if (modulo === "LIP" && tipo_despacho === "externo") return "LIP não tem despacho externo";
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assunto_id = searchParams.get("assunto_id");
  const modulo = searchParams.get("modulo");
  const tipo_despacho = searchParams.get("tipo_despacho");

  const erroValidacao = validarBucket(assunto_id, modulo, tipo_despacho);
  if (erroValidacao) {
    return NextResponse.json({ ok: false, erro: erroValidacao }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("despacho_padroes")
    .select("*")
    .eq("assunto_id", assunto_id!)
    .eq("modulo", modulo!)
    .eq("tipo_despacho", tipo_despacho!)
    .eq("ativo", true)
    .order("titulo");

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { assunto_id, modulo, tipo_despacho, titulo, corpo, destinatario_padrao } = body;

  const erroValidacao = validarBucket(assunto_id, modulo, tipo_despacho);
  if (erroValidacao) {
    return NextResponse.json({ ok: false, erro: erroValidacao }, { status: 400 });
  }
  if (!titulo || !String(titulo).trim()) {
    return NextResponse.json({ ok: false, erro: "titulo é obrigatório" }, { status: 400 });
  }
  if (!corpo || !String(corpo).trim()) {
    return NextResponse.json({ ok: false, erro: "corpo é obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("despacho_padroes")
    .insert({
      assunto_id,
      modulo,
      tipo_despacho,
      titulo: String(titulo).trim(),
      corpo: String(corpo),
      destinatario_padrao: destinatario_padrao || null,
      criado_por: auth.userId,
    })
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { id, titulo, corpo, destinatario_padrao } = body;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, erro: "id inválido" }, { status: 400 });
  }
  if (!titulo || !String(titulo).trim()) {
    return NextResponse.json({ ok: false, erro: "titulo é obrigatório" }, { status: 400 });
  }
  if (!corpo || !String(corpo).trim()) {
    return NextResponse.json({ ok: false, erro: "corpo é obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("despacho_padroes")
    .update({
      titulo: String(titulo).trim(),
      corpo: String(corpo),
      destinatario_padrao: destinatario_padrao || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await req.json();
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, erro: "id inválido" }, { status: 400 });
  }

  // Soft delete — um padrão referenciado por padrao_id num mdp_registros
  // antigo não pode sumir da rastreabilidade histórica.
  const { error } = await supabase
    .from("despacho_padroes")
    .update({ ativo: false, atualizado_em: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
