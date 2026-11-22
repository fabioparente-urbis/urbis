import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exigirUsuarioAtivo } from "@/lib/autorizacao";

/**
 * GET /api/usuarios/diretorio — quem pode RECEBER um processo, no escopo de quem pergunta
 * (C1, 21/10/2026).
 *
 * Substitui o uso que a Pilha fazia de /api/admin/usuarios (que entregava o cadastro completo de
 * todos a qualquer pessoa). Aqui só saem `id`, `nome` e `gerencia` — nada de e-mail, telefone,
 * matrícula ou status — e só de contas ATIVAS:
 *   · Administrador, Diretora/Diretor → todos os elegíveis (D3: a Diretora distribui entre gerências);
 *   · gerente ("Gerência GERxxx")     → só os elegíveis da própria gerência (D2);
 *   · analista                         → 403 (não atribui processos).
 *
 * Elegível = perfil Analista ou Administrador (o Administrador também produz — ver PERFIS_SEM_META
 * em /api/admin/usuarios). Nome de analista em processo já atribuído, inclusive inativo, não vem
 * daqui: vem junto do processo, em /api/processos (`analista_nome`).
 */
export async function GET(req: NextRequest) {
  const b = await exigirUsuarioAtivo(req);
  if (!b.ok) return b.resposta;
  const u = b.usuario;

  const escopoTotal = u.ehAdministrador || u.irrestrito;
  if (!escopoTotal && !u.gerenciaDoPerfil) {
    return NextResponse.json({ ok: false, erro: "Sem permissão para atribuir processos." }, { status: 403 });
  }

  let q = supabaseAdmin
    .from("usuarios")
    .select("id, nome, gerencia")
    .eq("status", "Ativo")
    .or("perfis.cs.{Analista},perfis.cs.{Administrador},perfil.eq.Analista,perfil.eq.Administrador")
    .order("nome");
  if (!escopoTotal) q = q.eq("gerencia", u.gerenciaDoPerfil as string);

  const { data, error } = await q;
  if (error) {
    console.error("[usuarios/diretorio]", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao carregar o diretório." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data: data ?? [] });
}
