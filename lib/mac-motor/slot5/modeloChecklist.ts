/**
 * lib/mac-motor/slot5/modeloChecklist.ts — resolve o modelo de checklist do Slot 5.
 *
 * `mac_checklist_itens` guarda os itens dos TRÊS modelos na mesma tabela (768 do Slot 5, 54 da
 * Regularização, 55 do Aceite). Qualquer consulta sem `modelo_id` mistura os três — a tela do
 * Slot 5 mostraria itens do Slot 1, e um filtro por nome de grupo poderia marcá-los. Todo acesso
 * a itens do Slot 5 passa por aqui.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TIPO_PROCESSO_SLOT5 } from "./constantes";

export async function modeloDoSlot5(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("mac_checklist_modelos").select("id")
    .eq("tipo_processo", TIPO_PROCESSO_SLOT5).is("dono_id", null)
    .limit(1).maybeSingle();
  return (data as any)?.id ?? null;
}
