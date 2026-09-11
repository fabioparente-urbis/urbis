import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * lib/documentosSei/lerEventosFluxo.ts — leitura COMPLETA de `fluxo_processo_eventos` (Fase 10).
 *
 * POR QUE ISTO EXISTE: o PostgREST corta qualquer `select()` em 1000 linhas por padrão, sem erro e
 * sem aviso. A tabela tinha 2441 linhas em 11/09/2026, então as três leituras que existiam
 * (`/api/admin/fluxo/portfolio`, `/api/admin/fluxo/interpretar` e `scripts/fase11_medir_fluxo.mts`)
 * agregavam 35 processos em vez de 101 — o painel de gestão mostrava um terço do acervo como se
 * fosse o todo, e a mediana da CHEADV aparecia como 205 dias quando a base inteira dá 501.
 *
 * Ficou num lugar só de propósito: eram três call sites com o mesmo defeito silencioso, e um
 * quarto repetiria o erro.
 */

const PASSO = 1000;

/** Lê a tabela inteira, paginando. Lança em erro de banco — quem chama decide o que fazer. */
export async function lerEventosFluxo<T = Record<string, unknown>>(
  sb: SupabaseClient,
  colunas: string,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb
      .from("fluxo_processo_eventos")
      .select(colunas)
      .order("processo_codigo")
      .order("pagina_ini")
      .range(de, de + PASSO - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    todas.push(...lote);
    if (lote.length < PASSO) return todas;
  }
}

export type EventoBruto = {
  processo_codigo: string;
  titulo: string;
  setor: string | null;
  data_documento: string | null;
};

/** Agrupa as linhas por processo, preservando a ordem de página em que foram lidas. */
export function agruparPorProcesso(
  linhas: EventoBruto[],
): Map<string, { titulo: string; setor: string | null; dataDocumento: string | null }[]> {
  const porProcesso = new Map<string, { titulo: string; setor: string | null; dataDocumento: string | null }[]>();
  for (const row of linhas) {
    const lista = porProcesso.get(row.processo_codigo) ?? [];
    lista.push({ titulo: row.titulo, setor: row.setor, dataDocumento: row.data_documento });
    porProcesso.set(row.processo_codigo, lista);
  }
  return porProcesso;
}
