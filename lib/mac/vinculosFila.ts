/**
 * lib/mac/vinculosFila.ts — fila de propostas de vínculo LIP/BIP (mac_vinculos_propostas).
 *
 * Autorizado pelo Fábio em 03/09/2026, escopo restrito a Regularização SEI e Aceite SEI (achado da
 * Fase 4 de "TAREFA DA NOITE": 0% de vínculo BIP nesses dois assuntos). Restrição de escopo é
 * aplicada aqui, em código — nunca em CHECK de banco — porque depende de join até
 * mac_checklist_modelos.tipo_processo, que muda de significado se um assunto novo entrar depois.
 *
 * "Não criar vínculo jurídico automático nem citar lei sem vínculo real ou consulta BIP citável":
 * nenhuma função aqui decide nada sozinha — só valida forma e escopo. A decisão de aprovar/rejeitar
 * é sempre uma ação humana explícita (ver app/api/mac/vinculos-fila/decidir/route.ts).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Escapa um valor de busca livre do usuário antes de entrar num filtro `.or()`
 * do PostgREST (buscar-bip/buscar-lip) — sem isso, vírgula/parênteses em `q`
 * são sintaxe de filtro, não texto: um `q` como `x,and(1,eq,1)` vira uma
 * condição extra de verdade, não uma busca por esse texto literal. O valor
 * entre aspas duplas do PostgREST aceita vírgula/parênteses/ponto como
 * literais; só `"` e `\` dentro dele precisam de escape.
 */
export function escaparValorFiltroOr(valor: string): string {
  return valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Únicos assuntos autorizados para esta fila — Slot 5 já tem seu próprio mecanismo
 *  (app/api/mac/slot-05/bip-vinculos), não usa esta fila. */
export const ASSUNTOS_PERMITIDOS_NA_FILA = ["regularizacao", "aceite_sei"] as const;
export type AssuntoPermitidoNaFila = (typeof ASSUNTOS_PERMITIDOS_NA_FILA)[number];

export type ItemDoEscopo = {
  itemId: string;
  modeloId: string;
  assuntoId: string;
  tipoProcesso: AssuntoPermitidoNaFila;
  grupo: string;
  texto: string;
  ativo: boolean;
};

/**
 * Confere se o item existe, está ativo, e pertence a um modelo de assunto permitido nesta fila.
 * Retorna null quando qualquer uma dessas condições falha — quem chama decide o código HTTP
 * (404 para item inexistente, 403/400 para item fora de escopo; a rota nunca precisa adivinhar
 * qual dos dois é o caso real porque o motivo já vem impresso em `erro`).
 */
export async function itemNoEscopoDaFila(
  itemId: string,
): Promise<{ ok: true; item: ItemDoEscopo } | { ok: false; erro: string }> {
  const { data: item, error } = await supabaseAdmin
    .from("mac_checklist_itens")
    .select("id, modelo_id, grupo, texto, ativo")
    .eq("id", itemId)
    .maybeSingle();
  if (error) return { ok: false, erro: `falha ao consultar item: ${error.message}` };
  if (!item) return { ok: false, erro: "item de checklist não encontrado" };

  const { data: modelo, error: erroModelo } = await supabaseAdmin
    .from("mac_checklist_modelos")
    .select("id, assunto_id, tipo_processo")
    .eq("id", item.modelo_id)
    .maybeSingle();
  if (erroModelo) return { ok: false, erro: `falha ao consultar modelo: ${erroModelo.message}` };
  if (!modelo) return { ok: false, erro: "modelo do item não encontrado" };

  const tipo = String(modelo.tipo_processo ?? "").toLowerCase();
  if (!ASSUNTOS_PERMITIDOS_NA_FILA.includes(tipo as AssuntoPermitidoNaFila)) {
    return {
      ok: false,
      erro: `esta fila só aceita itens de ${ASSUNTOS_PERMITIDOS_NA_FILA.join("/")} — este item é de "${tipo || "desconhecido"}"`,
    };
  }

  return {
    ok: true,
    item: {
      itemId: item.id, modeloId: modelo.id, assuntoId: modelo.assunto_id,
      tipoProcesso: tipo as AssuntoPermitidoNaFila, grupo: item.grupo, texto: item.texto, ativo: item.ativo,
    },
  };
}

/**
 * Fase 8 do mandato de 12 fases (05/09/2026) — "detectar vínculo afetado por mudança de
 * catálogo": um vínculo BIP aprovado ANTES da última mudança REAL do próprio item (criado/
 * atualizado/desativado/reativado, `mac_checklist_itens_historico`, trigger já em produção desde
 * 03/09) pode estar defasado — o texto/fundamento que embasou a aprovação pode não ser mais o
 * texto atual do item. Nunca desfaz o vínculo sozinho, só SINALIZA pra revisão humana.
 *
 * ACHADO REAL da auditoria (05/09/2026): `mac_checklist_itens_historico` está com 0 linhas no
 * banco INTEIRO hoje — nenhum item mudou de verdade desde que o trigger foi criado. Por isso
 * esta função sempre volta um Set vazio agora, pra QUALQUER vínculo real que existir — não é bug,
 * é a ausência honesta de mudança real ainda. Ativa sozinha assim que a trilha tiver a primeira
 * linha, sem precisar de deploy novo.
 *
 * Deliberadamente NÃO usa `mac_checklist_itens.atualizado_em` como proxy — auditado com dado
 * real (Slot 5, 727 vínculos) e descartado: 47% dos itens têm `atualizado_em` mais novo que o
 * vínculo, mas a esmagadora maioria disso é o script antigo de `classificacao_bip`/
 * `classificacao_lip` re-tocando a coluna (mesma hora, mesmo lote de 29/07), não uma edição real
 * de texto/fundamento — geraria alarme falso em quase metade dos vínculos reais.
 */
export async function vinculosBipPossivelmenteDesatualizados(
  vinculosBip: { mac_item_id: string; criado_em: string }[],
): Promise<Set<string>> {
  if (vinculosBip.length === 0) return new Set();
  const itemIds = [...new Set(vinculosBip.map((v) => v.mac_item_id))];

  const maiorMudancaPorItem = new Map<string, number>();
  const TAMANHO_LOTE = 150; // mesmo limite já documentado em cobertura-slot5/route.ts (URL do GET)
  for (let i = 0; i < itemIds.length; i += TAMANHO_LOTE) {
    const lote = itemIds.slice(i, i + TAMANHO_LOTE);
    const { data: historico } = await supabaseAdmin
      .from("mac_checklist_itens_historico")
      .select("item_id, criado_em")
      .in("item_id", lote);
    for (const h of (historico ?? []) as any[]) {
      const t = new Date(h.criado_em).getTime();
      const atual = maiorMudancaPorItem.get(h.item_id);
      if (atual === undefined || t > atual) maiorMudancaPorItem.set(h.item_id, t);
    }
  }

  const afetados = new Set<string>();
  for (const v of vinculosBip) {
    const mudanca = maiorMudancaPorItem.get(v.mac_item_id);
    if (mudanca !== undefined && mudanca > new Date(v.criado_em).getTime()) afetados.add(v.mac_item_id);
  }
  return afetados;
}

/** Confirma que um fragmento do BIP citado numa proposta é real — nunca aceita id inventado. */
export async function fragmentoBipExiste(fragmentoId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("bdi_lei_fragmentos").select("id").eq("id", fragmentoId).maybeSingle();
  return !!data;
}

/** Registra o evento no satélite MAP (auditoria_eventos) — nunca impede a ação principal de
 *  concluir; um evento perdido é logado, não propagado como erro HTTP. */
export async function registrarEventoVinculo(params: {
  acao: "MAC_VINCULO_PROPOSTO" | "MAC_VINCULO_APROVADO" | "MAC_VINCULO_REJEITADO";
  analistaId: string;
  analistaNome: string;
  assuntoId: string | null;
  detalhe: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("auditoria_eventos").insert({
    analista_id: params.analistaId,
    analista_nome: params.analistaNome,
    sessao_id: null,
    modulo: "MAC",
    acao: params.acao,
    processo_codigo: null,
    assunto_id: params.assuntoId,
    detalhe: params.detalhe,
    origem: "MANUAL",
  });
  if (error) console.error("[vinculosFila] falha ao registrar evento MAP (não bloqueia a ação):", error.message);
}
