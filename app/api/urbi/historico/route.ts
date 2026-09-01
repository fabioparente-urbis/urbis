import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// Histórico de conversas do URBI — cada usuário só acessa o próprio; ver
// histórico de terceiros (filtro por `analista`, ou nenhum filtro) exige
// Administrador.
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const analista = searchParams.get("analista");
  const linha = searchParams.get("linha");
  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  let query = supabase
    .from("urbi_historico")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limit);

  if (ctx.perfis.includes("Administrador")) {
    if (analista) query = query.eq("usuario_nome", analista);
  } else {
    // Não-administrador: ignora qualquer filtro por outro nome e vê só o próprio.
    query = query.eq("usuario_id", ctx.userId);
  }
  if (linha) query = query.eq("linha", linha);

  const { data, error } = await query;
  if (error) {
    console.error("[urbi/historico GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar histórico." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }
  const { mensagem_usuario, resposta_urbi, linha, pose_usada } = body as Record<string, unknown>;
  if (typeof mensagem_usuario !== "string" || !mensagem_usuario.trim()) {
    return NextResponse.json({ ok: false, erro: "mensagem_usuario é obrigatória." }, { status: 400 });
  }
  if (typeof resposta_urbi !== "string") {
    return NextResponse.json({ ok: false, erro: "resposta_urbi é obrigatória." }, { status: 400 });
  }

  // Identidade sempre da sessão — usuario_id/usuario_nome enviados pelo
  // cliente são ignorados.
  const { data: usuario } = await supabase.from("usuarios").select("nome").eq("id", ctx.userId).maybeSingle();

  const { error } = await supabase.from("urbi_historico").insert({
    usuario_id: ctx.userId,
    usuario_nome: usuario?.nome ?? ctx.perfil,
    mensagem_usuario,
    resposta_urbi,
    linha: typeof linha === "string" ? linha : "geral",
    pose_usada: typeof pose_usada === "string" ? pose_usada : null,
  });
  if (error) {
    console.error("[urbi/historico POST] falha ao gravar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao gravar histórico." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
