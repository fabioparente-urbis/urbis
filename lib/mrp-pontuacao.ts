export type RegraPontuacao = {
  id: string;
  tipo_despacho: string | null;
  area_min: number | null;
  area_max: number | null;
  pontos: number;
  descricao: string;
  ordem: number;
};

export function calcularPontos(
  tipo_despacho: string,
  area_construida: number,
  tabela: RegraPontuacao[]
): number {
  const regras = [...tabela].sort((a, b) => a.ordem - b.ordem);
  for (const r of regras) {
    if (r.tipo_despacho && r.tipo_despacho !== tipo_despacho.toUpperCase()) continue;
    if (r.area_min !== null && area_construida <= r.area_min) continue;
    if (r.area_max !== null && area_construida >= r.area_max) continue;
    return Number(r.pontos);
  }
  return 0;
}
