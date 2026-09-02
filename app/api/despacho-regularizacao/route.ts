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
    const { gerarDespachoRegularizacao, gerarIndeferimento, gerarArquivamento, assuntoParaDocumento } = await import("@/lib/geradores");
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
    if (tipo === "despacho") {
        buffer = await gerarDespachoRegularizacao({ processo, interessado, numeroProcessoFisico, numeroDespacho, naoConformes, naoConformesAgrupados, observacoes, observacoesPorAba, analises: analisesParaDoc, assinante, responsavelTecnico, data, tipoProcesso: (proc as any)?.tipo_processo, corpoPersonalizado });
    } else if (tipo === "indeferimento") {
      const fotosValidas = Array.isArray(fotos)
        ? fotos.filter((f: any) => f?.base64 && (f?.tipo === "png" || f?.tipo === "jpg")).map((f: any) => ({ base64: f.base64, tipo: f.tipo, legenda: String(f.legenda ?? "") }))
        : undefined;
      buffer = await gerarIndeferimento({ processo, interessado, analises: analisesParaDoc, observacoes, assinante, gerente, diretora, numeroParecer: numeroDespacho ?? undefined, assunto, data, fotos: fotosValidas });
    } else {
      buffer = await gerarArquivamento({ processo, interessado, assinante, gerente, diretora, numeroParecer: numeroDespacho ?? undefined, assunto, data });
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

    // ── MRP e MDP: gravação automática após emissão, no servidor. ──
    // Rede de segurança — o cliente também grava, os dois convergem para a
    // MESMA linha (dedupe por chave real da tabela). Falha aqui NÃO
    // silenciosa: motivo some no header da resposta, o cliente mostra pro
    // analista. Achado de 02/09/2026: gravarRegistroMRP já existia aqui,
    // mas o retorno {ok:false} nunca era conferido — só exceção lançada
    // caía no catch. Corrigido: agora os dois motivos de falha (exceção OU
    // {ok:false}) viram cabeçalho visível.
    const headersExtras: Record<string, string> = {};
    const tipoMdp = tipo === "despacho" ? "despacho" : tipo === "indeferimento" ? "indeferimento" : "arquivamento";

    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      const rMrp = await gravarRegistroMRP({
        processo_codigo: processo,
        tipo_processo: (proc as any)?.tipo_processo ?? "regularizacao",
        tipo_despacho: tipoMdp,
        numero_despacho: numeroDespacho ?? null,
        analise_id: analiseId ?? null,
        numero_revisao: Number.isInteger(Number(numero_revisao)) ? Number(numero_revisao) : null,
        data_despacho: data ?? null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
      if (!rMrp.ok && rMrp.motivo !== "sem numero_despacho — gravação delegada ao cliente") {
        console.warn("[MRP] falha ao gravar registro automático:", rMrp.motivo);
        headersExtras["X-MRP-Falhou"] = encodeURIComponent(rMrp.motivo ?? "motivo desconhecido");
      }
    } catch (mrpErr: any) {
      console.warn("[MRP] falha ao gravar registro automático:", mrpErr);
      headersExtras["X-MRP-Falhou"] = encodeURIComponent(mrpErr?.message ?? "erro desconhecido");
    }

    try {
      const { gravarRegistroMDPDespacho } = await import("@/lib/mdpGravar");
      const rMdp = await gravarRegistroMDPDespacho({
        processo_codigo: processo,
        assunto_id: assunto_id ?? (proc as any)?.assunto_id ?? null,
        tipo: tipoMdp,
        numero: numeroDespacho ?? null,
        interessado,
        data_despacho: data ?? null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
      if (!rMdp.ok && rMdp.motivo !== "sem número — gravação delegada ao cliente") {
        console.warn("[MDP] falha ao gravar registro automático:", rMdp.motivo);
        headersExtras["X-MDP-Falhou"] = encodeURIComponent(rMdp.motivo ?? "motivo desconhecido");
      }
    } catch (mdpErr: any) {
      console.warn("[MDP] falha ao gravar registro automático:", mdpErr);
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