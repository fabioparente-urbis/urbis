/**
 * Condições bloqueantes do URBI gravadas por processo (18/11/2026, pedido do Fábio).
 *
 * - Ao abrir o LIP (origem "lip") o Vigia recalcula; ao abrir o MAC ("mac") revisa; o botão do
 *   admin ("admin") refaz ignorando dispensas. O resultado vai para `urbi_condicoes_processo` e a
 *   Pilha só LÊ — nunca roda o Vigia para a lista inteira.
 * - Dispensa vale só para a mesma evidência (`evidencia_hash`). Evidência mudou → volta.
 * - Só Slots 1-4 (`regularizacao`, `aceite_sei`, `slot_03`, `slot_04`).
 * - Fail-safe: tabela ausente ou erro → nada gravado, nada filtrado, Pilha sem ícone. Nunca
 *   esconde uma condição por erro de leitura.
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Aviso } from "@/lib/bdi/vigia";

export const SLOTS_CONDICOES = ["regularizacao", "aceite_sei", "slot_03", "slot_04"] as const;
export function slotTemCondicoes(tipo: string | null | undefined): boolean {
  return (SLOTS_CONDICOES as readonly string[]).includes(String(tipo ?? "").trim().toLowerCase());
}

export type OrigemCondicao = "lip" | "mac" | "admin";

/**
 * Impressão digital da evidência. A contagem de dias muda todo dia sozinha ("Já se passaram
 * 183 dias") — sem tirar o número, a dispensa da condição dos 180 dias cairia a cada manhã.
 * Para as demais o texto inteiro conta (código de outro processo, trecho do laudo etc.).
 */
export function hashEvidencia(a: Pick<Aviso, "id" | "detalhe">): string {
  const base = a.detalhe.replace(/\d+(?:[.,]\d+)?\s+dias?/gi, "N dias").trim();
  return createHash("sha256").update(`${a.id}|${base}`).digest("hex").slice(0, 32);
}

export type DispensaAtiva = { condicao_id: string; evidencia_hash: string; motivo: string; usuario_id: string; criado_em: string };

export async function lerDispensasAtivas(codigos: string[]): Promise<Map<string, DispensaAtiva[]>> {
  const mapa = new Map<string, DispensaAtiva[]>();
  if (codigos.length === 0) return mapa;
  const { data, error } = await supabaseAdmin
    .from("urbi_condicoes_dispensa")
    .select("processo_codigo, condicao_id, evidencia_hash, motivo, usuario_id, criado_em")
    .in("processo_codigo", codigos)
    .is("revogada_em", null);
  if (error || !data) return mapa;
  for (const d of data as any[]) {
    const l = mapa.get(d.processo_codigo) ?? [];
    l.push(d);
    mapa.set(d.processo_codigo, l);
  }
  return mapa;
}

export function estaDispensado(a: Pick<Aviso, "id" | "detalhe">, dispensas: DispensaAtiva[] | undefined): boolean {
  if (!dispensas?.length) return false;
  const h = hashEvidencia(a);
  return dispensas.some((d) => d.condicao_id === a.id && d.evidencia_hash === h);
}

/** Grava o retrato das condições bloqueantes deste processo (substitui o anterior). */
export async function registrarCondicoes(codigo: string, avisos: Aviso[], origem: OrigemCondicao): Promise<void> {
  const bloqueantes = avisos.filter((a) => a.bloqueante === true);
  try {
    const { error: errDel } = await supabaseAdmin.from("urbi_condicoes_processo").delete().eq("processo_codigo", codigo);
    if (errDel) return;
    if (bloqueantes.length === 0) return;
    const agora = new Date().toISOString();
    await supabaseAdmin.from("urbi_condicoes_processo").insert(
      bloqueantes.map((a) => ({
        processo_codigo: codigo, condicao_id: a.id, titulo: a.titulo, detalhe: a.detalhe,
        evidencia_hash: hashEvidencia(a), origem, visto_em: agora,
      })),
    );
  } catch { /* fail-safe */ }
}

export type CondicaoPilha = { condicao_id: string; titulo: string; detalhe: string; origem: string; visto_em: string };

/** Condições vigentes e NÃO dispensadas, por processo — uma consulta para a lista toda. */
export async function lerCondicoesParaPilha(codigos: string[]): Promise<Map<string, CondicaoPilha[]>> {
  const mapa = new Map<string, CondicaoPilha[]>();
  if (codigos.length === 0) return mapa;
  const { data, error } = await supabaseAdmin
    .from("urbi_condicoes_processo")
    .select("processo_codigo, condicao_id, titulo, detalhe, evidencia_hash, origem, visto_em")
    .in("processo_codigo", codigos);
  if (error || !data) return mapa;
  const dispensas = await lerDispensasAtivas(codigos);
  for (const c of data as any[]) {
    const disp = dispensas.get(c.processo_codigo);
    if (disp?.some((d) => d.condicao_id === c.condicao_id && d.evidencia_hash === c.evidencia_hash)) continue;
    const l = mapa.get(c.processo_codigo) ?? [];
    l.push({ condicao_id: c.condicao_id, titulo: c.titulo, detalhe: c.detalhe, origem: c.origem, visto_em: c.visto_em });
    mapa.set(c.processo_codigo, l);
  }
  return mapa;
}
