import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ROTULO: Record<string, string> = {
  conforme: "✅ Conforme",
  nao_conforme: "❌ Não Conforme",
  nao_aplica: "⬜ N/A",
};

export async function GET(req: NextRequest) {
  const analiseId = req.nextUrl.searchParams.get("analiseId");
  if (!analiseId) return NextResponse.json({ ok: false, erro: "analiseId obrigatorio" }, { status: 400 });

  const { data, error } = await supabase
    .from("mac_historico")
    .select("criado_em, aba, item_texto, referencia_legal, status_anterior, status_novo, analista_nome")
    .eq("analise_id", analiseId)
    .order("criado_em", { ascending: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const grupos: Record<string, {
    momento: string; abas: Set<string>; analista: string;
    itens: { aba: string; texto: string; ref: string | null; de: string | null; para: string }[];
  }> = {};

  for (const row of data || []) {
    const chave = row.criado_em.slice(0, 16);
    if (!grupos[chave]) grupos[chave] = {
      momento: row.criado_em, abas: new Set(), analista: row.analista_nome || "",
      itens: [],
    };
    if (row.aba) grupos[chave].abas.add(row.aba);
    grupos[chave].itens.push({
      aba: row.aba || "—",
      texto: row.item_texto || "—",
      ref: row.referencia_legal || null,
      de: row.status_anterior ? (ROTULO[row.status_anterior] ?? row.status_anterior) : null,
      para: ROTULO[row.status_novo] ?? row.status_novo,
    });
  }

  const eventos = Object.values(grupos).map(g => ({
    momento: g.momento,
    total: g.itens.length,
    abas: Array.from(g.abas),
    analista: g.analista,
    itens: g.itens,
  }));

  return NextResponse.json({ ok: true, eventos });
}
