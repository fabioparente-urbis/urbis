/**
 * scripts/testar_fase_ag_linguagem_final.mts — Fase AG (04/09/2026): 4º e último reteste de
 * linguagem do resumo (25.5.000046759-5) antes de validar troca de contexto e avançar pro
 * Aceite SEI. 4 pontos:
 *   1. Nunca expandir sigla (LIP virou "Laudo de Informações Preliminares" — nem é o nome certo).
 *   2. Nunca confirmação implícita entre valores de área sem cruzamento real.
 *   3. Nunca causalidade inventada entre dois fatos.
 *   4. Nenhuma chave_solta com underscore na resposta ("itens_em_branco" cru).
 *
 * Pontos 1 e 4 ganharam rede de segurança em código (lib/urbi/sanitizarResposta.ts) — testados
 * com fixture real. Pontos 2 e 3 são puramente semânticos, só prompt — testados por presença da
 * instrução no arquivo.
 *
 *   npx tsx scripts/testar_fase_ag_linguagem_final.mts
 */
import { readFileSync } from "node:fs";
import { removerCaminhosTecnicos } from "../lib/urbi/sanitizarResposta";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);
const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · nunca expandir sigla — rede de segurança em código, com o texto REAL que vazou");
{
  const casos = [
    ["O LIP (Laudo de Informações Preliminares) está incompleto.", "O LIP está incompleto."],
    ["O LIP (Levantamento de Informações Preliminares) tem 4 campos vazios.", "O LIP tem 4 campos vazios."],
    ["O MAC (Módulo de Análise e Conformidade) mostra 0 pendências.", "O MAC mostra 0 pendências."],
  ];
  for (const [entrada, esperado] of casos) {
    const limpo = removerCaminhosTecnicos(entrada);
    t(`"${entrada}" → "${limpo}"`, limpo === esperado, `esperado "${esperado}"`);
  }
  t("sigla sem parênteses passa intacta (não mexe no que já está certo)", removerCaminhosTecnicos("O LIP está completo.") === "O LIP está completo.");
  t('prompt proíbe expandir sigla e cita o erro real ("Laudo de Informações Preliminares")', rota.includes("já errou (chamou \"LIP\" de \"Laudo de Informações Preliminares\""));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · confirmação implícita entre fontes — só prompt (semântico, não pattern-matchável)");
{
  t('prompt proíbe "conforme"/"confirmado por"/"bate com"/"confere com" entre valores de área', rota.includes('NUNCA use "conforme", "confirmado por", "bate com", "confere com"'));
  t("prompt nomeia os 5 conceitos reais do achado (Área a ser Regularizada/Quadro/Vistoria/ART/Laudo)", rota.includes("Área a ser Regularizada, valor do Quadro de Áreas, da\n  Vistoria, da ART ou do Laudo") || /Área a ser Regularizada,\s*valor do Quadro de Áreas,\s*da\s*Vistoria,\s*da ART ou do Laudo/.test(rota));
  t('prompt preserva o carve-out de "item conforme/não conforme" do MAC (vocabulário legítimo, não é a mesma coisa)', rota.includes('"item conforme"/"não conforme" no\n  checklist continua correto e obrigatório') || /"item conforme"\/"não conforme" no\s*checklist continua correto e obrigatório/.test(rota));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · causalidade inventada — só prompt (semântico)");
{
  t('prompt proíbe conector causal solto ("pois", "porque", "por isso")', rota.includes('"pois foi indeferido", "porque X", "por isso Y"'));
  t('prompt afirma que "não há itens não conformes" é fato válido isolado', rota.includes('"não há\n  itens não conformes registrados" é um fato') || /"não há\s*itens não conformes registrados" é um fato/.test(rota));
  t("prompt redireciona suspeita de causalidade pra 'Vale conferir' (nunca afirmação na prosa)", rota.includes("isso vai em \"Vale\n  conferir\" como pergunta pro analista confirmar") || /isso vai em "Vale\s*conferir" como pergunta pro analista confirmar/.test(rota));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · chave solta com underscore — rede de segurança em código, com o achado real");
{
  const casos: [string, string][] = [
    ["Há 25 itens_em_branco no checklist.", "Há 25 itens em branco no checklist."],
    ["Confira campos_vazios e campos_em_x antes de prosseguir.", "Confira campos vazios e campos em x antes de prosseguir."],
    ["A pendencias_ultima_analise está vazia.", "A pendencias ultima analise está vazia."],
  ];
  for (const [entrada, esperado] of casos) {
    const limpo = removerCaminhosTecnicos(entrada);
    t(`"${entrada}" → "${limpo}"`, limpo === esperado, `obtido "${limpo}"`);
  }
  // Prosa normal em português nunca tem "_" — nada deveria mudar.
  const proseNormal = "O processo tem 4 campos vazios e 55 itens em branco no checklist.";
  t("prosa normal (sem underscore nenhum) passa 100% intacta", removerCaminhosTecnicos(proseNormal) === proseNormal);
  // Palavra maiúscula com underscore (nunca ocorre em chave real do dossiê, mas confirma que a
  // regra é propositalmente restrita a minúsculo — evita procurar em texto que não é chave).
  t('token iniciado em maiúscula não é tocado (regra restrita a chave técnica minúscula)', removerCaminhosTecnicos("SEI_123 confirma o número.") === "SEI_123 confirma o número.");
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
