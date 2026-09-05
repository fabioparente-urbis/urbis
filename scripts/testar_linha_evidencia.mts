/**
 * scripts/testar_linha_evidencia.mts — ETAPA 5 do URBI (cadeia de evidência MDP→exigência→
 * retorno→resultado, 05/09/2026). Valida com processos REAIS dos 3 Slots, nunca fixture.
 *
 *   npx tsx --env-file=.env.local scripts/testar_linha_evidencia.mts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { montarDossieFactual } from "../lib/urbi/montarDossie";
import { montarRelatorioMotor } from "../lib/urbi/motorProducao";
import { montarLinhaEvidenciaExigencias, alertasLinhaEvidencia, formatarLinhaEvidenciaDetalhada } from "../lib/urbi/linhaEvidencia";
import { processarProximoPendente, obterUltimosRetratosVisiveis, type VisibilidadeUsuario } from "../lib/urbi/radar";
import { responderPerguntaPilha } from "../lib/urbi/perguntasPilha";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };
const USUARIO_ADMIN_REQ = { id: ADMIN.userId, perfis: ADMIN.perfis, gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
// Só conta como vazamento se aparecer como CHAVE de JSON ("...":) — a mesma palavra dentro de
// uma frase de `limitacoes` (explicando por que não há vínculo estrutural) é vocabulário
// humano, não um valor técnico exposto.
const CHAVE_TECNICA_RE = /"[a-z][a-zA-Z]*_id"\s*:/;

async function montarBloco(codigo: string) {
  const resultado = await montarDossieFactual(codigo, USUARIO_ADMIN_REQ);
  if (!resultado.ok) throw new Error(`dossiê falhou para ${codigo}: ${resultado.erro}`);
  const d = resultado.data as any;
  const relatorio = montarRelatorioMotor(d);
  const { data: proc } = await supabaseAdmin.from("processos").select("tags").eq("codigo", codigo).maybeSingle();
  const tagsProcesso = Array.isArray((proc as any)?.tags) ? (proc as any).tags : [];
  const bloco = await montarLinhaEvidenciaExigencias(codigo, d, tagsProcesso);
  return { d, relatorio, bloco };
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · cobrança emitida sem retorno identificado (Regularização E Aceite SEI, só 1 análise cada)");
for (const codigo of ["25.5.000046759-5", "25.5.000016900-4"]) {
  const { bloco } = await montarBloco(codigo);
  t(`[${codigo}] tem ao menos 1 registro`, bloco.registros.length > 0, JSON.stringify(bloco));
  const r = bloco.registros[0];
  t(`[${codigo}] resultado = permanece_pendente ou sem_marcacao_posterior (Slot5-only)`, r.resultado === "permanece_pendente" || r.resultado === "sem_marcacao_posterior");
  t(`[${codigo}] retorno_identificado é null quando permanece_pendente`, r.resultado !== "permanece_pendente" || r.retorno_identificado === null);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · retorno posterior com item MAC comprovadamente atendido (24.28.000005986-4)");
{
  const codigo = "24.28.000005986-4";
  const { bloco } = await montarBloco(codigo);
  const comAtendido = bloco.registros.filter((r) => r.resultado === "confirmado_atendido");
  t(`[${codigo}] tem ao menos 1 registro confirmado_atendido`, comAtendido.length > 0, JSON.stringify(bloco.registros));
  if (comAtendido.length > 0) {
    const r = comAtendido[0];
    t(`[${codigo}] grau_factual = confirmado`, r.grau_factual === "confirmado");
    t(`[${codigo}] metodo_relacao = vinculo_estruturado`, r.metodo_relacao === "vinculo_estruturado");
    t(`[${codigo}] itens_relacionados não vazio, com rótulo e grupo`, r.itens_relacionados.length > 0 && r.itens_relacionados.every((i) => typeof i.rotulo === "string" && i.rotulo.length > 0));
    t(`[${codigo}] evento_mac_posterior presente`, r.evento_mac_posterior !== null);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · item reincidente entre passadas (25.5.000054511-1)");
{
  const codigo = "25.5.000054511-1";
  const { bloco } = await montarBloco(codigo);
  const reincidiu = bloco.registros.filter((r) => r.resultado === "reincidiu");
  t(`[${codigo}] tem ao menos 1 registro reincidiu`, reincidiu.length > 0, JSON.stringify(bloco.registros));
  if (reincidiu.length > 0) {
    t(`[${codigo}] grau_factual = confirmado (reincidência também é estrutural)`, reincidiu[0].grau_factual === "confirmado");
    t(`[${codigo}] alerta "voltou a não conforme" presente`, alertasLinhaEvidencia(bloco).some((a) => a.includes("voltou a não conforme")));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · retorno sem prova de qual exigência foi atendida (25.5.000084973-0)");
{
  const codigo = "25.5.000084973-0";
  const { bloco } = await montarBloco(codigo);
  const semMarcacao = bloco.registros.filter((r) => r.resultado === "sem_marcacao_posterior");
  t(`[${codigo}] tem ao menos 1 registro sem_marcacao_posterior`, semMarcacao.length > 0, JSON.stringify(bloco.registros));
  if (semMarcacao.length > 0) {
    t(`[${codigo}] grau_factual = parcial`, semMarcacao[0].grau_factual === "parcial");
    t(`[${codigo}] retorno_identificado presente (retornou, só não dá pra atribuir resultado)`, semMarcacao[0].retorno_identificado !== null);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · processo sem MDP (25.5.000091936-4, sem despacho/parecer emitido)");
{
  const codigo = "25.5.000091936-4";
  const { bloco } = await montarBloco(codigo);
  t(`[${codigo}] bloco.registros vazio (nenhum despacho/parecer emitido)`, bloco.registros.length === 0, JSON.stringify(bloco.registros));
  const texto = formatarLinhaEvidenciaDetalhada(bloco);
  t(`[${codigo}] formatarLinhaEvidenciaDetalhada não quebra com bloco vazio`, typeof texto === "string" && texto.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · Home/Pilha responde as 4 perguntas novas sem Gemini (processa 1 retrato real primeiro)");
{
  // Garante que pelo menos 1 processo real tem retrato com linha_evidencia gravada de verdade
  // (não só em memória) — usa o mesmo caminho de produção (processarProximoPendente).
  // Achado real (05/09/2026): a fila pode ter backlog legítimo de processos "nunca analisados"
  // à frente (outras rodadas de teste/uso real também enfileiram) — criado_em propositalmente
  // antigo garante que este item SEMPRE é o próximo, sem depender do tamanho desse backlog.
  await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", "25.5.000054511-1").eq("estado", "pendente");
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: "25.5.000054511-1", tipo_processo: "regularizacao", versao: 9990, estado: "pendente", motivo_disparo: "teste_linha_evidencia", criado_em: new Date(Date.now() - 999_000_000).toISOString() });
  const resultadoProcessamento = await processarProximoPendente(ADMIN);
  t("processarProximoPendente processou o item de teste", resultadoProcessamento.processado === true && resultadoProcessamento.codigo === "25.5.000054511-1", JSON.stringify(resultadoProcessamento));

  const retratos = await obterUltimosRetratosVisiveis(ADMIN);
  const retratoTeste = retratos.find((r) => r.processo_codigo === "25.5.000054511-1");
  t("retrato gravado tem linha_evidencia não nula", !!retratoTeste?.linha_evidencia && retratoTeste.linha_evidencia.registros.length > 0);

  for (const pergunta of ["quais retornaram sem resultado?", "quais reincidiram?", "quais aguardam conferência após retorno?", "quais têm pendência repetida?"]) {
    const resposta = await responderPerguntaPilha(pergunta, ADMIN);
    t(`resposta não nula para "${pergunta}"`, typeof resposta === "string" && resposta.length > 0, String(resposta));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · zero chamadas novas em urbis_api_calls (nenhuma etapa chama Gemini)");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  await montarBloco("24.28.000005986-4");
  await montarBloco("25.5.000054511-1");
  await responderPerguntaPilha("quais reincidiram?", ADMIN);
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("8 · atualização incremental de apenas um retrato (processarProximoPendente não toca outro processo)");
{
  const codigoAlheio = "24.5.000050840-6";
  const { data: antes } = await supabaseAdmin.from("urbi_radar_retratos").select("versao").eq("processo_codigo", codigoAlheio).order("versao", { ascending: false }).limit(1);
  await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", "25.5.000016900-4").eq("estado", "pendente");
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: "25.5.000016900-4", tipo_processo: "aceite_sei", versao: 9991, estado: "pendente", motivo_disparo: "teste_linha_evidencia", criado_em: new Date(Date.now() - 999_000_000).toISOString() });
  await processarProximoPendente(ADMIN);
  const { data: depois } = await supabaseAdmin.from("urbi_radar_retratos").select("versao").eq("processo_codigo", codigoAlheio).order("versao", { ascending: false }).limit(1);
  t("processo alheio não ganhou versão nova", (antes?.[0]?.versao ?? null) === (depois?.[0]?.versao ?? null));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("9 · nenhum cruzamento de processo, slot ou contexto dentro do bloco");
{
  for (const codigo of ["24.28.000005986-4", "25.5.000054511-1", "25.5.000084973-0"]) {
    const { bloco } = await montarBloco(codigo);
    t(`[${codigo}] todo registro pertence ao próprio processo`, bloco.registros.every((r) => r.processo_codigo === codigo));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("10 · zero UUID, chave técnica ou dado pessoal na saída");
{
  for (const codigo of ["24.28.000005986-4", "25.5.000054511-1", "25.5.000084973-0", "48533", "50724"]) {
    const { bloco } = await montarBloco(codigo);
    const json = JSON.stringify(bloco);
    t(`[${codigo}] sem UUID no bloco`, !UUID_RE.test(json), json.match(UUID_RE)?.[0]);
    t(`[${codigo}] sem chave técnica (*_id) no bloco`, !CHAVE_TECNICA_RE.test(json), json.match(CHAVE_TECNICA_RE)?.[0]);
    const detalhe = formatarLinhaEvidenciaDetalhada(bloco);
    t(`[${codigo}] sem UUID no texto formatado`, !UUID_RE.test(detalhe));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("limpeza — remove linhas de teste (versao 999x) pra não poluir produção");
await supabaseAdmin.from("urbi_radar_retratos").delete().in("versao", [9990, 9991]).in("processo_codigo", ["25.5.000054511-1", "25.5.000016900-4"]);

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
