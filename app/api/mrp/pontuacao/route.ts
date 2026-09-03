import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const [{ data, error }, { data: historico, error: erroHist }] = await Promise.all([
    supabaseAdmin.from("mrp_pontuacao").select("*").order("ordem"),
    supabaseAdmin.from("mrp_pontuacao_historico").select("regra_id, pontos, vigente_desde"),
  ]);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (erroHist) return NextResponse.json({ ok: false, erro: erroHist.message }, { status: 500 });
  return NextResponse.json({ ok: true, data, historico });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfis.includes("Administrador"))
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const { id, pontos, descricao } = body;
  if (!id || pontos === undefined)
    return NextResponse.json({ ok: false, erro: "id e pontos obrigatórios" }, { status: 400 });

  // "yyyy-mm-dd"; sem informar, vale a partir de hoje.
  const vigenteDesde = (body.vigente_desde ? String(body.vigente_desde) : new Date().toISOString()).slice(0, 10);

  // Toda edição vira uma linha nova no histórico — nunca sobrescreve o
  // que já vigorou. mrp_pontuacao.pontos só é atualizado (cache do valor
  // vigente HOJE) quando a vigência já começou; uma edição vigente no
  // futuro fica só no histórico até a data chegar.
  const { error: erroHist } = await supabaseAdmin.from("mrp_pontuacao_historico").insert({
    regra_id: id,
    pontos: Number(pontos),
    vigente_desde: vigenteDesde,
    criado_por: auth.userId,
  });
  if (erroHist) return NextResponse.json({ ok: false, erro: erroHist.message }, { status: 500 });

  const hoje = new Date().toISOString().slice(0, 10);
  if (vigenteDesde <= hoje) {
    const { error } = await supabaseAdmin
      .from("mrp_pontuacao").update({ pontos: Number(pontos), descricao }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  } else if (descricao !== undefined) {
    const { error } = await supabaseAdmin.from("mrp_pontuacao").update({ descricao }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
