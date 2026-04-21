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

    // ── Buscar respostas do MAC ─────────────────────────────
    const { data: mac } = await supabase
      .from("mac_analises")
      .select("*")
      .eq("processo_codigo", processoId)
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

    // ── Montar DadosLaudo ───────────────────────────────────
    const dados: DadosLaudo = {
      // Identificação
      numeroProcesso:   p.codigo,
      proprietario:     v("proprietario"),
      logradouro:       v("logradouro"),
      quadra:           v("quadra"),
      lote:             v("lote"),
      bairro:           v("bairro"),

      // Despacho CHEADV
      numDespachoCheadv:  v("despacho"),
      pagDespachoCheadv:  v("pag"),

      // Documentação
      certidaoRegistro:           v("certidao"),
      artRrtLevantamento:         v("artLev"),
      levantamentoArquitetonico:  v("levantamento"),
      laudoTecnico:               v("laudo"),
      areaBemTombado:             v("tombado"),
      certidaoRememDesm:          undefined,
      areaAeroportuaria:          undefined,
      vistoriaFiscalFotografica:  v("vistoria"),
      embargo:                    v("embargo"),
      dataEmbargo:                v("dataEmb"),
      outorgaOnerosa:             v("onerosa"),
      despachoCheadvDoc:          v("despacho"),
      imagemGoogleEarth:          undefined,

      // Uso do Solo
      numUsoSolo:         v("usoSolo"),
      tipoUsoSolo:        v("tipoUso"),
      unidadeTerritorial: undefined,
      certCorredorViario: undefined,
      cnae1:              v("cnae1"),
      descCnae1:          undefined,
      cnae2:              v("cnae2"),
      descCnae2:          undefined,
      corredorViario:     v("corredor"),
      obsCorredorViario:  undefined,

      // Poço de Infiltração
      areaConstruida:         v("areaTotal"),
      pocoInfiltracao:        sn(v("caixa")),
      indiceCaptacao:         undefined,
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
      areaAtividadeEconomica: undefined,

      // Da Análise — Checkboxes
      edificacaoEstruturalDef: sn(mac?.itens?.edificacaoEstruturalDef),
      ultrapassaAltura12m:     sn(mac?.itens?.ultrapassaAltura12m),
      ocupaRecuoFrontal:       sn(mac?.itens?.ocupaRecuoFrontal),
      maxSetePavimentos:       sn(mac?.itens?.maxSetePavimentos),
      alturaMaxima21m:         sn(mac?.itens?.alturaMaxima21m),
      naoObstruiAreaPublica:   sn(mac?.itens?.naoObstruiAreaPublica),

      // Vistoria Fiscal
      levantamentoConferido:       sn(mac?.itens?.levantamentoConferido),
      aberturaPortasRespeita:      sn(mac?.itens?.aberturaPortasRespeita),
      respeitaPasPublicoVizinhos:  sn(mac?.itens?.respeitaPasPublicoVizinhos),
      apresentaCalcadaRegular:     sn(mac?.itens?.apresentaCalcadaRegular),
      apresentaPocoRecarga:        sn(mac?.itens?.apresentaPocoRecarga),
      aberturaPortasNaDivisa:      sn(mac?.itens?.aberturaPortasNaDivisa),
      lancaAguasPluviais:          sn(mac?.itens?.lancaAguasPluviais),

      // ANAC / Exército
      flAnac:     mac?.itens?.flAnac ?? undefined,
      flExercito: mac?.itens?.flExercito ?? undefined,

      // Taxa de Regularização
      areaTotalRegularizar:   v("areaTotal"),
      areaMultaRecuoFrontal:  v("areaRecuo"),
      areaMultaVertical:      v("areaVertical"),
      areaMultaGeral:         undefined,

      // Rodapé
      areaTerreno:          v("areaTerreno"),
      areaAprovadaRodape:   v("existente"),
      areaTotalRegRodape:   v("areaTotal"),
      areaTotalConstruida:  v("areaTotal"),

      // Emissão
      nomeAnalista: "",
      dataEmissao:  new Date(),

      observacoesFinais: mac?.observacoes ?? undefined,
    };

    const buffer = await gerarLaudo(dados);

    const nomeArquivo = `Laudo_${p.codigo.replace(/[/\\]/g, "-")}.xlsx`;

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