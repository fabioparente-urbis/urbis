/**
 * app/api/mac/slot-05/preencher-automatico/route.ts — pré-preenche o MAC do Slot 5 a partir do
 * LIP já lido da pasta, sem gastar IA.
 *
 * Isolado do Slot 1: não importa nada de app/api/mac/p3 nem de app/analise-regularizacao, não lê
 * nem grava lip_prompts, e resolve o processo pelo trio exato do Slot 5.
 *
 * NÃO grava nada. Devolve a proposta; quem decide gravar é a tela, depois do analista aceitar.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { gruposNaoAplicaveis } from "@/lib/mac-motor/slot5/aplicabilidade";
import { avaliarFiltros, type FiltroSlot5 } from "@/lib/mac-motor/slot5/filtrosDoBanco";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";

export const runtime = "nodejs";

/**
 * Junta o texto que a leitura da pasta já extraiu, agrupado por papel de documento.
 * Só lê o que o MHD guardou (`mhd_conteudos.texto`, por hash) — não reprocessa PDF nem chama IA.
 * Quando um papel tem mais de uma versão, os textos são concatenados: a busca é por presença do
 * tema no processo, então ler versão antiga junto só torna a afirmação de ausência mais segura.
 */
async function carregarTextosDaPasta(codigo: string): Promise<Record<string, string>> {
  const { data: docs } = await supabaseAdmin
    .from("mhd_documentos").select("id, papel").eq("processo_codigo", codigo).limit(200);
  if (!docs?.length) return {};

  const papelPorDoc = new Map(docs.map((d: any) => [d.id, d.papel as string]));
  const { data: versoes } = await supabaseAdmin
    .from("mhd_versoes").select("documento_id, conteudo_id")
    .in("documento_id", docs.map((d: any) => d.id)).limit(500);
  if (!versoes?.length) return {};

  const conteudoIds = [...new Set(versoes.map((v: any) => v.conteudo_id).filter(Boolean))];
  if (!conteudoIds.length) return {};

  const { data: conteudos } = await supabaseAdmin
    .from("mhd_conteudos").select("id, texto").in("id", conteudoIds).limit(500);
  const textoPorConteudo = new Map((conteudos ?? []).map((c: any) => [c.id, (c.texto ?? "") as string]));

  const acc: Record<string, string[]> = {};
  for (const v of versoes) {
    const papel = papelPorDoc.get((v as any).documento_id);
    const texto = textoPorConteudo.get((v as any).conteudo_id);
    if (!papel || !texto) continue;
    (acc[papel] ??= []).push(texto);
  }
  return Object.fromEntries(Object.entries(acc).map(([p, partes]) => [p, partes.join("\n")]));
}

/** Monta a proposta a partir dos filtros cadastrados em `mac_slot5_filtros`. */
async function propostaPorFiltrosDoBanco(
  filtros: FiltroSlot5[], lip: any, textos: Record<string, string>,
  codigo: string, camposPreenchidos: number, modeloId: string,
) {
  const { acionados, naoAcionados, indecisos, manuais } = avaliarFiltros(filtros, lip, textos);

  const gruposAlvo = [...new Set(acionados.flatMap((a) => a.grupos))];
  const itensAvulsos = [...new Set(acionados.flatMap((a) => a.itensIds))];

  const itensDoBanco: { id: string; grupo: string }[] = [];
  if (gruposAlvo.length) {
    const { data } = await supabaseAdmin.from("mac_checklist_itens")
      .select("id, grupo").eq("modelo_id", modeloId).in("grupo", gruposAlvo).eq("ativo", true).limit(2000);
    itensDoBanco.push(...((data ?? []) as any[]));
  }
  if (itensAvulsos.length) {
    const { data } = await supabaseAdmin.from("mac_checklist_itens")
      .select("id, grupo").eq("modelo_id", modeloId).in("id", itensAvulsos).eq("ativo", true).limit(2000);
    for (const it of (data ?? []) as any[]) {
      if (!itensDoBanco.some((x) => x.id === it.id)) itensDoBanco.push(it);
    }
  }

  // Quem decidiu cada grupo/item — o primeiro filtro acionado que o reivindica.
  const donoDoGrupo = new Map<string, typeof acionados[number]>();
  const donoDoItem = new Map<string, typeof acionados[number]>();
  for (const a of acionados) {
    for (const g of a.grupos) if (!donoDoGrupo.has(g)) donoDoGrupo.set(g, a);
    for (const i of a.itensIds) if (!donoDoItem.has(i)) donoDoItem.set(i, a);
  }

  const itens: Record<string, string> = {};
  const fontes: Record<string, string> = {};
  const contagem = new Map<string, { qtd: number; filtro: typeof acionados[number] }>();

  for (const it of itensDoBanco) {
    const dono = donoDoItem.get(it.id) ?? donoDoGrupo.get(it.grupo);
    if (!dono) continue;
    itens[it.id] = dono.statusAlvo;
    fontes[it.id] = `Filtro "${dono.nome}" — ${dono.justificativa}`;
    const atual = contagem.get(it.grupo);
    if (atual) atual.qtd++;
    else contagem.set(it.grupo, { qtd: 1, filtro: dono });
  }

  const porGrupo = [...contagem.entries()]
    .map(([grupo, { qtd, filtro }]) => ({
      grupo, qtd, regraId: filtro.nome, justificativa: filtro.justificativa,
    }))
    .sort((a, b) => b.qtd - a.qtd);

  return {
    ok: true, codigo, camposPreenchidos, origem: "banco" as const,
    itens, fontes, porGrupo,
    total: Object.keys(itens).length,
    filtrosAcionados: acionados.map((a) => ({ id: a.id, nome: a.nome, justificativa: a.justificativa })),
    aplicaveis: naoAcionados.map((n) => ({ regraId: n.nome, justificativa: n.justificativa })),
    indecisas: indecisos.map((i) => ({ regraId: i.id, nome: i.nome, camposFaltando: [i.motivo] })),
    manuais,
  };
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) {
      return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });
    }

    const { codigo } = await req.json().catch(() => ({ codigo: null }));
    if (!codigo) {
      return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    }

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const lip = (resolucao.processo.dados ?? {}) as Record<string, { valor?: string | null }>;
    const camposPreenchidos = Object.values(lip).filter((v) => v?.valor).length;
    if (camposPreenchidos === 0) {
      return NextResponse.json({
        ok: false,
        erro: "O LIP deste processo está vazio — leia a pasta no LIP antes de pré-preencher o MAC.",
      }, { status: 400 });
    }

    // Texto que a leitura da pasta já extraiu, por papel de documento. Nenhum PDF é reprocessado
    // e nenhuma chamada de IA acontece aqui — só releitura do que o MHD guardou por hash.
    const textosPorPapel = await carregarTextosDaPasta(codigo);

    // Todo item marcado precisa ser do checklist DO SLOT 5 — sem este recorte, um grupo de nome
    // igual em outro modelo (Regularização/Aceite) entraria na proposta.
    const modeloId = await modeloDoSlot5();
    if (!modeloId) {
      return NextResponse.json({
        ok: false, erro: "nenhum modelo de checklist cadastrado para o Slot 5",
      }, { status: 404 });
    }

    // Filtros cadastrados na tela têm prioridade. Enquanto a migration não roda (tabela ausente)
    // ou nenhum filtro existe, cai nas regras fixas do código — a tela nunca fica sem automação.
    const { data: filtrosBanco } = await supabaseAdmin
      .from("mac_slot5_filtros").select("*").eq("ativo", true).order("ordem").limit(200);

    if (filtrosBanco?.length) {
      return NextResponse.json(await propostaPorFiltrosDoBanco(
        filtrosBanco as any, lip, textosPorPapel, codigo, camposPreenchidos, modeloId,
      ));
    }

    const { naoAplicaveis, aplicaveis, indecisas } = gruposNaoAplicaveis(lip, textosPorPapel);

    const gruposNA = new Set(naoAplicaveis.flatMap((v) => v.grupos));
    if (gruposNA.size === 0) {
      return NextResponse.json({
        ok: true, codigo, camposPreenchidos,
        itens: {}, porGrupo: [], aplicaveis, indecisas,
        total: 0,
      });
    }

    const { data: itensDoChecklist, error } = await supabaseAdmin
      .from("mac_checklist_itens")
      .select("id, grupo")
      .eq("modelo_id", modeloId)
      .in("grupo", [...gruposNA])
      .eq("ativo", true)
      .limit(2000);
    if (error) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }

    // item_id → "nao_aplica", com a justificativa da regra que decidiu
    const justificativaPorGrupo = new Map<string, { regraId: string; justificativa: string }>();
    for (const v of naoAplicaveis) {
      for (const g of v.grupos) justificativaPorGrupo.set(g, { regraId: v.regraId, justificativa: v.justificativa });
    }

    const itens: Record<string, "nao_aplica"> = {};
    const fontes: Record<string, string> = {};
    const contagem = new Map<string, number>();
    for (const it of itensDoChecklist ?? []) {
      const g = (it as any).grupo as string;
      const just = justificativaPorGrupo.get(g);
      itens[(it as any).id] = "nao_aplica";
      fontes[(it as any).id] = `LIP · ${just?.regraId ?? "?"} — ${just?.justificativa ?? ""}`;
      contagem.set(g, (contagem.get(g) ?? 0) + 1);
    }

    const porGrupo = [...contagem.entries()].map(([grupo, qtd]) => ({
      grupo, qtd,
      regraId: justificativaPorGrupo.get(grupo)?.regraId ?? null,
      justificativa: justificativaPorGrupo.get(grupo)?.justificativa ?? null,
    })).sort((a, b) => b.qtd - a.qtd);

    return NextResponse.json({
      ok: true, codigo, camposPreenchidos,
      itens, fontes, porGrupo, aplicaveis, indecisas,
      total: Object.keys(itens).length,
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/preencher-automatico] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
