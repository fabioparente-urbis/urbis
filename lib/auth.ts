import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PERFIS_IRRESTRITOS,
  isPerfilIrrestrito,
  gerenciaDoPerfil,
  Gerencia,
} from "@/lib/perfis";

// Re-exporta para compatibilidade com codigo existente que importa daqui.
export { PERFIS_IRRESTRITOS };

export type AuthContext = {
  userId: string;
  perfil: string;
  perfis: string[];
  irrestrito: boolean;
  // Gerencia do usuario:
  // - usuarios.gerencia para analistas ('GERECCO' | 'GERAED' | 'GERAGP' | null)
  // - derivada do perfil 'Gerência GERECCO/MP/GP' para gerentes
  // - null para Administrador / Diretora / outros
  gerencia: Gerencia | null;
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
    .select("perfil, perfis, gerencia")
    .eq("id", userId)
    .maybeSingle();
  if (error || !usuario) {
    return NextResponse.json(
      { ok: false, erro: "Usuario nao encontrado" },
      { status: 401 },
    );
  }
  // `perfis` é o array canônico; `perfil` (legado) é mantido por compatibilidade.
  // Se um deles vier preenchido e o outro não, união dos dois.
  const perfisArr: string[] = Array.isArray((usuario as any).perfis)
    ? ((usuario as any).perfis as string[]).filter(Boolean)
    : [];
  if (usuario.perfil && !perfisArr.includes(usuario.perfil)) {
    perfisArr.push(usuario.perfil);
  }

  // gerencia: prioridade ao perfil de gerente (Gerência GERECCO/MP/GP); se nao
  // for gerente, usa usuarios.gerencia (caso seja analista).
  const gerenciaPerfil = gerenciaDoPerfil(perfisArr);
  const gerenciaUsuario = (usuario as any).gerencia as Gerencia | null | undefined;
  const gerencia: Gerencia | null =
    gerenciaPerfil ?? (gerenciaUsuario ?? null);

  return {
    userId,
    perfil: usuario.perfil ?? perfisArr[0] ?? "",
    perfis: perfisArr,
    irrestrito: isPerfilIrrestrito(perfisArr.length > 0 ? perfisArr : usuario.perfil),
    gerencia,
  };
}

/**
 * Garante que o usuario tem permissao para acessar um processo.
 * - Perfis irrestritos (Administrador / Diretora) sempre passam.
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
