import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { processo, tipo, numeroDespacho, naoConformes, observacoes, analises, analiseId, numero_revisao } = body;

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

    // Itens não conformes agrupados por grupo do checklist.
    // Quando o MAC envia `analiseId`, faz o equivalente do JOIN entre
    // analises_mac.itens (jsonb) e mac_checklist_itens — sempre puxando o
    // grupo direto do banco para a renderização do docx.
    let naoConformesAgrupados:
      | { texto: string; grupo: string; ordem: number }[]
      | undefined;
    if (analiseId) {
      const { data: analise } = await supabase
        .from("analises_mac")
        .select("itens, modelo_id")
        .eq("id", analiseId)
        .maybeSingle();
      const mapa = (analise?.itens as Record<string, string> | null) || {};
      const idsNaoConformes = Object.keys(mapa).filter((k) => mapa[k] === "nao_conforme");
      if (analise?.modelo_id && idsNaoConformes.length > 0) {
        const { data: itensMC } = await supabase
          .from("mac_checklist_itens")
          .select("id, texto, grupo, ordem")
          .eq("modelo_id", analise.modelo_id)
          .eq("ativo", true)
          .in("id", idsNaoConformes)
          .order("grupo", { ascending: true })
          .order("ordem", { ascending: true });
        if (itensMC && itensMC.length > 0) {
          naoConformesAgrupados = itensMC.map((i: any) => ({
            texto: String(i.texto ?? ""),
            grupo: String(i.grupo ?? ""),
            ordem: Number(i.ordem ?? 0),
          }));
        }
      }
    }

    // Quando o MAC envia `numero_revisao`, substituímos o array de análises
    // por uma única linha referente à revisão selecionada. A 5ª acrescenta
    // o sufixo "– LIBERAÇÃO DE TAXA OU INDEFERIMENTO" (via `ultima: true`).
    let analisesParaDoc = analises;
    const nRev = Number(numero_revisao);
    if (Number.isInteger(nRev) && nRev >= 1 && nRev <= 5) {
      const hoje = new Date().toLocaleDateString("pt-BR");
      analisesParaDoc = [{ numero: nRev, data: hoje, ultima: nRev === 5 }];
    }

    // Gerar documento baseado no tipo
    const { gerarDespachoRegularizacao, gerarIndeferimento, gerarArquivamento } = await import("@/lib/geradores");

    let buffer: Buffer;
    if (tipo === "despacho") {
        buffer = await gerarDespachoRegularizacao({ processo, interessado, numeroProcessoFisico, numeroDespacho, naoConformes, naoConformesAgrupados, observacoes, analises: analisesParaDoc, assinante });
    } else if (tipo === "indeferimento") {
      buffer = await gerarIndeferimento({ processo, interessado, analises: analisesParaDoc, assinante });
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