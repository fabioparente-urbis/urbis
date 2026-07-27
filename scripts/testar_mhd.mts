/**
 * Teste do MHD — Módulo de Histórico e Documentos.
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/testar_mhd.mts
 *
 * Exercita as duas partes onde um erro passaria despercebido: a comparação entre versões
 * (o "corrigido" do relatório) e a matriz de dependências (o que cada correção afeta).
 * Não toca no banco.
 */
import { compararVersoes } from "../lib/mhd";
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

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
