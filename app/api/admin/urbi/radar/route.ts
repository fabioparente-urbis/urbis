import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { obterStatusRadar } from "@/lib/urbi/radar";
import { obterEstadoJobRadar } from "@/lib/urbi/radarJob";

/**
 * GET /api/admin/urbi/radar — painel administrativo do Radar silencioso (Camada 1). Só LEITURA:
 * não dispara detecção nem processamento (isso são /api/urbi/radar/detectar e /processar).
 * Restrito a perfil irrestrito (Administrador/Diretora), mesmo padrão de
 * app/api/admin/urbi/receitas-visao/route.ts.
 *
 * `?codigo=X` devolve o HISTÓRICO completo (todas as versões) daquele processo, em vez do
 * painel agregado.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo");

  if (codigo) {
    const { data, error } = await supabaseAdmin
      .from("urbi_radar_retratos")
      .select("*")
      .eq("processo_codigo", codigo)
      .order("versao", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, historico: data ?? [] });
  }

  try {
    const cobertura = await obterStatusRadar({ userId: ctx.userId, irrestrito: ctx.irrestrito, gerencia: ctx.gerencia });
    const estadoJob = await obterEstadoJobRadar();

    const [{ data: filaPendente }, { data: errosRecentes }, { data: reanalisesRecentes }, { data: retratosParaEvidencia }] = await Promise.all([
      supabaseAdmin.from("urbi_radar_retratos")
        .select("processo_codigo, tipo_processo, estado, motivo_disparo, criado_em, iniciado_em")
        .in("estado", ["pendente", "em_atualizacao"])
        .order("criado_em", { ascending: true })
        .limit(50),
      supabaseAdmin.from("urbi_radar_retratos")
        .select("processo_codigo, erro, concluido_em, versao")
        .eq("estado", "erro")
        .order("concluido_em", { ascending: false })
        .limit(20),
      supabaseAdmin.from("urbi_radar_retratos")
        .select("processo_codigo, versao, estado, motivo_disparo, concluido_em, alertas")
        .in("estado", ["atualizado", "incompleto"])
        .order("concluido_em", { ascending: false })
        .limit(30),
      supabaseAdmin.from("urbi_radar_retratos")
        .select("processo_codigo, versao, linha_evidencia")
        .in("estado", ["atualizado", "incompleto"])
        .order("versao", { ascending: false }),
    ]);

    // ETAPA 4 (05/09/2026) — cobertura da linha de evidência: quantos retratos (versão mais
    // recente por processo) já têm o bloco calculado, e quantos processos têm pelo menos um
    // despacho/parecer sem vínculo estruturado com a numeração — nunca recalcula nada, só conta
    // o que já está gravado.
    const vistosEvidencia = new Set<string>();
    let comLinhaEvidencia = 0;
    let semVinculoEstruturado = 0;
    for (const linha of (retratosParaEvidencia ?? []) as any[]) {
      if (vistosEvidencia.has(linha.processo_codigo)) continue;
      vistosEvidencia.add(linha.processo_codigo);
      const bloco = linha.linha_evidencia;
      if (!bloco) continue;
      comLinhaEvidencia++;
      if ((bloco.registros ?? []).some((r: any) => r.resultado === "sem_vinculo_estruturado")) semVinculoEstruturado++;
    }

    return NextResponse.json({
      ok: true,
      cobertura,
      estado_job: estadoJob,
      cobertura_linha_evidencia: {
        com_linha_evidencia: comLinhaEvidencia,
        total_com_retrato: vistosEvidencia.size,
        sem_vinculo_estruturado: semVinculoEstruturado,
        parcial: comLinhaEvidencia < cobertura.totalVisiveis,
      },
      fila_pendente: filaPendente ?? [],
      erros_recentes: errosRecentes ?? [],
      reanalises_recentes: reanalisesRecentes ?? [],
    });
  } catch (e: any) {
    console.error("[admin/urbi/radar]", e?.message ?? e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao carregar painel do Radar." }, { status: 500 });
  }
}
