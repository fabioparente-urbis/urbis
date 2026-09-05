/**
 * scripts/testar_fase_af_qualidade_resumo.mts — Fase AF (04/09/2026): 3º reteste da Etapa 1
 * (resumo do processo 25.5.000046759-5) pediu 3 ajustes finais de qualidade:
 *   1. Nenhuma comparação livre TAMBÉM no resumo (não só na verificação de coerência).
 *   2. situacoes.geral/lip/mac nunca misturadas — LIP incompleto nunca vira "arquivado".
 *   3. Limpeza de linguagem: sem "grau_certeza:" impresso, sem artefato de coleção vazia,
 *      sem campo sem valor útil virando "fato".
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase_af_qualidade_resumo.mts
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
secao("1 · nenhuma comparação livre — regra vale pro resumo, não só pra coerência");
{
  t("regra absoluta agora diz explicitamente 'EM NENHUMA PERGUNTA (resumo, coerência...)'", rota.includes("EM NENHUMA PERGUNTA (resumo,"));
  t("regra repete que vale IGUALMENTE pra um resumo simples", rota.includes("Isto vale IGUALMENTE pra um resumo simples do processo"));
  t('frase pedida pelo Fábio ("não há regra para comparar") está literal no prompt', rota.includes('"não há regra para comparar estas áreas"'));
  t("exemplo de como apresentar como fatos SEPARADOS (duas frases) está no prompt", rota.includes("duas frases,\nnunca uma comparando as duas") || rota.includes("duas frases, nunca uma comparando as duas"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · situações não podem ser misturadas");
{
  const situacao = readFileSync(new URL("../lib/bdi/situacao.ts", import.meta.url), "utf-8");
  t("checagem de realidade: situacaoLip() nunca declara 'Arquivado/indeferido' no código-fonte", !/situacaoLip[\s\S]{0,600}Arquivado\/indeferido/.test(situacao));
  t('prompt tem a regra "situacoes tem 3 classificações SEPARADAS"', rota.includes('"situacoes" tem 3 classificações SEPARADAS'));
  t('prompt diz explicitamente que "Arquivado/indeferido" NUNCA é classe do LIP', rota.includes('"Arquivado/indeferido" NUNCA é uma classe do LIP'));
  t("prompt lista o vocabulário real de cada uma (geral/lip/mac) sem inventar rótulo", rota.includes('"Não iniciado", "Incompleto" ou "Completo"'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · limpeza de linguagem — prompt");
{
  t('prompt proíbe imprimir "grau_certeza:" literal', rota.includes('NUNCA escreva literalmente "grau_certeza:"'));
  t("prompt proíbe artefato de coleção vazia (parênteses/colchete vazio)", rota.includes("NUNCA imprima um campo/lista/seção vazia"));
  t('prompt proíbe listar campo "NP"/vazio como fato conclusivo', rota.includes('Um campo com valor "NP", vazio, "-" ou qualquer marcador de ausência NÃO é um fato conclusivo'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · limpeza de linguagem — rede de segurança em código (não só prompt)");
{
  const casos: [string, string][] = [
    ["Área do Terreno: 810 m² (grau_certeza: confirmado).", "Área do Terreno: 810 m²."],
    ["O item está pendente (grau de certeza: vale_conferir), reveja.", "O item está pendente, reveja."],
    ["Isso é grau_certeza: base_insuficiente para concluir.", "Isso é para concluir."],
  ];
  for (const [entrada, esperadoAproximado] of casos) {
    const limpo = removerCaminhosTecnicos(entrada);
    t(`remove tag de certeza de "${entrada}"`, !/grau[ _-]?(?:de[ _-]?)?certeza/i.test(limpo), limpo);
  }
  // Palavra comum do vocabulário ("confirmado") sem o prefixo "grau_certeza" NUNCA deve ser
  // cortada — evita destruir prosa legítima (achado de projeto: essas 5 palavras são
  // português comum, cortar sem o prefixo seria falso positivo grave).
  const proseNormal = "O embargo foi confirmado pela vistoria e a estrutura está concluída.";
  t("palavra comum do vocabulário (sem prefixo grau_certeza) NUNCA é removida da prosa normal", removerCaminhosTecnicos(proseNormal) === proseNormal);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
