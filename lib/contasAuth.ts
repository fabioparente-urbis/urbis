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

export class ErroAuth extends Error {}

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
