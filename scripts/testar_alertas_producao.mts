/**
 * scripts/testar_alertas_producao.mts — Fase 5 do mandato de 12 fases (05/09/2026): alertas de
 * produção consolidados. Valida com dado real que o consolidador nunca duplica, nunca inventa,
 * nunca mostra mais que o limite pedido, e reaproveita (nunca recalcula) linha de
 * evidência/Motor de Produção/previsão.
 *
 *   npx tsx --env-file=.env.local scripts/testar_alertas_producao.mts
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { montarAlertasProducao } from "../lib/urbi/alertasProducao";
import { obterRetratoAtual, processarProximoPendente, type VisibilidadeUsuario } from "../lib/urbi/radar";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };

async function retratoFresco(codigo: string) {
  await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", codigo).eq("estado", "pendente");
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: codigo, tipo_processo: null, versao: 1, estado: "pendente", motivo_disparo: "teste alertas", criado_em: new Date(Date.now() - 999_000_000).toISOString() });
  const r = await processarProximoPendente(ADMIN);
  if (!r.processado) throw new Error(`não processou ${codigo}: ${JSON.stringify(r)}`);
  return await obterRetratoAtual(codigo);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · nunca mais que 3 alertas (regra do Fábio: ajudar a agir, não relatório longo)");
for (const codigo of ["25.5.000046759-5", "25.5.000016900-4", "48533"]) {
  const retrato = await retratoFresco(codigo);
  const alertas = montarAlertasProducao(retrato as any);
  t(`[${codigo}] no máximo 3 alertas`, alertas.length <= 3, JSON.stringify(alertas));
  t(`[${codigo}] nenhum alerta duplicado`, new Set(alertas).size === alertas.length, JSON.stringify(alertas));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · limite customizável (limite:1)");
{
  const retrato = await retratoFresco("25.5.000046759-5");
  const alertas = montarAlertasProducao(retrato as any, { limite: 1 });
  t("respeita limite=1", alertas.length <= 1, JSON.stringify(alertas));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · retrato 'pendente'/'em_atualizacao' vira alerta de retrato desatualizado");
{
  const codigo = "25.5.000046759-5";
  await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", codigo).eq("versao", 9999);
  await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: codigo, tipo_processo: "regularizacao", versao: 9999, estado: "pendente", motivo_disparo: "teste desatualizado" });
  const { data: retratoPendente } = await supabaseAdmin.from("urbi_radar_retratos").select("*").eq("processo_codigo", codigo).eq("versao", 9999).maybeSingle();
  const alertas = montarAlertasProducao(retratoPendente as any);
  t("alerta de retrato aguardando atualização presente", alertas.some((a) => a.includes("aguardando atualização")), JSON.stringify(alertas));
  await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", codigo).eq("versao", 9999);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · retrato concluído há muito tempo vira alerta de desatualizado");
{
  const retratoAntigo = {
    estado: "atualizado", motivo_disparo: "x", concluido_em: new Date(Date.now() - 20 * 3_600_000).toISOString(),
    campos_consulta: null, campos_vazios: null, campos_totais: null, pendencias_mac: null, alertas: null,
    linha_evidencia: null, previsao_tempo: null,
  };
  const alertas = montarAlertasProducao(retratoAntigo as any);
  t("alerta de retrato desatualizado (20h > limite de 6h)", alertas.some((a) => a.includes("desatualizado")), JSON.stringify(alertas));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · nunca duplica a previsão bloqueada quando incluirPrevisaoBloqueada=false");
{
  const retratoSuspenso = {
    estado: "atualizado", motivo_disparo: "x", concluido_em: new Date().toISOString(),
    campos_consulta: null, campos_vazios: null, campos_totais: null, pendencias_mac: null, alertas: null,
    linha_evidencia: null, previsao_tempo: { status: "suspensa" },
  };
  const comPrevisao = montarAlertasProducao(retratoSuspenso as any, { incluirPrevisaoBloqueada: true });
  const semPrevisao = montarAlertasProducao(retratoSuspenso as any, { incluirPrevisaoBloqueada: false });
  t("com incluirPrevisaoBloqueada=true, o alerta aparece", comPrevisao.some((a) => a.includes("Previsão de tempo bloqueada")));
  t("com incluirPrevisaoBloqueada=false (uso do chat), o alerta NÃO aparece (evita repetir o que formatarPrevisao já mostra)", !semPrevisao.some((a) => a.includes("Previsão de tempo bloqueada")));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · chat/route.ts reaproveita montarAlertasProducao, nunca recalcula por conta própria");
{
  const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  t('rota importa montarAlertasProducao de "@/lib/urbi/alertasProducao"', rota.includes('from "@/lib/urbi/alertasProducao"'));
  t("rota chama com incluirPrevisaoBloqueada:false (previsão já mostrada por extenso ao lado)", /montarAlertasProducao\([^)]*incluirPrevisaoBloqueada:\s*false/.test(rota));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · zero chamada Gemini");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  await retratoFresco("48533");
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
