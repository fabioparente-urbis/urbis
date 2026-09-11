import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { agregarPortfolio } from "@/lib/documentosSei/analiseFluxo";
import {
  interpretacaoAssistidaFluxoAtiva,
  avaliarProntidaoBase,
  interpretarPortfolio,
} from "@/lib/documentosSei/interpretacaoAssistidaFluxo";

/**
 * POST /api/admin/fluxo/interpretar — Fase 13 do plano de leitura de PDF (§6, "Interpretação
 * assistida"). Cruza as estatísticas do portfólio (Fase 11) e devolve sugestões da IA, sempre
 * como proposta — nunca grava nada.
 *
 * DOIS PORTÕES antes de gastar um tostão com o Gemini (ver
 * lib/documentosSei/interpretacaoAssistidaFluxo.ts para o porquê de dois, não um):
 *   1. interruptor `urbis_config.interpretacao_assistida_fluxo_ativo` (false por padrão);
 *   2. base madura o bastante (mínimo de processos E de dias desde a primeira carga).
 *
 * Só irrestrito, mesmo gate de /api/admin/fluxo/portfolio.
 */
export const runtime = "nodejs";

/**
 * GET — só checa e devolve a prontidão da base (nenhum custo, não depende do interruptor). É o
 * que a tela usa pra decidir se mostra o botão habilitado ou o motivo de estar bloqueado.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("fluxo_processo_eventos")
    .select("processo_codigo, criado_em");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const codigos = new Set<string>();
  let primeiraCargaEm: string | null = null;
  for (const row of data ?? []) {
    codigos.add(row.processo_codigo);
    if (row.criado_em && (!primeiraCargaEm || row.criado_em < primeiraCargaEm)) primeiraCargaEm = row.criado_em;
  }

  const prontidao = avaliarProntidaoBase(codigos.size, primeiraCargaEm);
  const interruptorLigado = await interpretacaoAssistidaFluxoAtiva();
  return NextResponse.json({ ok: true, prontidao, interruptorLigado });
}

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  if (!(await interpretacaoAssistidaFluxoAtiva())) {
    return NextResponse.json({ ok: false, erro: "Interpretação assistida desligada (urbis_config)." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("fluxo_processo_eventos")
    .select("processo_codigo, titulo, setor, data_documento, criado_em")
    .order("processo_codigo");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const porProcesso = new Map<string, { titulo: string; setor: string | null; dataDocumento: string | null }[]>();
  let primeiraCargaEm: string | null = null;
  for (const row of data ?? []) {
    const lista = porProcesso.get(row.processo_codigo) ?? [];
    lista.push({ titulo: row.titulo, setor: row.setor, dataDocumento: row.data_documento });
    porProcesso.set(row.processo_codigo, lista);
    if (row.criado_em && (!primeiraCargaEm || row.criado_em < primeiraCargaEm)) primeiraCargaEm = row.criado_em;
  }

  const prontidao = avaliarProntidaoBase(porProcesso.size, primeiraCargaEm);
  if (!prontidao.pronta) {
    return NextResponse.json({ ok: false, erro: "Base ainda não madura para interpretação assistida.", prontidao }, { status: 409 });
  }

  const portfolio = agregarPortfolio([...porProcesso.values()]);
  const resultado = await interpretarPortfolio(portfolio);
  if (!resultado.ok) return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 502 });

  return NextResponse.json({ ok: true, sugestoes: resultado.sugestoes, prontidao });
}
