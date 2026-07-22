// ============================================================
// MRP — Mapa de Resultados e Produtividade
// Funções puras de cálculo + helpers para extrair métricas de
// processos.dados (JSONB). NÃO importa Next nem Supabase para
// poder ser usado tanto no server quanto em client components.
// ============================================================

export const META_BASE = 100;

export type Porte = 'GERECCO' | 'GERAED' | 'GERAGP';
export type TipoDespacho = 'despacho' | 'indeferimento' | 'arquivamento' | 'aceite' | 'interno' | 'laudo';
export type StatusMRP = 'EXCELENTE' | 'OK' | 'RUIM';

// ─── Cálculo de pontos ─────────────────────────────────────
// Regra: GP ou área > 2000 → 4.5 pts | MP (área entre 540 e 2000) → 3.5 | PP → 2.5
// Laudo segue o mesmo peso do despacho normal (baseado em porte/área).
export function calcularPontos(porte: string | null | undefined, area: number, tipoDespacho?: TipoDespacho): number {
  const p = String(porte ?? '').toUpperCase();
  if (p === 'GERAGP' || area > 2000) return 4.5;
  if (area > 540) return 3.5;
  return 2.5;
}

export function inferirPorte(area: number, porteInformado?: string | null): Porte {
  const p = String(porteInformado ?? '').toUpperCase();
  if (p === 'GERAGP' || p === 'GERAED' || p === 'GERECCO') return p as Porte;
  if (area > 2000) return 'GERAGP';
  if (area > 540) return 'GERAED';
  return 'GERECCO';
}

// ─── Meta efetiva (com redução legal) ──────────────────────
export function calcularMetaEfetiva(
  percentualReducao: number | null | undefined = 0,
  metaBase: number = META_BASE,
): number {
  const r = Math.max(0, Math.min(100, Number(percentualReducao ?? 0)));
  const base = Number(metaBase) > 0 ? Number(metaBase) : META_BASE;
  return Math.round(base * (1 - r / 100) * 100) / 100;
}

// ─── Meta vigente em um mês ────────────────────────────────
// A meta é versionada (mrp_meta_historico): alterar a meta hoje não pode
// mudar como os meses já fechados foram avaliados. Para um mês qualquer,
// vale a meta com a maior data de vigência que já tenha começado.
export type MetaVigencia = {
  meta: number | null;
  vigente_desde: string;
  usuario_id?: string | null;
  isento?: boolean | null;
};

/** Meta geral vigente no mês (ignora regras específicas de pessoa). */
export function metaVigenteNoMes(
  historico: MetaVigencia[] | null | undefined,
  ano: number,
  mes: number,
): number {
  const alvo = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const aplicaveis = (historico ?? [])
    .filter((h) => !h.usuario_id && String(h.vigente_desde).slice(0, 10) <= alvo)
    .sort((a, b) => String(b.vigente_desde).localeCompare(String(a.vigente_desde)));
  return aplicaveis.length > 0 ? Number(aplicaveis[0].meta ?? META_BASE) : META_BASE;
}

/**
 * Resolve a meta de uma pessoa num mês. A regra específica dela prevalece
 * sobre a geral; sem regra específica, vale a geral.
 *
 * Gerência e Diretoria são isentas, mas a isenção é datada: quem virou
 * gerente em setembro continua com meta em julho, e quem voltou a analista
 * volta a ter meta a partir do mês em que voltou.
 */
export function resolverMetaDoMes(
  historico: MetaVigencia[] | null | undefined,
  usuarioId: string,
  ano: number,
  mes: number,
): { isento: boolean; metaBase: number } {
  const alvo = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const doUsuario = (historico ?? [])
    .filter((h) => h.usuario_id === usuarioId && String(h.vigente_desde).slice(0, 10) <= alvo)
    .sort((a, b) => String(b.vigente_desde).localeCompare(String(a.vigente_desde)))[0];

  if (doUsuario?.isento) return { isento: true, metaBase: 0 };
  if (doUsuario && doUsuario.meta != null) {
    return { isento: false, metaBase: Number(doUsuario.meta) };
  }
  return { isento: false, metaBase: metaVigenteNoMes(historico, ano, mes) };
}

// ─── Dias efetivos a partir do calendário ──────────────────
export type Calendario = {
  dias_uteis: number;
  ferias: number;
  atestado: number;
  feriados: number;
  facultativo: number;
};

export function diasEfetivos(cal: Partial<Calendario>): number {
  const du = Math.max(0, Number(cal.dias_uteis ?? 22));
  const fe = Math.max(0, Number(cal.ferias ?? 0));
  const at = Math.max(0, Number(cal.atestado ?? 0));
  const fr = Math.max(0, Number(cal.feriados ?? 0));
  const fc = Math.max(0, Number(cal.facultativo ?? 0));
  return Math.max(0, du - fe - at - fr - fc);
}

// ─── Projeção linear (mesmo ritmo até o fim do mês) ────────
export function calcularProjecao(
  pontosAcumulados: number,
  diasEfetivosPassados: number,
  diasEfetivosRestantes: number,
): number {
  if (diasEfetivosPassados <= 0) return pontosAcumulados;
  const ritmo = pontosAcumulados / diasEfetivosPassados;
  return Math.round((pontosAcumulados + ritmo * diasEfetivosRestantes) * 10) / 10;
}

// ─── Status (EXCELENTE/OK/RUIM) com base na projeção ───────
export function calcularStatus(projecao: number, metaEfetiva: number): StatusMRP {
  if (metaEfetiva <= 0) return 'OK';
  if (projecao >= metaEfetiva * 1.2) return 'EXCELENTE';
  if (projecao >= metaEfetiva) return 'OK';
  return 'RUIM';
}

// ─── Pontos/dia necessários para cumprir a meta ────────────
export function pontosPorDiaNecessarios(
  pontosAcumulados: number,
  metaEfetiva: number,
  diasEfetivosRestantes: number,
): number {
  if (diasEfetivosRestantes <= 0) return 0;
  const falta = Math.max(0, metaEfetiva - pontosAcumulados);
  return Math.round((falta / diasEfetivosRestantes) * 10) / 10;
}

// ─── Score de complexidade ─────────────────────────────────
// Pondera revisão, número de análises e ocorrência de IND/Embargo.
export function calcularScoreComplexidade(reg: {
  revisao?: boolean;
  numero_analise?: number | null;
  teve_ind?: boolean;
  teve_embargo?: boolean;
}): { score: number; classificacao: 'Simples' | 'Moderado' | 'Complexo' | 'Crítico' } {
  let score = 0;
  if (reg.revisao) score += 2;
  const n = Number(reg.numero_analise ?? 1);
  if (n > 2) score += n - 2;
  if (reg.teve_ind) score += 3;
  if (reg.teve_embargo) score += 2;

  const classificacao =
    score === 0 ? 'Simples'
      : score <= 2 ? 'Moderado'
      : score <= 4 ? 'Complexo'
      : 'Crítico';
  return { score, classificacao };
}

// ─── Faixa de área para gráficos ───────────────────────────
export function faixaArea(area: number): string {
  if (area <= 0) return 'sem área';
  if (area <= 70) return '0–70 m²';
  if (area <= 200) return '71–200 m²';
  if (area <= 540) return '201–540 m²';
  if (area <= 1000) return '541–1.000 m²';
  if (area <= 2000) return '1.001–2.000 m²';
  return '> 2.000 m²';
}

// ─── Extração de métricas do processos.dados (JSONB) ───────
// O schema canônico do projeto é { [campo]: { valor, origem, ... } }.
// Algumas chaves têm aliases históricos — tentamos todas.
type CampoJsonb = { valor?: unknown } | undefined | null;

function pickStr(...campos: CampoJsonb[]): string {
  for (const c of campos) {
    const v = (c?.valor ?? '') as unknown;
    const s = String(v ?? '').trim();
    if (s && s.toUpperCase() !== 'NP' && s.toLowerCase() !== 'não identificado') return s;
  }
  return '';
}

function pickNum(...campos: CampoJsonb[]): number {
  for (const c of campos) {
    const v = c?.valor;
    if (v === null || v === undefined) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    // Aceita "1.234,56 m²" (PT-BR), "1234.56" (EN) ou "1234,56".
    let s = String(v).replace(/m²|m2|\s/gi, '');
    if (s.includes(',')) {
      // PT-BR: ponto é separador de milhar, vírgula é decimal.
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(s);
    if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export type DadosProcesso = Record<string, CampoJsonb>;

export function extrairMetricasProcesso(dados: DadosProcesso | null | undefined) {
  const d = (dados || {}) as Record<string, CampoJsonb>;

  const interessado = pickStr(d.proprietario, d.interessado, d.nome_proprietario);
  const assunto = pickStr(d.assunto, d.descricao_assunto, d.tipo_obra, d.uso);
  const bairro = pickStr(d.bairro, d.setor);
  const setor = pickStr(d.setor, d.bairro);
  // Área construída (preferida) cai para área total se não vier separada.
  const area = pickNum(d.areaConstruida, d.area_construida, d.areaTotal, d.area_total);
  const porteCampo = pickStr(d.porte);
  const porte = inferirPorte(area, porteCampo);

  return { interessado, assunto, bairro, setor, area, porte };
}

// ─── Tipos compartilhados para o frontend ──────────────────
export type RegistroMRP = {
  id: string;
  usuario_id: string;
  processo_codigo: string;
  tipo_processo: string;
  interessado: string | null;
  assunto: string | null;
  porte: Porte;
  area_construida: number;
  bairro: string | null;
  setor: string | null;
  tipo_despacho: TipoDespacho;
  numero_despacho: string | null;
  numero_analise: number | null;
  numero_revisao: number | null;
  revisao: boolean;
  data_inicio: string | null;
  data_despacho: string;
  pontos: number;
  observacoes: string | null;
  mes: number;
  ano: number;
  auto_gerado: boolean;
};

export type PainelResposta = {
  pontos_acumulados: number;
  total_despachos: number;
  area_total: number;
  meta_efetiva: number;
  projecao: number;
  status: StatusMRP;
  pontos_necessarios_por_dia: number;
  dias_efetivos_passados: number;
  dias_efetivos_restantes: number;
  calendario: Calendario;
  // true quando a pessoa era Gerência/Diretoria no mês consultado.
  isento_de_meta: boolean;
  historico_mensal: {
    // `meta` é a meta que vigorava naquele mês — pode diferir da meta atual.
    // `isento` = sem meta naquele mês (chefia à época).
    mes: number; ano: number; pontos: number; despachos: number;
    meta: number; isento: boolean; resultado: StatusMRP;
  }[];
  stats: {
    por_tipo_despacho: { tipo: string; count: number; pontos: number }[];
    por_tipo_processo: { tipo: string; count: number; area_total: number }[];
    por_porte: { porte: string; count: number; area_total: number }[];
    por_faixa_area: { faixa: string; count: number }[];
    taxa_revisao: number;
    taxa_indeferimento: number;
    tempo_medio_analise_dias: number;
    tempo_medio_por_mes: { mes: string; media: number }[];
    top_tempo_processo: { processo: string; dias: number }[];
    top_assuntos: { assunto: string; count: number }[];
    por_dia_semana: { dia: string; count: number }[];
    por_bairro: { bairro: string; count: number; area_total: number }[];
  };
};
