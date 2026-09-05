import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { obterStatusRadar } from "@/lib/urbi/radar";

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

    const [{ data: filaPendente }, { data: errosRecentes }, { data: reanalisesRecentes }] = await Promise.all([
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
    ]);

    return NextResponse.json({
      ok: true,
      cobertura,
      fila_pendente: filaPendente ?? [],
      erros_recentes: errosRecentes ?? [],
      reanalises_recentes: reanalisesRecentes ?? [],
    });
  } catch (e: any) {
    console.error("[admin/urbi/radar]", e?.message ?? e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao carregar painel do Radar." }, { status: 500 });
  }
}
