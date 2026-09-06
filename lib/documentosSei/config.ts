/**
 * lib/documentosSei/config.ts — interruptores da aba "Documentos" (Fase 2 do plano Documentos
 * Vivos, docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md), um por slot (Regularização e Aceite SEI).
 *
 * Mesmo padrão de `lib/visao/index.ts` (coluna booleana em `urbis_config`), com o fail-safe
 * INVERTIDO: se a leitura falhar, a resposta é DESLIGADO. `lib/visao` falha aberto porque já é
 * produção e travar quem já usa seria pior; esta feature é nova, sem histórico de confiança, e
 * Slot 1/2 são produção — nunca vale a pena arriscar ligar por acidente de leitura.
 *
 * Duas colunas, uma por slot — nunca uma só compartilhada: ligar num não pode ligar o outro em
 * silêncio (regra de isolamento entre slots do CLAUDE.md). Este arquivo em si é infraestrutura
 * genérica (leitura de config), não lógica de negócio de slot nenhum, por isso as duas funções
 * moram juntas — igual `lib/visao` serve todo slot com um helper só.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function lerInterruptor(coluna: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("urbis_config")
    .select(coluna)
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return false;
  return (data as any)[coluna] === true;
}

export async function documentosVivosRegularizacaoAtivo(): Promise<boolean> {
  return lerInterruptor("documentos_vivos_regularizacao_ativo");
}

export async function documentosVivosAceiteSeiAtivo(): Promise<boolean> {
  return lerInterruptor("documentos_vivos_aceite_sei_ativo");
}

/**
 * Fase 8 (§6 do plano) — "Analisar páginas ambíguas (Gemini)". Interruptor PRÓPRIO, separado dos
 * dois acima: ligar o Organizador (Fase 2) não liga o Gemini da Fase 8, e vice-versa — a Fase 8
 * gasta dinheiro de verdade, a Fase 2 não gasta nada.
 */
export async function documentosVivosGeminiAtivo(): Promise<boolean> {
  return lerInterruptor("documentos_vivos_gemini_ativo");
}
