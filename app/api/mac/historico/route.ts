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
  // Agrupa por minuto
  const grupos: Record<string, { momento: string; total: number; abas: Set<string>; analista: string }> = {};
  for (const row of data || []) {
    const chave = row.criado_em.slice(0, 16); // YYYY-MM-DDTHH:MM
    if (!grupos[chave]) grupos[chave] = { momento: row.criado_em, total: 0, abas: new Set(), analista: row.analista_nome || "" };
    grupos[chave].total++;
    if (row.aba) grupos[chave].abas.add(row.aba);
  }
  const eventos = Object.values(grupos).map(g => ({
    momento: g.momento,
    total: g.total,
    abas: Array.from(g.abas),
    analista: g.analista,
  }));
  return NextResponse.json({ ok: true, eventos });
}
