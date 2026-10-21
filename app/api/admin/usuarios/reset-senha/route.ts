import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdministradorAtivo } from "@/lib/autorizacao";
import { registrarIntencao, registrarResultado } from "@/lib/adminAuditoria";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/usuarios/reset-senha — o Administrador dispara o e-mail de redefinição de
 * senha de um usuário ativo (C1, 21/10/2026).
 *
 * Antes: sem autenticação (qualquer pessoa disparava e-mails para qualquer conta) e com o link
 * apontando para `${SUPABASE_URL}/login` — o endereço do Supabase, não do URBIS. Agora o link
 * leva a `/redefinir-senha` do próprio URBIS, a mesma tela do "Esqueci a senha".
 */
export async function POST(req: NextRequest) {
  const b = await exigirAdministradorAtivo(req, { mutacao: true, acao: "enviar_reset_senha" });
  if (!b.ok) return b.resposta;

  let id: unknown;
  try { ({ id } = await req.json()); } catch { /* cai na validação abaixo */ }
  if (typeof id !== "string" || !UUID.test(id))
    return NextResponse.json({ ok: false, erro: "ID obrigatório" }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("usuarios").select("id, nome, email, status").eq("id", id).maybeSingle();
  const usuario = data as { id: string; nome: string; email: string; status: string } | null;
  if (!usuario?.email) return NextResponse.json({ ok: false, erro: "Usuário não encontrado" }, { status: 404 });
  if (usuario.status !== "Ativo")
    return NextResponse.json({ ok: false, erro: "Usuário inativo — reative o cadastro antes de redefinir a senha." }, { status: 400 });

  let reg;
  try {
    reg = await registrarIntencao(req, b.usuario, "enviar_reset_senha", { id: usuario.id, nome: usuario.nome });
  } catch {
    return NextResponse.json({ ok: false, erro: "Registro de auditoria indisponível — nada foi enviado. Tente novamente." }, { status: 503 });
  }

  // Mesma origem usada por /api/auth/esqueci-senha: a de quem fez a requisição, com
  // NEXT_PUBLIC_APP_URL como override explícito.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const { error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ).auth.resetPasswordForEmail(usuario.email, { redirectTo: `${baseUrl}/redefinir-senha` });

  if (error) {
    await registrarResultado(reg, "falha", {}, error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao enviar o e-mail de redefinição." }, { status: 502 });
  }
  await registrarResultado(reg, "sucesso");
  return NextResponse.json({ ok: true });
}
