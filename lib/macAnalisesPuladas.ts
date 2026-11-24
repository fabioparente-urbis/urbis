import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Números de análise marcados como "pulada" no MAC (feita por outro analista ou no Excel). */
export async function numerosPulados(processoCodigo: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("mac_analises_puladas").select("numero_analise").eq("processo_codigo", processoCodigo);
  if (error) return []; // tabela ainda não migrada: o MAC segue como era antes
  return (data ?? []).map((r: any) => Number(r.numero_analise)).filter((n) => n > 0);
}

/** Próximo número de análise: depois da maior análise existente OU da maior pulada. */
export async function proximoNumeroComPuladas(processoCodigo: string, maiorExistente: number): Promise<number> {
  const pulados = await numerosPulados(processoCodigo);
  return Math.max(maiorExistente, ...pulados, 0) + 1;
}
