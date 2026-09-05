/**
 * scripts/testar_previsao_tempo.mts — Fase 4 do mandato de 12 fases (05/09/2026): previsão
 * determinística de tempo/esforço. Valida com dado real dos 3 slots — a amostra real é pequena
 * hoje (só 11 processos com ciclo completo medido), então a maioria das previsões DEVE voltar
 * honestamente "base insuficiente" — isso é o comportamento CORRETO, não falha de teste.
 *
 *   npx tsx --env-file=.env.local scripts/testar_previsao_tempo.mts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { montarDossieFactual } from "../lib/urbi/montarDossie";
import { montarRelatorioMotor } from "../lib/urbi/motorProducao";
import { preverCicloCompleto, previsaoGranularidadeIndisponivel, formatarPrevisao } from "../lib/urbi/previsao";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const USUARIO_ADMIN_REQ = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;

async function preverPara(codigo: string) {
  const resultado = await montarDossieFactual(codigo, USUARIO_ADMIN_REQ);
  if (!resultado.ok) throw new Error(`dossiê falhou para ${codigo}: ${resultado.erro}`);
  const d = resultado.data as any;
  const relatorio = montarRelatorioMotor(d);
  return { d, relatorio, previsao: await preverCicloCompleto(d, relatorio) };
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · Slot 5 (0 casos concluídos no histórico) → base insuficiente, sempre");
{
  const { previsao } = await preverPara("48533");
  t("status = base_insuficiente", previsao.status === "base_insuficiente", JSON.stringify(previsao));
  t("texto formatado nunca finge certeza", formatarPrevisao(previsao).startsWith("Base insuficiente"), formatarPrevisao(previsao));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · Aceite SEI (1 caso concluído — abaixo do mínimo de 5) → nunca estimativa numérica");
{
  const { relatorio, previsao } = await preverPara("25.5.000016900-4");
  // Se este processo real estiver dependendo de documento agora, "suspensa" tem prioridade sobre
  // o corte de amostra (mesma ordem de precedência do mandato) — nos dois casos, nunca gera
  // "estimativa" (só há 1 caso concluído no histórico deste slot, muito abaixo do mínimo de 5).
  t("nunca vira 'estimativa' com amostra tão pequena", previsao.status !== "estimativa", JSON.stringify({ esforco: relatorio?.esforco, previsao }));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · Regularização com amostra real (10 casos, ciclo completo) — estimativa OU suspensa por documento, nunca inventado");
{
  const { d, relatorio, previsao } = await preverPara("25.5.000046759-5");
  const dependeDocumento = relatorio?.esforco === "depende_documento";
  if (dependeDocumento) {
    t("esforço = depende_documento → previsão SUSPENSA (nunca estimativa)", previsao.status === "suspensa", JSON.stringify(previsao));
  } else {
    t("sem dependência de documento → estimativa OU base insuficiente, nunca suspensa", previsao.status === "estimativa" || previsao.status === "base_insuficiente", JSON.stringify(previsao));
    if (previsao.status === "estimativa") {
      t("intervalo é min <= max", previsao.minDias <= previsao.maxDias, JSON.stringify(previsao));
      t("amostra >= 5 (mínimo exigido)", previsao.amostra >= 5, JSON.stringify(previsao));
      t("confiança declarada é uma das 3 categorias", ["alta", "media", "baixa"].includes(previsao.confianca));
      t("fonte declarada por extenso", previsao.fonte.includes("vw_bdi_tempo_etapas"), previsao.fonte);
    }
  }
  console.log("  (contexto real desta chamada):", JSON.stringify({ esforco: relatorio?.esforco, previsao }));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · granularidades sem timestamp real (LIP/MAC/análise atual) — sempre honestas, nunca fabricadas");
{
  for (const g of ["lip", "mac", "analise_atual"] as const) {
    const p = previsaoGranularidadeIndisponivel(g);
    t(`${g}: sempre base_insuficiente`, p.status === "base_insuficiente");
    t(`${g}: motivo explica a ausência de timestamp real`, (p as any).motivo.includes("timestamp real"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · zero chamada Gemini");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  await preverPara("48533");
  await preverPara("25.5.000046759-5");
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · nunca compara casos entre slots diferentes (mesma regra do catálogo semântico)");
{
  const fonteRegularizacao = (await preverPara("25.5.000046759-5")).previsao;
  const codigoSrc = (await import("node:fs")).readFileSync(new URL("../lib/urbi/previsao.ts", import.meta.url), "utf-8");
  t("buscarCasosComparaveis sempre filtra por tipo_processo (nunca mistura slot)", codigoSrc.includes('.eq("tipo_processo", tipoProcesso)'));
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
