import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PERFIS_IRRESTRITOS, isPerfilIrrestrito } from "@/lib/perfis";

// Re-exporta para compatibilidade com codigo existente que importa daqui.
export { PERFIS_IRRESTRITOS };

export type AuthContext = {
  userId: string;
  perfil: string;
  irrestrito: boolean;
};

/**
 * Identifica o usuario logado via cookie urbis_id (mesmo padrao de /api/auth/me)
 * e busca o perfil direto no banco — o cookie urbis_perfil tem httpOnly:false
 * e e adulteravel pelo cliente, entao nao deve ser fonte de autoridade.
 *
 * Em caso de falha, retorna NextResponse com 401. Em sucesso, retorna AuthContext.
 */
export async function autenticar(
  req: NextRequest,
): Promise<AuthContext | NextResponse> {
  const cookieHeader = req.headers.get("cookie") || "";
  const userId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1];
  if (!userId) {
    return NextResponse.json(
      { ok: false, erro: "Nao autenticado" },
      { status: 401 },
    );
  }
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("perfil")
    .eq("id", userId)
    .maybeSingle();
  if (error || !usuario) {
    return NextResponse.json(
      { ok: false, erro: "Usuario nao encontrado" },
      { status: 401 },
    );
  }
  return {
    userId,
    perfil: usuario.perfil,
    irrestrito: isPerfilIrrestrito(usuario.perfil),
  };
}

/**
 * Garante que o usuario tem permissao para acessar um processo.
 * - Perfis irrestritos (Administrador/Gerente/Diretor) sempre passam.
 * - Demais perfis so passam se o processo estiver atribuido a eles.
 *
 * Retorna NextResponse com 403 quando deve bloquear; null quando autoriza.
 */
export function verificarOwnership(
  ctx: AuthContext,
  processoAnalistaId: string | null | undefined,
): NextResponse | null {
  if (ctx.irrestrito) return null;
  if (processoAnalistaId !== ctx.userId) {
    return NextResponse.json(
      { ok: false, erro: "Sem permissao para acessar este processo" },
      { status: 403 },
    );
  }
  return null;
}
