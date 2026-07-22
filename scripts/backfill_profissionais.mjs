// Backfill do módulo Profissionais (Bloco B).
// Lê processos.dados (JSONB) de todos os processos existentes, extrai
// nome_responsavel_arq / nome_responsavel_eng + cau/crea, cria/casa
// profissionais e grava o vínculo em processo_profissionais.
//
// Uso:
//   node scripts/backfill_profissionais.mjs --dry-run   (padrão, não grava nada)
//   node scripts/backfill_profissionais.mjs --aplicar   (grava de verdade)
//
// Idempotente: casamento por CAU/CREA normalizado, senão por nome
// normalizado. Rodar de novo não duplica profissional nem vínculo
// (UNIQUE processo_id+profissional_id+papel).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const APLICAR = process.argv.includes("--aplicar");

// Sentinelas — nunca viram profissional.
const SENTINELAS = new Set([
  "NP", "N.P.", "N.P", "CAU-NP", "CREA-NP", "N/A", "NA", "-", "--", "",
  "NAO POSSUI", "NÃO POSSUI", "SEM", "SEM RESPONSAVEL", "SEM RESPONSÁVEL",
]);

function normalizarNome(nome) {
  return nome
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ehSentinela(valor) {
  if (!valor) return true;
  const norm = valor.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return SENTINELAS.has(norm);
}

async function req(pathQuery, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${pathQuery}`, { headers: H, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const texto = await r.text();
  if (!texto) return null; // 204/201 sem corpo (ex: Prefer sem return=representation)
  return JSON.parse(texto);
}

async function main() {
  const procs = await req("processos?select=id,codigo,tipo_processo,dados");
  const g = (dados, chave) => {
    const v = dados?.[chave]?.valor ?? dados?.[chave];
    return typeof v === "string" ? v.trim() : "";
  };

  // Profissionais já existentes (pra casar em vez de duplicar em reprocessamento)
  const existentesRaw = APLICAR ? await req("profissionais?select=id,nome_normalizado,cau,crea") : [];
  const porNome = new Map(existentesRaw.map((p) => [p.nome_normalizado, p]));
  const porCau = new Map(existentesRaw.filter((p) => p.cau).map((p) => [p.cau, p]));
  const porCrea = new Map(existentesRaw.filter((p) => p.crea).map((p) => [p.crea, p]));

  let vinculosPropostos = [];
  let ignoradosSentinela = 0;
  let profissionaisNovos = new Map(); // chave dedupe -> {nome, cau, crea, papel_visto}

  for (const p of procs) {
    const dados = p.dados ?? {};
    const cau = g(dados, "cau");
    const crea = g(dados, "crea");

    const candidatos = [
      { campo: "nome_responsavel_arq", papel: "autor_arquiteto" },
      { campo: "nome_responsavel_eng", papel: "responsavel_engenheiro" },
    ];

    for (const { campo, papel } of candidatos) {
      const nome = g(dados, campo);
      if (!nome || ehSentinela(nome)) { if (nome) ignoradosSentinela++; continue; }

      const nomeNorm = normalizarNome(nome);
      const cauValido = cau && !ehSentinela(cau) ? cau.toUpperCase().trim() : null;
      const creaValido = crea && !ehSentinela(crea) ? crea.toUpperCase().trim() : null;

      // Chave de dedupe: prioridade CAU > CREA > nome normalizado
      const chaveDedupe = cauValido ? `cau:${cauValido}` : creaValido ? `crea:${creaValido}` : `nome:${nomeNorm}`;
      const confianca = cauValido || creaValido ? "media" : "baixa"; // sem CPF/CNPJ, nunca "alta" no backfill

      if (!profissionaisNovos.has(chaveDedupe)) {
        profissionaisNovos.set(chaveDedupe, { nome_original: nome, nome_normalizado: nomeNorm, cau: cauValido, crea: creaValido, processos: [] });
      }
      const prof = profissionaisNovos.get(chaveDedupe);
      prof.processos.push({ codigo: p.codigo, processo_id: p.id, papel, campo, valor_original: nome, confianca });
    }
  }

  console.log(`\n=== BACKFILL PROFISSIONAIS — modo: ${APLICAR ? "APLICAR (grava no banco)" : "DRY-RUN (não grava nada)"} ===\n`);
  console.log(`Processos lidos: ${procs.length}`);
  console.log(`Profissionais distintos identificados: ${profissionaisNovos.size}`);
  console.log(`Ocorrências de sentinela ignoradas (NP/CAU-NP/etc): ${ignoradosSentinela}`);
  const totalVinculos = [...profissionaisNovos.values()].reduce((s, p) => s + p.processos.length, 0);
  console.log(`Vínculos processo-profissional a criar: ${totalVinculos}\n`);

  console.log("--- Amostra (10 profissionais, ordenados por nº de processos) ---");
  const lista = [...profissionaisNovos.entries()].sort((a, b) => b[1].processos.length - a[1].processos.length);
  for (const [chave, p] of lista.slice(0, 10)) {
    console.log(`${String(p.processos.length).padStart(2)}x  ${p.nome_original.padEnd(42)} cau:${(p.cau ?? "-").padEnd(14)} crea:${(p.crea ?? "-").padEnd(14)} dedupe:${chave}`);
  }

  if (!APLICAR) {
    console.log("\n(dry-run — nada foi gravado. Rode com --aplicar para gravar de verdade.)");
    return;
  }

  // ── Aplicação real ──
  const execucao = await req("profissionais_backfill_execucoes", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ modo: "aplicado", processos_lidos: procs.length }),
  });
  const execucaoId = execucao[0].id;

  let profissionaisCriados = 0, vinculosCriados = 0;
  for (const [chave, p] of profissionaisNovos) {
    let profId = p.cau && porCau.has(p.cau) ? porCau.get(p.cau).id
      : p.crea && porCrea.has(p.crea) ? porCrea.get(p.crea).id
      : porNome.has(p.nome_normalizado) ? porNome.get(p.nome_normalizado).id
      : null;

    if (!profId) {
      const criado = await req("profissionais", {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({
          nome_original: p.nome_original,
          nome_normalizado: p.nome_normalizado,
          cau: p.cau, crea: p.crea,
        }),
      });
      profId = criado[0].id;
      profissionaisCriados++;
      if (p.cau) porCau.set(p.cau, { id: profId });
      if (p.crea) porCrea.set(p.crea, { id: profId });
      porNome.set(p.nome_normalizado, { id: profId });
    }

    for (const v of p.processos) {
      try {
        await req("processo_profissionais", {
          method: "POST",
          headers: { ...H, Prefer: "resolution=ignore-duplicates" }, // idempotente via UNIQUE constraint
          body: JSON.stringify({
            processo_id: v.processo_id,
            profissional_id: profId,
            papel: v.papel,
            origem: "backfill_jsonb",
            confianca: v.confianca,
            valor_original: v.valor_original,
            campo_original: v.campo,
          }),
        });
        vinculosCriados++;
      } catch (e) {
        console.warn(`  aviso: vínculo ${v.codigo}/${v.papel} não gravado: ${e.message}`);
      }
    }
  }

  await req(`profissionais_backfill_execucoes?id=eq.${execucaoId}`, {
    method: "PATCH",
    body: JSON.stringify({
      concluido_em: new Date().toISOString(),
      profissionais_criados: profissionaisCriados,
      vinculos_criados: vinculosCriados,
      ignorados_sentinela: ignoradosSentinela,
    }),
  });

  console.log(`\nAplicado. Profissionais criados: ${profissionaisCriados} | Vínculos criados: ${vinculosCriados} | execucao_id: ${execucaoId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
