// lib/macLimiteAnalisesSlots.ts
//
// Parte pura (sem banco) do limite de análises do MAC por slot — importável pela tela.
// Regra (Fábio, 19/10/2026): limite N = Análises 1..N; a N-1 avisa ("penúltimo despacho") e a N
// indefere. Vale para qualquer N: 2 → 1ª avisa, 2ª indefere; 5 → 4ª avisa, 5ª indefere; 10 → 9ª/10ª.
// Ver lib/macLimiteAnalises.ts (leitura do banco).

/** Padrão quando nada foi configurado — o comportamento de antes desta configuração. */
export const LIMITE_ANALISES_PADRAO = 5;
export const LIMITE_ANALISES_MAXIMO = 10;

export const SLOTS_LIMITE_ANALISES = [
  { slug: "regularizacao", nome: "Slot 1 — Regularização SEI" },
  { slug: "aceite_sei", nome: "Slot 2 — Aceite SEI" },
  { slug: "slot_03", nome: "Slot 3 — Regularização PED" },
  { slug: "slot_04", nome: "Slot 4 — Aceite PED" },
  { slug: "slot_05", nome: "Slot 5 — Aprovação de Projeto" },
] as const;

export function normalizarLimite(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1 || n > LIMITE_ANALISES_MAXIMO) return LIMITE_ANALISES_PADRAO;
  return n;
}

/** Recalcula `ultima`/`penultima` de cada análise pelo limite do slot — o servidor é quem decide. */
export function marcarUltimaPenultima<T extends { numero: number }>(
  analises: T[],
  limite: number,
): (T & { ultima: boolean; penultima: boolean })[] {
  return analises.map((a) => ({
    ...a,
    ultima: Number(a.numero) === limite,
    penultima: limite > 1 && Number(a.numero) === limite - 1,
  }));
}
