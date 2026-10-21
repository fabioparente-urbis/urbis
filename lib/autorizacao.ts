/**
 * lib/autorizacao.ts — quem é o usuário da requisição, e a que processo ele pode chegar.
 *
 * Existe porque o MHD usa a **service role**, que IGNORA o RLS. Com o cliente anônimo, uma
 * consulta indevida era barrada pelo banco; com service role, quem barra é este arquivo. Sem ele,
 * `GET /api/mhd?processo=X` seria leitura irrestrita de qualquer processo por quem souber a URL.
 *
 * Regra de visibilidade, a mesma já praticada na listagem do MDP:
 *   · perfil irrestrito (Administrador, Diretor/a) → vê tudo
 *   · perfil de gerência                          → vê os processos da sua gerência
 *   · analista                                    → vê os processos em que é o analista
 *
 * Processo sem `analista_id` e sem `gerencia` (recém-cadastrado) fica visível a qualquer usuário
 * autenticado — é o comportamento de hoje na tela do processo, e endurecer isso aqui quebraria o
 * cadastro de processo novo.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPerfilIrrestrito, gerenciaDoPerfil } from "@/lib/perfis";

export type UsuarioReq = {
  id: string;
  perfis: string[];
  gerencia: string | null;
  irrestrito: boolean;
  gerenciaDoPerfil: string | null;
};

/**
 * Usuário da requisição, validado pelo token de sessão do Supabase (cookie
 * `urbis_token`) — nunca pelo `urbis_id`, que é httpOnly:false e adulterável
 * (uma requisição direta com `Cookie: urbis_id=<uuid-alheio>` seria aceita
 * como qualquer usuário). Devolve null se não houver sessão válida.
 */
export async function usuarioDaRequisicao(req: NextRequest): Promise<UsuarioReq | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie.match(/urbis_token=([^;]+)/)?.[1];
  if (!token) return null;

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.email) return null;

  const { data } = await supabaseAdmin
    .from("usuarios")
    .select("id, perfis, gerencia")
    .eq("email", authData.user.email)
    .maybeSingle();
  if (!data) return null;

  const perfis: string[] = data.perfis ?? [];
  return {
    id: data.id,
    perfis,
    gerencia: data.gerencia ?? null,
    irrestrito: isPerfilIrrestrito(perfis),
    gerenciaDoPerfil: gerenciaDoPerfil(perfis) ?? null,
  };
}

export type Autorizacao =
  | { ok: true; processoId: string | null; assuntoId: string | null }
  | { ok: false; status: 401 | 403 | 404; erro: string };

/**
 * Pode este usuário ver/alterar este processo?
 *
 * Não confia no `processo_codigo` que veio do cliente: resolve o processo no banco e compara o
 * dono/gerência com o perfil de quem pediu.
 */
export async function podeAcessarProcesso(
  usuario: UsuarioReq | null,
  processoCodigo: string,
): Promise<Autorizacao> {
  if (!usuario) return { ok: false, status: 401, erro: "Sessão não encontrada" };
  if (!processoCodigo?.trim()) return { ok: false, status: 404, erro: "Processo não informado" };

  const { data: proc } = await supabaseAdmin
    .from("processos")
    .select("id, analista_id, gerencia, assunto_id, excluido_em")
    .eq("codigo", processoCodigo)
    .maybeSingle();

  // processo ainda não cadastrado: a leitura pode acontecer antes do cadastro existir
  if (!proc) return { ok: true, processoId: null, assuntoId: null };

  if (usuario.irrestrito) return { ok: true, processoId: proc.id, assuntoId: proc.assunto_id ?? null };

  const semDono = !proc.analista_id && !proc.gerencia;
  const meu = proc.analista_id === usuario.id;
  const daMinhaGerencia =
    !!usuario.gerenciaDoPerfil && proc.gerencia === usuario.gerenciaDoPerfil;

  if (semDono || meu || daMinhaGerencia) {
    return { ok: true, processoId: proc.id, assuntoId: proc.assunto_id ?? null };
  }
  return { ok: false, status: 403, erro: "Sem permissão para este processo" };
}

/** Atalho para rotas: resolve usuário e permissão numa chamada. */
export async function autorizar(req: NextRequest, processoCodigo: string): Promise<Autorizacao> {
  return podeAcessarProcesso(await usuarioDaRequisicao(req), processoCodigo);
}

// ─────────────────────────────────────────────────────────────────────────────
// Barreira das rotas do C1 (gestão de usuários, diretório, Pilha, atribuição) — 21/10/2026.
//
// Diferenças em relação a `usuarioDaRequisicao()` / `autenticar()`, que continuam como estão
// para não mudar o comportamento das demais rotas antes da etapa E4:
//   1. confere `usuarios.status = 'Ativo'` a cada requisição — conta desativada com sessão
//      antiga é barrada na hora, não só no próximo login;
//   2. nas requisições que alteram dados, exige `Origin` do próprio URBIS e corpo JSON
//      (defesa contra CSRF que não depende de `SameSite`, ver a nota em `origemConfiavel`);
//   3. devolve a resposta de recusa pronta, para a rota só repassar.
// A presença do cookie nunca basta: o token é sempre validado no servidor de Auth do Supabase.
// ─────────────────────────────────────────────────────────────────────────────

export type UsuarioAtivo = UsuarioReq & {
  nome: string;
  email: string;
  ehAdministrador: boolean;
};

type LinhaCadastro = {
  id: string;
  nome: string;
  email: string;
  perfil: string | null;
  perfis: string[] | null;
  gerencia: string | null;
  status: string;
};

export type Barreira =
  | { ok: true; usuario: UsuarioAtivo }
  | { ok: false; resposta: NextResponse };

function recusa(status: 401 | 403, erro: string, detalhe?: string): Barreira {
  return {
    ok: false,
    resposta: NextResponse.json({ ok: false, erro, ...(detalhe ? { detalhe } : {}) }, { status }),
  };
}

/**
 * A requisição veio de uma página do próprio URBIS?
 *
 * `SameSite=Lax` não basta como defesa: ele compara *site*, não *origem*, e se o sufixo
 * `up.railway.app` não estiver na Public Suffix List, qualquer outro app hospedado no Railway
 * seria "o mesmo site" e receberia os cookies. Por isso a origem é conferida aqui, contra o
 * `Host` que o próprio navegador mandou — um site de terceiros não consegue forjar nem o
 * `Origin` nem o `Host` de uma requisição feita pelo navegador da vítima.
 * `NEXT_PUBLIC_APP_URL`, se configurada, também vale (domínio próprio no futuro).
 */
export function origemConfiavel(req: NextRequest): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return false;
  let hostOrigem: string;
  try {
    hostOrigem = new URL(origem).host.toLowerCase();
  } catch {
    return false;
  }
  // Atrás do proxy do Railway, o domínio público pode vir em `x-forwarded-host` e/ou em `host`;
  // aceita qualquer um dos dois (nenhum deles é forjável por um site de terceiros no navegador
  // da vítima — são cabeçalhos proibidos ao JavaScript de outra origem).
  const permitidos = new Set<string>();
  for (const h of [req.headers.get("x-forwarded-host"), req.headers.get("host")]) {
    const v = (h ?? "").split(",")[0].trim().toLowerCase();
    if (v) permitidos.add(v);
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try { permitidos.add(new URL(appUrl).host.toLowerCase()); } catch { /* valor inválido: ignora */ }
  }
  const ok = permitidos.has(hostOrigem);
  if (!ok) console.warn("[barreira] origem recusada:", hostOrigem, "| esperado:", Array.from(permitidos).join(", "));
  return ok;
}

function corpoJson(req: NextRequest): boolean {
  return (req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/**
 * Usuário com sessão válida E cadastro ativo. Com `mutacao: true`, exige também origem do
 * próprio URBIS e corpo JSON — conferidos ANTES de consultar qualquer coisa.
 */
export async function exigirUsuarioAtivo(
  req: NextRequest,
  opcoes: { mutacao?: boolean } = {},
): Promise<Barreira> {
  if (opcoes.mutacao) {
    if (!origemConfiavel(req)) return recusa(403, "ORIGEM_INVALIDA");
    if (!corpoJson(req)) return recusa(403, "CONTEUDO_INVALIDO", "Envie o corpo como application/json.");
  }

  const token = req.cookies.get("urbis_token")?.value;
  if (!token) return recusa(401, "SESSAO_EXPIRADA");

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.email) return recusa(401, "SESSAO_EXPIRADA");

  const { data } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, email, perfil, perfis, gerencia, status")
    .eq("email", authData.user.email)
    .maybeSingle();
  const linha = data as LinhaCadastro | null;
  if (!linha) return recusa(401, "SESSAO_EXPIRADA");
  if (linha.status !== "Ativo") return recusa(401, "USUARIO_INATIVO");

  // `perfis` é o canônico; `perfil` (legado) entra na união, como em lib/auth.ts.
  const perfis: string[] = Array.isArray(linha.perfis) ? linha.perfis.filter(Boolean) : [];
  if (linha.perfil && !perfis.includes(linha.perfil)) perfis.push(linha.perfil);

  return {
    ok: true,
    usuario: {
      id: linha.id,
      nome: linha.nome,
      email: linha.email,
      perfis,
      gerencia: linha.gerencia ?? null,
      irrestrito: isPerfilIrrestrito(perfis),
      gerenciaDoPerfil: gerenciaDoPerfil(perfis) ?? null,
      ehAdministrador: perfis.includes("Administrador"),
    },
  };
}

/**
 * Administrador com sessão válida e cadastro ativo. Recusa de perfil de quem ESTÁ logado fica
 * registrada em `admin_auditoria` (tentativa de administrar sem poder). Recusa anônima não é
 * gravada — gravar no banco a pedido de quem nem se identificou abriria outra porta de abuso.
 */
export async function exigirAdministradorAtivo(
  req: NextRequest,
  opcoes: { mutacao?: boolean; acao: string },
): Promise<Barreira> {
  const b = await exigirUsuarioAtivo(req, { mutacao: opcoes.mutacao });
  if (!b.ok) return b;
  if (!b.usuario.ehAdministrador) {
    const { registrarRecusa } = await import("@/lib/adminAuditoria");
    await registrarRecusa(req, b.usuario, opcoes.acao, "perfil sem poder de administração de contas");
    return recusa(403, "Acesso restrito ao Administrador.");
  }
  return b;
}
