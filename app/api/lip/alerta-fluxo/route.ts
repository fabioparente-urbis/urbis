import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar, verificarOwnership } from "@/lib/auth";
import { situacaoMac, type TagProcesso, type UltimaPassadaMac } from "@/lib/bdi/situacao";

/**
 * GET /api/lip/alerta-fluxo — Fase 12 do plano de leitura de PDF (§3.4, "Alerta dentro do
 * processo": "Parado há 40 dias aguardando laudo de fiscalização.").
 *
 * Escopo Slot 1/2 só (regularizacao, aceite_sei) — o plano é "UPGRADE NA LEITURA DE PDF —
 * SLOT 1 E 2", e o CLAUDE.md exige isolamento entre slots; Slot 5 fica de fora de propósito.
 *
 * SÓ LEITURA, custo zero: nenhuma IA, nenhuma tabela nova. Reaproveita `situacaoMac` (mesma
 * classificação já usada na Pilha/BDI, lib/bdi/situacao.ts) e as colunas
 * `analise_iniciada_em`/`analise_concluida_em` que os 3 slots já gravam (ver
 * supabase/migrations/2026_07_16_add_relogios_analise.sql) — não inventa "setor atual", que não
 * existe como fato gravado para processo ativo (só para processo arquivado, via Fase 10); o
 * texto do alerta é sempre sobre TEMPO PARADO, honesto sobre o que o dado prova.
 *
 * Sem alarde para processo recente: só alerta a partir de LIMIAR_DIAS, mesmo corte de "faixa"
 * usado em lib/documentosSei/analiseFluxo.ts (30 dias).
 */
export const runtime = "nodejs";

const LIMIAR_DIAS = 30;

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const codigo = new URL(req.url).searchParams.get("codigo");
  if (!codigo) {
    return NextResponse.json({ ok: false, erro: "codigo é obrigatório." }, { status: 400 });
  }

  const { data: processo, error } = await supabase
    .from("processos")
    .select("tipo_processo, tags, analista_id, analise_iniciada_em, analise_concluida_em")
    .eq("codigo", codigo)
    .is("excluido_em", null)
    .maybeSingle();

  if (error) {
    console.error("[lip/alerta-fluxo] falha ao carregar processo:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao carregar o processo." }, { status: 500 });
  }
  if (!processo) return NextResponse.json({ ok: false, erro: "Processo não encontrado." }, { status: 404 });

  const semPermissao = verificarOwnership(ctx, (processo as any).analista_id);
  if (semPermissao) return semPermissao;

  const tipo = String((processo as any).tipo_processo ?? "").toLowerCase();
  if (tipo !== "regularizacao" && tipo !== "aceite_sei") {
    return NextResponse.json({ ok: true, alerta: null });
  }

  const tags: TagProcesso[] = Array.isArray((processo as any).tags) ? (processo as any).tags : [];

  const { data: analises } = await supabase
    .from("analises_mac")
    .select("numero_analise, status, numero_despacho, numero_parecer")
    .eq("processo_codigo", codigo)
    .is("excluido_em", null)
    .order("numero_analise", { ascending: true });

  const ultima = (analises && analises.length) ? analises[analises.length - 1] : null;
  const ultimaPassada: UltimaPassadaMac = ultima ? {
    numero_analise: Number(ultima.numero_analise) || 0,
    status: ultima.status,
    numero_despacho: ultima.numero_despacho,
    numero_parecer: ultima.numero_parecer,
  } : null;

  const sit = situacaoMac(ultimaPassada, tags);

  if (sit.classe === "Em análise") {
    const dias = ((processo as any).analise_concluida_em) ? null : diasDesde((processo as any).analise_iniciada_em);
    if (dias !== null && dias >= LIMIAR_DIAS) {
      return NextResponse.json({
        ok: true,
        alerta: { classe: "em_analise", dias, texto: `Em análise há ${dias} dias.` },
      });
    }
    return NextResponse.json({ ok: true, alerta: null });
  }

  if (sit.classe === "Aguardando retorno do interessado") {
    // A view guarda uma linha por despacho já emitido (histórico) — um processo com mais de um
    // ciclo tem várias; só a mais recente sem retorno ainda ("ainda aguardando") corresponde ao
    // que situacaoMac() classificou agora, então o filtro é obrigatório (achado ao escrever
    // esta rota: sem ele, .maybeSingle() falha com mais de uma linha).
    const { data: aguardando } = await supabase
      .from("vw_bdi_aguardando_retorno")
      .select("dias_aguardando_retorno")
      .eq("processo_codigo", codigo)
      .eq("situacao", "ainda aguardando")
      .maybeSingle();
    const dias = aguardando ? Number((aguardando as any).dias_aguardando_retorno) : null;
    if (dias !== null && Number.isFinite(dias) && dias >= LIMIAR_DIAS) {
      return NextResponse.json({
        ok: true,
        alerta: { classe: "aguardando_retorno", dias, texto: `Aguardando retorno do interessado há ${dias} dias.` },
      });
    }
    return NextResponse.json({ ok: true, alerta: null });
  }

  return NextResponse.json({ ok: true, alerta: null });
}
