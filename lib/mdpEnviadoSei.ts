/**
 * "Enviou no SEI?" — documentos emitidos (despacho, despacho interno, parecer) ainda sem
 * confirmação de envio ao SEI. Server-only.
 *
 * Slots liberados (13/11/2026): 2, 3, 4 e 5. O Slot 1 (assunto "regularizacao…") fica FORA até
 * o Fábio autorizar — para ligar, acrescente o slug dele em SLUGS_ENVIADO_SEI.
 * Laudo não entra: não é enviado como despacho/parecer.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const SLUGS_ENVIADO_SEI = ["aceite_sei", "slot_03", "slot_04", "slot_05"];
export const TIPOS_ENVIADO_SEI = ["despacho", "interno", "indeferimento", "arquivamento"];

export type PendenteSei = { id: string; processo_codigo: string; tipo: string; numero: string | null; criado_em: string; usuario_id: string | null };

export async function pendentesSei(codigos: string[]): Promise<PendenteSei[]> {
  if (codigos.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("mdp_registros")
    .select("id, processo_codigo, tipo, numero, criado_em, usuario_id, assunto:assunto_id ( slug )")
    .in("processo_codigo", codigos)
    .in("tipo", TIPOS_ENVIADO_SEI)
    .is("enviado_sei_em", null)
    .eq("enviado_sei_dispensado", false)
    .order("criado_em", { ascending: true });
  if (error) return []; // coluna ainda não criada ou banco fora: nunca derruba a tela
  return (data ?? [])
    .filter((r: any) => SLUGS_ENVIADO_SEI.includes((Array.isArray(r.assunto) ? r.assunto[0] : r.assunto)?.slug))
    .map(({ assunto, ...r }: any) => r as PendenteSei);
}
