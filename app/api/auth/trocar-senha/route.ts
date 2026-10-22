import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";

/**
 * POST /api/auth/trocar-senha — o próprio usuário troca a senha, logado, sem passar pelo
 * e-mail de reset (que depende do envio do Supabase, fora do nosso controle). Exige a senha
 * atual para confirmar que é o dono da conta, mesma checagem de /api/auth/login
 * (signInWithPassword com o client anônimo — nunca comparamos senha em texto).
 *
 * C1 (22/10/2026): a conta alterada é a DA SESSÃO, identificada pelo id que o Supabase Auth
 * devolve ao validar o token — não mais por uma busca de e-mail em `listUsers()`, que só via
 * as 50 primeiras contas e diferenciava maiúsculas (respondia "Usuário não encontrado no Auth"
 * para contas além da 1ª página, como as recriadas na reativação). Nada vem do navegador
 * além das senhas: não há como apontar outra conta.
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

    // Conta de acesso da própria sessão: id e e-mail como o Auth os conhece.
    const token = req.cookies.get("urbis_token")?.value;
    const { data: authData, error: authError } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: null, error: new Error("sem token") };
    const conta = authData?.user;
    if (authError || !conta?.id || !conta.email) {
      return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });
    }

    const { data: login, error: erroSenhaAtual } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ).auth.signInWithPassword({ email: conta.email, password: senhaAtual });
    // A senha atual tem de ser DESTA conta (mesmo id da sessão).
    if (erroSenhaAtual || login?.user?.id !== conta.id) {
      return NextResponse.json({ ok: false, erro: "Senha atual incorreta" }, { status: 401 });
    }

    const { error: erroTroca } = await supabaseAdmin.auth.admin.updateUserById(conta.id, { password: novaSenha });
    if (erroTroca) return NextResponse.json({ ok: false, erro: erroTroca.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
