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

export type PuladaComDados = { numero: number; data: string; numeroDocumento: string };

/** Puladas com nº do despacho/parecer e data (dd/mm/aaaa) informados. Marca antiga sem dados fica de fora. */
export async function puladasComDados(processoCodigo: string): Promise<PuladaComDados[]> {
  const { data, error } = await supabaseAdmin
    .from("mac_analises_puladas").select("numero_analise, numero_documento, data_documento")
    .eq("processo_codigo", processoCodigo);
  if (error) return [];
  const saida: PuladaComDados[] = [];
  for (const r of (data ?? []) as any[]) {
    if (!r.numero_documento || !r.data_documento) continue;
    const [y, m, d] = String(r.data_documento).slice(0, 10).split("-");
    saida.push({ numero: Number(r.numero_analise), data: `${d}/${m}/${y}`, numeroDocumento: String(r.numero_documento) });
  }
  return saida.sort((a, b) => a.numero - b.numero);
}
