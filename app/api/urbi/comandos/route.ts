import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

/**
 * Registro dos comandos de voz do URBI.
 *
 * Guarda o TEXTO entendido e a AÇÃO executada — nunca o áudio bruto. Ver o
 * cabeçalho de supabase/migrations/2026_09_02_urbi_comandos_voz.sql para o
 * porquê.
 *
 * Quem vê o quê: cada usuário só enxerga os próprios comandos; Administrador
 * vê todos. A separação é feita aqui, na rota, e não por policy de RLS —
 * o app inteiro fala com o banco pela service_role e a identidade vem do
 * cookie urbis_id validado em lib/auth.ts, então não existe sessão de banco
 * para uma policy avaliar. É o mesmo desenho de /api/urbi/historico.
 */

const ORIGENS = new Set(["webspeech", "whisper", "texto"]);

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  const { texto, origem, intencao_id, acao_tipo, acao_alvo, executado, confirmado, duracao_ms, erro } =
    body as Record<string, unknown>;

  if (typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ ok: false, erro: "texto é obrigatório." }, { status: 400 });
  }

  // Identidade sempre da sessão — usuario_id do cliente é ignorado de
  // propósito, para ninguém registrar comando no nome de outro.
  const { data: usuario } = await supabase
    .from("usuarios").select("nome").eq("id", ctx.userId).maybeSingle();

  const { error } = await supabase.from("urbi_comandos_voz").insert({
    usuario_id: ctx.userId,
    usuario_nome: usuario?.nome ?? null,
    texto: texto.slice(0, 2000),
    origem: typeof origem === "string" && ORIGENS.has(origem) ? origem : "webspeech",
    intencao_id: typeof intencao_id === "string" ? intencao_id : null,
    acao_tipo: typeof acao_tipo === "string" ? acao_tipo : null,
    acao_alvo: typeof acao_alvo === "string" ? acao_alvo : null,
    executado: executado === true,
    confirmado: typeof confirmado === "boolean" ? confirmado : null,
    duracao_ms: Number.isFinite(duracao_ms as number) ? (duracao_ms as number) : null,
    erro: typeof erro === "string" ? erro.slice(0, 500) : null,
    // audio_path fica NULL: nesta fase não se guarda áudio bruto.
  });

  if (error) {
    console.error("[urbi/comandos POST] falha ao registrar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao registrar comando." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
  const usuario = searchParams.get("usuario");

  let query = supabase
    .from("urbi_comandos_voz")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limit);

  if (ctx.perfis.includes("Administrador")) {
    // Acesso administrativo justificado: é quem responde pelo custo das
    // chamadas de voz e pelo uso indevido do assistente.
    if (usuario) query = query.eq("usuario_id", usuario);
  } else {
    // Qualquer outro perfil: só os próprios comandos, filtro de terceiro ignorado.
    query = query.eq("usuario_id", ctx.userId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[urbi/comandos GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar comandos." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, data });
}
