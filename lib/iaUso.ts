import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Preço por 1M de tokens em USD — ajustar aqui quando a Google mudar a tabela do
 * gemini-2.5-flash. É só uma estimativa para acompanhamento; o valor que vale é o do
 * Faturamento do AI Studio.
 */
const PRECO_USD_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "gemini-2.5-flash": { entrada: 0.30, saida: 2.50 },
};

function custoEstimadoUsd(modelo: string | null | undefined, tokensEntrada: number | null | undefined, tokensSaida: number | null | undefined): number | null {
  if (!modelo || !PRECO_USD_POR_MILHAO[modelo]) return null;
  const preco = PRECO_USD_POR_MILHAO[modelo];
  const custoEntrada = ((tokensEntrada ?? 0) / 1_000_000) * preco.entrada;
  const custoSaida = ((tokensSaida ?? 0) / 1_000_000) * preco.saida;
  return Number((custoEntrada + custoSaida).toFixed(5));
}

type RegistroChamadaIA = {
  modulo: "LIP" | "MAC" | "URBI" | "BDI";
  slot?: string | null;
  operacao: string;
  processoCodigo?: string | null;
  tamanhoBytes?: number | null;
  duracaoMs?: number | null;
  modelo?: string | null;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
  status: "ok" | "erro";
  motivoErro?: string | null;
};

/** Nunca lança — uma falha ao registrar uso não pode derrubar a leitura de verdade. */
export async function registrarChamadaIA(r: RegistroChamadaIA): Promise<void> {
  try {
    // O insert do supabase-js não lança em erro de banco/schema (coluna
    // inexistente, etc.) — ele retorna { error } normalmente. Sem checar
    // isso, uma falha de schema fica tão silenciosa quanto o try/catch abaixo
    // sugere que não deveria ficar.
    const { error } = await supabaseAdmin.from("urbis_api_calls").insert({
      modulo: r.modulo,
      slot: r.slot ?? null,
      operacao: r.operacao,
      processo_codigo: r.processoCodigo ?? null,
      tamanho_bytes: r.tamanhoBytes ?? null,
      duracao_ms: r.duracaoMs ?? null,
      modelo: r.modelo ?? null,
      tokens_entrada: r.tokensEntrada ?? null,
      tokens_saida: r.tokensSaida ?? null,
      custo_estimado_usd: custoEstimadoUsd(r.modelo, r.tokensEntrada, r.tokensSaida),
      status: r.status,
      motivo_erro: r.motivoErro ?? null,
    });
    if (error) {
      console.error("[iaUso] falha ao registrar chamada IA:", error.message);
    }
  } catch (e) {
    console.error("[iaUso] falha ao registrar chamada IA:", e);
  }
}
