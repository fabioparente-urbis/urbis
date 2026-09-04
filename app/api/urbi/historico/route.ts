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
  // Busca livre em mensagem/resposta — usada pelo módulo /admin/urbi (aba
  // Conversas). Escapa "%"/"_"/"," antes do .or() pelo mesmo motivo de
  // lib/mac/vinculosFila.ts: caractere de curinga/separador do PostgREST não
  // filtrado vira busca errada ou erro de sintaxe, nunca vazamento de dado,
  // mas o resultado fica errado em silêncio se não escapar.
  const busca = searchParams.get("busca")?.trim();
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
  if (busca) {
    const escapado = busca.replace(/[%_,]/g, (c) => `\\${c}`);
    query = query.or(`mensagem_usuario.ilike.%${escapado}%,resposta_urbi.ilike.%${escapado}%`);
  }

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
  const { mensagem_usuario, resposta_urbi, linha, pose_usada, processo_codigo, tipo_processo, fontes_tipos } = body as Record<string, unknown>;
  if (typeof mensagem_usuario !== "string" || !mensagem_usuario.trim()) {
    return NextResponse.json({ ok: false, erro: "mensagem_usuario é obrigatória." }, { status: 400 });
  }
  if (typeof resposta_urbi !== "string") {
    return NextResponse.json({ ok: false, erro: "resposta_urbi é obrigatória." }, { status: 400 });
  }

  // Identidade sempre da sessão — usuario_id/usuario_nome enviados pelo
  // cliente são ignorados.
  const { data: usuario } = await supabase.from("usuarios").select("nome").eq("id", ctx.userId).maybeSingle();

  // Fase AB (04/09/2026) — rastreabilidade do Co-Analista: qual processo/slot e que TIPOS de
  // fonte (nunca o conteúdo delas) alimentaram a resposta, pra conferência futura sem duplicar
  // dado pessoal — mensagem_usuario/resposta_urbi já cobrem o texto da conversa, isto aqui só
  // classifica a interação. Ausente (papo geral, sem processo em contexto) grava null/vazio.
  const { error } = await supabase.from("urbi_historico").insert({
    usuario_id: ctx.userId,
    usuario_nome: usuario?.nome ?? ctx.perfil,
    mensagem_usuario,
    resposta_urbi,
    linha: typeof linha === "string" ? linha : "geral",
    pose_usada: typeof pose_usada === "string" ? pose_usada : null,
    processo_codigo: typeof processo_codigo === "string" && processo_codigo.trim() ? processo_codigo.trim() : null,
    tipo_processo: typeof tipo_processo === "string" && tipo_processo.trim() ? tipo_processo.trim() : null,
    fontes_tipos: Array.isArray(fontes_tipos) ? fontes_tipos.filter((f): f is string => typeof f === "string") : null,
  });
  if (error) {
    console.error("[urbi/historico POST] falha ao gravar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao gravar histórico." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
