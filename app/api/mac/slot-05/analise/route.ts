/**
 * app/api/mac/slot-05/analise/route.ts — carga e gravação da análise do MAC no Slot 5.
 *
 * Isolada do Slot 1: não importa nada de app/api/analise-regularizacao nem de
 * app/api/analise-aceite-sei; sempre filtra por `tipo_processo = "slot_05"`, então uma chamada
 * daqui nunca alcança uma análise da Regularização/Aceite.
 *
 * Armazenamento é o mesmo `analises_mac` (mapa item_id → status em `itens`) — é a tabela do
 * módulo, não do Slot 1. `observacoes_por_item` (mapa item_id → texto) é a observação POR ITEM
 * do Slot 5 — mais granular que o `observacoes_por_aba` do Slot 1 (por grupo); mesma coluna
 * jsonb da tabela compartilhada, só que Slot 1 nunca lê/grava nela.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";

export const runtime = "nodejs";

const TIPO = TIPO_PROCESSO_SLOT5;

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const modeloId = await modeloDoSlot5();
    if (!modeloId) {
      return NextResponse.json({
        ok: false,
        erro: "nenhum modelo de checklist cadastrado para o Slot 5 (tipo_processo = slot_05)",
      }, { status: 404 });
    }

    // Flag "MAC não concluído". A coluna pode não existir ainda (migration pendente) —
    // nesse caso a tela simplesmente mostra o botão desmarcado.
    const { data: flag } = await supabaseAdmin
      .from("processos").select("mac_incompleto").eq("id", resolucao.processo.id).maybeSingle();

    const [{ data: analises }, { data: itensChecklist }] = await Promise.all([
      supabaseAdmin.from("analises_mac")
        .select("*").eq("processo_codigo", codigo).eq("tipo_processo", TIPO)
        .is("excluido_em", null).order("numero_analise", { ascending: false }),
      supabaseAdmin.from("mac_checklist_itens")
        .select("id, texto, grupo, ordem, ref")
        .eq("modelo_id", modeloId).eq("ativo", true).order("ordem").limit(2000),
    ]);

    const dados = (resolucao.processo.dados ?? {}) as Record<string, any>;

    return NextResponse.json({
      ok: true,
      processo: {
        codigo,
        proprietario: dados?.proprietario?.valor ?? null,
        bairro: dados?.bairro?.valor ?? null,
        logradouro: dados?.logradouro?.valor ?? null,
        areaTotal: dados?.areaTotal?.valor ?? null,
        numeroSei: dados?.processo?.valor ?? codigo,
      },
      // Campos do LIP em rascunho/vazios/"x" — alimentam a barra de pendências,
      // mesma leitura que a tela do Slot 1 faz sobre processos.dados.
      pendenciasLip: Object.entries(dados)
        .filter(([, campo]: [string, any]) =>
          campo && typeof campo === "object" &&
          (!campo.valor || campo.status === "rascunho" || String(campo.valor).toLowerCase() === "x"))
        .map(([chave]) => chave),
      macIncompleto: (flag as any)?.mac_incompleto === true,
      modeloId,
      analises: analises ?? [],
      itens: itensChecklist ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

/** Cria a análise N do processo (numeração própria do Slot 5, máximo 5). */
export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, itens, fontes, observacoes, observacoes_por_item } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    /* Só as VIVAS contam para a numeração. Sem `is("excluido_em", null)`, um "Limpar MAC" — que
     * exclui logicamente todas — faria a próxima análise nascer como nº 4 num processo que voltou
     * a ter zero análises. */
    const { data: existentes } = await supabaseAdmin
      .from("analises_mac").select("numero_analise")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO)
      .is("excluido_em", null)
      .order("numero_analise", { ascending: false }).limit(1);

    const proximo = existentes?.length ? (existentes[0] as any).numero_analise + 1 : 1;
    if (proximo > 5) {
      return NextResponse.json({ ok: false, erro: "Limite de 5 análises atingido." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("analises_mac").insert({
      processo_codigo: codigo,
      tipo_processo: TIPO,
      assunto_id: ASSUNTO_ID_SLOT5,
      analista_id: usuario.id,
      numero_analise: proximo,
      status: "em_andamento",
      itens: itens ?? {},
      fontes: fontes ?? {},
      aceites: {},
      observacoes: observacoes ?? "",
      observacoes_por_aba: {},
      observacoes_por_item: observacoes_por_item ?? {},
    }).select().maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    // Início da PASSAGEM atual (não do processo inteiro — ver a rota de conclusão, que fecha o
    // mesmo conceito do lado de saída). `processos.analise_iniciada_em` só marca a primeira vez
    // que o processo entrou em análise, igual ao Slot 1/2 (mesma coluna, mesma regra, reproduzida
    // por leitura — CLAUDE.md). O evento em auditoria_eventos, por outro lado, é por PASSAGEM: uma
    // retomada (proximo > 1) também gera o seu próprio ANALISE_INICIADA, com numero_analise no
    // detalhe. Servidor, aguardado — não é o registrar() client-side de outras telas, que engole
    // erro em silêncio.
    if (proximo === 1) {
      const { error: erroInicio } = await supabaseAdmin
        .from("processos")
        .update({ analise_iniciada_em: new Date().toISOString() })
        .eq("codigo", codigo)
        .is("analise_iniciada_em", null);
      if (erroInicio) console.error("[slot-05/analise] processos.analise_iniciada_em falhou:", erroInicio.message);
    }

    const { error: erroEvento } = await supabaseAdmin.from("auditoria_eventos").insert({
      analista_id: usuario.id,
      analista_nome: "",
      modulo: "MAC",
      acao: "ANALISE_INICIADA",
      processo_codigo: codigo,
      assunto_id: ASSUNTO_ID_SLOT5,
      detalhe: { numero_analise: proximo, slot: TIPO },
      origem: "SISTEMA",
    });
    if (erroEvento) console.error("[slot-05/analise] evento ANALISE_INICIADA falhou:", erroEvento.message);

    return NextResponse.json({ ok: true, analise: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

/** Atualiza itens/fontes/observações de uma análise já existente do Slot 5. */
export async function PUT(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { id, itens, fontes, observacoes, observacoes_por_item, status, aceites } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

    // trava de escopo: só atualiza se a análise for mesmo do Slot 5
    const { data: alvo } = await supabaseAdmin.from("analises_mac")
      .select("id, processo_codigo, tipo_processo").eq("id", id).maybeSingle();
    if (!alvo || (alvo as any).tipo_processo !== TIPO) {
      return NextResponse.json({ ok: false, erro: "análise não é do Slot 5" }, { status: 403 });
    }

    const resolucao = await resolverProcessoSlot5(usuario, (alvo as any).processo_codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    // Trilha de alterações — mesma tabela que a tela do Slot 1 alimenta, para o
    // histórico do item aparecer igual. Só registra o que MUDOU de status.
    if (itens) {
      const { data: antes } = await supabaseAdmin.from("analises_mac")
        .select("itens, analista_id").eq("id", id).maybeSingle();
      const anteriores = ((antes as any)?.itens ?? {}) as Record<string, string>;
      // A união das duas chaves: um item DESMARCADO some do mapa novo, então comparar só as
      // chaves de `itens` deixava toda limpeza/desfazer fora da trilha — o histórico mostrava a
      // marcação aparecendo e nunca sumindo (regra do CLAUDE.md: nada some em silêncio).
      const alterados = [...new Set([...Object.keys(itens), ...Object.keys(anteriores)])]
        .filter((k) => (itens[k] ?? null) !== (anteriores[k] ?? null));

      if (alterados.length) {
        const modeloId = await modeloDoSlot5();
        // Quem ASSINA a mudança é quem está mexendo agora, não o dono da análise: a trilha
        // responde "quem alterou", e creditar outro analista falsifica a auditoria do MAP.
        const [{ data: checkItens }, { data: analista }, { data: proc }] = await Promise.all([
          modeloId
            ? supabaseAdmin.from("mac_checklist_itens").select("id, grupo, texto, ref").eq("modelo_id", modeloId)
            : Promise.resolve({ data: [] as any[] }),
          supabaseAdmin.from("usuarios").select("nome, gerencia").eq("id", usuario.id).maybeSingle(),
          supabaseAdmin.from("processos").select("dados").eq("codigo", (alvo as any).processo_codigo)
            .eq("tipo_processo", TIPO).maybeSingle(),
        ]);
        const d = ((proc as any)?.dados ?? {}) as Record<string, any>;
        const idx = new Map(((checkItens ?? []) as any[]).map((i: any) => [i.id, i]));

        await supabaseAdmin.from("mac_historico").insert(alterados.map((itemId) => {
          const it = idx.get(itemId) as any;
          return {
            analise_id: id,
            processo_codigo: (alvo as any).processo_codigo,
            tipo_processo: TIPO,
            area_total: d?.areaTotal?.valor ? Number(String(d.areaTotal.valor).replace(/\./g, "").replace(",", ".")) : null,
            analista_id: usuario.id,
            analista_nome: (analista as any)?.nome ?? null,
            analista_gerencia: (analista as any)?.gerencia ?? null,
            proprietario: d?.proprietario?.valor ?? null,
            autor_projeto: d?.nome_responsavel_arq?.valor ?? null,
            autor_levantamento: d?.nome_responsavel_eng?.valor ?? null,
            checklist_item_id: itemId,
            aba: it?.grupo ?? null,
            item_texto: it?.texto ?? null,
            referencia_legal: it?.ref ?? null,
            status_anterior: anteriores[itemId] ?? null,
            // Sem resposta nova = o item foi devolvido para pendente. "limpo" é o mesmo rótulo
            // que a rota de manutenção já usa, para o histórico falar uma língua só.
            status_novo: itens[itemId] ?? "limpo",
          };
        }));
      }
    }

    const { error } = await supabaseAdmin.from("analises_mac").update({
      ...(itens !== undefined ? { itens } : {}),
      ...(fontes !== undefined ? { fontes } : {}),
      ...(observacoes !== undefined ? { observacoes } : {}),
      ...(observacoes_por_item !== undefined ? { observacoes_por_item } : {}),
      ...(aceites !== undefined ? { aceites } : {}),
      ...(status !== undefined ? { status } : {}),
    }).eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
