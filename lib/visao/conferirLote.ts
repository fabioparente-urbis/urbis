/**
 * lib/visao/conferirLote.ts — "as dimensões do lote conferem com a certidão de matrícula?"
 *
 * Módulo PURO (sem banco, sem rede): é a parte que decide, e por isso a que precisa de teste
 * determinístico. Quem LÊ as imagens são as receitas `certidao.descricao_imovel` e
 * `prancha.planta_situacao` (lib/visao/receitas.ts); aqui só se compara o que elas devolveram com o
 * que a camada de texto já tinha (carimbo, lote e quadra do Uso do Solo).
 *
 * Regra de decisão — conservadora, porque um SIM errado deixa passar lote com medida diferente da
 * matrícula, e a medida do lote decide recuo, ocupação e permeabilidade:
 *   · qualquer par comparável que DIVERGE        → "NÃO" (com o par que divergiu na evidência)
 *   · todos os pares conferem e há pelo menos 2, e pelo menos 1 deles vem da planta de situação
 *                                                 → "SIM"
 *   · pouco dado (ex.: situação ilegível)          → null: o campo fica pendente, nunca estimado
 *
 * Os dois lados podem trazer a mesma medida em ordem diferente (a planta não diz qual cota é a
 * frente), então lados são comparados como MENOR e MAIOR cota, não como frente/lateral.
 */

/** Valores em cm de diferença que ainda contam como a mesma medida: arredondamento de CAD. */
const TOL_METROS = 0.10;
/** Área: 0,5% ou 0,5 m² (o que for maior) — a matrícula arredonda, o CAD calcula. */
const TOL_AREA_REL = 0.005;
const TOL_AREA_ABS = 0.5;

export type LeituraCertidao = {
  lote?: string | null; quadra?: string | null; area?: string | null;
  frente?: string | null; lateralDireita?: string | null; lateralEsquerda?: string | null; fundos?: string | null;
};
export type LeituraSituacao = { area?: string | null; menorCota?: string | null; maiorCota?: string | null };
export type EntradaConferencia = {
  certidao: LeituraCertidao;
  situacao: LeituraSituacao;
  /** o que o texto já leu do carimbo e do Uso do Solo */
  carimbo: { areaTerreno?: string | null; lote?: string | null; quadra?: string | null };
};

export type Comparacao = { nome: string; a: string; b: string; ok: boolean; daSituacao: boolean };
export type ResultadoConferencia = {
  veredito: "SIM" | "NÃO" | null;
  comparacoes: Comparacao[];
  /** frase para o analista: o que foi comparado e, se for o caso, o que divergiu */
  evidencia: string;
};

/** "1.234,56" / "360,00" / "360.00" / "360" → número; qualquer outra coisa → null. */
export function numero(v: string | null | undefined): number | null {
  const s = String(v ?? "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
}

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

/** "Q03", "Quadra 03", "03", "A-18" → forma comparável. Zeros à esquerda e rótulo não contam. */
function idLote(v: string | null | undefined): string | null {
  const s = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  return s.replace(/^(QUADRA|QD|LOTE|LT|Q|L)(?=[A-Z0-9]*\d)/, "").replace(/^0+(?=\d)/, "") || null;
}

export function conferirLote(e: EntradaConferencia): ResultadoConferencia {
  const comparacoes: Comparacao[] = [];

  const areaCert = numero(e.certidao.area);
  const lados = [e.certidao.frente, e.certidao.lateralDireita, e.certidao.lateralEsquerda, e.certidao.fundos]
    .map(numero).filter((n): n is number => n != null);

  const areaConfere = (x: number, y: number) =>
    Math.abs(x - y) <= Math.max(TOL_AREA_ABS, TOL_AREA_REL * Math.max(x, y));
  const ladoConfere = (x: number, y: number) => Math.abs(x - y) <= TOL_METROS;

  // lote e quadra: a certidão descreve OUTRO imóvel se não batem — é a divergência mais grave
  for (const [nome, cert, txt] of [
    ["Lote", e.certidao.lote, e.carimbo.lote], ["Quadra", e.certidao.quadra, e.carimbo.quadra],
  ] as const) {
    const a = idLote(cert), b = idLote(txt);
    if (a && b) comparacoes.push({ nome, a: String(cert), b: String(txt), ok: a === b, daSituacao: false });
  }

  const areaCarimbo = numero(e.carimbo.areaTerreno);
  if (areaCert != null && areaCarimbo != null) {
    comparacoes.push({
      nome: "Área × carimbo da prancha", a: `${fmt(areaCert)} m²`, b: `${fmt(areaCarimbo)} m²`,
      ok: areaConfere(areaCert, areaCarimbo), daSituacao: false,
    });
  }

  const areaSit = numero(e.situacao.area);
  if (areaCert != null && areaSit != null) {
    comparacoes.push({
      nome: "Área × planta de situação", a: `${fmt(areaCert)} m²`, b: `${fmt(areaSit)} m²`,
      ok: areaConfere(areaCert, areaSit), daSituacao: true,
    });
  }

  /* Só compara lados quando a certidão trouxe os QUATRO: lote irregular (chanfro, 5+ lados)
   * descrito pela metade daria menor/maior cota de outra figura e um NÃO falso. */
  const menorSit = numero(e.situacao.menorCota), maiorSit = numero(e.situacao.maiorCota);
  if (lados.length === 4 && menorSit != null && maiorSit != null) {
    const menorCert = Math.min(...lados), maiorCert = Math.max(...lados);
    comparacoes.push({
      nome: "Menor cota × planta de situação", a: `${fmt(menorCert)} m`, b: `${fmt(menorSit)} m`,
      ok: ladoConfere(menorCert, menorSit), daSituacao: true,
    });
    comparacoes.push({
      nome: "Maior cota × planta de situação", a: `${fmt(maiorCert)} m`, b: `${fmt(maiorSit)} m`,
      ok: ladoConfere(maiorCert, maiorSit), daSituacao: true,
    });
  }

  const divergentes = comparacoes.filter((c) => !c.ok);
  const linha = (c: Comparacao) => `${c.nome}: certidão ${c.a} × ${c.b}`;

  if (divergentes.length) {
    return {
      veredito: "NÃO", comparacoes,
      evidencia: `NÃO CONFERE — ${divergentes.map(linha).join("; ")}`
        + (comparacoes.length > divergentes.length
          ? `. Conferiam: ${comparacoes.filter((c) => c.ok).map((c) => c.nome).join(", ")}` : ""),
    };
  }
  if (comparacoes.length >= 2 && comparacoes.some((c) => c.daSituacao)) {
    return {
      veredito: "SIM", comparacoes,
      evidencia: `CONFERE — ${comparacoes.map(linha).join("; ")}`,
    };
  }
  return {
    veredito: null, comparacoes,
    evidencia: comparacoes.length
      ? `dado insuficiente: só ${comparacoes.map((c) => c.nome).join(", ")} puderam ser comparados, e sem a planta de situação não há veredito`
      : "a certidão e a planta de situação não puderam ser lidas",
  };
}
