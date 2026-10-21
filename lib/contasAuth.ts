/**
 * lib/contasAuth.ts — operações na conta do Supabase Auth ligada a um cadastro de `usuarios`
 * (C1, 21/10/2026). Só servidor: usa a service_role.
 *
 * Enquanto o cadastro não guardar o id da conta do Auth (etapa E4), a ligação é pelo e-mail.
 * A busca antiga (`listUsers()` sem paginação) só olhava os 50 primeiros: acima disso a troca de
 * senha "dava certo" sem trocar nada. Aqui a busca percorre todas as páginas e diferencia
 * "não existe" de "não consegui consultar".
 */

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const POR_PAGINA = 200;
const MAX_PAGINAS = 100; // 20 mil contas — muito acima do tamanho da diretoria

export class ErroAuth extends Error {
  /** true quando o Auth recusou porque o e-mail já tem conta. */
  jaExiste = false;
}

/** Conta do Auth pelo e-mail. `null` = não existe. Lança `ErroAuth` se a consulta falhar. */
export async function buscarContaAuthPorEmail(email: string): Promise<{ id: string } | null> {
  const alvo = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw new ErroAuth(`consulta ao Auth falhou: ${error.message}`);
    const usuarios = data?.users ?? [];
    const achado = usuarios.find((u) => (u.email ?? "").toLowerCase() === alvo);
    if (achado) return { id: achado.id };
    if (usuarios.length < POR_PAGINA) return null;
  }
  throw new ErroAuth("consulta ao Auth excedeu o número máximo de páginas");
}

/**
 * Bloqueio no Auth para conta desativada: impede login e renovação da sessão. O token de acesso
 * já emitido ainda vale até expirar (~1 h) nas rotas que não conferem `status` — as do C1
 * conferem a cada requisição (lib/autorizacao.ts → exigirUsuarioAtivo).
 */
export async function banirConta(authId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, { ban_duration: "876000h" });
  if (error) throw new ErroAuth(`bloqueio no Auth falhou: ${error.message}`);
}

export async function desbanirConta(authId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, { ban_duration: "none" });
  if (error) throw new ErroAuth(`desbloqueio no Auth falhou: ${error.message}`);
}

export async function definirSenha(authId: string, senha: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authId, { password: senha });
  if (error) throw new ErroAuth(`troca de senha no Auth falhou: ${error.message}`);
}

/** Senha aleatória que ninguém conhece — usada para obrigar a redefinição (P5). */
export function senhaDescartavel(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Cria a conta de acesso. Com `bloqueada`, ela já nasce banida — um cadastro Inativo nunca tem
 * uma conta de acesso livre, nem por um instante. Lança `ErroAuth` (com `jaExiste` quando o
 * e-mail já tem conta no Auth).
 */
export async function criarConta(email: string, senha: string, bloqueada: boolean): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    ...(bloqueada ? { ban_duration: "876000h" } : {}),
  });
  if (error || !data?.user) {
    const e = new ErroAuth(`criação da conta de acesso falhou: ${error?.message ?? "sem conta no retorno"}`);
    // Só "e-mail já cadastrado" — um 422 genérico (ex.: senha fraca) NÃO é conta órfã.
    const code = (error as { code?: string } | null)?.code;
    e.jaExiste = code === "email_exists" || /already (been )?registered|already exists/i.test(error?.message ?? "");
    throw e;
  }
  return data.user.id;
}

/** A conta está bloqueada (banida) neste momento? Lança `ErroAuth` se não conseguir consultar. */
export async function contaEstaBloqueada(authId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authId);
  if (error || !data?.user) throw new ErroAuth(`consulta à conta de acesso falhou: ${error?.message ?? "não encontrada"}`);
  const ate = (data.user as { banned_until?: string | null }).banned_until;
  return !!ate && new Date(ate).getTime() > Date.now();
}

export async function excluirConta(authId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
  if (error) throw new ErroAuth(`exclusão da conta de acesso falhou: ${error.message}`);
}
