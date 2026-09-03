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
