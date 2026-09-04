import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

/**
 * Fase H do plano de Inteligência URBIS — "medidas pra evolução de LIP/MAC e orientação da
 * equipe". Só o recorte que tem massa real pra sustentar hoje (auditoria de 03/09/2026):
 * item do checklist que volta a "não conforme" em muitos processos DIFERENTES. Nunca é
 * "erro" — é RECORRÊNCIA: pode ser item mal redigido, campo do LIP confuso, ou exigência que
 * o interessado realmente erra com frequência (motivo não dá pra saber só com este dado).
 *
 * Fora de escopo aqui de propósito, por falta de massa/base segura:
 *   - "campos LIP mais vazios/alterados" — precisaria de tabela de rótulo por campo, que só
 *     existe pro Slot 5 (lib/rastreabilidade/lipSlot5.ts); Regularização/Aceite SEI não têm
 *     essa matriz, mostrar chave técnica crua (ex.: "cau", "artCx") seria pior que não mostrar.
 *   - Aceite SEI: mac_historico.checklist_item_id é NULL em praticamente todo evento deste
 *     slot (achado real: 39 eventos, 0 itens distintos) — a tabela é reaproveitada pra nota
 *     livre nesse assunto (ver memória "urbis-dossie-evolucao-achados-reais"), não dá pra
 *     calcular recorrência por item aqui. Declarado como lacuna, não escondido.
 *   - mudança de catálogo pós-análise: mac_checklist_itens_historico tem 0 linhas hoje (trigger
 *     de 03/09/2026, ainda sem evento real) — a sugestão determinística já existe
 *     (lib/urbi/sugestoes.ts, catalogo_alterado_apos_analise), só ainda não disparou.
 *
 * NUNCA agrupa por analista/autor/construtora/despachante — a pergunta aqui é só sobre o ITEM
 * do checklist, nunca sobre quem marcou.
 */
const LIMIAR_MINIMO_PROCESSOS = 5;
const NOME_SLOT: Record<string, string> = { regularizacao: "Regularização SEI", aceite_sei: "Aceite SEI", slot_05: "Aprovação de Projeto" };

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const { data: processos, error: erroProcessos } = await supabaseAdmin.from("processos").select("codigo, tipo_processo");
  if (erroProcessos) {
    console.error("[admin/urbi/recorrencia GET] falha ao consultar processos:", erroProcessos.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar recorrência." }, { status: 500 });
  }

  // PostgREST devolve no máximo 1000 linhas por requisição por padrão — sem paginar explícito
  // aqui, a consulta ficaria com um corte silencioso (achado real ao testar esta rota: só
  // vieram as primeiras 1000 de 1577 linhas reais, o suficiente pra sumir com TODO o slot_05 e
  // distorcer a contagem de regularização, sem erro nenhum avisando). Mesmo espírito do achado
  // de .in() com URL grande (lib/urbi/dossieProcesso.ts, selecionarEmLotes) — outro limite do
  // mesmo tipo, mecanismo diferente (paginação por range, não tamanho de URL).
  const TAMANHO_PAGINA = 1000;
  const historico: { processo_codigo: string; checklist_item_id: string; status_novo: string }[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data: pagina, error: erroHistorico } = await supabaseAdmin
      .from("mac_historico")
      .select("processo_codigo, checklist_item_id, status_novo")
      .eq("status_novo", "nao_conforme")
      .not("checklist_item_id", "is", null)
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (erroHistorico) {
      console.error("[admin/urbi/recorrencia GET] falha ao consultar mac_historico:", erroHistorico.message);
      return NextResponse.json({ ok: false, erro: "Falha ao consultar recorrência." }, { status: 500 });
    }
    historico.push(...((pagina ?? []) as any[]));
    if (!pagina || pagina.length < TAMANHO_PAGINA) break;
  }

  const slotPorCodigo = new Map((processos ?? []).map((p: any) => [p.codigo, p.tipo_processo as string]));

  // Chave composta item+slot: o mesmo item_id nunca se repete entre slots (catálogo isolado por
  // modelo), mas agrupar por slot explicitamente evita qualquer suposição sobre isso.
  const porItem = new Map<string, { itemId: string; slot: string; eventos: number; processos: Set<string> }>();
  const eventosPorSlot = new Map<string, number>();
  const itensDistintosPorSlot = new Map<string, Set<string>>();
  for (const h of historico ?? []) {
    const linha = h as any;
    const slot = slotPorCodigo.get(linha.processo_codigo);
    if (!slot) continue; // processo excluído ou não encontrado — não inventa slot
    eventosPorSlot.set(slot, (eventosPorSlot.get(slot) ?? 0) + 1);
    if (!itensDistintosPorSlot.has(slot)) itensDistintosPorSlot.set(slot, new Set());
    itensDistintosPorSlot.get(slot)!.add(linha.checklist_item_id);

    const chave = `${slot}:${linha.checklist_item_id}`;
    if (!porItem.has(chave)) porItem.set(chave, { itemId: linha.checklist_item_id, slot, eventos: 0, processos: new Set() });
    const registro = porItem.get(chave)!;
    registro.eventos += 1;
    registro.processos.add(linha.processo_codigo);
  }

  const idsItens = [...new Set([...porItem.values()].map((r) => r.itemId))];
  const { data: itens, error: erroItens } = idsItens.length
    ? await supabaseAdmin.from("mac_checklist_itens").select("id, grupo, texto, ref, ativo").in("id", idsItens)
    : { data: [] as any[], error: null };
  if (erroItens) {
    console.error("[admin/urbi/recorrencia GET] falha ao consultar itens:", erroItens.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar itens do checklist." }, { status: 500 });
  }
  const itemPorId = new Map((itens ?? []).map((i: any) => [i.id, i]));

  const linhas = [...porItem.values()]
    .filter((r) => r.processos.size >= LIMIAR_MINIMO_PROCESSOS)
    .map((r) => {
      const item = itemPorId.get(r.itemId);
      return {
        slot: r.slot,
        nome_slot: NOME_SLOT[r.slot] ?? r.slot,
        item_id: r.itemId,
        grupo: item?.grupo ?? null,
        texto: item?.texto ?? "(item não encontrado no catálogo atual)",
        referencia: item?.ref ?? null,
        ativo_no_catalogo_hoje: item?.ativo !== false,
        processos_distintos: r.processos.size,
        eventos_nao_conforme: r.eventos,
      };
    })
    .sort((a, b) => b.processos_distintos - a.processos_distintos)
    .slice(0, 30);

  // Massa por slot — pra declarar explicitamente onde não há base suficiente (Fase H, item 5:
  // "se não houver massa, registre a lacuna, não publique ranking enganoso"). Limiar aqui é
  // arbitrário (>= 3 itens distintos com evento) só pra distinguir "zero/quase zero" de "tem
  // alguma coisa mas pouco" — nenhuma conclusão jurídica depende disso.
  const massaPorSlot = ["regularizacao", "aceite_sei", "slot_05"].map((slot) => {
    const itensDistintos = itensDistintosPorSlot.get(slot)?.size ?? 0;
    return {
      slot,
      nome_slot: NOME_SLOT[slot] ?? slot,
      eventos_nao_conforme: eventosPorSlot.get(slot) ?? 0,
      itens_distintos_com_evento: itensDistintos,
      massa_suficiente: itensDistintos >= 3,
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      itens: linhas,
      limiar_minimo_processos: LIMIAR_MINIMO_PROCESSOS,
      massa_por_slot: massaPorSlot,
      fonte: "mac_historico (status_novo=nao_conforme) cruzado com processos.tipo_processo e mac_checklist_itens — nunca agrupado por analista/autor.",
    },
  });
}
