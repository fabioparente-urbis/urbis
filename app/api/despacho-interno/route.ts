import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { codigo, tipoProcesso, numeroDespacho, data, destino, corpo } = body;
    const { data: proc } = await supabase.from("processos").select("dados, analista_id").eq("codigo", codigo).maybeSingle();
    const dadosProc = (proc as any)?.dados || {};
    const interessado = dadosProc?.nome_proprietario?.valor || dadosProc?.proprietario?.valor || codigo;
    let assinante = undefined;
    if ((proc as any)?.analista_id) {
      const { data: membro } = await supabase.from("usuarios").select("nome, matricula, cargo, cau_crea").eq("id", (proc as any).analista_id).maybeSingle();
      if ((membro as any)?.nome) assinante = { nome: (membro as any).nome, matricula: (membro as any).matricula || undefined, cargo: (membro as any).cargo || undefined, registro: (membro as any).cau_crea || undefined };
    }
    const { gerarDespachoInterno } = await import("@/lib/geradores");
    const buffer = await gerarDespachoInterno({ processo: codigo, interessado, numeroDespacho, data, tipoProcesso, destino, corpo, assinante });
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="DespachoInterno_${codigo}_${numeroDespacho}.docx"` } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
