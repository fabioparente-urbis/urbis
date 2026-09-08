import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = await req.json();
    if (!email || !senha) {
      return NextResponse.json({ ok: false, erro: "Email e senha obrigatórios" }, { status: 400 });
    }
    const { data: authData, error: authError } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.signInWithPassword({ email, password: senha });
    if (authError || !authData.session) {
      return NextResponse.json({ ok: false, erro: "Email ou senha incorretos" }, { status: 401 });
    }
    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("id, nome, perfil, status")
      .eq("email", email)
      .maybeSingle();
    if (userError || !usuario) {
      return NextResponse.json({ ok: false, erro: "Usuário não encontrado no sistema" }, { status: 403 });
    }
    if (usuario.status !== "Ativo") {
      return NextResponse.json({ ok: false, erro: "Usuário inativo. Entre em contato com o administrador." }, { status: 403 });
    }
    await supabase.from("usuarios").update({ ultimo_acesso: new Date().toISOString() }).eq("id", usuario.id);
    const res = NextResponse.json({
      ok: true,
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, email },
    });
    /**
     * 30 dias, e não mais 8 horas (08/09/2026, pedido do Fábio: "deixa esse trem logado de vez").
     *
     * O problema que isso resolve não era o prazo do cookie: o `access_token` do Supabase vence
     * em ~1 HORA, e o `refresh_token` vinha sendo JOGADO FORA aqui. Passada essa hora, toda
     * chamada voltava 401 e a tela ficava no limbo — sem nome, sem módulos, mas sem mandar pro
     * login ("nem tá logado e nem deslogado"). Guardar o refresh_token é o que permite o
     * `middleware.ts` renovar a sessão sozinho, sem o analista parar o que está fazendo.
     */
    const opcoesCookie = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    };
    res.cookies.set("urbis_token", authData.session.access_token, opcoesCookie);
    res.cookies.set("urbis_refresh", authData.session.refresh_token, opcoesCookie);
    res.cookies.set("urbis_perfil", usuario.perfil, { ...opcoesCookie, httpOnly: false });
    res.cookies.set("urbis_nome", usuario.nome, { ...opcoesCookie, httpOnly: false });
    res.cookies.set("urbis_id", usuario.id, { ...opcoesCookie, httpOnly: false });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}