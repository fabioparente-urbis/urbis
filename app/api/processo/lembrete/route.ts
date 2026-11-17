import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRequisicao, podeAcessarProcesso } from "@/lib/autorizacao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX = 1000;

// GET — todos os lembretes que ESTE usuário pode ver:
//   · os seus; · Gerente: os de usuários da sua gerência; · Diretor/a e Administrador: todos.
export async function GET(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  let q = supabaseAdmin
    .from("processo_lembretes")
    .select("id, processo_codigo, usuario_id, texto, atualizado_em, usuarios!inner(nome, gerencia)")
    .order("atualizado_em", { ascending: false })
    .limit(2000);
  if (!u.irrestrito) {
    let ids = [u.id];
    if (u.gerenciaDoPerfil) {
      const { data: da } = await supabaseAdmin.from("usuarios").select("id").eq("gerencia", u.gerenciaDoPerfil);
      ids = [u.id, ...(da ?? []).map((x: any) => x.id)];
    }
    q = q.in("usuario_id", ids);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lembretes = (data ?? []).map((r: any) => ({
    id: r.id, processo: r.processo_codigo, usuarioId: r.usuario_id,
    autor: r.usuarios?.nome ?? "—", texto: r.texto, atualizadoEm: r.atualizado_em,
    meu: r.usuario_id === u.id,
  }));
  return NextResponse.json({ ok: true, lembretes });
}

// POST { processo, texto } — grava o lembrete PRÓPRIO. Texto vazio apaga.
export async function POST(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const processo = String(body.processo ?? "").trim();
  const texto = String(body.texto ?? "").trim().slice(0, MAX);
  if (!processo) return NextResponse.json({ ok: false, erro: "processo obrigatório" }, { status: 400 });

  const aut = await podeAcessarProcesso(u, processo);
  if (!aut.ok) return NextResponse.json({ ok: false, erro: aut.erro }, { status: aut.status });

  if (!texto) {
    const { error } = await supabaseAdmin.from("processo_lembretes").delete()
      .eq("processo_codigo", processo).eq("usuario_id", u.id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, apagado: true });
  }
  const { error } = await supabaseAdmin.from("processo_lembretes").upsert(
    { processo_codigo: processo, usuario_id: u.id, texto, atualizado_em: new Date().toISOString() },
    { onConflict: "processo_codigo,usuario_id" },
  );
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
