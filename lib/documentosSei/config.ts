/**
 * lib/documentosSei/config.ts — interruptor da aba "Documentos" (Fase 2 do plano Documentos
 * Vivos, docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md) na Regularização (Slot 1).
 *
 * Mesmo padrão de `lib/visao/index.ts` (coluna booleana em `urbis_config`), com o fail-safe
 * INVERTIDO: se a leitura falhar, a resposta é DESLIGADO. `lib/visao` falha aberto porque já é
 * produção e travar quem já usa seria pior; esta feature é nova, sem histórico de confiança, e
 * Slot 1 é produção crítica — nunca vale a pena arriscar ligar por acidente de leitura.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function documentosVivosRegularizacaoAtivo(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("urbis_config")
    .select("documentos_vivos_regularizacao_ativo")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return false;
  return (data as any).documentos_vivos_regularizacao_ativo === true;
}
