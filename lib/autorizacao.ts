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

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPerfilIrrestrito, gerenciaDoPerfil } from "@/lib/perfis";

export type UsuarioReq = {
  id: string;
  perfis: string[];
  gerencia: string | null;
  irrestrito: boolean;
  gerenciaDoPerfil: string | null;
};

/** Usuário da requisição, pelo cookie `urbis_id`. Devolve null se não houver sessão. */
export async function usuarioDaRequisicao(req: NextRequest): Promise<UsuarioReq | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const userId = cookie.match(/urbis_id=([^;]+)/)?.[1];
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;

  const { data } = await supabaseAdmin
    .from("usuarios")
    .select("id, perfis, gerencia")
    .eq("id", userId)
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
