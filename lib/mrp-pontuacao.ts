export type RegraPontuacao = {
  id: string;
  tipo_despacho: string | null;
  area_min: number | null;
  area_max: number | null;
  pontos: number;
  descricao: string;
  ordem: number;
};

export type VigenciaPontuacao = {
  regra_id: string;
  pontos: number;
  vigente_desde: string; // "yyyy-mm-dd"
};

/**
 * Pontos vigentes para uma regra numa data. Mesmo padrão de
 * resolverMetaDoMes/metaVigenteNoMes em lib/mrp.ts: pega a linha de maior
 * vigente_desde que já tinha começado até a data do despacho.
 */
export function pontosVigenteEm(
  historico: VigenciaPontuacao[],
  regraId: string,
  dataISO: string,
): number | null {
  const alvo = dataISO.slice(0, 10);
  const aplicaveis = historico
    .filter((h) => h.regra_id === regraId && h.vigente_desde.slice(0, 10) <= alvo)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde));
  return aplicaveis.length > 0 ? Number(aplicaveis[0].pontos) : null;
}

/**
 * Acha a regra aplicável (por tipo_despacho + faixa de área) e devolve os
 * pontos. Sem `dataISO`/`historico`, usa `regra.pontos` (valor vigente hoje,
 * cacheado em mrp_pontuacao) — comportamento de antes. Com os dois, resolve
 * o valor que vigorava NA DATA DO DESPACHO, para não reescrever pontuação já
 * gravada quando a tabela muda depois.
 */
export function calcularPontos(
  tipo_despacho: string,
  area_construida: number,
  tabela: RegraPontuacao[],
  dataISO?: string,
  historico?: VigenciaPontuacao[],
): number {
  const regras = [...tabela].sort((a, b) => a.ordem - b.ordem);
  for (const r of regras) {
    if (r.tipo_despacho && r.tipo_despacho !== tipo_despacho.toUpperCase()) continue;
    if (r.area_min !== null && area_construida <= r.area_min) continue;
    if (r.area_max !== null && area_construida >= r.area_max) continue;
    if (dataISO && historico) {
      const vigente = pontosVigenteEm(historico, r.id, dataISO);
      if (vigente !== null) return vigente;
    }
    return Number(r.pontos);
  }
  return 0;
}
