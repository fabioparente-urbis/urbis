/**
 * scripts/testar_radar_cobertura_integral.mts — Fase 3 do mandato de 12 fases (05/09/2026):
 * cobertura integral gradual do Radar. Cobre: mudança de catálogo invalida só os retratos do
 * mesmo tipo_processo (nunca a Pilha inteira), versão do contrato gravada, processo excluído
 * some da cobertura e tem seu retrato pendente órfão limpo.
 *
 *   npx tsx --env-file=.env.local scripts/testar_radar_cobertura_integral.mts
 */
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { processarProximoPendente, detectarMudancas, limparRetratosDeProcessosExcluidos, type VisibilidadeUsuario } from "../lib/urbi/radar";
import { executarJobRadar } from "../lib/urbi/radarJob";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };
const PROCESSO_REGULARIZACAO = "25.5.000046759-5"; // tipo_processo = regularizacao
const PROCESSO_SLOT5 = "48533"; // tipo_processo = slot_05

async function limparRetratos(codigos: string[]) {
  await supabaseAdmin.from("urbi_radar_retratos").delete().in("processo_codigo", codigos);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · mudança de catálogo invalida só os retratos do MESMO tipo_processo");
{
  await limparRetratos([PROCESSO_REGULARIZACAO, PROCESSO_SLOT5]);
  // Achado real: fabricar um "watermark_fontes" a mão (um timestamp só chutado) é sensível a
  // qualquer diferença de relógio ou atividade real concorrente nesses processos (banco de
  // produção, outros testes podem tocar os mesmos códigos). Mais robusto: deixar o PRÓPRIO
  // sistema calcular um retrato "de verdade em dia" primeiro (enfileira + processa cada um uma
  // vez), estabelecendo o baseline exatamente como produção faria — só DEPOIS insere a mudança
  // de catálogo e confere que só o tipo certo reage.
  await supabaseAdmin.from("urbi_radar_retratos").insert([
    { processo_codigo: PROCESSO_REGULARIZACAO, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "setup teste", criado_em: new Date(Date.now() - 999_000_000).toISOString() },
    { processo_codigo: PROCESSO_SLOT5, tipo_processo: "slot_05", versao: 1, estado: "pendente", motivo_disparo: "setup teste", criado_em: new Date(Date.now() - 999_000_000 + 10).toISOString() },
  ]);
  for (let i = 0; i < 2; i++) await processarProximoPendente(ADMIN);
  const { data: baseline } = await supabaseAdmin.from("urbi_radar_retratos").select("processo_codigo, estado").in("processo_codigo", [PROCESSO_REGULARIZACAO, PROCESSO_SLOT5]).order("versao", { ascending: false });
  const baselineOk = [PROCESSO_REGULARIZACAO, PROCESSO_SLOT5].every((c) => (baseline ?? []).find((b: any) => b.processo_codigo === c)?.estado !== "pendente");
  t("baseline: os 2 processos ficaram 'em dia' antes do teste de catálogo", baselineOk, JSON.stringify(baseline));

  // Insere uma mudança de catálogo REAL só pro tipo "regularizacao" — sem `criado_em` explícito
  // (usa o relógio do PRÓPRIO banco, o mesmo que grava `concluido_em`/`watermark_fontes` do
  // baseline acima, então não há mais comparação entre relógios diferentes).
  const idHistorico = randomUUID();
  await supabaseAdmin.from("mac_checklist_itens_historico").insert({
    id: idHistorico, item_id: randomUUID(), modelo_id: null, tipo_processo: "regularizacao",
    acao: "atualizado", campos_alterados: { teste: true },
  });

  const { enfileirados } = await detectarMudancas(ADMIN, 200);
  t("detectarMudancas rodou (enfileirados é um número válido)", Number.isFinite(enfileirados), String(enfileirados));

  const { data: linhaRegularizacao } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_REGULARIZACAO).order("versao", { ascending: false }).limit(1).maybeSingle();
  const { data: linhaSlot5 } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_SLOT5).order("versao", { ascending: false }).limit(1).maybeSingle();
  t(`${PROCESSO_REGULARIZACAO} (regularizacao) REENTROU na fila (mudança de catálogo do próprio tipo)`, linhaRegularizacao?.estado === "pendente", JSON.stringify(linhaRegularizacao));
  t(`${PROCESSO_SLOT5} (slot_05) NÃO reentrou (mudança de catálogo foi só de regularizacao)`, linhaSlot5?.estado !== "pendente", JSON.stringify(linhaSlot5));

  await supabaseAdmin.from("mac_checklist_itens_historico").delete().eq("id", idHistorico);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · versão do contrato é gravada no retrato");
{
  // Achado real: sem criado_em antigo, um backlog real pode fazer processarProximoPendente
  // pegar OUTRO processo em vez do inserido aqui — mesma classe de instabilidade já corrigida
  // noutros arquivos desta suíte. `criado_em` bem antigo garante prioridade absoluta.
  await limparRetratos([PROCESSO_REGULARIZACAO]);
  const criadoEmAntigo = new Date(Date.now() - 999_000_000).toISOString();
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: PROCESSO_REGULARIZACAO, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste versao_contrato", criado_em: criadoEmAntigo });
  const r = await processarProximoPendente(ADMIN);
  t("processou o processo certo", r.processado && r.codigo === PROCESSO_REGULARIZACAO, JSON.stringify(r));
  const { data: linha } = await supabaseAdmin.from("urbi_radar_retratos").select("versao_contrato").eq("processo_codigo", PROCESSO_REGULARIZACAO).eq("versao", 1).maybeSingle();
  t("versao_contrato = 1 gravada", (linha as any)?.versao_contrato === 1, JSON.stringify(linha));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · processo excluído some da cobertura e tem retrato pendente órfão limpo");
{
  const CODIGO_FANTASMA = "CODIGO-EXCLUIDO-TESTE-777";
  await limparRetratos([CODIGO_FANTASMA]);
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: CODIGO_FANTASMA, tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste órfão (processo nunca existiu, simula excluído)" });

  const removidos = await limparRetratosDeProcessosExcluidos();
  t("pelo menos 1 linha órfã removida (o código fantasma, que não existe em processos)", removidos >= 1, String(removidos));
  const { data: linhaFantasma } = await supabaseAdmin.from("urbi_radar_retratos").select("id").eq("processo_codigo", CODIGO_FANTASMA);
  t("a linha do processo fantasma foi mesmo removida", (linhaFantasma ?? []).length === 0);

  // Um processo REAL e ativo com linha pendente não pode ser tocado pela limpeza.
  await limparRetratos([PROCESSO_SLOT5]);
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: PROCESSO_SLOT5, tipo_processo: "slot_05", versao: 1, estado: "pendente", motivo_disparo: "teste — processo real, não deve ser limpo" });
  await limparRetratosDeProcessosExcluidos();
  const { data: linhaReal } = await supabaseAdmin.from("urbi_radar_retratos").select("estado").eq("processo_codigo", PROCESSO_SLOT5).order("versao", { ascending: false }).limit(1).maybeSingle();
  t("processo real e ativo NÃO foi removido pela limpeza", linhaReal?.estado === "pendente", JSON.stringify(linhaReal));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · o job de servidor chama a limpeza sozinho (integração, não recálculo)");
{
  const radarJobSrc = (await import("node:fs")).readFileSync(new URL("../lib/urbi/radarJob.ts", import.meta.url), "utf-8");
  t("executarJobRadar chama limparRetratosDeProcessosExcluidos", radarJobSrc.includes("limparRetratosDeProcessosExcluidos()"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("limpeza — remove tudo que este teste gerou");
await limparRetratos([PROCESSO_REGULARIZACAO, PROCESSO_SLOT5]);

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
