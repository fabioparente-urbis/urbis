import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export async function POST(req: NextRequest) {
  try {
    const { codigo, fileName, status } = await req.json();
    if (!codigo) return NextResponse.json({ ok: false }, { status: 400 });
    const { data: proc } = await supabaseAdmin.from("processos").select("id").eq("codigo", codigo).maybeSingle();
    if (!proc?.id) return NextResponse.json({ ok: false });
    await supabaseAdmin.from("auditoria_log").insert({
      tabela: "processos",
      registro_id: proc.id,
      operacao: "LIP_LEITURA",
      dados_antes: null,
      dados_depois: { arquivo: fileName ?? "arquivo.pdf", camposPreenchidos: 0, status },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message }, { status: 500 });
  }
}
