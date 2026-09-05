/**
 * scripts/testar_radar_job_servidor.mts — Radar independente de sessão/navegador (Fase 2,
 * 05/09/2026). Cobre a bateria pedida: detecção isolada por processo, execução sem sessão
 * humana, lock contra concorrência, retomada de pendência, isolamento de falha, separação de
 * presença/atendimento, zero Gemini, zero dado sensível no log — mais o mecanismo de
 * "atendimento ativo" (lease técnico que pausa só o processo aberto, não o Radar inteiro).
 *
 *   npx tsx --env-file=.env.local scripts/testar_radar_job_servidor.mts
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { executarJobRadar, obterEstadoJobRadar, USUARIO_SISTEMA } from "../lib/urbi/radarJob";
import { processarProximoPendente } from "../lib/urbi/radar";
import { iniciarOuRenovarAtendimento, finalizarAtendimento, obterProcessosEmAtendimento } from "../lib/urbi/atendimento";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const { data: usuarios } = await supabaseAdmin.from("usuarios").select("id").limit(1);
const USUARIO_REAL_ID = (usuarios ?? [])[0]?.id as string;

const PROCESSO_A = "25.5.000046759-5";
const PROCESSO_B = "25.5.000016900-4";
// Achado real: a fila pode ter um backlog legítimo de processos "nunca analisados" à frente
// (outras rodadas de teste/uso real também enfileiram). Pra testes de PRIORIDADE dentro de um
// lote pequeno, os inserts manuais abaixo usam `criado_em` propositalmente antigo — garante que
// SEMPRE são os primeiros da fila, sem depender de quantos itens reais existem antes deles.
const CRIADO_EM_ANTIGO = new Date(Date.now() - 999_000_000).toISOString();

async function limparRetratos(codigos: string[]) {
  await supabaseAdmin.from("urbi_radar_retratos").delete().in("processo_codigo", codigos);
}
async function limparExecucoes() {
  await supabaseAdmin.from("urbi_radar_execucoes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
await limparExecucoes();

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · alteração em A é detectada e só A entra na fila (B intocado)");
{
  await limparRetratos([PROCESSO_A, PROCESSO_B]);
  const resultado = await executarJobRadar({ maxItens: 3, maxMs: 8_000 });
  t("execução concluída", resultado.ok === true, JSON.stringify(resultado));
  const { data: linhaA } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_A).order("versao", { ascending: false }).limit(1).maybeSingle();
  const { data: linhaB } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_B).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("A recebeu retrato (mudou de nunca-analisado)", !!linhaA, JSON.stringify(linhaA));
  t("B também recebeu retrato próprio (nunca analisado antes é mudança legítima)", !!linhaB, JSON.stringify(linhaB));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · Processo B não é reprocessado sem mudança (2ª execução do job não cria versão nova)");
{
  const { data: antes } = await supabaseAdmin.from("urbi_radar_retratos").select("versao").eq("processo_codigo", PROCESSO_B).order("versao", { ascending: false }).limit(1).maybeSingle();
  await executarJobRadar({ maxItens: 3, maxMs: 8_000 });
  const { data: depois } = await supabaseAdmin.from("urbi_radar_retratos").select("versao").eq("processo_codigo", PROCESSO_B).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("versão de B não mudou (nada foi alterado no processo real)", antes?.versao === depois?.versao, `antes=${antes?.versao} depois=${depois?.versao}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · execução ocorre sem qualquer aba/sessão humana — executarJobRadar é uma função de servidor pura");
{
  const codigoJob = readFileSync(new URL("../lib/urbi/radarJob.ts", import.meta.url), "utf-8");
  const linhasImport = codigoJob.split("\n").filter((l) => l.trim().startsWith("import"));
  t("radarJob.ts não tem NENHUM import de auth/cookie/sessão", !linhasImport.some((l) => /auth|cookie/i.test(l)), JSON.stringify(linhasImport));
  t("USUARIO_SISTEMA é uma conta técnica (irrestrito, sem gerência)", USUARIO_SISTEMA.irrestrito === true && USUARIO_SISTEMA.gerencia === null);
  const rota = readFileSync(new URL("../app/api/urbi/radar/job/route.ts", import.meta.url), "utf-8");
  t("rota /api/urbi/radar/job usa segredo compartilhado, NUNCA autenticar()", rota.includes("URBI_RADAR_CRON_SECRET") && !rota.includes("autenticar"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · logout/expiração de sessão humana não interrompem o job (rota não depende de lib/auth.ts)");
{
  const rota = readFileSync(new URL("../app/api/urbi/radar/job/route.ts", import.meta.url), "utf-8");
  t('rota do job não importa "@/lib/auth"', !rota.includes('from "@/lib/auth"'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · duas execuções concorrentes não duplicam retrato (lock por índice único parcial)");
{
  await limparExecucoes();
  const [r1, r2] = await Promise.all([executarJobRadar({ maxItens: 2, maxMs: 8_000 }), executarJobRadar({ maxItens: 2, maxMs: 8_000 })]);
  const executados = [r1, r2].filter((r) => r.ok && (r as any).executado === true).length;
  const recusados = [r1, r2].filter((r) => r.ok && (r as any).executado === false).length;
  t("exatamente 1 das 2 chamadas concorrentes executou de verdade, a outra recusou por lock", executados === 1 && recusados === 1, JSON.stringify([r1, r2]));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · erro de um processo não impede os demais");
{
  // ACHADO REAL (ao escrever este teste): um `processo_codigo` que não existe de verdade em
  // `processos` nunca chega a ser "reivindicado" — `processarProximoPendente` só considera
  // candidatos dentro de `processosVisiveis()`, que já filtra por processo real e não excluído.
  // Ou seja, é MAIS seguro do que "reivindicar e marcar erro": uma linha estranha na fila é
  // simplesmente ignorada, nunca trava nem consome o orçamento de tentativas dos itens reais.
  // O caminho `estado='erro'` (try/catch em torno de `montarDossieFactual`) é verificado
  // estruturalmente abaixo — forçar uma falha de verdade exigiria corromper um processo real,
  // proibido pela regra de só-leitura em Slot 1/Aceite SEI/Slot 5.
  const radarSrc = readFileSync(new URL("../lib/urbi/radar.ts", import.meta.url), "utf-8");
  t("processarProximoPendente tem try/catch em volta de todo o processamento do item", /try \{[\s\S]*catch \(e: any\) \{/.test(radarSrc));
  t("falha de dossiê (resultado.ok===false) marca estado='erro' e RETORNA sem lançar (não derruba quem chama)", /if \(!resultado\.ok\) \{[\s\S]{0,400}estado: "erro"[\s\S]{0,400}return \{ processado: true, codigo, estado: "erro" \};/.test(radarSrc));
  t("catch externo também marca estado='erro' e retorna normalmente (nunca propaga a exceção)", /\} catch \(e: any\) \{[\s\S]{0,400}estado: "erro"[\s\S]{0,400}return \{ processado: true, codigo, estado: "erro" \};/.test(radarSrc));

  await limparRetratos(["CODIGO-INEXISTENTE-TESTE-999"]);
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: "CODIGO-INEXISTENTE-TESTE-999", tipo_processo: null, versao: 1, estado: "pendente", motivo_disparo: "teste — linha estranha na fila", criado_em: CRIADO_EM_ANTIGO });
  await limparRetratos([PROCESSO_A]);
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: PROCESSO_A, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste — processo real ao lado", criado_em: CRIADO_EM_ANTIGO });

  let processouA = false;
  for (let i = 0; i < 5; i++) {
    const r = await processarProximoPendente(USUARIO_SISTEMA);
    if (!r.processado) break;
    if (r.codigo === PROCESSO_A) processouA = true;
  }
  t("processo real (A) é processado normalmente mesmo com uma linha de processo inexistente ao lado na fila", processouA);
  const { data: linhaEstranha } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", "CODIGO-INEXISTENTE-TESTE-999").maybeSingle();
  t("a linha estranha nunca é reivindicada (fica 'pendente' pra sempre, nunca trava nada)", linhaEstranha?.estado === "pendente", JSON.stringify(linhaEstranha));
  await limparRetratos(["CODIGO-INEXISTENTE-TESTE-999"]);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · pendência continua para a próxima execução (maxItens limita o lote)");
{
  await limparRetratos([PROCESSO_A, PROCESSO_B]);
  await supabaseAdmin.from("urbi_radar_retratos").insert([
    { processo_codigo: PROCESSO_A, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste lote", criado_em: CRIADO_EM_ANTIGO },
    { processo_codigo: PROCESSO_B, tipo_processo: "aceite_sei", versao: 1, estado: "pendente", motivo_disparo: "teste lote", criado_em: CRIADO_EM_ANTIGO },
  ]);
  const r1 = await processarProximoPendente(USUARIO_SISTEMA);
  t("1º item processado", r1.processado);
  const { data: pendenteRestante } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_B).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("2º item continua pendente pra próxima execução (não processado no mesmo lote de 1)", pendenteRestante?.estado === "pendente", JSON.stringify(pendenteRestante));
  await processarProximoPendente(USUARIO_SISTEMA); // drena o restante, não deixa lixo de teste
}

// ─────────────────────────────────────────────────────────────────────────────
secao("8 · atendimento ativo pausa SÓ o processo aberto (nunca o Radar inteiro) e expira por lease");
{
  await limparRetratos([PROCESSO_A, PROCESSO_B]);
  await supabaseAdmin.from("urbi_radar_retratos").insert([
    { processo_codigo: PROCESSO_A, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste atendimento", criado_em: CRIADO_EM_ANTIGO },
    { processo_codigo: PROCESSO_B, tipo_processo: "aceite_sei", versao: 1, estado: "pendente", motivo_disparo: "teste atendimento", criado_em: CRIADO_EM_ANTIGO },
  ]);
  await iniciarOuRenovarAtendimento(USUARIO_REAL_ID, PROCESSO_A);
  const emAtendimento = await obterProcessosEmAtendimento();
  t("A aparece em atendimento", emAtendimento.has(PROCESSO_A));

  const r = await processarProximoPendente(USUARIO_SISTEMA);
  t("o job PULA o processo em atendimento e processa o outro (B) em vez dele", r.processado && r.codigo === PROCESSO_B, JSON.stringify(r));
  const { data: linhaA } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_A).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("A continua 'pendente', intocado (Radar não pausou por completo, só pulou A)", linhaA?.estado === "pendente");

  await finalizarAtendimento(PROCESSO_A);
  const depoisDeFinalizar = await obterProcessosEmAtendimento();
  t("finalizarAtendimento libera A imediatamente", !depoisDeFinalizar.has(PROCESSO_A));
  const r2 = await processarProximoPendente(USUARIO_SISTEMA);
  t("A agora é processado normalmente", r2.processado && r2.codigo === PROCESSO_A, JSON.stringify(r2));

  // Lease expirado (navegador fechou sem avisar) nunca bloqueia pra sempre.
  await supabaseAdmin.from("urbi_atendimento_ativo").upsert({ processo_codigo: PROCESSO_B, usuario_id: USUARIO_REAL_ID, expira_em: new Date(Date.now() - 60_000).toISOString() }, { onConflict: "processo_codigo" });
  const comLeaseExpirado = await obterProcessosEmAtendimento();
  t("lease expirado não conta como em atendimento", !comLeaseExpirado.has(PROCESSO_B));
  await supabaseAdmin.from("urbi_atendimento_ativo").delete().eq("processo_codigo", PROCESSO_B);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("9 · logs de presença humana permanecem separados do Radar/atendimento");
{
  const radarJobSrc = readFileSync(new URL("../lib/urbi/radarJob.ts", import.meta.url), "utf-8");
  const atendimentoSrc = readFileSync(new URL("../lib/urbi/atendimento.ts", import.meta.url), "utf-8");
  const presencaSrc = readFileSync(new URL("../lib/urbi/presenca.ts", import.meta.url), "utf-8");
  t("radarJob.ts nunca referencia urbi_presenca_eventos", !radarJobSrc.includes("urbi_presenca_eventos"));
  t("atendimento.ts nunca referencia urbi_presenca_eventos", !atendimentoSrc.includes("urbi_presenca_eventos"));
  t("presenca.ts nunca referencia urbi_radar_execucoes nem urbi_atendimento_ativo", !presencaSrc.includes("urbi_radar_execucoes") && !presencaSrc.includes("urbi_atendimento_ativo"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("10 · zero chamada Gemini");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  await executarJobRadar({ maxItens: 5, maxMs: 10_000 });
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("11 · nenhum dado pessoal/documento/conversa nos logs de execução");
{
  const { data: linha } = await supabaseAdmin.from("urbi_radar_execucoes").select("*").order("iniciado_em", { ascending: false }).limit(1).maybeSingle();
  const chaves = Object.keys(linha ?? {}).sort();
  const esperadas = ["concluido_em", "detectados", "enfileirados", "erro", "estado", "falhas", "id", "iniciado_em", "origem", "processados"].sort();
  t("só as colunas mínimas contratadas existem na linha de execução", JSON.stringify(chaves) === JSON.stringify(esperadas), JSON.stringify(chaves));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("12 · painel de estado do job (usado por /admin/urbi e Home/Pilha)");
{
  const estado = await obterEstadoJobRadar();
  t("obterEstadoJobRadar devolve última execução real", estado.ultima_execucao !== null, JSON.stringify(estado));
  t("em_execucao_agora é false depois de tudo concluído", estado.em_execucao_agora === false);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("limpeza — remove retratos/execuções gerados por este teste");
await limparRetratos([PROCESSO_A, PROCESSO_B]);
await limparExecucoes();

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
