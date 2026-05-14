import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";

type Origem = "original" | "urbis" | "manual" | "padrao";
type Campo = { valor: string; origem: Origem; fonte?: string };

function norm(s: any): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const codigo = String(form.get("codigo") || "").trim();
    const tipo = String(form.get("tipo") || "REGULARIZACAO").trim();

    if (!codigo) {
      return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    }
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, erro: "arquivo .xlsx obrigatório" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: "buffer" });
    } catch {
      return NextResponse.json({ ok: false, erro: "falha ao ler o arquivo .xlsx" }, { status: 400 });
    }

    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    if (!ws) {
      return NextResponse.json({ ok: false, erro: "planilha vazia" }, { status: 400 });
    }

    const linhas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

    // Carrega estrutura de campos (label → chave). Inclui aba.nome para resolver labels duplicados entre abas.
    const { data: abas, error: errAbas } = await supabase
      .from("lip_abas")
      .select("nome, ordem, lip_campos(chave, label, ordem)")
      .order("ordem");

    if (errAbas) {
      return NextResponse.json({ ok: false, erro: errAbas.message }, { status: 500 });
    }

    // Index 1: (abaNorm + labelNorm) → chave    — match preciso
    // Index 2: labelNorm → chave[]              — fallback quando aba não bate
    const idxPorAbaLabel = new Map<string, string>();
    const idxPorLabel = new Map<string, string[]>();
    for (const aba of (abas || []) as any[]) {
      const abaNome = norm(aba.nome);
      for (const campo of aba.lip_campos || []) {
        const labelNome = norm(campo.label);
        const chave = String(campo.chave);
        idxPorAbaLabel.set(`${abaNome}::${labelNome}`, chave);
        const arr = idxPorLabel.get(labelNome) || [];
        arr.push(chave);
        idxPorLabel.set(labelNome, arr);
      }
    }

    // Carrega processo atual para merge não-destrutivo
    const { data: proc, error: errProc } = await supabase
      .from("processos")
      .select("dados")
      .eq("codigo", codigo)
      .eq("tipo_processo", tipo)
      .maybeSingle();

    if (errProc) {
      return NextResponse.json({ ok: false, erro: errProc.message }, { status: 500 });
    }
    if (!proc) {
      return NextResponse.json({ ok: false, erro: "processo não encontrado" }, { status: 404 });
    }

    const dadosAtuais: Record<string, Campo> = (proc.dados as any) || {};
    const dadosMesclados: Record<string, Campo> = { ...dadosAtuais };

    let atualizados = 0;
    const naoEncontrados: string[] = [];

    for (const row of linhas) {
      const abaTxt = norm(row["Aba"]);
      const campoTxt = norm(row["Campo"]);
      const valor = row["Valor"];

      if (!campoTxt) continue;

      let chave = idxPorAbaLabel.get(`${abaTxt}::${campoTxt}`);
      if (!chave) {
        const cands = idxPorLabel.get(campoTxt);
        if (cands && cands.length === 1) chave = cands[0];
      }

      if (!chave) {
        naoEncontrados.push(String(row["Campo"] ?? ""));
        continue;
      }

      dadosMesclados[chave] = {
        valor: valor == null ? "" : String(valor),
        origem: "manual",
      };
      atualizados++;
    }

    const { error: errUpd } = await supabase
      .from("processos")
      .update({ dados: dadosMesclados })
      .eq("codigo", codigo)
      .eq("tipo_processo", tipo);

    if (errUpd) {
      return NextResponse.json({ ok: false, erro: errUpd.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      atualizados,
      naoEncontrados,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro inesperado" }, { status: 500 });
  }
}
