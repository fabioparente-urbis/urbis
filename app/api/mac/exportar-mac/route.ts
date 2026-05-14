import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const analiseId = req.nextUrl.searchParams.get("analiseId");
  if (!analiseId) return NextResponse.json({ ok: false, erro: "analiseId obrigatório" }, { status: 400 });

  const { data: analise } = await supabase
    .from("analises_mac")
    .select("processo_codigo, tipo_processo, numero_revisao, checklist_modelo_id")
    .eq("id", analiseId)
    .maybeSingle();

  if (!analise) return NextResponse.json({ ok: false, erro: "Análise não encontrada" }, { status: 404 });

  const { data: itens } = await supabase
    .from("mac_checklist_itens")
    .select("id, grupo, ordem, texto, ref")
    .eq("modelo_id", analise.checklist_modelo_id)
    .eq("ativo", true)
    .order("grupo")
    .order("ordem");

  const { data: respostas } = await supabase
    .from("analise_itens")
    .select("checklist_item_id, status, observacao")
    .eq("analise_id", analiseId);

  const mapaRespostas: Record<string, { status: string; observacao: string }> = {};
  for (const r of respostas || []) {
    mapaRespostas[r.checklist_item_id] = { status: r.status, observacao: r.observacao || "" };
  }

  const statusLabel: Record<string, string> = {
    conforme: "✅ Conforme",
    nao_conforme: "❌ Não Conforme",
    nao_aplica: "⬜ N/A",
  };

  const rows = (itens || []).map((item: any) => ({
    Grupo: item.grupo,
    Item: item.texto,
    Referência: item.ref || "",
    Status: statusLabel[mapaRespostas[item.id]?.status] || "— Não respondido",
    Observação: mapaRespostas[item.id]?.observacao || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 25 }, { wch: 60 }, { wch: 20 }, { wch: 20 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MAC");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const data = new Date().toISOString().slice(0, 10);
  const filename = `MAC_${analise.processo_codigo}_${data}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
