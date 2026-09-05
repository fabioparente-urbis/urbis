/**
 * scripts/testar_previsao_integracao.mts — Fase 4 (05/09/2026): integração da previsão de
 * tempo com o Radar e a Pilha. Complementa scripts/testar_previsao_tempo.mts (que testa só o
 * módulo lib/urbi/previsao.ts isolado).
 *
 *   npx tsx --env-file=.env.local scripts/testar_previsao_integracao.mts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { processarProximoPendente, obterUltimosRetratosVisiveis, type VisibilidadeUsuario } from "../lib/urbi/radar";
import { responderPerguntaPilha } from "../lib/urbi/perguntasPilha";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };
const PROCESSO = "25.5.000046759-5";

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · retrato grava previsao_tempo de verdade (não recalcula fora do Radar)");
{
  await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", PROCESSO).eq("estado", "pendente");
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: PROCESSO, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste previsão", criado_em: new Date(Date.now() - 999_000_000).toISOString() });
  const r = await processarProximoPendente(ADMIN);
  t("processou", r.processado && r.codigo === PROCESSO, JSON.stringify(r));
  const { data: linha } = await supabaseAdmin.from("urbi_radar_retratos").select("previsao_tempo, versao_contrato").eq("processo_codigo", PROCESSO).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("previsao_tempo gravada (não nula)", !!(linha as any)?.previsao_tempo, JSON.stringify(linha));
  // Não trava num número fixo: VERSAO_CONTRATO_RETRATO sobe legitimamente a cada fase que muda o
  // formato do retrato (ex.: Fase 6 subiu de 2 pra 3 ao acrescentar pendencias_sem_bip) — o que
  // importa é que o campo Fase 4 (previsao_tempo) continua sendo gravado corretamente.
  t("versao_contrato gravada como inteiro positivo (>= 2, já que previsao_tempo existe desde a Fase 4)", Number.isInteger((linha as any)?.versao_contrato) && (linha as any).versao_contrato >= 2, JSON.stringify(linha));
  t("status é um dos 3 válidos", ["estimativa", "suspensa", "base_insuficiente"].includes((linha as any)?.previsao_tempo?.status), JSON.stringify(linha));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · Pilha responde 'menor previsão' e 'dependem de documento' sem Gemini");
{
  for (const pergunta of ["qual está com menor previsão de tempo?", "quais processos dependem de documento?"]) {
    const resposta = await responderPerguntaPilha(pergunta, ADMIN);
    t(`resposta não nula para "${pergunta}"`, typeof resposta === "string" && resposta.length > 0, String(resposta));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · retratos consultáveis expõem previsao_tempo");
{
  const retratos = await obterUltimosRetratosVisiveis(ADMIN);
  const doTeste = retratos.find((r) => r.processo_codigo === PROCESSO);
  t("previsao_tempo presente no retrato consultável", doTeste?.previsao_tempo !== undefined, JSON.stringify(doTeste?.previsao_tempo));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · zero chamada Gemini");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  await responderPerguntaPilha("qual está com menor previsão de tempo?", ADMIN);
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
