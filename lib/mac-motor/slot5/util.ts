/**
 * lib/mac-motor/slot5/util.ts — helpers pequenos e puros, compartilhados pelas regras do motor.
 */

import type { Confianca, FatoExtraido, SaidaRegraItem } from "./tipos";

/** "450,00" → 450; "1.234,5" → 1234.5. null se não for número BR reconhecível. */
export function parseNumeroBR(s: string): number | null {
  const limpo = s.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function confiancaBucket(n: number): Confianca {
  if (n >= 0.85) return "ALTA";
  if (n >= 0.6) return "MEDIA";
  return "BAIXA";
}

/** A menor confiança entre os fatos LIDOS (abstenções não entram — quem chama já trata isso). */
export function confiancaMinima(fatos: FatoExtraido[]): Confianca | null {
  const lidos = fatos.filter((f): f is Extract<FatoExtraido, { valor: string }> => !("abstencao" in f));
  if (lidos.length === 0) return null;
  const menor = Math.min(...lidos.map((f) => f.confianca));
  return confiancaBucket(menor);
}

export function buscarFato(fatos: FatoExtraido[], nome: string): FatoExtraido | undefined {
  return fatos.find((f) => f.nome === nome);
}

/**
 * Regra 7/8 do usuário: baixa confiança nunca vira CONFORME/NAO_CONFORME automático, mesmo que a
 * conta feche — exige revisão humana. Só reclassifica um resultado já "decidido" (CONFORME ou
 * NAO_CONFORME); PENDENTE/NAO_AVALIADO/REVISAO_MANUAL já são não-comprometedores e passam direto.
 */
export function comGuardaDeConfianca(saida: SaidaRegraItem): SaidaRegraItem {
  if (saida.confianca === "BAIXA" && (saida.resultado === "CONFORME" || saida.resultado === "NAO_CONFORME")) {
    return {
      ...saida,
      resultado: "REVISAO_MANUAL",
      requerRevisao: true,
      justificativa: `${saida.justificativa} — confiança da leitura é BAIXA; decisão automática suspensa, exige revisão humana.`,
    };
  }
  return saida;
}

/** true só quando o fato existe, foi lido (sem abstenção) e o valor é um número BR válido. */
export function fatoNumerico(fatos: FatoExtraido[], nome: string): number | null {
  const f = buscarFato(fatos, nome);
  if (!f || "abstencao" in f) return null;
  return parseNumeroBR(f.valor);
}
