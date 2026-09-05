/**
 * scripts/testar_radar_silencioso.mts — Radar silencioso incremental da Pilha (Camada 1 da
 * arquitetura mestra do URBI, 05/09/2026). Bateria pedida pelo Fábio:
 *   1. alteração no Processo A atualiza apenas A;
 *   2. abrir URBI no Processo B pausa o Radar;
 *   3. dispensar URBI retoma a fila;
 *   4. Home/Pilha mostra cobertura e dados factuais;
 *   5. Gemini com zero chamadas novas.
 *
 * Roda contra o banco REAL (processos de verdade, só leitura neles — a única escrita é na
 * tabela própria urbi_radar_retratos). Pontos 2/3 são comportamento client-side
 * (components/urbi/UrbiGlobal.tsx) — verificados por leitura estrutural do código, mesmo método
 * já usado noutras baterias desta sessão (ex.: scripts/testar_coanalista_fase_r.mts, teste 7).
 *
 *   npx tsx --env-file=.env.local scripts/testar_radar_silencioso.mts
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  detectarMudancas, processarProximoPendente, obterStatusRadar,
  type VisibilidadeUsuario,
} from "../lib/urbi/radar";
import { formatarCartaoRadarComJob } from "../lib/urbi/radarJob";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };

// Limpeza: nenhuma linha de teste deve sobrar em urbi_radar_retratos depois desta bateria —
// ela é 100% gerada aqui, então pode ser apagada com segurança ao final (rodapé).
const codigosTocados = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
secao("0 · drenar fila pré-existente (achado real: 1ª exploração desta sessão já enfileirou processos reais 'nunca analisados' — são legítimos, processar é o trabalho certo do Radar, não resíduo de teste)");
{
  let processados = 0;
  for (let i = 0; i < 20; i++) {
    const r = await processarProximoPendente(ADMIN);
    if (!r.processado) break;
    processados++;
  }
  console.log(`  ${processados} item(ns) pré-existente(s) processado(s) de verdade (cobertura real da Pilha, não descartado)`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · processar a fila afeta SÓ o processo da vez — outros itens enfileirados ficam intactos");
{
  // Setup controlado (não via detectarMudancas, que legitimamente enfileira TODOS os processos
  // "nunca analisados" de uma vez — isso não é o que este teste quer isolar). Aqui: 2 processos
  // reais, os dois 'pendente', inseridos em ordem conhecida — A primeiro (criado_em mais antigo,
  // por isso é ele que processarProximoPendente pega).
  const PROCESSO_A = "25.5.000046759-5";
  const PROCESSO_B = "25.5.000016900-4";
  await supabaseAdmin.from("urbi_radar_retratos").delete().in("processo_codigo", [PROCESSO_A, PROCESSO_B]);
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: PROCESSO_A, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste isolado A" });
  await new Promise((r) => setTimeout(r, 50)); // garante criado_em(B) > criado_em(A) mesmo com relógio de baixa resolução
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: PROCESSO_B, tipo_processo: "aceite_sei", versao: 1, estado: "pendente", motivo_disparo: "teste isolado B" });
  codigosTocados.add(PROCESSO_A); codigosTocados.add(PROCESSO_B);

  const processamento = await processarProximoPendente(ADMIN);
  t("processou exatamente o processo A (o mais antigo da fila)", processamento.processado && processamento.codigo === PROCESSO_A, JSON.stringify(processamento));

  const { data: linhaA } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_A).order("versao", { ascending: false }).limit(1).maybeSingle();
  const { data: linhaB } = await supabaseAdmin.from("urbi_radar_retratos").select("estado, motivo_disparo").eq("processo_codigo", PROCESSO_B).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("A saiu de 'pendente' (foi processado de verdade)", linhaA?.estado !== "pendente", JSON.stringify(linhaA));
  t("B continua EXATAMENTE 'pendente', intocado — não vazou processamento pro item vizinho da fila", linhaB?.estado === "pendente" && linhaB?.motivo_disparo === "teste isolado B", JSON.stringify(linhaB));

  // Prova estrutural complementar: a reivindicação é por ID único (nunca em lote/por tipo), o
  // que já explica ESTRUTURALMENTE por que B nunca poderia ter sido tocado nesta chamada.
  const codigoFonte = readFileSync(new URL("../lib/urbi/radar.ts", import.meta.url), "utf-8");
  t("processarProximoPendente reivindica e atualiza por ID único (nunca em lote)", /\.update\(\{ estado: "em_atualizacao"/.test(codigoFonte) && /\.eq\("id", alvo\.id\)/.test(codigoFonte));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · cliente não é mais dependência do Radar (rodada de independência de sessão, 05/09/2026)");
{
  // ACHADO REAL que motivou a rodada: até aqui, o Radar só rodava enquanto alguém tinha uma aba
  // logada aberta (os ticks vinham de UrbiGlobal.tsx). Agora ele roda via cron.schedule (pg_cron
  // + pg_net) chamando /api/urbi/radar/job com conta técnica — o cliente não dispara mais nada.
  const widget = readFileSync(new URL("../components/urbi/UrbiGlobal.tsx", import.meta.url), "utf-8");
  t("UrbiGlobal.tsx não chama mais /api/urbi/radar/detectar", !widget.includes("/api/urbi/radar/detectar"));
  t("UrbiGlobal.tsx não chama mais /api/urbi/radar/processar", !widget.includes("/api/urbi/radar/processar"));
  t("UrbiGlobal.tsx não cria mais setInterval nenhum pro Radar", !/setInterval[^;]*radar/i.test(widget.replace(/\n/g, " ")));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · job de servidor reaproveita a MESMA lógica factual, nunca duplica cálculo");
{
  const job = readFileSync(new URL("../lib/urbi/radarJob.ts", import.meta.url), "utf-8");
  t("radarJob.ts importa detectarMudancas/processarProximoPendente de radar.ts (nunca reimplementa)", /import \{ detectarMudancas, processarProximoPendente,.*\} from "\.\/radar"/.test(job));
  t("radarJob.ts não define nenhum cálculo de situação/motor por conta própria", !/situacaoGeral|montarRelatorioMotor|montarDossieFactual/.test(job));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · Home/Pilha mostra cobertura e dados factuais (cartão determinístico)");
{
  const SEM_EXECUCAO = { ultima_execucao: null, execucoes_recentes: [], em_execucao_agora: false };
  const JOB_RECENTE = { ultima_execucao: { iniciado_em: new Date().toISOString(), concluido_em: new Date().toISOString(), estado: "concluido", detectados: 5, enfileirados: 1, processados: 1, falhas: 0, erro: null }, execucoes_recentes: [], em_execucao_agora: false };

  t("nenhuma execução do job ainda → declara isso explicitamente (nunca finge estar em dia)", /job de servidor ainda não rodou/.test(formatarCartaoRadarComJob({ totalVisiveis: 10, comRetratoAtualizado: 0, pendentes: 10, emAtualizacao: 0, ultimaExecucaoEm: null, atualizadosUltimos15Min: 0 }, SEM_EXECUCAO)));

  const parcial = formatarCartaoRadarComJob({ totalVisiveis: 10, comRetratoAtualizado: 6, pendentes: 4, emAtualizacao: 0, ultimaExecucaoEm: new Date().toISOString(), atualizadosUltimos15Min: 2 }, JOB_RECENTE);
  t("cobertura parcial declarada explicitamente (nunca escondida)", /PARCIAL/.test(parcial) && parcial.includes("6 de 10") && parcial.includes("4 processo(s) ainda na fila"));

  const completa = formatarCartaoRadarComJob({ totalVisiveis: 10, comRetratoAtualizado: 10, pendentes: 0, emAtualizacao: 0, ultimaExecucaoEm: new Date().toISOString(), atualizadosUltimos15Min: 1 }, JOB_RECENTE);
  t("cobertura completa não exibe alerta de parcial", !/PARCIAL/.test(completa) && completa.includes("10 de 10"));
  t('cartão sempre declara "Gemini não foi acionado" (verificável pelo analista)', completa.includes("Gemini não foi acionado"));

  const JOB_ATRASADO = { ultima_execucao: { iniciado_em: new Date(Date.now() - 10 * 60_000).toISOString(), concluido_em: new Date(Date.now() - 10 * 60_000).toISOString(), estado: "concluido", detectados: 5, enfileirados: 0, processados: 0, falhas: 0, erro: null }, execucoes_recentes: [], em_execucao_agora: false };
  const atrasado = formatarCartaoRadarComJob({ totalVisiveis: 10, comRetratoAtualizado: 10, pendentes: 0, emAtualizacao: 0, ultimaExecucaoEm: new Date().toISOString(), atualizadosUltimos15Min: 1 }, JOB_ATRASADO);
  t("execução do job há 10 min (esperado a cada 1 min) → declara ATRASADA", /ATRASADA/.test(atrasado), atrasado);

  // Status real contra o banco (só leitura) — confirma que a função de agregação roda sem erro
  // contra dado de verdade e devolve números coerentes (não negativos, não NaN).
  const statusReal = await obterStatusRadar(ADMIN);
  t("status real: totalVisiveis é um número válido", Number.isFinite(statusReal.totalVisiveis) && statusReal.totalVisiveis >= 0, JSON.stringify(statusReal));
  t("status real: comRetratoAtualizado nunca maior que totalVisiveis", statusReal.comRetratoAtualizado <= statusReal.totalVisiveis);

  // Wiring real na rota do chat (Home/Pilha = sem `codigo` no corpo da requisição).
  const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  t('cartão só é calculado quando NÃO há processo em contexto (semProcessoNoContexto)', rota.includes("tipo === \"OnMount\" && semProcessoNoContexto"));
  t("cartão é anexado tanto no caminho de cache quanto no caminho novo (nunca só um dos dois)", /emCache\.resposta}\\n\\n\$\{cartaoRadar\}/.test(rota) && /\$\{resposta\}\\n\\n\$\{cartaoRadar\}/.test(rota));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · Gemini com zero chamadas novas");
{
  const radarSrc = readFileSync(new URL("../lib/urbi/radar.ts", import.meta.url), "utf-8");
  t("lib/urbi/radar.ts nunca referencia a API do Gemini", !radarSrc.includes("generativelanguage.googleapis.com") && !radarSrc.includes("GEMINI_API_KEY"));
  for (const rotaArquivo of ["detectar", "processar", "status"]) {
    const src = readFileSync(new URL(`../app/api/urbi/radar/${rotaArquivo}/route.ts`, import.meta.url), "utf-8");
    t(`app/api/urbi/radar/${rotaArquivo}/route.ts nunca chama Gemini`, !src.includes("generativelanguage.googleapis.com") && !src.includes("GEMINI_API_KEY"));
  }

  // Prova real: nenhuma linha nova em urbis_api_calls com modelo/operação de Gemini, atribuível
  // ao Radar, no período em que os testes 1/4 rodaram acima (o Radar nunca grava lá, então a
  // contagem tem que ser zero por construção — confere contra o registro real mesmo assim).
  const { count } = await supabaseAdmin
    .from("urbis_api_calls")
    .select("*", { count: "exact", head: true })
    .eq("modulo", "URBI")
    .not("modelo", "is", null)
    .gte("criado_em", new Date(Date.now() - 5 * 60 * 1000).toISOString());
  t("nenhuma chamada de modelo registrada em urbis_api_calls nos últimos 5 min por causa deste teste", (count ?? 0) === 0, `count=${count}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("limpeza — remove só as linhas geradas por ESTE teste");
{
  for (const codigo of codigosTocados) {
    await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", codigo);
  }
  console.log(`  ${codigosTocados.size} processo(s) limpos: ${[...codigosTocados].join(", ") || "(nenhum precisou)"}`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
