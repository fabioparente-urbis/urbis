import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { processo, tipo, numeroDespacho, naoConformes, observacoes, analises } = body;

    // Buscar dados do processo
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: proc } = await supabase
      .from("processos")
      .select("dados")
      .eq("codigo", processo)
      .single();

    const dados = proc?.dados || {};
    const interessado = dados?.proprietario?.valor || processo;

    // Gerar documento baseado no tipo
    const { gerarDespachoRegularizacao, gerarIndeferimento, gerarArquivamento } = await import("@/lib/geradores");

    let buffer: Buffer;
    if (tipo === "despacho") {
      buffer = await gerarDespachoRegularizacao({ processo, interessado, numeroDespacho, naoConformes, observacoes, analises });
    } else if (tipo === "indeferimento") {
      buffer = await gerarIndeferimento({ processo, interessado, analises });
    } else {
      buffer = await gerarArquivamento({ processo, interessado });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="despacho_${processo}_${tipo}.docx"`,
      },
    });
  } catch (e: any) {
    console.error("[DESPACHO]", e);
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}