/**
 * Testes de integridade da MATRIZ DE RASTREABILIDADE.
 *
 *   set -a && source .env.local && set +a && npx tsx scripts/testar_rastreabilidade.mts
 *   ... --atualizar-lock    (só depois de conferir que a mudança funcional é intencional)
 *
 * A matriz é contrato técnico, não documentação. Estes testes são o que impede o contrato de
 * virar ficção: se a declaração e o comportamento divergirem, o teste quebra — não avisa.
 *
 * A trava mais importante é a de nº 13: roda a leitura REAL na pasta de amostra e compara o que o
 * leitor preencheu com o que a matriz declara. É a diferença entre documentação e contrato.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  MATRIZES, CHAVES_FANTASMA, registros, idDoRegistro, hashFuncional, matriz,
} from "../lib/rastreabilidade";
import type { CampoRastreado, ItemRastreado } from "../lib/rastreabilidade";
import { lerPastaSlot5, type ArquivoEntrada } from "../lib/lerPastaSlot5";
import { fecharResultados } from "../lib/rastreabilidade/fechar";

const LOCK = path.join(process.cwd(), "lib/rastreabilidade/versoes.lock.json");
const atualizarLock = process.argv.includes("--atualizar-lock");

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
// Campos do LIP direto do banco: a matriz tem que bater com a realidade, não com
// uma cópia da realidade.
// ─────────────────────────────────────────────────────────────────────────────
async function camposDoBanco(assuntoId: string): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const abas = await (await fetch(`${url}/rest/v1/lip_abas?select=id&assunto_id=eq.${assuntoId}`, { headers: h })).json();
  const ids = (abas as any[]).map((a) => a.id);
  const campos = await (await fetch(`${url}/rest/v1/lip_campos?select=chave,aba_id&limit=2000`, { headers: h })).json();
  return new Set((campos as any[]).filter((c) => ids.includes(c.aba_id)).map((c) => c.chave));
}

const m = matriz("LIP", "slot_05")!;
const campos = m.campos!;
const noBanco = await camposDoBanco(m.assuntoId);
const fantasmas = new Set(CHAVES_FANTASMA["LIP:slot_05"] ?? []);

secao("1-5 · cobertura: a matriz cobre o LIP, e só o LIP");
t("1. os 136 campos do LIP existem na matriz", campos.length === noBanco.size,
  `matriz ${campos.length} × banco ${noBanco.size}`);

const chaves = campos.map((c) => c.chave);
const dups = chaves.filter((k, i) => chaves.indexOf(k) !== i);
t("2. não há duplicatas", dups.length === 0, dups.join(", "));

const semRastro = [...noBanco].filter((k) => !chaves.includes(k));
t("4. não há campo do LIP sem rastreabilidade", semRastro.length === 0, semRastro.join(", "));

const inexistentes = chaves.filter((k) => !noBanco.has(k));
t("5. não há registro na matriz para campo inexistente", inexistentes.length === 0, inexistentes.join(", "));

// campo fantasma = o leitor grava numa chave que não existe no LIP. Tem que estar DECLARADO.
const naoDeclarados = [...fantasmas].filter((k) => noBanco.has(k));
t("3. não há campo fantasma não documentado", naoDeclarados.length === 0,
  `declarados como fantasma mas existem no banco: ${naoDeclarados.join(", ")}`);

secao("6-11 · qualidade de cada declaração");
const semStatus = campos.filter((c) => !c.declaracao);
t("6. todo campo tem declaração", semStatus.length === 0, semStatus.map((c) => c.chave).join(", "));

const npSemMotivo = campos.filter((c) => c.regraNP != null && !c.regraNP?.trim());
t("7. todo NP tem justificativa", npSemMotivo.length === 0, npSemMotivo.map((c) => c.chave).join(", "));

const calcSemFormula = campos.filter(
  (c) => c.metodos.includes("CALCULO") && !c.formula?.trim() && !c.regras.some((r) => r.regra === "FORMULA"));
t("8. todo cálculo tem função ou fórmula", calcSemFormula.length === 0, calcSemFormula.map((c) => c.chave).join(", "));

const cmpIncompleta = campos.filter(
  (c) => c.metodos.includes("COMPARACAO") && (!c.fontesComparadas?.length || !c.regras.length));
t("9. toda comparação tem fontes e regra", cmpIncompleta.length === 0, cmpIncompleta.map((c) => c.chave).join(", "));

const autoSemOrigem = campos.filter(
  (c) => (c.declaracao === "AUTOMATICO" || c.declaracao === "CALCULADO") && (!c.fontePrincipal || c.fontePrincipal === "SEM_FONTE"));
t("10. todo campo automático tem origem", autoSemOrigem.length === 0, autoSemOrigem.map((c) => c.chave).join(", "));

const fatoSemDescricao = campos.filter((c) => c.fatoNecessario != null && !c.fatoNecessario.trim());
t("11. todo fato necessário está descrito", fatoSemDescricao.length === 0, fatoSemDescricao.map((c) => c.chave).join(", "));

// exigências que decorrem do próprio contrato
const semResponsavel = campos.filter((c) => !c.responsavel?.trim());
t("+ todo campo diz que código o executa", semResponsavel.length === 0, semResponsavel.map((c) => c.chave).join(", "));
const iaSemVisao = campos.filter((c) => c.usaIA && !c.metodos.some((x) => x === "VISAO_LOCALIZADA" || x === "ANALISE_IA"));
t("+ campo marcado com IA usa método de IA", iaSemVisao.length === 0, iaSemVisao.map((c) => c.chave).join(", "));

secao("12 · governança: mudança de método exige incremento de versão");
type Lock = Record<string, { versao: number; hash: string }>;
const lockAtual: Lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, "utf8")) : {};
const lockNovo: Lock = {};
const semVersao: string[] = [];

for (const mtz of MATRIZES) {
  for (const r of registros(mtz) as (CampoRastreado | ItemRastreado)[]) {
    const id = `${mtz.modulo}:${mtz.slot}:${idDoRegistro(r as any)}`;
    const hash = hashFuncional(r);
    lockNovo[id] = { versao: r.versao, hash };
    const antes = lockAtual[id];
    // comportamento mudou e a versão ficou igual: é exatamente o que a regra proíbe
    if (antes && antes.hash !== hash && antes.versao === r.versao) semVersao.push(id);
  }
}
t("12. nenhuma mudança funcional sem incremento de versão", semVersao.length === 0,
  semVersao.join("\n           ") + (semVersao.length ? "\n           → suba a `versao` do campo, ou rode com --atualizar-lock se a mudança já foi versionada" : ""));

secao("13 · a trava: a declaração bate com o que o leitor faz de verdade");
const AMOSTRA = process.env.HOME + "/Desktop/SLOT 5";
if (!fs.existsSync(AMOSTRA)) {
  console.log("  (pulado — pasta de amostra não encontrada)");
} else {
  const entradas: ArquivoEntrada[] = fs.readdirSync(AMOSTRA)
    .filter((n) => !n.startsWith(".") && /\.pdf$/i.test(n))
    .map((nome) => {
      const buffer = new Uint8Array(fs.readFileSync(path.join(AMOSTRA, nome)));
      return { nome, rodada: 1, hash: crypto.createHash("sha256").update(buffer).digest("hex"), buffer };
    });
  const r = await lerPastaSlot5(entradas);
  const preenchidos = new Set(Object.keys(r.campos).filter((k) => noBanco.has(k)));
  const porChave = new Map(campos.map((c) => [c.chave, c]));

  /* A trava cobra do LEITOR só o que é do leitor. Campo preenchido pela rota (consulta a banco
   * depois da leitura), pela tela (no aceite) ou por valor padrão do assunto não passa por aqui —
   * e é por isso que a matriz declara `preenchidoPor`. */
  const prometeuNaoCumpriu = campos.filter(
    (c) => c.implementado && c.preenchidoPor === "leitor" && !preenchidos.has(c.chave));
  t("13a. tudo que a matriz diz que o LEITOR preenche foi preenchido", prometeuNaoCumpriu.length === 0,
    prometeuNaoCumpriu.map((c) => `${c.chave} (${c.declaracao})`).join(", "));

  const preencheuSemDeclarar = [...preenchidos].filter((k) => {
    const c = porChave.get(k);
    return !c?.implementado || c.preenchidoPor !== "leitor";
  });
  t("13b. nada foi preenchido pelo leitor sem estar declarado como tal", preencheuSemDeclarar.length === 0,
    preencheuSemDeclarar.join(", "));

  /* NP exige PROVA POSITIVA: leu, aplicou regra, concluiu. Ausência de valor é NAO_ENCONTRADO. */
  const npSemEvidencia = Object.entries(r.campos)
    .filter(([, v]: any) => v.resultado === "NAO_APLICAVEL" && !v.evidencia?.trim());
  t("13c. todo NP produzido traz evidência positiva", npSemEvidencia.length === 0,
    npSemEvidencia.map(([k]) => k).join(", "));

  const semTentativa = Object.entries(r.campos)
    .filter(([, v]: any) => (v.resultado === "NAO_ENCONTRADO" || v.resultado === "FONTE_ILEGIVEL")
      && !v.tentativa?.procurou?.length);
  t("13e. todo NAO_ENCONTRADO/FONTE_ILEGIVEL diz onde procurou", semTentativa.length === 0,
    semTentativa.map(([k]) => k).join(", "));

  const fantasmaReal = Object.keys(r.campos).filter((k) => !noBanco.has(k));
  const fantasmaNaoDeclarado = fantasmaReal.filter((k) => !fantasmas.has(k));
  t("13d. toda chave fantasma que o leitor grava está declarada", fantasmaNaoDeclarado.length === 0,
    fantasmaNaoDeclarado.join(", "));

  console.log(`\n  cobertura real: ${preenchidos.size} de ${noBanco.size} campos preenchidos na amostra`);

  secao("14 · a trava dos 136: nenhum campo termina uma execução sem resultado");
  const chavesMatriz = new Set(campos.map((c) => c.chave));
  const fechados = fecharResultados(campos, r.campos);
  // chaves fantasma (ex.: `certidao`) não são da matriz — contam à parte, não nos 136
  const fechadosNaMatriz = Object.keys(fechados).filter((k) => chavesMatriz.has(k));
  t("14a. tudo que não é preenchido pela tela recebeu resultado (135 de 136 — falta só `observacoes`)",
    fechadosNaMatriz.length === campos.length - 1,
    `${fechadosNaMatriz.length} de ${campos.length - 1}`);

  // `observacoes` só nasce no aceite (preenchidoPor "tela") — simula o que a rota
  // /api/lip/aceitar-pasta faz, para conferir que a execução completa fecha em 136.
  const comObservacoes = { ...fechados, observacoes: { resultado: "CALCULADO" as const, valor: "log da leitura", fonte: "aceite" } };
  const comObsNaMatriz = Object.keys(comObservacoes).filter((k) => chavesMatriz.has(k));
  t("14b. a execução completa (com o aceite) fecha exatamente em 136", comObsNaMatriz.length === 136,
    `${comObsNaMatriz.length}`);

  const semDeclaracao = Object.keys(comObservacoes).filter((k) => !chavesMatriz.has(k) && !fantasmas.has(k));
  const naoResultaram = [...chavesMatriz].filter((k) => !(k in comObservacoes));
  t("14c. toda chave de resultado existe na matriz (fora as fantasmas já declaradas)", semDeclaracao.length === 0, semDeclaracao.join(", "));
  t("14d. toda chave da matriz recebeu resultado", naoResultaram.length === 0, naoResultaram.join(", "));

  const bloqueadosSemDependencia = Object.entries(comObservacoes)
    .filter(([, v]: any) => v.resultado === "BLOQUEADO" && !v.tentativa?.motivo?.trim());
  t("14e. todo BLOQUEADO informa a dependência", bloqueadosSemDependencia.length === 0,
    bloqueadosSemDependencia.map(([k]) => k).join(", "));

  const naoImplementadoIndevido = Object.entries(comObservacoes)
    .filter(([k, v]: any) => v.resultado === "NAO_IMPLEMENTADO" && porChave.get(k)?.implementado !== false);
  t("14f. NAO_IMPLEMENTADO só aparece em campo declarado implementado=false", naoImplementadoIndevido.length === 0,
    naoImplementadoIndevido.map(([k]) => k).join(", "));

  const distribuicao = Object.entries(comObservacoes).filter(([k]) => chavesMatriz.has(k))
    .reduce((acc: Record<string, number>, [, v]: any) => {
    acc[v.resultado] = (acc[v.resultado] ?? 0) + 1; return acc;
  }, {});
  console.log(`\n  distribuição dos 136 resultados: ${Object.entries(distribuicao).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

secao("MAC · estrutura pronta, conteúdo vazio");
const mac = matriz("MAC", "slot_05")!;
t("estrutura do MAC existe", !!mac.itens, "");
console.log(`  ${mac.itens!.length} itens cadastrados — vazio de propósito; ver lib/rastreabilidade/macSlot5.ts`);

if (atualizarLock) {
  fs.writeFileSync(LOCK, JSON.stringify(lockNovo, null, 2) + "\n");
  console.log(`\n  lock atualizado: ${Object.keys(lockNovo).length} registros`);
} else if (!fs.existsSync(LOCK)) {
  fs.writeFileSync(LOCK, JSON.stringify(lockNovo, null, 2) + "\n");
  console.log(`\n  lock criado: ${Object.keys(lockNovo).length} registros`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
