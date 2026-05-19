import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ===========================================================================
// BDI — Snapshot de mrp_registros
// ===========================================================================
// Endpoint acionado pelo botão "Gerar Backup" (tela /admin/backup). Consolida
// os registros de mrp_registros em JSON estático e grava em bdi_snapshots.
//
// Restrito ao perfil Administrador (mesmo gate do backup).
// ===========================================================================

async function bloqueioAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  const perfil = store.get("urbis_perfil")?.value ?? "";
  const p = perfil.toLowerCase();
  if (p !== "admin" && p !== "administrador") {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito ao Administrador." },
      { status: 403 },
    );
  }
  return null;
}

function identificarUsuario(req: NextRequest): {
  id: string | null;
  nome: string | null;
} {
  const cookieHeader = req.headers.get("cookie") || "";
  const id = cookieHeader.match(/urbis_id=([^;]+)/)?.[1] ?? null;
  const nome =
    cookieHeader.match(/urbis_nome=([^;]+)/)?.[1]
      ? decodeURIComponent(cookieHeader.match(/urbis_nome=([^;]+)/)![1])
      : null;
  return { id, nome };
}

// ---------- POST: gerar snapshot --------------------------------------------
export async function POST(req: NextRequest) {
  const bloqueio = await bloqueioAdmin();
  if (bloqueio) return bloqueio;

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
  const usuario = identificarUsuario(req);

  const { data: inserido, error: erroInsert } = await supabaseAdmin
    .from("bdi_snapshots")
    .insert({
      tipo: "mrp_registros",
      origem,
      gerado_por_id: usuario.id,
      gerado_por_nome: usuario.nome,
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
export async function GET() {
  const bloqueio = await bloqueioAdmin();
  if (bloqueio) return bloqueio;

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
