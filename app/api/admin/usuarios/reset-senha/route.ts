import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirAdministradorAtivo } from "@/lib/autorizacao";
import { registrarIntencao, registrarResultado } from "@/lib/adminAuditoria";
import { buscarContaAuthPorEmail } from "@/lib/contasAuth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/usuarios/reset-senha — o Administrador dispara o e-mail de redefinição de
 * senha de um usuário ativo (C1, 21/10/2026).
 *
 * Antes: sem autenticação (qualquer pessoa disparava e-mails para qualquer conta) e com o link
 * apontando para `${SUPABASE_URL}/login` — o endereço do Supabase, não do URBIS. Agora o link
 * leva a `/redefinir-senha` do próprio URBIS, a mesma tela do "Esqueci a senha".
 *
 * A conta de acesso é conferida ANTES do envio: o Supabase responde "ok" mesmo quando o e-mail
 * não tem conta (por desenho, contra enumeração), e a tela dizia "e-mail enviado" sem nada sair.
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

  // Sem conta de acesso no Auth não há o que redefinir — e o Supabase não avisaria.
  let temConta: boolean;
  try {
    temConta = !!(await buscarContaAuthPorEmail(usuario.email));
  } catch {
    return NextResponse.json({ ok: false, erro: "Nenhum e-mail foi enviado: não foi possível consultar a conta de acesso. Tente novamente." }, { status: 502 });
  }
  if (!temConta) {
    return NextResponse.json({
      ok: false,
      code: "SEM_CONTA_AUTH",
      erro: "Nenhum e-mail foi enviado: este cadastro não tem conta de acesso no Auth. Recuperação: Editar → digite uma Nova senha → Salvar; o sistema oferece criar a conta de acesso.",
    }, { status: 409 });
  }

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
