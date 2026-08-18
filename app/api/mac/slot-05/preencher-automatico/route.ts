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
import { gruposNaoAplicaveis, textoCitaAlgum } from "@/lib/mac-motor/slot5/aplicabilidade";
import { avaliarFiltros, type FiltroSlot5 } from "@/lib/mac-motor/slot5/filtrosDoBanco";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";

export const runtime = "nodejs";

/** Nomes das regras fixas no vocabulário dos botões de filtro do analista. */
const ROTULO_REGRA: Record<string, string> = {
  APROVACAO_NAO_E_MODIFICACAO: "APRO DE PROJ",
  PORTE_NAO_E_GRANDE: "MEDIO PORTE",
  SEM_USO_HABITACIONAL: "COMERCIAL",
  SEM_OUTORGA_ONEROSA: "S/ ONEROSA",
  SEM_POSTO_COMBUSTIVEL: "NÃO É POSTO",
  SEM_QUITINETE_PENSAO: "NÃO É PENSÃO",
  COM_CORREDOR_VIARIO: "S/ CORREDOR",
  SEM_CARGA_DESCARGA: "S/ CARGA E DES",
  SEM_SUBSOLO: "S/ SUBSOLO",
  SEM_EIT_EIV: "S/ EIT E EIV",
  SEM_EMBARQUE_DESEMBARQUE: "S/ EMB E DESE",
  SEM_BAIA_DESACELERACAO: "S/ BAIA DE DES",
  SEM_MARQUISE: "S/ MARQUISE",
  SEM_AOS_ARAU: "FORA AOS/ARAU",
  SEM_ZONA_AEROPORTUARIA: "S/ ZONA AEROP",
};

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

  // Cada filtro carrega os PRÓPRIOS itens — o analista aceita ou recusa um por um, inclusive os
  // que o motor não recomendou (ele pode saber algo que o documento não diz).
  const porNome = new Map(filtros.map((f) => [f.nome, f]));

  // Catálogo COMPLETO do modelo: `termos_item` casa pelo texto do item, então o alvo de um
  // filtro pode estar em qualquer grupo — não dá para buscar só os grupos declarados.
  const { data: catalogoBruto } = await supabaseAdmin.from("mac_checklist_itens")
    .select("id, grupo, texto").eq("modelo_id", modeloId).eq("ativo", true).limit(2000);
  const catalogo = (catalogoBruto ?? []) as { id: string; grupo: string; texto: string }[];

  const itensDoFiltro = (nome: string) => {
    const f = porNome.get(nome);
    if (!f) return [] as typeof catalogo;
    const grupos = new Set(f.grupos ?? []);
    const avulsos = new Set(f.itens_ids ?? []);
    const termos = f.termos_item ?? [];
    return catalogo.filter((it) =>
      grupos.has(it.grupo) || avulsos.has(it.id) || !!textoCitaAlgum(it.texto ?? "", termos));
  };

  const montar = (nome: string, justificativa: string, recomendado: boolean) => {
    const f = porNome.get(nome);
    const itens = itensDoFiltro(nome);
    const porGrupo = new Map<string, number>();
    for (const it of itens) porGrupo.set(it.grupo, (porGrupo.get(it.grupo) ?? 0) + 1);
    return {
      id: f?.id ?? nome,
      nome,
      recomendado,
      justificativa,
      statusAlvo: f?.status_alvo ?? "nao_aplica",
      qtd: itens.length,
      itensIds: itens.map((i) => i.id),
      grupos: [...porGrupo.entries()].map(([grupo, qtd]) => ({ grupo, qtd })).sort((a, b) => b.qtd - a.qtd),
    };
  };

  const recomendados = acionados.map((a) => montar(a.nome, a.justificativa, true));
  const naoRecomendados = naoAcionados.map((n) => montar(n.nome, n.justificativa, false));

  const totalRecomendado = [...new Set(recomendados.flatMap((r) => r.itensIds))].length;

  return {
    ok: true, codigo, camposPreenchidos, origem: "banco" as const,
    filtros: [...recomendados, ...naoRecomendados],
    total: totalRecomendado,
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

    // ── Fallback: regras fixas do código, no MESMO formato por filtro ──────────
    const { naoAplicaveis, aplicaveis, indecisas } = gruposNaoAplicaveis(lip, textosPorPapel);

    // Catálogo completo: `termosItem` alcança item em qualquer grupo.
    const { data: catBruto, error: erroCat } = await supabaseAdmin
      .from("mac_checklist_itens").select("id, grupo, texto")
      .eq("modelo_id", modeloId).eq("ativo", true).limit(2000);
    if (erroCat) return NextResponse.json({ ok: false, erro: erroCat.message }, { status: 500 });
    const catalogo = (catBruto ?? []) as { id: string; grupo: string; texto: string }[];

    const montar = (
      v: { regraId: string; grupos: string[]; termosItem?: string[]; justificativa: string },
      recomendado: boolean,
    ) => {
      const grupos = new Set(v.grupos);
      const termos = v.termosItem ?? [];
      const itens = catalogo.filter((it) =>
        grupos.has(it.grupo) || !!textoCitaAlgum(it.texto ?? "", termos));
      const porGrupo = new Map<string, number>();
      for (const it of itens) porGrupo.set(it.grupo, (porGrupo.get(it.grupo) ?? 0) + 1);
      return {
        id: v.regraId, nome: ROTULO_REGRA[v.regraId] ?? v.regraId, recomendado,
        justificativa: v.justificativa, statusAlvo: "nao_aplica" as const,
        qtd: itens.length, itensIds: itens.map((i) => i.id),
        grupos: [...porGrupo.entries()].map(([grupo, qtd]) => ({ grupo, qtd })).sort((a, b) => b.qtd - a.qtd),
      };
    };

    // Regra com termos de item também conta, mesmo sem grupo declarado.
    const temAlvo = (v: { grupos: string[]; termosItem?: string[] }) =>
      v.grupos.length > 0 || (v.termosItem?.length ?? 0) > 0;
    const recomendados = naoAplicaveis.filter(temAlvo).map((v) => montar(v, true));
    const naoRecomendados = aplicaveis.filter(temAlvo).map((v) => montar(v, false));

    return NextResponse.json({
      ok: true, codigo, camposPreenchidos, origem: "codigo" as const,
      filtros: [...recomendados, ...naoRecomendados],
      total: [...new Set(recomendados.flatMap((r) => r.itensIds))].length,
      indecisas, manuais: [],
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/preencher-automatico] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
