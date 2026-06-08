import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const isAdmin = ctx.perfis.includes("Administrador");
  const url = new URL(req.url);
  const modulo    = url.searchParams.get("modulo") || "";
  const acao      = url.searchParams.get("acao") || "";
  const processo  = url.searchParams.get("processo") || "";
  const analista  = url.searchParams.get("analista") || "";
  const de        = url.searchParams.get("de") || "";
  const ate       = url.searchParams.get("ate") || "";
  const page      = parseInt(url.searchParams.get("page") || "0");
  const limit     = 50;

  let q = supabaseAdmin
    .from("auditoria_eventos")
    .select("*", { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (!isAdmin) q = q.eq("analista_id", ctx.userId);
  else if (analista) q = q.eq("analista_id", analista);

  if (modulo)   q = q.eq("modulo", modulo);
  if (acao)     q = q.eq("acao", acao);
  if (processo) q = q.ilike("processo_codigo", `%${processo}%`);
  if (de)       q = q.gte("criado_em", de);
  if (ate)      q = q.lte("criado_em", ate + "T23:59:59Z");

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data || [], total: count ?? 0, page, limit });
}
