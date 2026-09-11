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

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const codigosFiltro = process.argv.slice(2);

const { data, error } = await sb
  .from("fluxo_processo_eventos")
  .select("processo_codigo, titulo, setor, data_documento, pagina_ini")
  .order("processo_codigo")
  .order("pagina_ini");
if (error) { console.error(error.message); process.exit(1); }

const porProcesso = new Map<string, { titulo: string; setor: string | null; dataDocumento: string | null }[]>();
for (const row of data) {
  if (codigosFiltro.length && !codigosFiltro.includes(row.processo_codigo)) continue;
  const lista = porProcesso.get(row.processo_codigo) ?? [];
  lista.push({ titulo: row.titulo, setor: row.setor, dataDocumento: row.data_documento });
  porProcesso.set(row.processo_codigo, lista);
}

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
  console.log(`Retrabalho típico (mediana): ${portfolio.retrabalhoMedio} despacho(s) de pendência/diligência por processo`);
  if (portfolio.tempoTipicoPorSetor.length) {
    console.log("Tempo TÍPICO por setor (mediana entre os processos que passaram por ele — não é a média, um outlier não distorce):");
    for (const t of portfolio.tempoTipicoPorSetor) console.log(`  ${String(t.medianaDias).padStart(4)} dias — ${t.setor} (visto em ${t.processos} processo(s))`);
  }
}
