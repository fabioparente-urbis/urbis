import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar, AuthContext } from "@/lib/auth";

// ===========================================================================
// BDI — Snapshot de mrp_registros
// ===========================================================================
// Endpoint acionado pelo botão "Gerar Backup" (tela /admin/backup). Consolida
// os registros de mrp_registros em JSON estático e grava em bdi_snapshots.
//
// Restrito ao perfil Administrador (mesmo gate do backup).
// ===========================================================================

async function autenticarAdmin(
  req: NextRequest,
): Promise<AuthContext | NextResponse> {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.perfis.includes("Administrador")) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito ao Administrador." },
      { status: 403 },
    );
  }
  return auth;
}

// ---------- POST: gerar snapshot --------------------------------------------
export async function POST(req: NextRequest) {
  const auth = await autenticarAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { origem?: unknown; observacoes?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // body opcional — segue sem ele
  }
  const origem: string =
    typeof body.origem === "string" && body.origem.trim()
      ? body.origem.trim()
      : "backup_manual";
  const observacoes: string | null =
    typeof body.observacoes === "string" ? body.observacoes : null;

  const { data: registros, error } = await supabaseAdmin
    .from("mrp_registros")
    .select("*")
    .order("data_despacho", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao ler mrp_registros: ${error.message}` },
      { status: 500 },
    );
  }

  const dados = registros ?? [];
  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("nome")
    .eq("id", auth.userId)
    .maybeSingle();

  const { data: inserido, error: erroInsert } = await supabaseAdmin
    .from("bdi_snapshots")
    .insert({
      tipo: "mrp_registros",
      origem,
      gerado_por_id: auth.userId,
      gerado_por_nome: usuario?.nome ?? null,
      total_registros: dados.length,
      dados,
      observacoes,
    })
    .select("id, gerado_em, total_registros")
    .single();

  if (erroInsert) {
    return NextResponse.json(
      {
        ok: false,
        erro: `Falha ao gravar bdi_snapshots: ${erroInsert.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    snapshot: inserido,
  });
}

// ---------- GET: listar snapshots existentes --------------------------------
export async function GET(req: NextRequest) {
  const auth = await autenticarAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseAdmin
    .from("bdi_snapshots")
    .select(
      "id, tipo, origem, gerado_em, gerado_por_nome, total_registros, observacoes",
    )
    .order("gerado_em", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, snapshots: data ?? [] });
}
