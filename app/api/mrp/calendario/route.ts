// ============================================================
// GET  /api/mrp/calendario?usuario_id=&mes=&ano=
// PUT  /api/mrp/calendario  body: { usuario_id?, mes, ano, dias_uteis, ferias, atestado, feriados, facultativo }
//
// Analista edita o próprio calendário. Gerente/Admin/Diretora podem
// editar o de outros analistas (respeitando hierarquia).
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

async function podeAcessar(auth: { userId: string; irrestrito: boolean; gerencia: string | null }, alvoId: string) {
  if (alvoId === auth.userId) return true;
  if (auth.irrestrito) return true;
  if (auth.gerencia) {
    const { data: alvo } = await supabaseAdmin
      .from("usuarios").select("gerencia").eq("id", alvoId).maybeSingle();
    return (alvo as any)?.gerencia === auth.gerencia;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const mes = Number(searchParams.get("mes") ?? hoje.getMonth() + 1);
  const ano = Number(searchParams.get("ano") ?? hoje.getFullYear());
  const alvoId = searchParams.get("usuario_id") ?? auth.userId;

  if (!(await podeAcessar(auth, alvoId))) {
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from("mrp_calendario")
    .select("*")
    .eq("usuario_id", alvoId).eq("ano", ano).eq("mes", mes)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    data: data ?? {
      usuario_id: alvoId, mes, ano,
      dias_uteis: 22, ferias: 0, atestado: 0, feriados: 0, facultativo: 0,
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const alvoId = body.usuario_id ?? auth.userId;
  const mes = Number(body.mes);
  const ano = Number(body.ano);
  if (!mes || !ano) {
    return NextResponse.json({ ok: false, erro: "mes/ano obrigatórios" }, { status: 400 });
  }
  if (!(await podeAcessar(auth, alvoId))) {
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });
  }

  const payload = {
    usuario_id: alvoId,
    mes, ano,
    dias_uteis: Math.max(0, Number(body.dias_uteis ?? 22)),
    ferias: Math.max(0, Number(body.ferias ?? 0)),
    atestado: Math.max(0, Number(body.atestado ?? 0)),
    feriados: Math.max(0, Number(body.feriados ?? 0)),
    facultativo: Math.max(0, Number(body.facultativo ?? 0)),
  };

  const { error } = await supabaseAdmin
    .from("mrp_calendario")
    .upsert(payload, { onConflict: "usuario_id,mes,ano" });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
