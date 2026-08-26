import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { autenticar } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // Rota servia o LIP inteiro (todos os campos do processo) sem checar
  // sessão nenhuma — bastava a URL com o código do processo, sem cookie,
  // sem login. Mesmo padrão de autenticação usado em processo/salvar.
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const codigo = req.nextUrl.searchParams.get("codigo");
  const tipo = req.nextUrl.searchParams.get("tipo") || "regularizacao";
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

  const { data: proc } = await supabase
    .from("processos")
    .select("dados, codigo, tipo_processo, assunto_id")
    .eq("codigo", codigo)
    .eq("tipo_processo", tipo)
    .maybeSingle();

  if (!proc) return NextResponse.json({ ok: false, erro: "Processo não encontrado" }, { status: 404 });

  const dados = proc.dados || {};

  // Sem o filtro por assunto_id, a exportação trazia as abas e campos de
  // TODOS os slots (Regularização, Aceite SEI, Aprovação de Projeto etc.
  // misturados) — o Excel do Slot 5 saía com campos que nem existem na tela
  // daquele processo. Mesmo filtro do GET /api/admin/lip.
  let query = supabase
    .from("lip_abas")
    .select("nome, ordem, lip_campos(chave, label, ordem)")
    .order("ordem");
  if (proc.assunto_id) query = query.eq("assunto_id", proc.assunto_id);
  const { data: abas } = await query;

  const rows: { Aba: string; Campo: string; Valor: string }[] = [];

  for (const aba of (abas || []) as any[]) {
    const campos = (aba.lip_campos || []).sort((a: any, b: any) => a.ordem - b.ordem);
    for (const campo of campos) {
      const val = dados[campo.chave];
      rows.push({
        Aba: aba.nome,
        Campo: campo.label,
        Valor: val?.valor ?? "",
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 40 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LIP");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const data = new Date().toISOString().slice(0, 10);
  const filename = `LIP_${codigo}_${data}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
