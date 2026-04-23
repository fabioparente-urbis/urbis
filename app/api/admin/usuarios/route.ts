import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_FIXO = "Fábio Parente Martins Santos";

export async function GET() {
  const { data, error } = await supabase.from("usuarios").select("*").order("nome");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  try {
    const { nome, cpf, email, matricula, telefone, cargo, perfil, status, senha } = await req.json();
    if (!nome || !email || !senha)
      return NextResponse.json({ ok: false, erro: "Nome, email e senha obrigatórios" }, { status: 400 });

    // Regra: perfil Administrador só para o nome fixo
    if (perfil === "Administrador" && nome.trim() !== ADMIN_FIXO)
      return NextResponse.json({ ok: false, erro: `O perfil Administrador é exclusivo de "${ADMIN_FIXO}".` }, { status: 400 });

    // Regra: só pode existir 1 administrador
    if (perfil === "Administrador") {
      const { data: admins } = await supabase.from("usuarios").select("id").eq("perfil", "Administrador");
      if (admins && admins.length > 0)
        return NextResponse.json({ ok: false, erro: "Já existe um Administrador cadastrado no sistema." }, { status: 400 });
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

    // Regra: não permite remover/alterar o admin fixo
    const { data: atual } = await supabase.from("usuarios").select("perfil, nome").eq("id", id).single();
    if (atual?.perfil === "Administrador" && atual?.nome === ADMIN_FIXO) {
      if (perfil !== "Administrador")
        return NextResponse.json({ ok: false, erro: "Não é permitido alterar o perfil do Administrador fixo." }, { status: 400 });
      if (nome.trim() !== ADMIN_FIXO)
        return NextResponse.json({ ok: false, erro: `O nome do Administrador não pode ser alterado.` }, { status: 400 });
    }

    // Regra: perfil Administrador só para o nome fixo
    if (perfil === "Administrador" && nome.trim() !== ADMIN_FIXO)
      return NextResponse.json({ ok: false, erro: `O perfil Administrador é exclusivo de "${ADMIN_FIXO}".` }, { status: 400 });

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

// #1 — Exclusão real de usuário
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatório" }, { status: 400 });

    // Protege o admin fixo
    const { data: usuario } = await supabase.from("usuarios").select("perfil, nome, email").eq("id", id).single();
    if (usuario?.perfil === "Administrador" && usuario?.nome === ADMIN_FIXO)
      return NextResponse.json({ ok: false, erro: "O Administrador fixo não pode ser excluído." }, { status: 400 });

    // Remove do Auth do Supabase
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find((u) => u.email === usuario?.email);
    if (authUser) await supabase.auth.admin.deleteUser(authUser.id);

    // Remove da tabela usuarios
    const { error } = await supabase.from("usuarios").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}