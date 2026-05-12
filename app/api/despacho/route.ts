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
      .select("dados, numero_processo_fisico, analista_id")
      .eq("codigo", processo)
      .maybeSingle();

    const dados = proc?.dados || {};
    const interessado =
      dados?.proprietario?.valor ||
      dados?.interessado?.valor ||
      dados?.nome_proprietario?.valor ||
      processo;
    const numeroProcessoFisico =
      dados?.numero_processo_fisico?.valor ||
      (proc as any)?.numero_processo_fisico ||
      "";

    // Buscar dados do analista responsável na tabela equipe
    let assinante: { nome: string; matricula?: string; cargo?: string; registro?: string } | undefined;
    const analistaId = (proc as any)?.analista_id;
    if (analistaId) {
      const { data: membro } = await supabase
        .from("equipe")
        .select("nome, matricula, cargo, registro")
        .eq("id", analistaId)
        .maybeSingle();
      if (membro?.nome) {
        assinante = {
          nome: membro.nome,
          matricula: membro.matricula || undefined,
          cargo: membro.cargo || undefined,
          registro: membro.registro || undefined,
        };
      }
    }

    // Gerar documento baseado no tipo
    const { gerarDespachoRegularizacao, gerarIndeferimento, gerarArquivamento } = await import("@/lib/geradores");

    let buffer: Buffer;
    if (tipo === "despacho") {
        buffer = await gerarDespachoRegularizacao({ processo, interessado, numeroProcessoFisico, numeroDespacho, naoConformes, observacoes, analises, assinante });
    } else if (tipo === "indeferimento") {
      buffer = await gerarIndeferimento({ processo, interessado, analises, assinante });
    } else {
      buffer = await gerarArquivamento({ processo, interessado, assinante });
    }

    // Registrar último documento emitido
    const label = tipo === "despacho" ? `Despacho ${numeroDespacho}` : tipo === "indeferimento" ? "Indeferimento" : "Arquivamento";
    await supabase.from("processos").update({ dados: { ...dados, ultimo_documento: label }, atualizado_em: new Date().toISOString() }).eq("codigo", processo);

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