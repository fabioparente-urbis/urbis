/**
 * Teste do MHD — Módulo de Histórico e Documentos.
 *
 *   npx tsx --env-file=.env.local scripts/testar_mhd.mts
 *
 * Seções 1-3 exercitam a comparação entre versões (o "corrigido" do relatório) e a matriz de
 * dependências (o que cada correção afeta) — PURAS, não tocam no banco.
 *
 * Seção 4 é de INTEGRAÇÃO — toca o banco real (`mhd_resultados_campo`, `mhd_eventos`), com
 * `processo_codigo` sintético (nunca um processo real) e limpeza no `finally`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { compararVersoes, complementarCampo } from "../lib/mhd";
import { conferenciasAfetadas, camposAfetados, rotuloDe } from "../lib/mhdDependencias";

let falhas = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? "ok    " : "FALHA ") + msg); if (!cond) falhas++; };

// ── comparação entre versões (o "corrigido" do relatório)
const v1 = { areaTotalConstrucao: 350, permeavel: 78.48, revisao: "REV00", atividades: [1,2] };
const v2 = { areaTotalConstrucao: 420, permeavel: 78.48, revisao: "REV04", atividades: [3] };
const difs = compararVersoes(v1, v2, "projeto");
ok(difs.length === 2, `detecta 2 alterações (achou ${difs.length}: ${difs.map(d=>d.campo).join(",")})`);
ok(!!difs.find(d => d.campo === "areaTotalConstrucao" && d.de === "350" && d.para === "420"), "área 350 → 420");
ok(!difs.find(d => d.campo === "atividades"), "ignora 'atividades' (ruído, não é fato do projeto)");
ok(!difs.find(d => d.campo === "permeavel"), "campo igual não vira alteração");

// campo que some e campo que aparece
const d2 = compararVersoes({ a: "x" }, { b: "y" }, "projeto");
ok(d2.length === 2 && d2.some(d => d.para === "—") && d2.some(d => d.de === "—"), "campo removido e campo novo aparecem");

// ── matriz de dependências
const afetadaPorArt = conferenciasAfetadas(["art_projeto"]);
ok(afetadaPorArt("Área na ART de projeto confere com o projeto?"), "ART nova afeta a conferência da ART de projeto");
ok(afetadaPorArt("As datas dos documentos são coerentes entre si?"), "ART nova afeta a coerência de datas");
ok(!afetadaPorArt("Índice paisagístico atende o mínimo do Uso do Solo?"), "ART nova NÃO afeta o índice paisagístico");
ok(!afetadaPorArt("Vagas de estacionamento exigidas × atendidas"), "ART nova NÃO afeta vagas");

const afetadaPorPrancha = conferenciasAfetadas(["projeto"]);
ok(afetadaPorPrancha("Índice paisagístico atende o mínimo do Uso do Solo?"), "prancha nova afeta o paisagístico");
ok(afetadaPorPrancha("Vagas de estacionamento exigidas × atendidas"), "prancha nova afeta vagas");
ok(!afetadaPorPrancha("Validade do Uso do Solo (fora do escopo do analista)"), "prancha NÃO afeta validade do UDS");

ok(conferenciasAfetadas([])("Conferência inventada que não está na matriz"), "sem regra declarada → trata como afetada (nunca esconde)");

const campos = camposAfetados(["art_projeto"]);
ok(campos.has("areaNaArtDeProjeto") && !campos.has("areaTerreno"), "campos da ART de projeto sem contaminar os da prancha");
ok(rotuloDe("art_caixa") === "ART de Caixa de Recarga", "rótulo humano do papel");

// ─────────────────────────── 4 · complementarCampo — integração real com o banco ───────────────────────────

async function testarComplementarCampo() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: usuario } = await supabase.from("usuarios").select("id").limit(1).maybeSingle();
  if (!usuario) {
    console.log("  (seção 4 pulada — precisa de ao menos 1 usuário no banco; não conta como falha)");
    return;
  }

  const PROCESSO_TESTE = `TESTE-MHD-COMPLEMENTAR-TEMP-${Date.now()}`;
  const CHAVE_FATO = "fatoComplementarDeTeste";
  const CHAVE_ITEM_MAC = "itemManualDeTeste";

  try {
    // 4a — chave SEM nenhuma linha automática ainda: nasce como resultado "MANUAL"
    const r1 = await complementarCampo({
      processoCodigo: PROCESSO_TESTE, modulo: "LIP", slot: "slot_05", chave: CHAVE_FATO,
      valorManual: "356,93", autorId: (usuario as any).id,
      versaoFallback: 1, hashFallback: "fato-complementar-sem-declaracao",
    });
    ok(r1.ativa && r1.gravou, `4a. complementarCampo grava sem falhas (problemas: ${r1.problemas.join("; ")})`);

    const { data: linha1 } = await supabase.from("mhd_resultados_campo").select("*")
      .eq("processo_codigo", PROCESSO_TESTE).eq("modulo", "LIP").eq("chave", CHAVE_FATO).eq("vigente", true).maybeSingle();
    ok(!!linha1, "4b. a linha foi criada e está vigente");
    ok((linha1 as any)?.resultado === "MANUAL" && (linha1 as any)?.valor === null, "4c. nasce com resultado=MANUAL e valor automático null (nunca inventa um valor automático)");
    ok((linha1 as any)?.valor_manual === "356,93", "4d. valor_manual é exatamente o que o analista informou");
    ok((linha1 as any)?.autor_manual_id === (usuario as any).id, "4e. autor_manual_id é o usuário informado");
    ok(!!(linha1 as any)?.complementado_em, "4f. complementado_em foi preenchido");

    // 4g — simula um resultado AUTOMÁTICO já existente (ENCONTRADO, com valor) e confirma que
    // complementar NUNCA sobrescreve resultado/valor/fonte — só as colunas *_manual.
    const { error: erroSetup } = await supabase.from("mhd_resultados_campo").insert({
      processo_codigo: PROCESSO_TESTE, modulo: "MAC", slot: "slot_05", chave: CHAVE_ITEM_MAC,
      execucao_id: crypto.randomUUID(), vigente: true,
      resultado: "ENCONTRADO", valor: "valor-automatico-original", fonte: "leitor-automatico",
      versao: 1, hash: "hash-de-teste",
    });
    ok(!erroSetup, `4g. setup do resultado automático pré-existente (erro: ${erroSetup?.message ?? "nenhum"})`);

    const r2 = await complementarCampo({
      processoCodigo: PROCESSO_TESTE, modulo: "MAC", slot: "slot_05", chave: CHAVE_ITEM_MAC,
      valorManual: "nao_conforme — justificativa do analista", autorId: (usuario as any).id,
      versaoFallback: 1, hashFallback: "hash-de-teste",
    });
    ok(r2.ativa && r2.gravou, `4h. complementarCampo sobre item com resultado automático prévio grava sem falhas (${r2.problemas.join("; ")})`);

    const { data: linha2 } = await supabase.from("mhd_resultados_campo").select("*")
      .eq("processo_codigo", PROCESSO_TESTE).eq("modulo", "MAC").eq("chave", CHAVE_ITEM_MAC).eq("vigente", true).maybeSingle();
    ok((linha2 as any)?.resultado === "ENCONTRADO" && (linha2 as any)?.valor === "valor-automatico-original" && (linha2 as any)?.fonte === "leitor-automatico", "4i. resultado/valor/fonte automáticos permanecem INTACTOS — complementação nunca sobrescreve o automático");
    ok((linha2 as any)?.valor_manual === "nao_conforme — justificativa do analista", "4j. valor_manual foi gravado ao lado, sem tocar o automático");

    // 4k — correção: responder de novo muda o valor_manual, e cada complemento grava um evento
    // (trilha auditável mesmo sem versionar a coluna valor_manual em si).
    const r3 = await complementarCampo({
      processoCodigo: PROCESSO_TESTE, modulo: "MAC", slot: "slot_05", chave: CHAVE_ITEM_MAC,
      valorManual: "conforme — corrigido depois de reler o documento", autorId: (usuario as any).id,
      versaoFallback: 1, hashFallback: "hash-de-teste",
    });
    ok(r3.ativa && r3.gravou, "4l. correção do valor_manual grava sem falhas");
    const { data: linha3 } = await supabase.from("mhd_resultados_campo").select("valor_manual")
      .eq("processo_codigo", PROCESSO_TESTE).eq("modulo", "MAC").eq("chave", CHAVE_ITEM_MAC).eq("vigente", true).maybeSingle();
    ok((linha3 as any)?.valor_manual === "conforme — corrigido depois de reler o documento", "4m. valor_manual reflete a correção mais recente");

    const { data: eventos } = await supabase.from("mhd_eventos").select("tipo, detalhe")
      .eq("processo_codigo", PROCESSO_TESTE).eq("tipo", "fato_complementado");
    ok((eventos?.length ?? 0) === 3, `4n. cada chamada (inclusive a correção) grava 1 evento — 3 chamadas, ${eventos?.length ?? 0} eventos`);
    const eventoCorrecao = (eventos ?? []).find((e: any) => e.detalhe?.valorNovo === "conforme — corrigido depois de reler o documento");
    ok(eventoCorrecao?.detalhe?.valorAnterior === "nao_conforme — justificativa do analista", "4o. o evento da correção preserva o valor ANTERIOR, mesmo que valor_manual só guarde o mais recente");

    // 4p — só UMA linha vigente por (processo,modulo,slot,chave), mesmo depois de 2 complementações
    const { data: todasLinhas } = await supabase.from("mhd_resultados_campo").select("id, vigente")
      .eq("processo_codigo", PROCESSO_TESTE).eq("modulo", "MAC").eq("chave", CHAVE_ITEM_MAC);
    ok((todasLinhas ?? []).filter((l: any) => l.vigente).length === 1, "4p. continua havendo exatamente 1 linha vigente (a trava única do banco não foi violada)");
  } finally {
    await supabase.from("mhd_eventos").delete().eq("processo_codigo", PROCESSO_TESTE);
    await supabase.from("mhd_resultados_campo").delete().eq("processo_codigo", PROCESSO_TESTE);
    console.log(`  limpeza: dados de teste do processo sintético "${PROCESSO_TESTE}" removidos`);
  }
}

await testarComplementarCampo();

// ─────────────────────────── 5 · rota POST — checagens de wiring por código-fonte ───────────────────────────

{
  const fonteRota = readFileSync(join(process.cwd(), "app", "api", "admin", "rastreabilidade", "route.ts"), "utf8");
  const corpoPost = fonteRota.slice(fonteRota.indexOf("export async function POST"));
  ok(corpoPost.indexOf("usuarioDaRequisicao(req)") < corpoPost.indexOf("req.json()"), "5a. a rota autentica ANTES de ler o corpo (usuarioDaRequisicao antes de req.json())");
  ok(corpoPost.includes('modulo === "MAC" && !registro'), "5b. a rota rejeita chave que não é item MAC declarado na matriz (nunca aceita chave arbitrária pro módulo MAC)");
  ok(!corpoPost.includes('modulo === "LIP" && !registro'), "5c. a rota NÃO exige a chave estar na matriz pro módulo LIP — fato complementar tem que poder nascer fora dos 136 campos oficiais");
  ok(corpoPost.includes("complementarCampo("), "5d. a rota chama complementarCampo (não grava direto na tabela, respeita a função central)");
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
