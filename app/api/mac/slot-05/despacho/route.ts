/**
 * app/api/mac/slot-05/despacho/route.ts — emite o Despacho ao Interessado, EXCLUSIVO do Slot 5.
 *
 * Devolve o .docx pronto para download. Todo o conteúdo sai do que já está gravado:
 *   · cabeçalho ← LIP (processos.dados);
 *   · exigências ← itens marcados NÃO CONFORME na análise, na ordem do checklist;
 *   · Controle de Etapas ← data_despacho de CADA análise 1..5 (a da 1ª nunca é sobrescrita);
 *   · assinatura ← usuário logado no URBIS.
 *
 * NÃO consome número de despacho: quem faz isso é /api/numeracao/proximo, chamado pela tela antes
 * daqui — a mesma série e as mesmas regras dos Slots 1 e 2, por decisão do Fábio. Aqui o número
 * chega pronto. Assim um erro na geração do documento não queima um número da faixa.
 *
 * Isolada do Slot 1: não importa nada de app/api/despacho-regularizacao nem de lib/geradores.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { gerarDespachoAprovacaoProjeto, type ItemNaoConforme } from "@/lib/mac-motor/slot5/gerarDespacho";

export const runtime = "nodejs";

const HOJE_BR = () => new Date().toLocaleDateString("pt-BR");

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, numeroDespacho, dataEmissao, analiseId, padrao_id } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    if (!numeroDespacho) return NextResponse.json({ ok: false, erro: "número do despacho obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const dados = (resolucao.processo.dados ?? {}) as Record<string, any>;
    const valor = (chave: string) => {
      const v = dados?.[chave]?.valor;
      return v === null || v === undefined ? "" : String(v).trim();
    };

    const modeloId = await modeloDoSlot5();
    if (!modeloId) return NextResponse.json({ ok: false, erro: "sem modelo de checklist do Slot 5" }, { status: 404 });

    // Todas as análises do processo: a atual (para as exigências) e as demais (para a tabela de etapas).
    const { data: analises } = await supabaseAdmin
      .from("analises_mac")
      .select("id, numero_analise, itens, data_despacho, observacoes_por_item")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .is("excluido_em", null).order("numero_analise", { ascending: true }).limit(10);
    if (!analises?.length) {
      return NextResponse.json({ ok: false, erro: "este processo ainda não tem análise gravada" }, { status: 400 });
    }

    const alvo = (analiseId ? analises.find((a: any) => a.id === analiseId) : null)
      ?? analises[analises.length - 1];
    const data = String(dataEmissao ?? "").match(/^\d{2}\/\d{2}\/\d{4}$/) ? String(dataEmissao) : HOJE_BR();

    // Controle de Etapas: uma data por análise. A da análise sendo emitida agora usa a data
    // escolhida no modal (ela só vai para o banco quando a numeração comita).
    const datasEtapas: (string | null)[] = [null, null, null, null, null];
    for (const a of analises as any[]) {
      const i = Number(a.numero_analise) - 1;
      if (i < 0 || i > 4) continue;
      datasEtapas[i] = a.id === alvo.id ? data : (a.data_despacho || null);
    }

    // Exigências = itens NÃO CONFORME, na ordem do checklist. Só itens ATIVOS: uma marca presa a
    // item desativado sumiria calada do despacho, então é melhor não existir do que enganar.
    const marcas = ((alvo as any).itens ?? {}) as Record<string, string>;
    const obsPorItem = ((alvo as any).observacoes_por_item ?? {}) as Record<string, string>;
    const idsNaoConformes = Object.keys(marcas).filter((k) => marcas[k] === "nao_conforme");

    let naoConformes: ItemNaoConforme[] = [];
    if (idsNaoConformes.length) {
      const [{ data: itens }, { data: catalogo }] = await Promise.all([
        supabaseAdmin
          .from("mac_checklist_itens").select("id, texto, grupo, ordem")
          .eq("modelo_id", modeloId).eq("ativo", true)
          .in("id", idsNaoConformes).order("ordem", { ascending: true }).limit(2000),
        // Posição de cada grupo no índice do checklist. Onze grupos do Slot 5 têm itens
        // acrescentados depois, com `ordem` na casa dos 9000; sem a menor ordem do grupo, um
        // deles apareceria no fim do despacho mesmo estando no meio da tela.
        supabaseAdmin
          .from("mac_checklist_itens").select("grupo, ordem")
          .eq("modelo_id", modeloId).eq("ativo", true).limit(2000),
      ]);
      const ordemDoGrupo = new Map<string, number>();
      for (const c of (catalogo ?? []) as any[]) {
        const g = String(c.grupo ?? "");
        const o = Number(c.ordem ?? 0);
        if (!ordemDoGrupo.has(g) || o < ordemDoGrupo.get(g)!) ordemDoGrupo.set(g, o);
      }
      naoConformes = (itens ?? []).map((i: any) => ({
        texto: String(i.texto ?? ""), grupo: String(i.grupo ?? ""), ordem: Number(i.ordem ?? 0),
        ordemGrupo: ordemDoGrupo.get(String(i.grupo ?? "")) ?? Number(i.ordem ?? 0),
        // A observação do analista naquele item sai logo abaixo da exigência no documento.
        observacao: obsPorItem[i.id] ?? null,
      }));
    }
    const perdidos = idsNaoConformes.length - naoConformes.length;

    // Padrão de despacho: busca o texto NO SERVIDOR pelo id — nunca confia em
    // texto vindo do client. Quando presente, substitui inteiramente as
    // exigências do checklist no documento (naoConformes continua sendo
    // gravado no MDP pelo client, para auditoria — ver registrarNosSatelites).
    let corpoPersonalizado: string | undefined;
    let padraoTitulo: string | undefined;
    if (padrao_id) {
      const { data: padrao } = await supabaseAdmin
        .from("despacho_padroes")
        .select("titulo, corpo")
        .eq("id", padrao_id)
        .eq("ativo", true)
        .maybeSingle();
      if (padrao?.corpo) { corpoPersonalizado = padrao.corpo; padraoTitulo = padrao.titulo; }
    }

    // Assinatura: o usuário logado, não o dono do processo — quem assina é quem emite.
    const { data: membro } = await supabaseAdmin
      .from("usuarios").select("nome, cargo, cau_crea").eq("id", usuario.id).maybeSingle();

    const buffer = await gerarDespachoAprovacaoProjeto({
      codigo,
      numeroProcessoFisico: valor("processoFisico"),
      interessado: valor("proprietario") || codigo,
      assunto: "APROVAÇÃO DE PROJETO",
      numeroDespacho: String(numeroDespacho),
      dataEmissao: data,
      cheadvN: valor("cheadvN") || null,
      naoConformes,
      corpoPersonalizado,
      datasEtapas,
      assinante: {
        nome: (membro as any)?.nome || "—",
        cargo: (membro as any)?.cargo || null,
        registro: (membro as any)?.cau_crea || null,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="despacho_${codigo}_${numeroDespacho}.docx"`,
        // A tela mostra estes números como conferência do que entrou no documento.
        // Com padrão aplicado, o documento não leva as exigências do checklist —
        // os headers refletem 0/0 e um sinalizador à parte, pra notificação da
        // tela não afirmar "N exigências" sobre algo que não foi impresso.
        "X-Exigencias": corpoPersonalizado ? "0" : String(naoConformes.length),
        "X-Exigencias-Perdidas": corpoPersonalizado ? "0" : String(perdidos > 0 ? perdidos : 0),
        ...(padraoTitulo ? { "X-Padrao-Aplicado": encodeURIComponent(padraoTitulo) } : {}),
      },
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/despacho]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
