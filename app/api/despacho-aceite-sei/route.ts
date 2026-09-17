import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { processo, tipo, numeroDespacho, naoConformes, observacoes, observacoesPorAba, analises, analiseId, numero_revisao, assunto_id, data, padrao_id, fotos } = body;

    // Buscar dados do processo
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: proc } = await supabase
      .from("processos")
      .select("dados, numero_processo_fisico, analista_id, tipo_processo, assunto_id")
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
    /* `gerarDespachoAceiteSei` é do Slot 2 e vive em `lib/geradores/aceiteSei/`
     * desde 17/09/2026. Até então esta rota chamava `gerarDespachoRegularizacao`
     * e o despacho do Aceite saía com "Assunto: ALVARÁ DE REGULARIZAÇÃO", a base
     * legal do Título I e a citação do Art. 1º § 1º — que é da Regularização.
     * Ver o cabeçalho do gerador novo.
     *
     * Indeferimento e arquivamento também são do Slot 2 desde 17/09/2026, com
     * conteúdo IDÊNTICO ao Slot 1 por determinação do Fábio ("indeferimento e
     * arquivamento é igual ao slot 1") — o ganho é só o isolamento.
     *
     * De `lib/geradores.ts` fica só `assuntoParaDocumento`, que não gera
     * documento: é a consulta a `assuntos.nome_documento`, fonte única do nome
     * do ato para todos os slots, na mesma lógica da numeração. */
    const { assuntoParaDocumento } = await import("@/lib/geradores");
    const { gerarDespachoAceiteSei } = await import("@/lib/geradores/aceiteSei/gerarDespachoAceiteSei");
    const { gerarIndeferimentoAceiteSei, gerarArquivamentoAceiteSei } = await import("@/lib/geradores/aceiteSei/gerarParecerAceiteSei");
    const assunto = await assuntoParaDocumento((proc as any)?.tipo_processo, assunto_id ?? (proc as any)?.assunto_id);

    // Padrão de despacho: busca o texto NO SERVIDOR pelo id — nunca confia
    // em texto vindo do client. Só vale para tipo="despacho" (parecer fica
    // fora do escopo desta feature).
    let corpoPersonalizado: string | undefined;
    if (padrao_id && tipo === "despacho") {
      const { data: padrao } = await supabase
        .from("despacho_padroes")
        .select("corpo")
        .eq("id", padrao_id)
        .eq("ativo", true)
        .maybeSingle();
      if (padrao?.corpo) corpoPersonalizado = padrao.corpo;
    }

    let buffer: Buffer;
    /** Ids de item que entraram no despacho sem texto legível — vira cabeçalho. */
    let idsSemTexto: string[] = [];
    if (tipo === "despacho") {
        // `assunto` sai de `assuntos.nome_documento` ("Alvará de Aceite") e agora é
        // PASSADO ao gerador. A rota já o calculava e não usava no despacho.
        const r = await gerarDespachoAceiteSei({ processo, interessado, numeroProcessoFisico, numeroDespacho, assunto, seiCheadv: (dados as any)?.seiCheadv?.valor ?? undefined, naoConformes, naoConformesAgrupados, observacoes, observacoesPorAba, analises: analisesParaDoc, assinante, data, corpoPersonalizado });
        buffer = r.buffer;
        idsSemTexto = r.idsSemTexto;
    } else if (tipo === "indeferimento") {
      const fotosValidas = Array.isArray(fotos)
        ? fotos.filter((f: any) => f?.base64 && (f?.tipo === "png" || f?.tipo === "jpg")).map((f: any) => ({ base64: f.base64, tipo: f.tipo, legenda: String(f.legenda ?? "") }))
        : undefined;
      buffer = await gerarIndeferimentoAceiteSei({ processo, interessado, analises: analisesParaDoc, observacoes, assinante, gerente, diretora, numeroParecer: numeroDespacho ?? undefined, assunto, data, fotos: fotosValidas });
    } else {
      buffer = await gerarArquivamentoAceiteSei({ processo, interessado, assinante, gerente, diretora, numeroParecer: numeroDespacho ?? undefined, assunto, data });
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

    /** Cabeçalhos de aviso: nada do que falhou sai em silêncio (CLAUDE.md). */
    const headersExtras: Record<string, string> = {};
    if (idsSemTexto.length > 0) {
      headersExtras["X-Ids-Sem-Texto"] = encodeURIComponent(idsSemTexto.join(","));
    }

    // ── MRP: grava o despacho automaticamente ──
    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      const rMrp = await gravarRegistroMRP({
        processo_codigo: processo,
        // Fallback do Aceite é "aceite_sei". Estava "regularizacao" (copiado da
        // rota do Slot 1): processo sem tipo_processo gravava a produção do
        // Aceite como se fosse Regularização no MRP. Corrigido 17/09/2026.
        tipo_processo: (proc as any)?.tipo_processo ?? "aceite_sei",
        tipo_despacho: tipo === "despacho" ? "despacho" : tipo === "indeferimento" ? "indeferimento" : "arquivamento",
        numero_despacho: numeroDespacho ?? null,
        analise_id: analiseId ?? null,
        numero_revisao: Number.isInteger(Number(numero_revisao)) ? Number(numero_revisao) : null,
        data_despacho: data ?? null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
      if (!rMrp.ok && rMrp.motivo !== "sem numero_despacho — gravação delegada ao cliente") {
        console.warn("[MRP/slot2] falha ao gravar registro automático:", rMrp.motivo);
        headersExtras["X-MRP-Falhou"] = encodeURIComponent(rMrp.motivo ?? "motivo desconhecido");
      }
    } catch (mrpErr: any) {
      console.warn("[MRP/slot2] falha ao gravar registro automático:", mrpErr);
      headersExtras["X-MRP-Falhou"] = encodeURIComponent(mrpErr?.message ?? "erro desconhecido");
    }

    /* ── MDP: rede de segurança no SERVIDOR ──
     * O cliente também grava (app/analise-aceite-sei/[codigo]/page.tsx) e as duas
     * convergem para a mesma linha (dedupe pela chave real da tabela). O Slot 1
     * ganhou isto em 02/09/2026; o Slot 2 nunca teve, então navegador fechado no
     * meio da emissão fazia o despacho não chegar ao MDP em silêncio — e emissão
     * que não chega ao MDP deixa campos do LIP "aguardando o fato" para sempre
     * (CLAUDE.md, lib/lipDocumentosEmitidos.ts). */
    try {
      const { gravarRegistroMDPDespacho } = await import("@/lib/mdpGravar");
      const rMdp = await gravarRegistroMDPDespacho({
        processo_codigo: processo,
        assunto_id: assunto_id ?? (proc as any)?.assunto_id ?? null,
        tipo: tipo === "despacho" ? "despacho" : tipo === "indeferimento" ? "indeferimento" : "arquivamento",
        numero: numeroDespacho ?? null,
        interessado,
        data_despacho: data ?? null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
      if (!rMdp.ok && rMdp.motivo !== "sem número — gravação delegada ao cliente") {
        console.warn("[MDP/slot2] falha ao gravar registro automático:", rMdp.motivo);
        headersExtras["X-MDP-Falhou"] = encodeURIComponent(rMdp.motivo ?? "motivo desconhecido");
      }
    } catch (mdpErr: any) {
      console.warn("[MDP/slot2] falha ao gravar registro automático:", mdpErr);
      headersExtras["X-MDP-Falhou"] = encodeURIComponent(mdpErr?.message ?? "erro desconhecido");
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="despacho_${processo}_${tipo}.docx"`,
        ...headersExtras,
      },
    });
  } catch (e: any) {
    console.error("[DESPACHO]", e);
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}