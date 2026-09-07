import { NextRequest, NextResponse } from "next/server";
import { classificarPaginaAmbigua, estimarCustoUsd, hashPdf } from "@/lib/documentosSei/visaoAmbiguas";
import { contarPaginas } from "@/lib/visao/rasterizar";
import { documentosVivosGeminiAtivo, documentosVivosRegularizacaoAtivo } from "@/lib/documentosSei/config";
import { autorizar } from "@/lib/autorizacao";
import { registrarChamadaIA } from "@/lib/iaUso";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GEMINI_MODEL, AVISO_IA_DESLIGADA } from "@/lib/constants";

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

/**
 * Teto GLOBAL por hora, somando todos os processos e todos os usuários. Acrescentado em
 * 07/09/2026 (§23.6 da auditoria): sozinho, o teto por processo NÃO limita o gasto — 20
 * páginas/hora × N processos abertos não tem topo. Este é o número que de fato impede a conta de
 * escapar, que é a regra de custo zero do projeto.
 *
 * Por que global e não "por usuário", como `lib/visao/index.ts` faz: `urbis_api_calls` não tem
 * coluna de usuário, e acrescentar uma é migration numa tabela que TODO o registro de IA usa
 * (LIP s2/s3, visão do Slot 5) — risco desproporcional para o que se quer aqui, que é um teto de
 * gasto, não repartição justa entre analistas. Um teto global entrega isso sem tocar em schema.
 * Se um dia houver muitos analistas concorrendo, aí sim vale a coluna e o teto por usuário.
 *
 * Ordem de grandeza para calibrar: ~US$ 0,0008 por página, então 200 páginas/hora é ~US$ 0,17/h
 * no pior caso. O teto não existe para economizar centavos — existe para que um laço com defeito
 * ou um clique repetido não vire uma conta de verdade.
 */
const TETO_PAGINAS_GLOBAL_HORA = 200;

export async function POST(req: NextRequest) {
  const [organizadorAtivo, geminiAtivo] = await Promise.all([
    documentosVivosRegularizacaoAtivo(), documentosVivosGeminiAtivo(),
  ]);
  /**
   * Os DOIS bloqueios existem, mas dizem coisas diferentes ao analista (regra do Fábio,
   * 07/09/2026 — `docs/URBIS_PLANO_GOVERNANCA_IA.md` §5):
   * - Organizador desligado: a aba inteira não deveria estar visível. Não é assunto de gasto.
   * - Gemini desligado: é gasto travado, e o analista precisa saber que existe alguém que
   *   destrava — senão ele só vê "não funcionou" e não tem o que fazer com essa informação.
   */
  if (!organizadorAtivo) {
    return NextResponse.json(
      { ok: false, erro: "O Organizador de PDF SEI não está ativado para a Regularização." },
      { status: 403 },
    );
  }
  if (!geminiAtivo) {
    return NextResponse.json({ ok: false, erro: AVISO_IA_DESLIGADA, iaDesligada: true }, { status: 403 });
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const processoCodigo = String(form.get("processo_codigo") ?? "");
  let paginas: number[];
  try {
    const bruto = JSON.parse(String(form.get("paginas") ?? "[]"));
    if (!Array.isArray(bruto)) throw new Error();
    // A lista vem do cliente. Antes só o TIPO era conferido (§23.6 / B2 da auditoria): página
    // repetida pagava duas vezes, e número negativo ou fora do PDF virava erro registrado como
    // chamada de IA. Agora: inteiro positivo, sem repetição, em ordem — o intervalo real do PDF é
    // conferido adiante, quando o arquivo já está aberto.
    paginas = [...new Set(bruto)]
      .filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1)
      .sort((a, b) => a - b);
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

  const { count: countGlobal } = await supabaseAdmin
    .from("urbis_api_calls").select("id", { count: "exact", head: true })
    .eq("operacao", "documentos_sei_paginas_ambiguas")
    .gte("criado_em", umaHoraAtras);
  if ((countGlobal ?? 0) + paginas.length > TETO_PAGINAS_GLOBAL_HORA) {
    return NextResponse.json({
      ok: false,
      erro: `Teto global de ${TETO_PAGINAS_GLOBAL_HORA} página(s)/hora atingido (${countGlobal ?? 0} já usada(s) no sistema).`,
    }, { status: 429 });
  }

  const buffer = new Uint8Array(await arquivo.arrayBuffer());

  // agora que o PDF está aberto, dá pra recusar página fora do intervalo real em vez de deixar o
  // rasterizador estourar e o erro virar chamada registrada (§23.6 / B2).
  const totalPaginas = await contarPaginas(buffer);
  const foraDoIntervalo = paginas.filter((p) => p > totalPaginas);
  if (foraDoIntervalo.length) {
    return NextResponse.json({
      ok: false,
      erro: `Página(s) fora do PDF (${totalPaginas} páginas): ${foraDoIntervalo.join(", ")}.`,
    }, { status: 400 });
  }

  const hashDocumento = hashPdf(buffer); // uma vez por requisição — chave do cache
  const resultados: { pagina: number; papel: string | null; erro?: string }[] = [];
  let custoTotalUsd = 0;
  let reaproveitadas = 0;
  let cobradas = 0;

  for (const pagina of paginas) {
    /**
     * Teto reconferido A CADA PÁGINA, não só uma vez no começo (§23.6 / B1). Não elimina a corrida
     * entre dois cliques simultâneos — para isso seria preciso reservar no banco — mas encolhe a
     * janela de "um lote inteiro" para "uma página", que é o suficiente para o dano possível aqui.
     * Só conta o que foi COBRADO: página servida pelo cache não gastou nada e não consome teto.
     */
    if (cobradas > 0) {
      const { count: agora } = await supabaseAdmin
        .from("urbis_api_calls").select("id", { count: "exact", head: true })
        .eq("operacao", "documentos_sei_paginas_ambiguas")
        .gte("criado_em", umaHoraAtras);
      if ((agora ?? 0) >= TETO_PAGINAS_GLOBAL_HORA) {
        resultados.push({ pagina, papel: null, erro: "teto global atingido durante a análise" });
        continue;
      }
    }
    try {
      const r = await classificarPaginaAmbigua(buffer, pagina, hashDocumento);
      custoTotalUsd += r.custoUsd;
      resultados.push({ pagina: r.pagina, papel: r.papel });
      if (r.reaproveitada) { reaproveitadas++; continue; } // cache: não custou, não registra chamada
      cobradas++;
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

  return NextResponse.json({ ok: true, resultados, custoTotalUsd, reaproveitadas, cobradas });
}

export async function GET(req: NextRequest) {
  const nPaginas = Number(new URL(req.url).searchParams.get("paginas") ?? "0");
  return NextResponse.json({ ok: true, custoEstimadoUsd: estimarCustoUsd(nPaginas) });
}
