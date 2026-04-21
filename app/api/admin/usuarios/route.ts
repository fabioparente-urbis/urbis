import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from("usuarios").select("*").order("nome");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  try {
    const { nome, cpf, email, matricula, telefone, cargo, perfil, status, senha } = await req.json();
    if (!nome || !email || !senha) {
      return NextResponse.json({ ok: false, erro: "Nome, email e senha obrigatórios" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });

    if (authError) return NextResponse.json({ ok: false, erro: authError.message }, { status: 400 });

    const { error: dbError } = await supabase.from("usuarios").insert({
      nome, cpf, email, matricula, telefone, cargo,
      perfil: perfil || "Analista", status: status || "Ativo",
    });

    if (dbError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ ok: false, erro: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nome, cpf, email, matricula, telefone, cargo, perfil, status, senha } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatório" }, { status: 400 });

    const atualizacao: any = { nome, cpf, email, matricula, telefone, cargo, perfil, status };
    if (status === "Inativo") atualizacao.descadastrado_em = new Date().toISOString();
    if (status === "Ativo") atualizacao.descadastrado_em = null;

    const { error: dbError } = await supabase.from("usuarios").update(atualizacao).eq("id", id);
    if (dbError) return NextResponse.json({ ok: false, erro: dbError.message }, { status: 500 });

    if (senha) {
      const { data: userData } = await supabase.from("usuarios").select("email").eq("id", id).single();
      if (userData?.email) {
        const { data: authUser } = await supabase.auth.admin.listUsers();
        const user = authUser?.users?.find((u) => u.email === userData.email);
        if (user) await supabase.auth.admin.updateUserById(user.id, { password: senha });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
