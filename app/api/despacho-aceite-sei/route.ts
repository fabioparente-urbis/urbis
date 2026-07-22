import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { processo, tipo, numeroDespacho, naoConformes, observacoes, observacoesPorAba, analises, analiseId, numero_revisao, assunto_id } = body;

    // Buscar dados do processo
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: proc } = await supabase
      .from("processos")
      .select("dados, numero_processo_fisico, analista_id, tipo_processo")
      .eq("codigo", processo)
      .maybeSingle();

    const dados = proc?.dados || {};
    const interessado =
      dados?.proprietario?.valor ||
      dados?.interessado?.valor ||
      dados?.nome_proprietario?.valor ||
      processo;
    const numeroProcessoFisico =
      dados?.processoFisico?.valor ||
      (proc as any)?.numero_processo_fisico ||
      "";

    // Buscar dados do analista responsável na tabela usuarios
    type Pessoa = { nome: string; matricula?: string; cargo?: string; registro?: string };
    let assinante: Pessoa | undefined;
    let gerente: Pessoa | undefined;
    let diretora: Pessoa | undefined;
    const analistaId = (proc as any)?.analista_id;
    if (analistaId) {
      const { data: membro } = await supabase
        .from("usuarios")
        .select("nome, matricula, cargo, cau_crea, gerencia")
        .eq("id", analistaId)
        .maybeSingle();
      if (membro?.nome) {
        assinante = {
          nome: membro.nome,
          matricula: membro.matricula || undefined,
          cargo: membro.cargo || undefined,
          registro: membro.cau_crea || undefined,
        };
        // Gerente: perfis contém "Gerência {gerencia}" (ex: "Gerência MP")
        if (membro.gerencia) {
          const perfilGerente = `Gerência ${membro.gerencia}`;
          const { data: ger } = await supabase
            .from("usuarios")
            .select("nome, matricula, cargo, cau_crea")
            .contains("perfis", [perfilGerente])
            .limit(1)
            .maybeSingle();
          if (ger?.nome) {
            gerente = {
              nome: ger.nome,
              matricula: ger.matricula || undefined,
              cargo: ger.cargo || undefined,
              registro: ger.cau_crea || undefined,
            };
          }
        }
      }
    }
    // Diretora: usuario com perfil "Diretora"
    {
      const { data: dir } = await supabase
        .from("usuarios")
        .select("nome, matricula, cargo, cau_crea")
        .contains("perfis", ["Diretora"])
        .limit(1)
        .maybeSingle();
      if (dir?.nome) {
        diretora = {
          nome: dir.nome,
          matricula: dir.matricula || undefined,
          cargo: dir.cargo || undefined,
          registro: dir.cau_crea || undefined,
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
    let responsavelTecnico: { cau?: string | null; crea?: string | null } | undefined;
    if (analiseId) {
      const { data: analise } = await supabase
        .from("analises_mac")
        .select("itens, modelo_id")
        .eq("id", analiseId)
        .maybeSingle();
      // CAU/CREA vêm do LIP (processos.dados) — S63
      const dadosProc = (proc as any)?.dados || {};
      const cauLip = dadosProc?.cau?.valor || null;
      const creaLip = dadosProc?.crea?.valor || null;
      if (cauLip || creaLip) {
        responsavelTecnico = { cau: cauLip, crea: creaLip };
      }
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
    // analises[] vem do frontend com as análises reais (numero, data, ultima)
    // Usar analises.length para determinar obs — não numero_revisao (pode estar errado no banco)
    const nReal = Array.isArray(analises) ? analises.length : 0;
    const analisesParaDoc = Array.isArray(analises) && analises.length > 0
      ? analises
      : [];

    // Gerar documento baseado no tipo
    const { gerarDespachoRegularizacao, gerarIndeferimento, gerarArquivamento } = await import("@/lib/geradores");

    let buffer: Buffer;
    if (tipo === "despacho") {
        buffer = await gerarDespachoRegularizacao({ processo, interessado, numeroProcessoFisico, numeroDespacho, naoConformes, naoConformesAgrupados, observacoes, observacoesPorAba, analises: analisesParaDoc, assinante, responsavelTecnico });
    } else if (tipo === "indeferimento") {
      buffer = await gerarIndeferimento({ processo, interessado, analises: analisesParaDoc, observacoes, assinante, gerente, diretora });
    } else {
      buffer = await gerarArquivamento({ processo, interessado, assinante, gerente, diretora });
    }

    // Registrar último documento emitido
    const label = tipo === "despacho" ? `Despacho ${numeroDespacho}` : tipo === "indeferimento" ? "Indeferimento" : "Arquivamento";
    await supabase.from("processos").update({ dados: { ...dados, ultimo_documento: label }, atualizado_em: new Date().toISOString() }).eq("codigo", processo);

    // Relógio do processo: indeferimento e arquivamento são resultado definitivo.
    // "despacho" comum não é (pode ser exigência intermediária) — não marca conclusão.
    // Idempotente: só grava se ainda não houver data de conclusão registrada.
    if (tipo === "indeferimento" || tipo === "arquivamento") {
      await supabase
        .from("processos")
        .update({ analise_concluida_em: new Date().toISOString() })
        .eq("codigo", processo)
        .is("analise_concluida_em", null);
    }

    // ── MRP: grava o despacho automaticamente (falha silenciosa) ──
    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      await gravarRegistroMRP({
        processo_codigo: processo,
        tipo_processo: (proc as any)?.tipo_processo ?? "regularizacao",
        tipo_despacho: tipo === "despacho" ? "despacho" : tipo === "indeferimento" ? "indeferimento" : "arquivamento",
        numero_despacho: numeroDespacho ?? null,
        analise_id: analiseId ?? null,
        numero_revisao: Number.isInteger(Number(numero_revisao)) ? Number(numero_revisao) : null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
    } catch (mrpErr) {
      console.warn("[MRP] falha ao gravar registro automático:", mrpErr);
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