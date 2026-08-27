import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";

export const runtime = "nodejs";

function chaveDia(iso: string) {
  return iso.slice(0, 10);
}
function chaveMes(iso: string) {
  return iso.slice(0, 7);
}
/** Semana ISO (segunda a domingo), no formato AAAA-Www. */
function chaveSemana(iso: string) {
  const d = new Date(iso);
  const data = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diaSemana = (data.getUTCDay() + 6) % 7;
  data.setUTCDate(data.getUTCDate() - diaSemana + 3);
  const primeiroQuinta = new Date(Date.UTC(data.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round(((data.getTime() - primeiroQuinta.getTime()) / 86400000 - 3 + ((primeiroQuinta.getUTCDay() + 6) % 7)) / 7);
  return `${data.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/**
 * GET /api/admin/rastreabilidade/ia
 *
 * Uso real da API Gemini (urbis_api_calls) e aportes de crédito (urbis_aportes).
 * Agregações por dia/semana/mês e por processo/slot são calculadas aqui em cima
 * das últimas chamadas — sem view no banco, pra não duplicar a fonte de verdade.
 */
export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const noventaDiasAtras = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: chamadas, error: errChamadas }, { data: aportes, error: errAportes }] = await Promise.all([
      supabaseAdmin
        .from("urbis_api_calls")
        .select("criado_em,status,modulo,slot,operacao,processo_codigo,tamanho_bytes,duracao_ms,modelo,tokens_entrada,tokens_saida,custo_estimado_usd,motivo_erro")
        .gte("criado_em", noventaDiasAtras)
        .order("criado_em", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("urbis_aportes")
        .select("*")
        .order("data_hora", { ascending: false }),
    ]);

    if (errChamadas) return NextResponse.json({ ok: false, erro: errChamadas.message }, { status: 500 });
    if (errAportes) return NextResponse.json({ ok: false, erro: errAportes.message }, { status: 500 });

    const linhas = chamadas ?? [];

    const agora = Date.now();
    const inicioHoje = chaveDia(new Date().toISOString());
    const seteDiasAtras = new Date(agora - 7 * 24 * 60 * 60 * 1000).toISOString();
    const trintaDiasAtras = new Date(agora - 30 * 24 * 60 * 60 * 1000).toISOString();

    function resumoDesde(desdeIso: string | null) {
      const filtradas = desdeIso ? linhas.filter((l: any) => l.criado_em >= desdeIso) : linhas;
      return {
        chamadas: filtradas.length,
        erros: filtradas.filter((l: any) => l.status === "erro").length,
        custoEstimadoUsd: Number(filtradas.reduce((acc: number, l: any) => acc + (l.custo_estimado_usd ?? 0), 0).toFixed(4)),
      };
    }

    function agrupar(chaveFn: (iso: string) => string) {
      const acc: Record<string, { chamadas: number; erros: number; custoEstimadoUsd: number }> = {};
      for (const l of linhas) {
        const k = chaveFn(l.criado_em);
        if (!acc[k]) acc[k] = { chamadas: 0, erros: 0, custoEstimadoUsd: 0 };
        acc[k].chamadas += 1;
        if (l.status === "erro") acc[k].erros += 1;
        acc[k].custoEstimadoUsd += l.custo_estimado_usd ?? 0;
      }
      return Object.entries(acc)
        .map(([chave, v]) => ({ chave, ...v, custoEstimadoUsd: Number(v.custoEstimadoUsd.toFixed(4)) }))
        .sort((a, b) => (a.chave < b.chave ? 1 : -1));
    }

    function agruparPor(campo: "processo_codigo" | "slot") {
      const acc: Record<string, { chamadas: number; erros: number; custoEstimadoUsd: number; ultimaChamada: string }> = {};
      for (const l of linhas) {
        const k = l[campo] || "(sem valor)";
        if (!acc[k]) acc[k] = { chamadas: 0, erros: 0, custoEstimadoUsd: 0, ultimaChamada: l.criado_em };
        acc[k].chamadas += 1;
        if (l.status === "erro") acc[k].erros += 1;
        acc[k].custoEstimadoUsd += l.custo_estimado_usd ?? 0;
        if (l.criado_em > acc[k].ultimaChamada) acc[k].ultimaChamada = l.criado_em;
      }
      return Object.entries(acc)
        .map(([chave, v]) => ({ chave, ...v, custoEstimadoUsd: Number(v.custoEstimadoUsd.toFixed(4)) }))
        .sort((a, b) => b.chamadas - a.chamadas);
    }

    const porMes = agrupar(chaveMes);
    const mediaMensalReais = (() => {
      const totalAportes = (aportes ?? []).reduce((acc: number, a: any) => acc + Number(a.valor_reais), 0);
      if (!aportes?.length) return null;
      const maisAntigo = aportes.reduce((min: any, a: any) => (a.data_hora < min ? a.data_hora : min), aportes[0].data_hora);
      const meses = Math.max(1, (agora - new Date(maisAntigo).getTime()) / (30 * 24 * 60 * 60 * 1000));
      return Number((totalAportes / meses).toFixed(2));
    })();

    return NextResponse.json({
      ok: true,
      resumo: {
        hoje: resumoDesde(inicioHoje),
        ultimos7Dias: resumoDesde(seteDiasAtras),
        ultimos30Dias: resumoDesde(trintaDiasAtras),
      },
      porDia: agrupar(chaveDia).slice(0, 30),
      porSemana: agrupar(chaveSemana).slice(0, 12),
      porMes,
      porProcesso: agruparPor("processo_codigo").slice(0, 30),
      porSlot: agruparPor("slot"),
      recentes: linhas.slice(0, 100),
      aportes: aportes ?? [],
      totalAportesReais: Number((aportes ?? []).reduce((acc: number, a: any) => acc + Number(a.valor_reais), 0).toFixed(2)),
      mediaMensalReais,
      linkPagamento: "https://aistudio.google.com/app/billing",
    });
  } catch (e: any) {
    console.error("[rastreabilidade/ia GET]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}

/**
 * POST /api/admin/rastreabilidade/ia — registra manualmente um aporte de crédito
 * (a Google não expõe API para ler isso automaticamente; quem confirma é o analista
 * depois de recarregar no AI Studio).
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, erro: "corpo da requisição inválido" }, { status: 400 });

    const dataHora = typeof body.dataHora === "string" ? body.dataHora : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const valorReais = Number(body.valorReais);
    const contaFaturamento = typeof body.contaFaturamento === "string" ? body.contaFaturamento.trim() || null : null;
    const projeto = typeof body.projeto === "string" ? body.projeto.trim() || null : null;
    const observacao = typeof body.observacao === "string" ? body.observacao.trim() || null : null;

    if (!dataHora) return NextResponse.json({ ok: false, erro: "dataHora obrigatória" }, { status: 400 });
    if (!email) return NextResponse.json({ ok: false, erro: "email obrigatório" }, { status: 400 });
    if (!valorReais || valorReais <= 0) return NextResponse.json({ ok: false, erro: "valorReais precisa ser maior que zero" }, { status: 400 });

    const { error } = await supabaseAdmin.from("urbis_aportes").insert({
      data_hora: new Date(dataHora).toISOString(),
      email, valor_reais: valorReais,
      conta_faturamento: contaFaturamento, projeto, observacao,
      origem: "manual",
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[rastreabilidade/ia POST]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
