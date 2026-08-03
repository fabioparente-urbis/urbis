// app/api/mac/gerar-laudo/route.ts
// POST /api/mac/gerar-laudo  →  { processoId: string }
// Retorna o .xlsm preenchido para download direto

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gerarLaudo, type DadosLaudo, type SimNao } from "@/lib/geradores/gerarLaudo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { processoId } = await req.json();
    if (!processoId) {
      return NextResponse.json({ erro: "processoId obrigatório" }, { status: 400 });
    }

    // ── Buscar processo ─────────────────────────────────────
    const { data: p, error: ep } = await supabase
      .from("processos")
      .select("*")
      .eq("codigo", processoId)
      .limit(1)
      .maybeSingle();

    if (ep || !p) {
      return NextResponse.json(
        { erro: "Processo não encontrado", detalhe: ep?.message },
        { status: 404 }
      );
    }

    // ── Buscar analista ────────────────────────────────────────
    let nomeAnalista = "";
    if (p.analista_id) {
      const { data: membro } = await supabase
        .from("usuarios")
        .select("nome, cargo, cau_crea")
        .eq("id", p.analista_id)
        .maybeSingle();
      if (membro?.nome) {
        nomeAnalista = membro.nome;
        if (membro.cargo) nomeAnalista += `
${membro.cargo}`;
        if (membro.cau_crea) nomeAnalista += `
${membro.cau_crea}`;
      }
    }
    // ── Buscar respostas do MAC ─────────────────────────────
    // Sessão 5A: o nome correto da tabela é `analises_mac` (não `mac_analises`).
    // Pega a análise mais recente por `numero_analise` para refletir a revisão
    // atual que vai pro laudo.
    const { data: mac } = await supabase
      .from("analises_mac")
      .select("*")
      .eq("processo_codigo", processoId)
      .order("numero_analise", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Helper para converter valor do banco em SimNao
    const sn = (val: unknown): SimNao => {
      if (val === true || val === "SIM" || val === "S" || val === "Sim") return "SIM";
      if (val === false || val === "NAO" || val === "N" || val === "Não") return "NAO";
      return "NA";
    };

    // Helper para ler campos do JSON dados
    const d = p.dados || {};
    const v = (campo: string) => d[campo]?.valor ?? null;

    // O textarea de "observações" acumula, além do texto do analista, blocos
    // de log automático gerados a cada leitura P3 (delimitados por
    // "━━━ LEITURA DO PROCESSO (MAC) ━━━"). Esse log é uso interno de tela —
    // não deve ir para o documento oficial. Mantém só o texto do analista.
    const stripLogAutomatico = (texto: string | null | undefined): string | undefined => {
      if (!texto) return undefined;
      const limpo = texto
        .split(/\n{2,}(?=━━━ LEITURA DO PROCESSO \(MAC\) ━━━)/)
        .filter((bloco) => !bloco.trimStart().startsWith("━━━ LEITURA DO PROCESSO (MAC) ━━━"))
        .join("\n\n")
        .trim();
      return limpo || undefined;
    };

    // ── Montar DadosLaudo ───────────────────────────────────
    const dados: DadosLaudo = {
      // Identificação
      numeroProcesso:   p.codigo + (v("processoFisico") ? " E " + v("processoFisico") : ""),
      proprietario:     v("proprietario"),
      logradouro:       v("logradouro"),
      quadra:           v("quadra"),
      lote:             v("lote"),
      bairro:           v("bairro"),

      // Despacho CHEADV
      numDespachoCheadv:  v("despacho"),
      pagDespachoCheadv:  v("seiCheadv"),

      // Documentação
      certidaoRegistro:           v("certidao"),
      artRrtLevantamento:         v("artLev"),
      levantamentoArquitetonico:  v("levantamento"),
      laudoTecnico:               v("laudo"),
      areaBemTombado:             v("tombado"),
      certidaoRememDesm:          v("certidaoRememDesm"),
      areaAeroportuaria:          v("vistoriaAreaAeroportuaria"),
      vistoriaFiscalFotografica:  v("vistoria"),
      embargo:                    v("embargo"),
      dataEmbargo:                v("dataEmb"),
      outorgaOnerosa:             v("onerosa"),
      despachoCheadvDoc:          v("despacho"),
      imagemGoogleEarth:          v("foto"),

      // Uso do Solo
      numUsoSolo:         v("usoSolo"),
      tipoUsoSolo:        v("tipoUso"),
      unidadeTerritorial: v("vistoriaUnidadeTerritorial"),
      certCorredorViario: v("certCorredorViario"),
      cnae1:              v("cnae1"),
      descCnae1:          v("descCnae1"),
      cnae2:              v("cnae2"),
      descCnae2:          v("descCnae2"),
      corredorViario:     v("corredor"),
      obsCorredorViario:  undefined,

      // Poço de Infiltração
      areaConstruida:         v("areaTotal"),
      pocoInfiltracao:        sn(v("caixa")),
      indiceCaptacao:         v("indiceCaptacao"),
      areaImpermeabilizada:   v("areaImpermeavel"),
      volumeCaixas:           v("volAt"),
      numCaixas:              v("caixas"),

      // Da Análise — Áreas
      areaLote:               v("areaTerreno"),
      areaRegularizar:        v("areaTotal"),
      areaExistenteAprovada:  v("existente"),
      areaTotalConstrucao:    v("areaTotal"),
      numPavimentos:          v("pav"),
      numUnidades:            v("unid"),
      areaAtividadeEconomica: v("vistoriaAreaComercial"),

      // Da Análise — Checkboxes
      edificacaoEstruturalDef: sn(v("vistoriaEstruturaConcluida")),
      ultrapassaAltura12m:     sn(v("vistoriaMais12m")),
      ocupaRecuoFrontal:       sn(v("vistoriaOcupaRecuo")),
      maxSetePavimentos:       sn(v("vistoriaMax7Pav")),
      alturaMaxima21m:         sn(v("vistoriaAltMax21m")),
      naoObstruiAreaPublica:   sn(v("vistoriaOcupaPublica")) === "SIM" ? "NAO" : "SIM",

      // Vistoria Fiscal
      levantamentoConferido:       sn(v("vistoriaLevante")),
      aberturaPortasRespeita:      sn(v("vistoriaEsquadriaDivisa")) === "SIM" ? "NAO" : "SIM",
      respeitaPasPublicoVizinhos:  sn(v("vistoriaCalcadas")),
      apresentaCalcadaRegular:     sn(v("vistoriaCalcadas")),
      apresentaPocoRecarga:        sn(v("caixa")),
      aberturaPortasNaDivisa:      sn(v("vistoriaEsquadriaDivisa")) === "SIM" ? "NAO" : "SIM",
      lancaAguasPluviais:          sn(v("vistoriaAguasPluviais")),

      // ANAC / Exército
      flAnac:     v("flAnac"),
      flExercito: v("flExercito"),

      // Taxa de Regularização
      areaTotalRegularizar:   v("areaTotal"),
      areaMultaRecuoFrontal:  v("areaRecuo"),
      areaMultaVertical:      v("areaVertical"),
      areaMultaGeral:         v("areaForaFrontal"),

      // Rodapé
      areaTerreno:          v("areaTerreno"),
      areaAprovadaRodape:   v("existente"),
      areaTotalRegRodape:   v("areaTotal"),
      areaTotalConstruida:  v("areaTotal"),

      // Emissão
      nomeAnalista,
      dataEmissao:  new Date(),

      observacoesFinais: stripLogAutomatico(mac?.observacoes),
    };

    const buffer = await gerarLaudo(dados);

    const nomeArquivo = `Laudo_${p.codigo.replace(/[/\\]/g, "-")}.xlsx`;

    // Registrar último documento emitido
    await supabase.from("processos").update({ dados: { ...(p.dados || {}), ultimo_documento: "Laudo" }, atualizado_em: new Date().toISOString() }).eq("codigo", processoId);

    // Relógio do processo: laudo é resultado definitivo.
    // Idempotente: só grava se ainda não houver data de conclusão registrada.
    await supabase
      .from("processos")
      .update({ analise_concluida_em: new Date().toISOString() })
      .eq("codigo", processoId)
      .is("analise_concluida_em", null);

    // ── MRP: grava geração do laudo automaticamente (falha silenciosa) ──
    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      const tipoProc = String(p.tipo_processo || "regularizacao");
      await gravarRegistroMRP({
        processo_codigo: processoId,
        tipo_processo: tipoProc,
        tipo_despacho: "laudo",
        numero_despacho: null,
        analise_id: mac?.id ?? null,
        numero_revisao: null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
    } catch (mrpErr) {
      console.warn("[MRP] falha ao gravar laudo:", mrpErr);
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e: any) {
    console.error("[gerar-laudo]", e);
    return NextResponse.json(
      { erro: "Erro ao gerar laudo", detalhe: e?.message },
      { status: 500 }
    );
  }
}