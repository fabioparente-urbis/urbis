/**
 * lib/urbi/catalogoConsultaPilha.ts — Camada 2 da arquitetura mestra do URBI (05/09/2026):
 * bloco VERSIONADO de atributos factuais consultáveis da Pilha, gravado dentro de cada retrato
 * (urbi_radar_retratos.campos_consulta).
 *
 * ── AUDITORIA CURTA (feita antes de escrever este arquivo, contra `lip_campos` real) ──────────
 * `catalogoSemantico.ts` (Fase AA) cobre só ~13 campos de ÁREA/ALTURA/VOLUME, pra impedir
 * comparação inválida entre eles — NÃO cobre bairro/onerosa/pavimentos, que são um domínio
 * diferente (filtro de Pilha, não comparação de grandeza). Este arquivo é um catálogo SEPARADO
 * e RESTRITO, só para os atributos autorizados abaixo — nunca usado pra comparação de área.
 *
 * Confirmado por consulta real a `lip_campos` (chave, label) nos 3 assuntos:
 *   - bairro:      chave "bairro" ESTÁVEL nos 3 slots (label "Bairro" nos 3).
 *   - pavimentos:  chave "pav" ESTÁVEL nos 3 slots (label "Número de Pavimentos"/variação de
 *                  caixa, mesmo sentido).
 *   - onerosa:     chave DIFERENTE por slot — "onerosa" (Regularização/Aceite SEI, label "Tem
 *                  Onerosa?") vs "outorgaOnerosa" (Slot 5, label "Outorga Onerosa?") — MESMO
 *                  domínio, chave diferente (mesmo padrão do achado da Fase AA: nunca comparar
 *                  chave crua entre slots, sempre resolver pelo catálogo).
 *   - porte:       NÃO é campo do LIP — é `processos.porte` (coluna direta, PP/MP/GP), a MESMA
 *                  fonte que a Pilha já usa (app/api/processos/route.ts).
 *   - retorno_gerencia: SEM FONTE CONFIÁVEL — nenhuma tabela/tag registra "retornou da
 *                  gerência" hoje. Declarado sempre indisponível, nunca inventado.
 *
 * Cada atributo é { valor, disponivel, fonte, motivo? } — nunca um valor solto sem procedência.
 * "disponivel: false" cobre TANTO "não existe fonte" quanto "não se aplica a este processo agora"
 * (o `motivo` sempre diz qual dos dois é, nunca some a distinção).
 */
import { type Slot } from "./catalogoSemantico";
import type { RelatorioMotor } from "./motorProducao";

export type AtributoFactual<T> = {
  valor: T | null;
  disponivel: boolean;
  fonte: string;
  motivo?: string;
};

export type BlocoAtributosConsultaveis = {
  versao_bloco: 1;
  bairro: AtributoFactual<string>;
  onerosa: AtributoFactual<boolean>;
  pavimentos: AtributoFactual<number>;
  porte: AtributoFactual<string>;
  faixa_area: AtributoFactual<string>;
  analise_atual: AtributoFactual<number>;
  situacao_geral: AtributoFactual<string>;
  data_indeferimento: AtributoFactual<string>;
  retorno_gerencia: AtributoFactual<boolean>;
  campos_criticos_vazios: AtributoFactual<number>;
  campos_criticos_em_x: AtributoFactual<number>;
  campos_criticos_totais: AtributoFactual<number>;
  dias_aguardando_retorno: AtributoFactual<number>;
  pendencias: AtributoFactual<number>;
  retrabalho: AtributoFactual<number>;
  esforco_provavel: AtributoFactual<string>;
};

const FONTE_LIP = (rotulo: string) => `LIP — ${rotulo}`;

function atributoIndisponivel<T>(fonte: string, motivo: string): AtributoFactual<T> {
  return { valor: null, disponivel: false, fonte, motivo };
}

/** "Sim"/"Não" (formato padrão dos campos booleanos do LIP nos 3 slots) → boolean real. */
function paraBooleanoLip(valor: unknown): boolean | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  if (v === "sim") return true;
  if (v === "não" || v === "nao") return false;
  return null;
}

function paraNumero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Mesmos 3 limiares já usados pelo filtro de área da Pilha (lib/urbi/navegacao.ts) — reproduzido
 *  aqui como classificação pura, nunca a lógica de filtro em si (evita acoplar um módulo de
 *  navegação de UI a este catálogo, mas nunca diverge dos limiares reais: 250 e 1000). */
function calcularFaixaArea(area: number | null): string | null {
  if (area === null) return null;
  if (area <= 250) return "ate_250";
  if (area <= 1000) return "de_251_a_1000";
  return "acima_1000";
}

const CHAVE_BAIRRO: Record<Slot, string> = { regularizacao: "bairro", aceite_sei: "bairro", slot_05: "bairro" };
const CHAVE_ONEROSA: Record<Slot, string> = { regularizacao: "onerosa", aceite_sei: "onerosa", slot_05: "outorgaOnerosa" };
const CHAVE_PAVIMENTOS: Record<Slot, string> = { regularizacao: "pav", aceite_sei: "pav", slot_05: "pav" };

function ehSlotConhecido(tipo: string | null | undefined): tipo is Slot {
  return tipo === "regularizacao" || tipo === "aceite_sei" || tipo === "slot_05";
}

/**
 * Monta o bloco inteiro a partir do MESMO dossiê (`d`, resultado de montarDossieFactual) e do
 * MESMO relatório do Motor de Produção (`relatorio`, montarRelatorioMotor) já calculados por
 * quem chama — nunca um cálculo novo. `tagsProcesso` vem de uma consulta própria e pequena
 * (processos.tags), porque o dossiê não expõe tags cruas. Nunca grava dado pessoal, texto livre
 * de observação, documento integral ou qualquer campo fora desta lista.
 */
export function montarBlocoAtributosConsultaveis(
  d: Record<string, any>,
  relatorio: RelatorioMotor,
  tagsProcesso: { tipo: string; criado_em?: string | null }[],
): BlocoAtributosConsultaveis {
  const tipoProcesso = d.processo?.tipo_processo ?? null;
  const slot = ehSlotConhecido(tipoProcesso) ? tipoProcesso : null;
  const camposTecnicos: Record<string, { valor: unknown; rotulo?: string }> = d.lip?.campos_tecnicos ?? {};

  const campoDoSlot = (mapa: Record<Slot, string>): { chave: string; campo: any } | null => {
    if (!slot) return null;
    const chave = mapa[slot];
    return { chave, campo: camposTecnicos[chave] };
  };

  // ── bairro ──────────────────────────────────────────────────────────────
  let bairro: AtributoFactual<string>;
  if (!slot) {
    bairro = atributoIndisponivel(FONTE_LIP("Bairro"), "slot não identificado");
  } else {
    const alvo = campoDoSlot(CHAVE_BAIRRO)!;
    const valor = typeof alvo.campo?.valor === "string" ? alvo.campo.valor.trim() : null;
    bairro = valor
      ? { valor, disponivel: true, fonte: FONTE_LIP(alvo.campo?.rotulo ?? "Bairro") }
      : atributoIndisponivel(FONTE_LIP("Bairro"), "campo vazio no LIP deste processo");
  }

  // ── onerosa ─────────────────────────────────────────────────────────────
  let onerosa: AtributoFactual<boolean>;
  if (!slot) {
    onerosa = atributoIndisponivel(FONTE_LIP("Onerosa"), "slot não identificado");
  } else {
    const alvo = campoDoSlot(CHAVE_ONEROSA)!;
    const valor = paraBooleanoLip(alvo.campo?.valor);
    onerosa = valor !== null
      ? { valor, disponivel: true, fonte: FONTE_LIP(alvo.campo?.rotulo ?? "Onerosa") }
      : atributoIndisponivel(FONTE_LIP(alvo.campo?.rotulo ?? "Onerosa"), "campo vazio ou não é Sim/Não no LIP deste processo");
  }

  // ── pavimentos ──────────────────────────────────────────────────────────
  let pavimentos: AtributoFactual<number>;
  if (!slot) {
    pavimentos = atributoIndisponivel(FONTE_LIP("Número de Pavimentos"), "slot não identificado");
  } else {
    const alvo = campoDoSlot(CHAVE_PAVIMENTOS)!;
    const valor = paraNumero(alvo.campo?.valor);
    pavimentos = valor !== null
      ? { valor, disponivel: true, fonte: FONTE_LIP(alvo.campo?.rotulo ?? "Número de Pavimentos") }
      : atributoIndisponivel(FONTE_LIP(alvo.campo?.rotulo ?? "Número de Pavimentos"), "campo vazio ou não numérico no LIP deste processo");
  }

  // ── porte / faixa de área — coluna direta de `processos`, nunca campo do LIP ─────────────
  const porteValor = typeof d.processo?.porte === "string" ? d.processo.porte : null;
  const porte: AtributoFactual<string> = porteValor
    ? { valor: porteValor, disponivel: true, fonte: "Processo — Porte (processos.porte)" }
    : atributoIndisponivel("Processo — Porte (processos.porte)", "porte não cadastrado neste processo");

  const areaNum = paraNumero(d.processo?.area_construida);
  const faixa = calcularFaixaArea(areaNum);
  const faixa_area: AtributoFactual<string> = faixa
    ? { valor: faixa, disponivel: true, fonte: "Processo — Área construída (processos.area_construida)" }
    : atributoIndisponivel("Processo — Área construída (processos.area_construida)", "área não cadastrada neste processo");

  // ── análise atual ───────────────────────────────────────────────────────
  const numeroAnaliseAtual = d.mac?.ultima_analise?.numero_analise ?? null;
  const analise_atual: AtributoFactual<number> = typeof numeroAnaliseAtual === "number"
    ? { valor: numeroAnaliseAtual, disponivel: true, fonte: "MAC — análises_mac (última passada)" }
    : atributoIndisponivel("MAC — análises_mac (última passada)", "nenhuma análise registrada ainda");

  // ── situação geral + data de indeferimento ─────────────────────────────
  const situacaoGeralValor = d.situacoes?.geral?.classe ?? null;
  const situacao_geral: AtributoFactual<string> = situacaoGeralValor
    ? { valor: situacaoGeralValor, disponivel: true, fonte: "Processo/MAC — situação geral (lib/bdi/situacao.ts)" }
    : atributoIndisponivel("Processo/MAC — situação geral (lib/bdi/situacao.ts)", "situação não calculável");

  const tagIndeferimento = tagsProcesso.find((t) => t.tipo === "indeferimento" || t.tipo === "arquivamento");
  const data_indeferimento: AtributoFactual<string> = tagIndeferimento?.criado_em
    ? { valor: tagIndeferimento.criado_em, disponivel: true, fonte: "Processo — tag de indeferimento/arquivamento (processos.tags)" }
    : atributoIndisponivel("Processo — tag de indeferimento/arquivamento (processos.tags)", "processo não tem tag de indeferimento/arquivamento");

  // ── retorno da gerência — SEM FONTE CONFIÁVEL hoje, declarado sempre assim ──────────────
  const retorno_gerencia: AtributoFactual<boolean> = atributoIndisponivel(
    "(nenhuma — não existe hoje)",
    "não existe, no sistema atual, nenhuma tabela ou tag que registre 'retorno da gerência' — nunca inventar este dado",
  );

  // ── campos críticos (fonte canônica única, Fase AE) ────────────────────
  const campos_criticos_vazios: AtributoFactual<number> = typeof d.lip?.campos_vazios === "number"
    ? { valor: d.lip.campos_vazios, disponivel: true, fonte: "LIP — vw_bdi_campos_criticos" }
    : atributoIndisponivel("LIP — vw_bdi_campos_criticos", "contagem indisponível");
  const campos_criticos_em_x: AtributoFactual<number> = typeof d.lip?.campos_em_x === "number"
    ? { valor: d.lip.campos_em_x, disponivel: true, fonte: "LIP — vw_bdi_campos_criticos" }
    : atributoIndisponivel("LIP — vw_bdi_campos_criticos", "contagem indisponível");
  const campos_criticos_totais: AtributoFactual<number> = typeof d.lip?.campos_totais === "number"
    ? { valor: d.lip.campos_totais, disponivel: true, fonte: "LIP — vw_bdi_campos_criticos" }
    : atributoIndisponivel("LIP — vw_bdi_campos_criticos", "contagem indisponível");

  // ── dias aguardando retorno — só quando é fato real ("ainda aguardando") ────────────────
  const aguardando: any[] = Array.isArray(d.fluxo?.aguardando_retorno) ? d.fluxo.aguardando_retorno : [];
  const emEspera = aguardando.find((a) => a?.situacao === "ainda aguardando");
  const dias_aguardando_retorno: AtributoFactual<number> = emEspera && typeof emEspera.dias === "number"
    ? { valor: emEspera.dias, disponivel: true, fonte: "BDI — vw_bdi_aguardando_retorno" }
    : atributoIndisponivel("BDI — vw_bdi_aguardando_retorno", "processo não está aguardando retorno do interessado agora");

  // ── pendências / retrabalho / esforço (reaproveitados, nunca recalculados) ──────────────
  const pendenciasValor = Array.isArray(d.mac?.pendencias_ultima_analise) ? d.mac.pendencias_ultima_analise.length : null;
  const pendencias: AtributoFactual<number> = pendenciasValor !== null
    ? { valor: pendenciasValor, disponivel: true, fonte: "MAC — pendências da última análise" }
    : atributoIndisponivel("MAC — pendências da última análise", "nenhuma análise registrada ainda");

  const retrabalhoValor = Array.isArray(d.fluxo?.retrabalho_entre_passadas) ? d.fluxo.retrabalho_entre_passadas.length : null;
  const retrabalho: AtributoFactual<number> = retrabalhoValor !== null
    ? { valor: retrabalhoValor, disponivel: true, fonte: "BDI — vw_bdi_retrabalho_por_passada" }
    : atributoIndisponivel("BDI — vw_bdi_retrabalho_por_passada", "contagem indisponível");

  const esforco_provavel: AtributoFactual<string> = relatorio?.esforco
    ? { valor: relatorio.esforco, disponivel: true, fonte: "Motor de Produção (lib/urbi/motorProducao.ts)" }
    : atributoIndisponivel("Motor de Produção (lib/urbi/motorProducao.ts)", "relatório do motor indisponível");

  return {
    versao_bloco: 1,
    bairro, onerosa, pavimentos, porte, faixa_area, analise_atual, situacao_geral,
    data_indeferimento, retorno_gerencia, campos_criticos_vazios, campos_criticos_em_x,
    campos_criticos_totais, dias_aguardando_retorno, pendencias, retrabalho, esforco_provavel,
  };
}
