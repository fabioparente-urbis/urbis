/**
 * lib/cadastroImobiliario.ts — largura de via e de calçada, do Cadastro de Logradouros.
 *
 * A tabela `logradouros` tem 20.524 vias de Goiânia com hierarquia viária, largura da via, da
 * pista, da calçada e da ilha. Já era usada pela tela "Via no Cadastro Imobiliário" do slot 1 e
 * nunca tinha sido ligada ao slot 5 — os campos `larguraDaVia1` e `larguraDoPasseio1` do LIP
 * ficavam vazios com o dado a uma consulta de distância.
 *
 * ── O CASAMENTO DE NOME É O PROBLEMA, NÃO A CONSULTA ────────────────────────────
 * O Uso do Solo diz bairro "JD GOIAS" e via "R 2". O cadastro grava "JD GOIAS" e "R  2" — com
 * DOIS espaços. Comparar string crua não acha nada. A normalização abaixo colapsa espaço, tira
 * acento e expande as abreviaturas usuais (R→RUA, AV→AVENIDA, AL→ALAMEDA, PC→PRACA).
 *
 * ── HIERARQUIA: DUAS FONTES QUE PODEM DIVERGIR ──────────────────────────────────
 * O Uso do Solo também classifica a via, e o OBS COD registra a pergunta em aberto de qual das
 * duas manda quando divergem (muda porte, vagas e recuo). Aqui NÃO se decide: devolve-se a
 * hierarquia do cadastro junto, e a divergência vira conferência para o analista resolver.
 */

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export type ViaCadastro = {
  nome: string;
  bairro: string;
  hierarquia: string | null;
  larguraVia: number | null;
  larguraPista: number | null;
  larguraCalcada: number | null;
  larguraIlha: number | null;
};

const ABREV: [RegExp, string][] = [
  [/^R\b\.?/, "RUA"], [/^AV\b\.?/, "AVENIDA"], [/^AL\b\.?/, "ALAMEDA"],
  [/^PC\b\.?/, "PRACA"], [/^TV\b\.?/, "TRAVESSA"], [/^ROD\b\.?/, "RODOVIA"],
  [/^MARG\b\.?/, "MARGINAL"], [/^JD\b\.?/, "JARDIM"], [/^ST\b\.?/, "SETOR"],
  [/^PQ\b\.?/, "PARQUE"], [/^RES\b\.?/, "RESIDENCIAL"], [/^CJ\b\.?/, "CONJUNTO"],
];

/** "R  2" · "RUA 02" · "r.2" → "RUA 2" */
export function normalizarVia(nome: string): string {
  let t = (nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
  for (const [re, cheio] of ABREV) if (re.test(t)) { t = t.replace(re, cheio); break; }
  // "RUA 02" e "RUA 2" são a mesma via
  return t.replace(/\b0+(\d)/g, "$1").replace(/\s+/g, " ").trim();
}

/**
 * Procura a via no cadastro. Devolve null quando não acha — e não acha é resposta: o cadastro não
 * cobre loteamento novo, e inventar largura de via é pior que deixar o campo vazio, porque a
 * largura entra no cálculo de recuo, de porte e de vagas.
 */
export async function buscarVia(bairro: string, via: string): Promise<ViaCadastro | null> {
  if (!bairro?.trim() || !via?.trim()) return null;

  const alvoBairro = normalizarVia(bairro);
  const alvoVia = normalizarVia(via);

  const COLUNAS = "bairro,nome_logradouro,hierarquia_viaria,largura_via,largura_pista,larg_calcada,largura_ilha";

  /* O filtro do BAIRRO vai ao banco; o casamento da VIA é em memória.
   * Motivo: a grafia do banco ("R  2", com dois espaços) não sobrevive a um ilike montado a partir
   * do texto do Uso do Solo ("R 2"). Filtrar o bairro derruba 20.524 linhas para ~150, e aí
   * comparar em memória é barato e exato. */
  let { data } = await supabase.from("logradouros").select(COLUNAS).eq("bairro", bairro).limit(600);

  // o bairro também pode estar abreviado de outro jeito: tenta pela palavra mais significativa
  if (!data?.length) {
    const palavra = alvoBairro.split(" ").sort((a, b) => b.length - a.length)[0] ?? alvoBairro;
    ({ data } = await supabase.from("logradouros").select(COLUNAS)
      .ilike("bairro", `%${palavra}%`).limit(600));
  }
  if (!data?.length) return null;

  const achado = data.find(
    (l: any) => normalizarVia(l.bairro) === alvoBairro && normalizarVia(l.nome_logradouro) === alvoVia,
  );
  if (!achado) return null;

  return {
    nome: achado.nome_logradouro,
    bairro: achado.bairro,
    hierarquia: achado.hierarquia_viaria ?? null,
    larguraVia: achado.largura_via ?? null,
    larguraPista: achado.largura_pista ?? null,
    larguraCalcada: achado.larg_calcada ?? null,
    larguraIlha: achado.largura_ilha ?? null,
  };
}
