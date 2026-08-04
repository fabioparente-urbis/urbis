import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";

/**
 * POST /api/auth/trocar-senha — o próprio usuário troca a senha, logado, sem passar pelo
 * e-mail de reset (que depende do envio do Supabase, fora do nosso controle). Exige a senha
 * atual para confirmar que é o dono da conta, mesma checagem de /api/auth/login
 * (signInWithPassword com o client anônimo — nunca comparamos senha em texto).
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { senhaAtual, novaSenha } = await req.json();
    if (!senhaAtual || !novaSenha) {
      return NextResponse.json({ ok: false, erro: "Senha atual e nova senha são obrigatórias" }, { status: 400 });
    }
    if (novaSenha.length < 8) {
      return NextResponse.json({ ok: false, erro: "A nova senha deve ter pelo menos 8 caracteres" }, { status: 400 });
    }

    const { data: linha } = await supabaseAdmin.from("usuarios").select("email").eq("id", usuario.id).maybeSingle();
    const email = (linha as any)?.email;
    if (!email) return NextResponse.json({ ok: false, erro: "Usuário não encontrado" }, { status: 404 });

    const { error: erroSenhaAtual } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ).auth.signInWithPassword({ email, password: senhaAtual });
    if (erroSenhaAtual) return NextResponse.json({ ok: false, erro: "Senha atual incorreta" }, { status: 401 });

    const { data: lista, error: erroLista } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = erroLista ? null : lista.users.find((u) => u.email === email);
    if (!authUser) return NextResponse.json({ ok: false, erro: "Usuário não encontrado no Auth" }, { status: 404 });

    const { error: erroTroca } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password: novaSenha });
    if (erroTroca) return NextResponse.json({ ok: false, erro: erroTroca.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
