import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const analiseId = req.nextUrl.searchParams.get("analiseId");
  if (!analiseId) return NextResponse.json({ ok: false, erro: "analiseId obrigatorio" }, { status: 400 });

  const { data, error } = await supabase
    .from("mac_historico")
    .select("criado_em, aba, status_anterior, status_novo, analista_nome")
    .eq("analise_id", analiseId)
    .order("criado_em", { ascending: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const grupos: Record<string, {
    momento: string; total: number; abas: Set<string>; analista: string;
    conformes: number; nao_conformes: number; nao_aplica: number;
  }> = {};

  for (const row of data || []) {
    const chave = row.criado_em.slice(0, 16);
    if (!grupos[chave]) grupos[chave] = {
      momento: row.criado_em, total: 0, abas: new Set(), analista: row.analista_nome || "",
      conformes: 0, nao_conformes: 0, nao_aplica: 0,
    };
    grupos[chave].total++;
    if (row.aba) grupos[chave].abas.add(row.aba);
    if (row.status_novo === "conforme")      grupos[chave].conformes++;
    if (row.status_novo === "nao_conforme")  grupos[chave].nao_conformes++;
    if (row.status_novo === "nao_aplica")    grupos[chave].nao_aplica++;
  }

  const eventos = Object.values(grupos).map(g => ({
    momento: g.momento,
    total: g.total,
    abas: Array.from(g.abas),
    analista: g.analista,
    conformes: g.conformes,
    nao_conformes: g.nao_conformes,
    nao_aplica: g.nao_aplica,
  }));

  return NextResponse.json({ ok: true, eventos });
}
