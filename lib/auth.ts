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
  _renovarCookie?: boolean;
};

/**
 * Identifica o usuario logado validando o token de sessão do Supabase
 * (cookie urbis_token) direto no servidor de Auth — nunca confia em
 * urbis_id/urbis_perfil/urbis_nome, que são cookies httpOnly:false e portanto
 * adulteráveis pelo cliente (bastava enviar `Cookie: urbis_id=<uuid-alheio>`
 * para uma requisição direta à API ser aceita como qualquer usuário, perfil
 * incluído — inclusive Administrador). A identidade confiável é sempre a que
 * o Supabase Auth devolve para o token validado, mapeada para `usuarios` pelo
 * e-mail (usuarios.id não é o mesmo id de auth.users).
 *
 * Em caso de falha, retorna NextResponse com 401. Em sucesso, retorna AuthContext.
 */
export async function autenticar(
  req: NextRequest,
): Promise<AuthContext | NextResponse> {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader.match(/urbis_token=([^;]+)/)?.[1];
  if (!token) {
    return NextResponse.json(
      { ok: false, erro: "SESSAO_EXPIRADA" },
      { status: 401 },
    );
  }
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    return NextResponse.json(
      { ok: false, erro: "SESSAO_EXPIRADA" },
      { status: 401 },
    );
  }
  const { data: usuario, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, perfil, perfis, gerencia")
    .eq("email", authData.user.email)
    .maybeSingle();
  if (error || !usuario) {
    return NextResponse.json(
      { ok: false, erro: "SESSAO_EXPIRADA" },
      { status: 401 },
    );
  }
  const userId = usuario.id as string;
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
    _renovarCookie: true, // sinal para a rota renovar o cookie urbis_id
  };
}

/**
 * Versão enxuta de `autenticar()` para código que só tem o header Cookie cru
 * (não um NextRequest) — os gravadores server-only dos satélites (MDP, MRP)
 * e as rotas de numeração. Mesma validação: token do Supabase, nunca
 * `urbis_id`. Devolve só o id em `usuarios`, ou null se a sessão não valida.
 */
export async function resolverUsuarioIdPorCookie(cookieHeader: string): Promise<string | null> {
  const token = cookieHeader.match(/urbis_token=([^;]+)/)?.[1];
  if (!token) return null;
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.email) return null;
  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("email", authData.user.email)
    .maybeSingle();
  return usuario?.id ?? null;
}

/** Aplica renovação do cookie urbis_id na response (estende por mais 8h). */
export function renovarCookieAuth(res: NextResponse, userId: string): NextResponse {
  const opcoes = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 8,
    path: "/",
  };
  res.cookies.set("urbis_id", userId, opcoes);
  return res;
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
