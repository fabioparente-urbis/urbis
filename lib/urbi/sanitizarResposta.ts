/**
 * lib/urbi/sanitizarResposta.ts — Fase AD→AG (04/09/2026): rede de segurança determinística
 * contra vazamento de detalhe técnico na resposta HUMANA do Co-Analista.
 *
 * Cada rodada de piloto achou uma forma NOVA de vazamento que a rodada anterior de prompt não
 * cobria — confirma que instrução de prompt sozinha não é garantia, o modelo pode desobedecer de
 * um jeito diferente a cada vez. Esta função roda DEPOIS da resposta do modelo, inteiramente em
 * código: caminho técnico tipo "lip.campos_tecnicos.X" (Fase AD), UUID solto, tag
 * "grau_certeza: X" (Fase AF), expansão inventada de sigla tipo "LIP (Laudo de Informações
 * Preliminares)" e qualquer palavra_com_underscore solta (Fase AG, achado real: "itens_em_branco"
 * apareceu cru na prosa, fora de qualquer caminho técnico com raiz conhecida).
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
// Fase AF (04/09/2026, achado real do 3º reteste): o prompt pede pro modelo NUNCA imprimir o
// vocabulário interno de certeza literalmente (a seção onde o fato aparece já expressa isso) —
// mas, como todo o resto que já foi só instrução de prompt, pode ser ignorado. Só o "grau" +
// "certeza" juntos são exigidos aqui (nunca as 5 palavras soltas, tipo "confirmado" — essas são
// português comum e apareceriam em prosa legítima, cortar por engano é pior que deixar passar).
const PADRAO_GRAU_CERTEZA = /grau[ _-]?(?:de[ _-]?)?certeza\s*[:=]\s*["']?[a-zçã_-]+["']?/gi;
// Fase AG (04/09/2026, achado real do 4º reteste): o modelo "explicou" a sigla LIP com um nome
// inventado ("Laudo de Informações Preliminares" — nem é o nome certo, que é "Leitura Inteligente
// de Processo", ver CLAUDE.md) — sem fonte confiável no dossiê pra expansão de sigla nenhuma, o
// risco é sempre inventar. Nunca deixa a sigla passar COM parênteses de expansão, seja qual for o
// texto dentro — a sigla sozinha sempre sobrevive.
const SIGLAS_DO_SISTEMA = ["LIP", "MAC", "BIP", "MRP", "MDP", "MAP", "MHD", "URBI"];
const PADRAO_EXPANSAO_SIGLA = new RegExp(`\\b(${SIGLAS_DO_SISTEMA.join("|")})\\s*\\([^)]*\\)`, "g");
// Qualquer palavra_com_underscore que sobreviver até aqui é sempre um identificador técnico
// (chave de objeto, nome de coluna) — nunca prosa legítima em português, que não usa "_". Vira
// as mesmas palavras separadas por espaço (perde acentuação da chave, que nunca tinha mesmo:
// "itens_em_branco" -> "itens em branco"; melhor que expor o "_" cru, nunca pretende ser
// ortografia perfeita).
const PADRAO_CHAVE_SOLTA = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

/**
 * Remove todo caminho técnico ("lip.campos_tecnicos.X", "mac.resumo_ultima_analise.Y"...), todo
 * UUID solto, toda tag "grau_certeza: X", toda expansão inventada de sigla ("LIP (...)") e toda
 * palavra_com_underscore solta do texto — depois limpa a pontuação residual que a remoção deixa
 * pra trás (o caso mais comum: "Rótulo humano (caminho.tecnico)" vira só "Rótulo humano", nunca
 * "Rótulo humano ()" nem "Rótulo humano (, )").
 */
export function removerCaminhosTecnicos(texto: string): string {
  let limpo = texto
    .replace(PADRAO_CAMINHO_TECNICO, "")
    .replace(PADRAO_UUID, "")
    .replace(PADRAO_GRAU_CERTEZA, "")
    .replace(PADRAO_EXPANSAO_SIGLA, "$1")
    .replace(PADRAO_CHAVE_SOLTA, (m) => m.replace(/_/g, " "));
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
