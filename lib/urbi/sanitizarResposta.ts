/**
 * lib/urbi/sanitizarResposta.ts — Fase AD (04/09/2026): rede de segurança determinística contra
 * vazamento de caminho técnico/UUID na resposta HUMANA do Co-Analista.
 *
 * Achado real do piloto: mesmo com o prompt instruindo explicitamente "use sempre 'rotulo',
 * nunca a chave do objeto" (Fase AC), o Gemini continuou citando caminho técnico tipo
 * "lip.campos_tecnicos.observacoes" entre parênteses na seção "Fontes consultadas" — instrução
 * de prompt sozinha não é garantia, o modelo pode desobedecer. Esta função roda DEPOIS da
 * resposta do modelo, inteiramente em código, e remove qualquer ocorrência do padrão — nunca
 * depende do modelo ter seguido a instrução.
 *
 * Só mexe no texto que o ANALISTA vê — o que fica gravado pra auditoria interna (urbi_historico,
 * urbis_api_calls) é decisão de quem grava, não desta função.
 */

// Raízes reais dos objetos do dossiê (ver lib/urbi/montarDossie.ts) — qualquer caminho do tipo
// "raiz.propriedade[.propriedade...]" é sempre um detalhe técnico interno, nunca prosa legítima
// em português (nenhuma dessas palavras, seguida de ".", ocorre numa frase humana normal).
const RAIZES_DOSSIE = ["processo", "situacoes", "lip", "mac", "fluxo", "cruzamentos", "tecnico", "cobertura"];
const PADRAO_CAMINHO_TECNICO = new RegExp(`\\b(?:${RAIZES_DOSSIE.join("|")})(?:\\.[a-zA-Z0-9_]+){1,4}\\b`, "g");
const PADRAO_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Remove todo caminho técnico ("lip.campos_tecnicos.X", "mac.resumo_ultima_analise.Y"...) e todo
 * UUID solto do texto, depois limpa a pontuação residual que a remoção deixa pra trás (o caso
 * mais comum: "Rótulo humano (caminho.tecnico)" vira só "Rótulo humano", nunca "Rótulo humano ()"
 * nem "Rótulo humano (, )").
 */
export function removerCaminhosTecnicos(texto: string): string {
  let limpo = texto.replace(PADRAO_CAMINHO_TECNICO, "").replace(PADRAO_UUID, "");
  // Várias passadas: uma lista com 2+ caminhos técnicos nos mesmos parênteses (ex.:
  // "(situacoes.geral.classe, situacoes.geral.motivo)") deixa resíduo em camadas
  // ("(, )") que só se resolve depois de mais de uma rodada de limpeza.
  for (let i = 0; i < 3; i++) {
    limpo = limpo
      .replace(/\(\s*,\s*/g, "(")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*\)/g, ")")
      .replace(/\(\s*\)/g, "")
      .replace(/[ \t]+\)/g, ")")
      .replace(/\([ \t]+/g, "(");
  }
  return limpo
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]+$/gm, "");
}
