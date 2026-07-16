import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const statusLabel: Record<string, string> = {
  conforme: "✅ Conforme",
  nao_conforme: "❌ Não Conforme",
  nao_aplica: "⬜ N/A",
};

async function buildSheet(analise: any) {
  if (!analise.modelo_id) {
    const ws = XLSX.utils.json_to_sheet([{ "Aba": "", "Item": "(sem checklist)", "Referencia": "", "Status": "" }]);
    ws["!cols"] = [{ wch: 30 }, { wch: 80 }, { wch: 20 }, { wch: 20 }];
    return ws;
  }
  const { data: itens } = await supabase
    .from("mac_checklist_itens")
    .select("id, grupo, ordem, texto, ref")
    .eq("modelo_id", analise.modelo_id)
    .eq("ativo", true)
    .order("grupo")
    .order("ordem");

  const itensJson = (analise.itens || {}) as Record<string, string>;
  const mapaRespostas: Record<string, string> = {};
  for (const [id, status] of Object.entries(itensJson)) {
    mapaRespostas[id] = status;
  }

  const obsPorAba = (analise.observacoes_por_aba || {}) as Record<string, string>;
  const obsEntradas = Object.entries(obsPorAba).filter(([, v]) => v && String(v).trim());
  const obsRows = obsEntradas.map(([aba, obs]) => ({ "Aba": aba, "Item": String(obs), "Referencia": "", "Status": "" }));
  const separador = [{ "Aba": "", "Item": "", "Referencia": "", "Status": "" }];
  const checklistRows = (itens || []).map((item: any) => ({
    "Aba": item.grupo,
    "Item": item.texto,
    "Referencia": item.ref || "",
    "Status": statusLabel[mapaRespostas[item.id]] || "— Nao respondido",
  }));
  const linhas = obsEntradas.length > 0 ? [...obsRows, ...separador, ...checklistRows] : checklistRows;
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = [{ wch: 30 }, { wch: 80 }, { wch: 20 }, { wch: 20 }];
  return ws;
}

export async function GET(req: NextRequest) {
  try { return await handleGET(req); } catch (e: any) {
    console.error("[exportar-mac] erro:", e?.message, e?.stack);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}

async function handleGET(req: NextRequest) {
  const analiseId = req.nextUrl.searchParams.get("analiseId");
  const codigoParam = req.nextUrl.searchParams.get("codigo");
  const todas = req.nextUrl.searchParams.get("todas") === "true";
  const data = new Date().toISOString().slice(0, 10);

  // ── MODO TODAS AS ANÁLISES ──────────────────────────────────────────────
  if (todas && codigoParam) {
    const { data: lista } = await supabase
      .from("analises_mac")
      .select("id, processo_codigo, tipo_processo, numero_analise, modelo_id, observacoes_por_aba, itens")
      .eq("processo_codigo", codigoParam)
      .order("numero_analise", { ascending: true });

    if (!lista || lista.length === 0)
      return NextResponse.json({ ok: false, erro: "Nenhuma análise encontrada" }, { status: 404 });

    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    for (const analise of lista) {
      const ws = await buildSheet(analise);
      let sheetName = `Analise ${analise.numero_analise}`;
      let suffix = 2;
      while (usedNames.has(sheetName)) sheetName = `Analise ${analise.numero_analise}_${suffix++}`;
      usedNames.add(sheetName);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    const buf = Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const filename = `MAC_${codigoParam}_todas-analises_${data}.xlsx`;
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // ── MODO ANÁLISE ÚNICA ──────────────────────────────────────────────────
  let analise: any = null;

  if (analiseId) {
    const { data: d } = await supabase
      .from("analises_mac")
      .select("id, processo_codigo, tipo_processo, numero_analise, modelo_id, observacoes_por_aba, itens")
      .eq("id", analiseId)
      .maybeSingle();
    analise = d;
  }

  if (!analise && codigoParam) {
    const { data: d } = await supabase
      .from("analises_mac")
      .select("id, processo_codigo, tipo_processo, numero_analise, modelo_id, observacoes_por_aba, itens")
      .eq("processo_codigo", codigoParam)
      .order("numero_analise", { ascending: false })
      .limit(1)
      .maybeSingle();
    analise = d;
  }

  if (!analise) return NextResponse.json({ ok: false, erro: "Análise não encontrada" }, { status: 404 });

  const wb = XLSX.utils.book_new();
  const ws = await buildSheet(analise);
  XLSX.utils.book_append_sheet(wb, ws, `Analise ${analise.numero_analise}`);

  const buf = Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  const filename = `MAC_${analise.processo_codigo}_analise-${analise.numero_analise}_${data}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
