/**
 * scripts/testar_fase_ad_sanitizacao.mts — Fase AD (04/09/2026): rede de segurança
 * determinística contra caminho técnico/UUID na resposta humana. Usa como fixture o texto REAL
 * que vazou no piloto (colado pelo Fábio, Etapa 1 retestada), não um exemplo sintético — se essa
 * bateria passar, o defeito relatado está mesmo coberto.
 *
 *   npx tsx scripts/testar_fase_ad_sanitizacao.mts
 */
import { readFileSync } from "node:fs";
import { removerCaminhosTecnicos } from "../lib/urbi/sanitizarResposta";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);
const PADRAO_CAMINHO = /\b(?:processo|situacoes|lip|mac|fluxo|cruzamentos|tecnico|cobertura)\.[a-zA-Z0-9_.]+\b/;
const PADRAO_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · texto REAL do piloto (Etapa 1, pergunta 1 — 'Fontes consultadas' inteira)");
{
  // Trecho literal colado pelo Fábio — a lista inteira de "Fontes consultadas" da resposta real.
  const trechoReal = `### Fontes consultadas:

- Assunto do processo (processo.assunto)
- Código do processo (processo.codigo)
- Porte do processo (processo.porte)
- Situação geral (situacoes.geral.classe, situacoes.geral.motivo)
- Situação do LIP (situacoes.lip.classe, situacoes.lip.motivo, lip.campos_vazios)
- Situação do MAC (situacoes.mac.classe, situacoes.mac.motivo)
- Área a ser Regularizada TOTAL (lip.campos_tecnicos.areaTotal)
- Área a ser Regularizada em Ed. Vertical (lip.campos_tecnicos.areaVertical)
- Área apontada pela Fiscalização (Vistoria) (lip.campos_tecnicos.areaVistoria)
- Área a ser Regularizada fora do frontal (lip.campos_tecnicos.areaForaFrontal)
- Número de Pavimentos (lip.campos_tecnicos.pav)
- Bairro (lip.campos_tecnicos.bairro)
- Quadra (lip.campos_tecnicos.quadra)
- Lote (lip.campos_tecnicos.lote)
- Número de Unidades (lip.campos_tecnicos.unid)
- Área do Terreno (lip.campos_tecnicos.areaTerreno)
- Estrutura e telhado concluído? (lip.campos_tecnicos.vistoriaEstruturaConcluida)
- Mais de 12m de altura? (lip.campos_tecnicos.vistoriaMais12m)
- Máximo 7 pavimentos? (lip.campos_tecnicos.vistoriaMax7Pav)
- Área conforme ART de Levantamento (lip.campos_tecnicos.areaArt)
- Área conforme Laudo Técnico (lip.campos_tecnicos.areaLaudo)
- Tem Embargo? (lip.campos_tecnicos.embargo)
- É área tombada? (lip.campos_tecnicos.tombado)
- Corredor Viário? (lip.campos_tecnicos.corredor)
- Área militar? (lip.campos_tecnicos.vistoriaAreaMilitar)
- Área aeroportuária? (lip.campos_tecnicos.vistoriaAreaAeroportuaria)
- Ocupa área pública? (lip.campos_tecnicos.vistoriaOcupaPublica)
- Qual o nº do outro processo? (lip.campos_tecnicos.qualOutro)
- Observações do LIP (lip.campos_tecnicos.observacoes)
- Status da última análise do MAC (mac.ultima_analise.status)
- Resumo da última análise do MAC (mac.resumo_ultima_analise.em_branco)`;

  const limpo = removerCaminhosTecnicos(trechoReal);
  t("nenhum caminho técnico sobrevive (raiz.propriedade)", !PADRAO_CAMINHO.test(limpo), limpo.match(PADRAO_CAMINHO)?.[0]);
  t("nenhum parêntese vazio sobra", !/\(\s*\)/.test(limpo), limpo);
  t("cada linha continua com o rótulo humano (ex.: 'Bairro' sobrevive)", limpo.includes("- Bairro") && !limpo.includes("(lip.campos_tecnicos.bairro)"));
  t("linha com 2 caminhos nos mesmos parênteses fica limpa (Situação geral)", limpo.includes("- Situação geral") && !/situacoes\.geral/.test(limpo));
  t("linha com 3 caminhos (Situação do LIP) fica limpa", limpo.includes("- Situação do LIP") && !/situacoes\.lip|lip\.campos_vazios/.test(limpo));
  console.log("\n  --- resultado sanitizado ---\n" + limpo.split("\n").slice(0, 6).join("\n") + "\n  ...");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · texto REAL do piloto (Etapa 1, pergunta 2 — coerência)");
{
  const trechoReal = `### Fontes consultadas:

- Observações do LIP (lip.campos_tecnicos.observacoes)
- Bairro (lip.campos_tecnicos.bairro)`;
  const limpo = removerCaminhosTecnicos(trechoReal);
  t("nenhum caminho técnico sobrevive", !PADRAO_CAMINHO.test(limpo));
  t("rótulos humanos sobrevivem intactos", limpo.includes("- Observações do LIP") && limpo.includes("- Bairro"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · texto sem NENHUM caminho técnico passa intacto (não mexe no que já está certo)");
{
  const textoLimpo = "Processo analisado: 25.5.000046759-5 — Regularização SEI\n\n### Fatos do dossiê:\n- A área do terreno é de 810,00 m².\n- O bairro é Setor Bueno.";
  t("texto idêntico depois de sanitizar", removerCaminhosTecnicos(textoLimpo) === textoLimpo);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · UUID solto também é removido, mesmo fora de parênteses de caminho");
{
  const comUuid = "O item relevante é o 1dcb19d3-825a-4fd7-a90c-f4c2d70bac03 do checklist.";
  const limpo = removerCaminhosTecnicos(comUuid);
  t("UUID removido", !PADRAO_UUID.test(limpo), limpo);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · sanitizador está de fato ligado na rota (não só existe, é chamado)");
{
  const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  t("route.ts importa removerCaminhosTecnicos", rota.includes('import { removerCaminhosTecnicos } from "@/lib/urbi/sanitizarResposta"'));
  // Fase AE (04/09/2026): a variável mudou de nome (respostaBase) porque "Fontes consultadas"
  // passou a ser anexada DEPOIS do sanitizador (ela é montada em código, nunca precisa de
  // sanitização) — o sanitizador continua rodando sobre tudo que o modelo escreveu antes dela.
  t("resposta final passa pelo sanitizador antes de voltar ao cliente", /const respostaBase = removerCaminhosTecnicos\(/.test(rota));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · widget prefere o bloco do backend, mostrado por padrão (não escondido atrás de clique)");
{
  const widget = readFileSync(new URL("../components/urbi/UrbiChat.tsx", import.meta.url), "utf-8");
  t("toda resposta que usou dossiê já abre o bloco de fontes automaticamente", widget.includes("if (usouDossieResposta) setFontesAbertasIndice(msgs.length + 1);"));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
