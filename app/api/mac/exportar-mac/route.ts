import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const analiseId = req.nextUrl.searchParams.get("analiseId");
  const codigoParam = req.nextUrl.searchParams.get("codigo");

  let analise: any = null;

  if (analiseId) {
    const { data } = await supabase
      .from("analises_mac")
      .select("id, processo_codigo, tipo_processo, numero_revisao, modelo_id, observacoes_por_aba")
      .eq("id", analiseId)
      .maybeSingle();
    analise = data;
  }

  if (!analise && codigoParam) {
    const { data } = await supabase
      .from("analises_mac")
      .select("id, processo_codigo, tipo_processo, numero_revisao, modelo_id, observacoes_por_aba")
      .eq("processo_codigo", codigoParam)
      .order("numero_analise", { ascending: false })
      .limit(1)
      .maybeSingle();
    analise = data;
  }

  if (!analise) return NextResponse.json({ ok: false, erro: "Análise não encontrada" }, { status: 404 });

  const { data: itens } = await supabase
    .from("mac_checklist_itens")
    .select("id, grupo, ordem, texto, ref")
    .eq("modelo_id", analise.modelo_id)
    .eq("ativo", true)
    .order("grupo")
    .order("ordem");

  let { data: respostas } = await supabase
    .from("analise_itens")
    .select("checklist_item_id, status, observacao")
    .eq("analise_id", analise.id);
  // Se análise atual sem respostas, busca a anterior com dados
  if (!respostas || respostas.length === 0) {
    const { data: anterior } = await supabase
      .from("analises_mac")
      .select("id")
      .eq("processo_codigo", analise.processo_codigo)
      .order("numero_analise", { ascending: false })
      .limit(10)
      .then(async (res) => {
        for (const a of res.data || []) {
          if (a.id === analise.id) continue;
          const { data: r } = await supabase.from("analise_itens").select("checklist_item_id, status, observacao").eq("analise_id", a.id).limit(1);
          if (r && r.length > 0) return { data: a };
        }
        return { data: null };
      });
    if (anterior) {
      const { data: r2 } = await supabase.from("analise_itens").select("checklist_item_id, status, observacao").eq("analise_id", anterior.id);
      if (r2) respostas = r2;
    }
  }

  const mapaRespostas: Record<string, { status: string; observacao: string }> = {};
  for (const r of respostas || []) {
    mapaRespostas[r.checklist_item_id] = { status: r.status, observacao: r.observacao || "" };
  }

  const statusLabel: Record<string, string> = {
    conforme: "✅ Conforme",
    nao_conforme: "❌ Não Conforme",
    nao_aplica: "⬜ N/A",
  };

  // Aba unica: obs por aba no topo + checklist abaixo
  const obsPorAba = (analise.observacoes_por_aba || {}) as Record<string, string>;
  const obsEntradas = Object.entries(obsPorAba).filter(([, v]) => v && String(v).trim());
  const obsRows = obsEntradas.map(([aba, obs]) => ({ "Aba": aba, "Item": String(obs), "Referencia": "", "Status": "" }));
  const separador = [{ "Aba": "", "Item": "", "Referencia": "", "Status": "" }];
  const checklistRows = (itens || []).map((item: any) => ({
    "Aba": item.grupo,
    "Item": item.texto,
    "Referencia": item.ref || "",
    "Status": statusLabel[mapaRespostas[item.id]?.status] || "— Nao respondido",
  }));
  const todasLinhas = obsEntradas.length > 0 ? [...obsRows, ...separador, ...checklistRows] : checklistRows;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(todasLinhas);
  ws["!cols"] = [{ wch: 30 }, { wch: 80 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "MAC");

  const buf = Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  const data = new Date().toISOString().slice(0, 10);
  const filename = `MAC_${analise.processo_codigo}_${data}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
