/**
 * app/api/mac/slot-05/concluir-analise/route.ts — marca o fim da PASSAGEM atual de análise.
 *
 * Isolada do Slot 1/2: só grava para tipo_processo = "slot_05" (via resolverProcessoSlot5), não
 * importa nada de app/api/despacho-regularizacao nem de app/api/despacho-aceite-sei.
 *
 * "Conclusão" aqui fecha a análise/passagem atual, NÃO o processo inteiro (decisão de
 * 02/09/2026): o processo pode voltar para retorno ou nova análise depois — isso não é
 * responsabilidade desta rota, que só registra que ESTA passagem terminou.
 *
 * Chamar só depois que o despacho já foi gerado e o número já foi commitado — nunca antes, e
 * nunca numa reemissão (reemitir não fecha nada de novo, o número já foi consumido antes).
 *
 * Não mexe em processos.status nem reativa o motor SQL morto (motor_concluir_analise,
 * marcar_processo_como_retorno) — auditoria de 02/09/2026 achou que esse motor está desligado há
 * meses (processos.status é 'CADASTRADO' em 80/80 linhas) e religá-lo sem que nada mais o
 * acompanhe teria o mesmo efeito da trava silenciosa já achada em gravarRegistroMRP.
 *
 * `processos.analise_concluida_em` é SOBRESCRITO a cada chamada — guarda a conclusão mais
 * recente, não só a primeira (diferente do Slot 1/2 hoje, que trava no ".is(...null)" e nunca
 * atualiza depois da primeira vez — comportamento antigo, fora de escopo aqui). Para o histórico
 * completo por passagem, use o evento ANALISE_CONCLUIDA em auditoria_eventos, que carrega
 * numero_analise no detalhe.
 *
 * Nada do corpo da requisição é gravado sem verificação: `numero_analise` só ESCOLHE qual
 * `analises_mac` conferir — não é aceito por si só. A rota busca essa análise de novo no banco,
 * confirma que é do mesmo processo/Slot 5 e que já tem `numero_despacho` commitado; o número e o
 * tipo de documento do evento vêm sempre dessa leitura, nunca do que o navegador mandou. Despacho
 * interno NÃO conta como conclusão (decisão de 02/09/2026) — só despacho ao interessado.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, numero_analise } = await req.json().catch(() => ({}));
    if (!codigo || !numero_analise) {
      return NextResponse.json({ ok: false, erro: "codigo e numero_analise obrigatórios" }, { status: 400 });
    }

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    // Releitura server-side, obrigatória: confirma que esta análise existe MESMO, é deste
    // processo, é do Slot 5, e já tem despacho commitado. numero_documento nunca vem do corpo da
    // requisição — só daqui.
    const { data: analise, error: erroAnalise } = await supabaseAdmin
      .from("analises_mac")
      .select("numero_analise, numero_despacho")
      .eq("processo_codigo", codigo)
      .eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .eq("numero_analise", numero_analise)
      .is("excluido_em", null)
      .maybeSingle();
    if (erroAnalise) return NextResponse.json({ ok: false, erro: erroAnalise.message }, { status: 500 });
    if (!analise) {
      return NextResponse.json({ ok: false, erro: "análise não encontrada para este processo no Slot 5" }, { status: 404 });
    }
    if (!analise.numero_despacho) {
      return NextResponse.json({ ok: false, erro: "esta análise ainda não tem despacho commitado — nada para concluir" }, { status: 400 });
    }

    const agora = new Date().toISOString();
    const falhas: string[] = [];

    const { error: erroProcesso } = await supabaseAdmin
      .from("processos")
      .update({ analise_concluida_em: agora })
      .eq("codigo", codigo);
    if (erroProcesso) {
      console.error("[slot-05/concluir-analise] processos.analise_concluida_em falhou:", erroProcesso.message);
      falhas.push("processos.analise_concluida_em");
    }

    const { error: erroEvento } = await supabaseAdmin.from("auditoria_eventos").insert({
      analista_id: usuario.id,
      analista_nome: "",
      modulo: "MAC",
      acao: "ANALISE_CONCLUIDA",
      processo_codigo: codigo,
      assunto_id: ASSUNTO_ID_SLOT5,
      detalhe: {
        numero_analise: analise.numero_analise,
        tipo_documento: "despacho",
        numero_documento: analise.numero_despacho,
        slot: TIPO_PROCESSO_SLOT5,
      },
      origem: "SISTEMA",
    });
    if (erroEvento) {
      console.error("[slot-05/concluir-analise] evento ANALISE_CONCLUIDA falhou:", erroEvento.message);
      falhas.push("auditoria_eventos");
    }

    return NextResponse.json({ ok: true, falhas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
