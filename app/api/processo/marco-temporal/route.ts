import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRequisicao, podeAcessarProcesso } from "@/lib/autorizacao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * "Marco Temporal atendido?" — decisão do ANALISTA no MAC dos Slots 1-4 (Fábio, 18/11/2026).
 * Grava na tabela `processo_marco_temporal` (não em processos.dados: o salvar do LIP regrava `dados` inteiro).
 * Com "sim", o URBI para de mostrar o aviso "Marco temporal não atendido" (lib/bdi/vigia.ts).
 * Só computador: nunca expor em /api/mobile/*.
 */
export async function GET(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  const codigo = new URL(req.url).searchParams.get("codigo") ?? "";
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
  const aut = await podeAcessarProcesso(u, codigo);
  if (!aut.ok) return NextResponse.json({ ok: false, erro: aut.erro }, { status: aut.status });
  const { data } = await supabaseAdmin.from("processo_marco_temporal").select("valor").eq("processo_codigo", codigo).maybeSingle();
  const v = (data as any)?.valor ?? null;
  return NextResponse.json({ ok: true, valor: v === "sim" || v === "nao" ? v : null });
}

export async function POST(req: NextRequest) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? "").trim();
  const valor = body.valor === "sim" || body.valor === "nao" ? body.valor : null;
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
  const aut = await podeAcessarProcesso(u, codigo);
  if (!aut.ok) return NextResponse.json({ ok: false, erro: aut.erro }, { status: aut.status });

  const { error } = valor
    ? await supabaseAdmin.from("processo_marco_temporal").upsert(
        { processo_codigo: codigo, valor, usuario_id: u.id, atualizado_em: new Date().toISOString() },
        { onConflict: "processo_codigo" })
    : await supabaseAdmin.from("processo_marco_temporal").delete().eq("processo_codigo", codigo);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, valor });
}
