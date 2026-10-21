/**
 * lib/urbi/regrasBloqueio.ts — liga/desliga por regra das condições que fazem o URBI
 * avisar/bloquear a análise de um processo (Slot 1 e Slot 2). Ver
 * supabase/migrations/2026_09_08_urbi_regras_bloqueio.sql e o plano de sessão em
 * ~/.claude/plans/floating-humming-orbit.md.
 *
 * Fail-safe DESLIGADO em erro de leitura, mesmo padrão de lib/documentosSei/config.ts — nunca
 * vale a pena arriscar ligar uma regra bloqueante por acidente de leitura.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ChaveRegraBloqueio =
  | "COND_180_DIAS"
  | "COND_FISCAL_DIVERGE"
  | "COND_MARCO_TEMPORAL"
  | "COND_USO_SOLO"
  | "COND_BUSCA_ENDERECO"
  | "COND_ASSUNTO_ERRADO"
  | "COND_CHEADV_APTO"
  | "COND_IMOVEL_DUPLICADO";

export type RegraBloqueio = { ativo: boolean; parametros: Record<string, any> };

const PADRAO: RegraBloqueio = { ativo: false, parametros: {} };

/** Lê todas as regras de uma vez — uma query só, cada chamador filtra o que precisa. */
export async function lerRegrasBloqueio(): Promise<Record<ChaveRegraBloqueio, RegraBloqueio>> {
  const base = {
    COND_180_DIAS: { ...PADRAO },
    COND_FISCAL_DIVERGE: { ...PADRAO },
    COND_MARCO_TEMPORAL: { ...PADRAO },
    COND_USO_SOLO: { ...PADRAO },
    COND_BUSCA_ENDERECO: { ...PADRAO },
    COND_ASSUNTO_ERRADO: { ...PADRAO },
    COND_CHEADV_APTO: { ...PADRAO },
    COND_IMOVEL_DUPLICADO: { ...PADRAO },
  } as Record<ChaveRegraBloqueio, RegraBloqueio>;

  const { data, error } = await supabaseAdmin
    .from("urbi_regras_bloqueio")
    .select("chave, ativo, parametros");
  if (error || !data) return base;

  for (const linha of data as any[]) {
    if (linha.chave in base) {
      base[linha.chave as ChaveRegraBloqueio] = {
        ativo: linha.ativo === true,
        parametros: linha.parametros ?? {},
      };
    }
  }
  return base;
}

/** Slots com liga/desliga PRÓPRIO das condições (tabela `urbi_regras_bloqueio_slot`). */
export const SLOTS_COM_REGRAS_PROPRIAS = ["slot_03", "slot_04"] as const;

export function temRegrasProprias(tipoProcesso: string | null | undefined): boolean {
  const t = String(tipoProcesso ?? "").toLowerCase().trim();
  return (SLOTS_COM_REGRAS_PROPRIAS as readonly string[]).includes(t);
}

/**
 * Slots 3 e 4 (PED, 16/10/2026) — liga/desliga PRÓPRIO de cada slot, em
 * `urbi_regras_bloqueio_slot` (migration 2026_10_16b). Os Slots 1 e 2 continuam em
 * `lerRegrasBloqueio()` acima, sem mudança: ligar/desligar lá não muda aqui, e vice-versa.
 *
 * Mesmo fail-safe: erro de leitura, tabela ausente ou slot sem linha → tudo DESLIGADO.
 */
export async function lerRegrasBloqueioDoSlot(
  slot: (typeof SLOTS_COM_REGRAS_PROPRIAS)[number],
): Promise<Record<ChaveRegraBloqueio, RegraBloqueio>> {
  const base = {
    COND_180_DIAS: { ...PADRAO },
    COND_FISCAL_DIVERGE: { ...PADRAO },
    COND_MARCO_TEMPORAL: { ...PADRAO },
    COND_USO_SOLO: { ...PADRAO },
    COND_BUSCA_ENDERECO: { ...PADRAO },
    COND_ASSUNTO_ERRADO: { ...PADRAO },
    COND_CHEADV_APTO: { ...PADRAO },
    COND_IMOVEL_DUPLICADO: { ...PADRAO },
  } as Record<ChaveRegraBloqueio, RegraBloqueio>;

  const { data, error } = await supabaseAdmin
    .from("urbi_regras_bloqueio_slot")
    .select("chave, ativo, parametros")
    .eq("slot", slot);
  if (error || !data) return base;

  for (const linha of data as any[]) {
    if (linha.chave in base) {
      base[linha.chave as ChaveRegraBloqueio] = {
        ativo: linha.ativo === true,
        parametros: linha.parametros ?? {},
      };
    }
  }
  return base;
}
