import { NextRequest, NextResponse } from "next/server";
import { classificarPaginaAmbigua, estimarCustoUsd } from "@/lib/documentosSei/visaoAmbiguas";
import { documentosVivosGeminiAtivo, documentosVivosRegularizacaoAtivo } from "@/lib/documentosSei/config";
import { autorizar } from "@/lib/autorizacao";
import { registrarChamadaIA } from "@/lib/iaUso";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GEMINI_MODEL } from "@/lib/constants";

/**
 * POST /api/analise-regularizacao/documentos-sei/analisar-pendentes — Fase 8 do plano Documentos
 * Vivos (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §6), exclusiva da Regularização (Slot 1).
 *
 * Só roda sob CLIQUE explícito do analista (nunca dentro do fluxo normal do Organizador) e só
 * classifica as páginas `classificacao_pendente` que a tela mandar — nunca o PDF inteiro de novo.
 * Devolve PROPOSTA de papel por página; quem decide se aceita é o analista.
 *
 * Atrás de DOIS interruptores: o do Organizador (Fase 2) e o do Gemini (Fase 8,
 * `urbis_config.documentos_vivos_gemini_ativo`, default desligado — gasta dinheiro de verdade).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 350 * 1024 * 1024;
const TETO_PAGINAS_POR_PROCESSO_HORA = 20;

export async function POST(req: NextRequest) {
  const [organizadorAtivo, geminiAtivo] = await Promise.all([
    documentosVivosRegularizacaoAtivo(), documentosVivosGeminiAtivo(),
  ]);
  if (!organizadorAtivo || !geminiAtivo) {
    return NextResponse.json(
      { ok: false, erro: "Análise de páginas ambíguas (Gemini) ainda não está ativada." },
      { status: 403 },
    );
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const processoCodigo = String(form.get("processo_codigo") ?? "");
  let paginas: number[];
  try {
    paginas = JSON.parse(String(form.get("paginas") ?? "[]"));
    if (!Array.isArray(paginas) || paginas.some((p) => typeof p !== "number")) throw new Error();
  } catch {
    return NextResponse.json({ ok: false, erro: "Lista de páginas inválida." }, { status: 400 });
  }
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ ok: false, erro: "Nenhum PDF enviado" }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, erro: "PDF grande demais" }, { status: 400 });
  }
  if (paginas.length === 0) {
    return NextResponse.json({ ok: true, resultados: [], custoTotalUsd: 0 });
  }

  const permissao = await autorizar(req, processoCodigo);
  if (!permissao.ok) return NextResponse.json({ ok: false, erro: permissao.erro }, { status: 403 });

  // teto por processo/hora — mesmo espírito do TETO_POR_PROCESSO de lib/visao/index.ts, contado
  // na mesma tabela urbis_api_calls (operação própria: nunca colide com outras métricas de IA).
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("urbis_api_calls").select("id", { count: "exact", head: true })
    .eq("processo_codigo", processoCodigo)
    .eq("operacao", "documentos_sei_paginas_ambiguas")
    .gte("criado_em", umaHoraAtras);
  if ((count ?? 0) + paginas.length > TETO_PAGINAS_POR_PROCESSO_HORA) {
    return NextResponse.json({
      ok: false,
      erro: `Teto de ${TETO_PAGINAS_POR_PROCESSO_HORA} página(s)/hora por processo atingido (${count ?? 0} já usada(s)).`,
    }, { status: 429 });
  }

  const buffer = new Uint8Array(await arquivo.arrayBuffer());
  const resultados: { pagina: number; papel: string | null; erro?: string }[] = [];
  let custoTotalUsd = 0;

  for (const pagina of paginas) {
    try {
      const r = await classificarPaginaAmbigua(buffer, pagina);
      custoTotalUsd += r.custoUsd;
      resultados.push({ pagina: r.pagina, papel: r.papel });
      await registrarChamadaIA({
        modulo: "LIP", slot: "regularizacao", operacao: "documentos_sei_paginas_ambiguas",
        processoCodigo, modelo: GEMINI_MODEL, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida,
        duracaoMs: Math.round(r.ms), status: "ok",
      });
    } catch (e: any) {
      resultados.push({ pagina, papel: null, erro: e?.message ?? String(e) });
      await registrarChamadaIA({
        modulo: "LIP", slot: "regularizacao", operacao: "documentos_sei_paginas_ambiguas",
        processoCodigo, status: "erro", motivoErro: e?.message ?? String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, resultados, custoTotalUsd });
}

export async function GET(req: NextRequest) {
  const nPaginas = Number(new URL(req.url).searchParams.get("paginas") ?? "0");
  return NextResponse.json({ ok: true, custoEstimadoUsd: estimarCustoUsd(nPaginas) });
}
