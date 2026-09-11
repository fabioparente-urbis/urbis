/**
 * scripts/fase11_medir_fluxo.mts — Fase 11 do plano de leitura de PDF (§6): "Consultas devolvem
 * números coerentes com a realidade conhecida" — o critério de pronto da própria fase é o Fábio
 * conferir se o número bate com o que ele lembra de cada processo.
 *
 * Lê `fluxo_processo_eventos` (gravada pela Fase 10) e aplica `analisarJornada`
 * (lib/documentosSei/analiseFluxo.ts) — SÓ LEITURA, não grava nada.
 *
 *   npx tsx --env-file=.env.local scripts/fase11_medir_fluxo.mts                         (todos os processos gravados)
 *   npx tsx --env-file=.env.local scripts/fase11_medir_fluxo.mts 24.5.000070854-5 ...     (só os informados)
 */
import { createClient } from "@supabase/supabase-js";
import { analisarJornada, agregarPortfolio } from "../lib/documentosSei/analiseFluxo";
import { lerEventosFluxo, agruparPorProcesso, type EventoBruto } from "../lib/documentosSei/lerEventosFluxo";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const codigosFiltro = process.argv.slice(2);

// Paginado — um .select() simples para em 1000 linhas e este script mediria 35 dos 101 processos.
const linhas = await lerEventosFluxo<EventoBruto>(sb, "processo_codigo, titulo, setor, data_documento, pagina_ini");
const porProcesso = agruparPorProcesso(
  codigosFiltro.length ? linhas.filter((l) => codigosFiltro.includes(l.processo_codigo)) : linhas,
);

if (porProcesso.size === 0) {
  console.log("Nenhum processo encontrado em fluxo_processo_eventos" + (codigosFiltro.length ? " para os códigos informados." : "."));
  process.exit(0);
}

for (const [codigo, eventos] of porProcesso) {
  const r = analisarJornada(eventos);
  console.log(`\n=== ${codigo} ===`);
  console.log(`${r.totalEventos} documentos | ${r.eventosComData} com data | ${r.eventosComSetor} com setor`);
  if (r.datasDescartadasComoRuido) console.log(`  (${r.datasDescartadasComoRuido} data(s) descartada(s) como ruído — destoava muito das demais)`);
  if (r.duracaoDias === null) {
    console.log("Duração: não deu pra medir (poucas datas confiáveis)");
  } else {
    console.log(`Duração medida (do documento mais antigo ao mais recente): ${r.duracaoDias} dias — faixa: ${r.faixa}`);
  }
  console.log(`Retrabalho (despachos de pendência/diligência): ${r.retrabalho}`);
  if (r.tempoPorSetor.length) {
    console.log("Tempo por setor (melhor esforço, só onde a data e o setor apareceram juntos):");
    for (const t of r.tempoPorSetor) console.log(`  ${String(t.dias).padStart(4)} dias — ${t.setor}`);
  }
}

if (porProcesso.size > 1) {
  const portfolio = agregarPortfolio([...porProcesso.values()]);
  console.log(`\n=== PORTFÓLIO (${portfolio.totalProcessos} processos) ===`);
  console.log(`Duração medida em: ${portfolio.processosComDuracaoMedida}/${portfolio.totalProcessos}`);
  console.log("Faixas de tempo:");
  for (const [faixa, n] of Object.entries(portfolio.contagemPorFaixa)) console.log(`  ${n} processo(s) — ${faixa}`);
  const rt = portfolio.retrabalho;
  console.log(`Retrabalho: ${rt.processosComRetrabalho}/${rt.totalProcessos} processos voltaram ao menos uma vez (mediana entre eles: ${rt.medianaEntreOsQueVoltaram}, máximo: ${rt.maximo})`);
  if (portfolio.setoresOcultadosPorAmostra) {
    console.log(`(${portfolio.setoresOcultadosPorAmostra} setor(es) fora do ranking por aparecerem em um único processo)`);
  }
  if (portfolio.tempoTipicoPorSetor.length) {
    console.log("Tempo TÍPICO por setor (espera ATÉ o setor emitir seu documento; mediana, não média):");
    for (const t of portfolio.tempoTipicoPorSetor) console.log(`  ${String(t.medianaDias).padStart(4)} dias — ${t.setor} (visto em ${t.processos} processo(s))`);
  }
}
