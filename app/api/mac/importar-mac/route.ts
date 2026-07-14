import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";

function norm(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function mapearStatus(raw: any): "conforme" | "nao_conforme" | "nao_aplica" | null {
  const v = norm(raw);
  if (!v) return null;
  if (v.includes("nao conforme") || v.includes("nao-conforme") || v.includes("❌")) return "nao_conforme";
  if (v.includes("n/a") || v.includes("nao aplica") || v.includes("⬜")) return "nao_aplica";
  if (v.includes("conforme") || v.includes("✅")) return "conforme";
  if (v === "conforme") return "conforme";
  if (v === "nao_conforme") return "nao_conforme";
  if (v === "nao_aplica") return "nao_aplica";
  return null;
}

async function importarSheet(
  ws: XLSX.WorkSheet,
  analiseId: string
): Promise<{ atualizados: number; naoEncontrados: string[] }> {
  const linhas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

  const { data: analise } = await supabase
    .from("analises_mac")
    .select("id, modelo_id, itens, observacoes_por_aba")
    .eq("id", analiseId)
    .maybeSingle();

  if (!analise) throw new Error(`Análise ${analiseId} não encontrada`);
  if (!(analise as any).modelo_id) throw new Error("Análise sem modelo vinculado");

  const { data: itensModelo } = await supabase
    .from("mac_checklist_itens")
    .select("id, grupo, texto")
    .eq("modelo_id", (analise as any).modelo_id)
    .eq("ativo", true);

  const idxPorGrupoTexto = new Map<string, string>();
  const idxPorTexto = new Map<string, string[]>();
  for (const it of itensModelo || []) {
    const t = norm((it as any).texto);
    const g = norm((it as any).grupo);
    const id = String((it as any).id);
    idxPorGrupoTexto.set(`${g}::${t}`, id);
    const arr = idxPorTexto.get(t) || [];
    arr.push(id);
    idxPorTexto.set(t, arr);
  }

  let atualizados = 0;
  const naoEncontrados: string[] = [];
  const obsPorAba: Record<string, string> = { ...((analise as any).observacoes_por_aba || {}) };
  const itensJson: Record<string, "conforme" | "nao_conforme" | "nao_aplica"> = {
    ...((analise as any).itens || {}),
  };

  for (const row of linhas) {
    const grupoTxt = norm(row["Aba"] ?? row["Grupo"]);
    const itemTxt = norm(row["Item"] ?? row["Observacao"]);
    const status = mapearStatus(row["Status"]);

    if (!itemTxt) continue;
    if (!status) {
      const aba = String(row["Aba"] ?? "").trim();
      const obs = String(row["Item"] ?? "").trim();
      if (aba && obs) obsPorAba[aba] = (obsPorAba[aba] ? obsPorAba[aba] + "\n" : "") + obs;
      continue;
    }

    let id = idxPorGrupoTexto.get(`${grupoTxt}::${itemTxt}`);
    if (!id) {
      const cands = idxPorTexto.get(itemTxt);
      if (cands && cands.length === 1) id = cands[0];
    }
    if (!id) { naoEncontrados.push(String(row["Item"] ?? "")); continue; }

    itensJson[id] = status;
    atualizados++;
  }

  await supabase
    .from("analises_mac")
    .update({ itens: itensJson, observacoes_por_aba: obsPorAba, atualizado_em: new Date().toISOString() })
    .eq("id", analiseId);

  return { atualizados, naoEncontrados };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const analiseId = String(form.get("analiseId") || "").trim();
    const todas = form.get("todas") === "true";
    const codigoParam = String(form.get("codigo") || "").trim();

    if (!file || !(file instanceof Blob))
      return NextResponse.json({ ok: false, erro: "arquivo .xlsx obrigatório" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: "buffer" });
    } catch {
      return NextResponse.json({ ok: false, erro: "falha ao ler o arquivo .xlsx" }, { status: 400 });
    }

    // ── MODO TODAS AS ANÁLISES ───────────────────────────────────────────
    if (todas && codigoParam) {
      const { data: lista } = await supabase
        .from("analises_mac")
        .select("id, numero_analise")
        .eq("processo_codigo", codigoParam)
        .order("numero_analise", { ascending: true });

      if (!lista || lista.length === 0)
        return NextResponse.json({ ok: false, erro: "Nenhuma análise encontrada" }, { status: 404 });

      let totalAtualizados = 0;
      const erros: string[] = [];
      for (const analise of lista) {
        // Procura a aba pelo nome "Analise N" (mesmo nome gerado no export)
        const nomePlanilha = wb.SheetNames.find(n =>
          n.toLowerCase().replace(/\s/g, "") === `analise${analise.numero_analise}`
        );
        if (!nomePlanilha) continue;
        try {
          const { atualizados } = await importarSheet(wb.Sheets[nomePlanilha], analise.id);
          totalAtualizados += atualizados;
        } catch (e: any) {
          erros.push(`Análise ${analise.numero_analise}: ${e.message}`);
        }
      }
      return NextResponse.json({ ok: true, atualizados: totalAtualizados, erros });
    }

    // ── MODO ANÁLISE ÚNICA ───────────────────────────────────────────────
    if (!analiseId)
      return NextResponse.json({ ok: false, erro: "analiseId obrigatório" }, { status: 400 });

    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    if (!ws)
      return NextResponse.json({ ok: false, erro: "planilha vazia" }, { status: 400 });

    const { atualizados, naoEncontrados } = await importarSheet(ws, analiseId);
    return NextResponse.json({ ok: true, atualizados, naoEncontrados });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro inesperado" }, { status: 500 });
  }
}
