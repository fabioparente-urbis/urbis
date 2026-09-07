/**
 * lib/documentosSei/visaoAmbiguas.ts — Fase 8 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §6). Gemini SÓ AQUI, e só sob clique: classifica páginas
 * que ficaram `classificacao_pendente` (`lib/documentosSei/pecas.ts`), nunca automaticamente.
 *
 * Reaproveita `contarPaginas`/`recortar` de `lib/visao/rasterizar.ts` (utilitário puro de
 * PDF→PNG via mupdf, sem lógica de slot nenhuma — importado direto, ao contrário do caso
 * MAC×LIP que é isolamento de REGRA DE NEGÓCIO) e o preço por token de `lib/visao/index.ts`
 * (mesmos `USD_POR_TOKEN_*`, reproduzidos aqui porque não são exportados de lá).
 *
 * Devolve só PROPOSTA — nunca troca `classificacao_pendente` sozinho. Quem decide é o analista,
 * na tela, por página.
 */
import { createHash } from "crypto";
import { recortar } from "@/lib/visao/rasterizar";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { GEMINI_MODEL } from "@/lib/constants";
import type { PapelPeca } from "./pecas";

// mesmos valores de lib/visao/index.ts — não exportados de lá, reproduzidos aqui de propósito
// (módulo isolado do Slot 5).
const USD_POR_TOKEN_ENTRADA = 0.3 / 1_000_000;
const USD_POR_TOKEN_SAIDA = 2.5 / 1_000_000;

// estimativa GROSSEIRA pra mostrar custo ANTES do clique — não existe utilitário de pré-estimativa
// em lib/visao (só mede depois). ~1100 tokens de imagem (referência pública do Gemini pra imagem
// de baixa/média resolução) + ~200 de saída (classificação curta).
const TOKENS_ENTRADA_POR_PAGINA_ESTIMADO = 1100;
const TOKENS_SAIDA_POR_PAGINA_ESTIMADO = 200;

export function estimarCustoUsd(numeroDePaginas: number): number {
  return numeroDePaginas * (
    TOKENS_ENTRADA_POR_PAGINA_ESTIMADO * USD_POR_TOKEN_ENTRADA
    + TOKENS_SAIDA_POR_PAGINA_ESTIMADO * USD_POR_TOKEN_SAIDA
  );
}

const PAPEIS_VALIDOS: PapelPeca[] = [
  "projeto", "levantamento", "art", "art_levantamento", "art_caixa", "matricula", "certidao",
  "laudo", "vistoria", "foto", "memorial", "procuracao", "embargo", "despacho", "parecer",
  "oficio", "requerimento", "email",
];

const PROMPT = `Esta é uma página de um processo administrativo brasileiro (SEI). Classifique-a em UMA destas categorias, pelo conteúdo visível: ${PAPEIS_VALIDOS.join(", ")}, ou "nenhuma" se não reconhecer. Responda em JSON: {"papel": "<uma das opções acima ou nenhuma>"}.`;

export type ResultadoClassificacaoAmbigua = {
  pagina: number;
  papel: PapelPeca | null;
  bruto: string;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
  ms: number;
  /** veio do cache — não rasterizou, não chamou o Gemini, não custou nada */
  reaproveitada: boolean;
};

/**
 * CACHE (§6 Fase 8 do plano: "cache por conteúdo+receita+modelo"). Acrescentado em 07/09/2026 —
 * a auditoria (§23.6) achou que a Fase 8 tinha entregue o interruptor e o teto, mas NÃO o cache,
 * e sem ele reclassificar a mesma página paga de novo.
 *
 * Reaproveita `mhd_interpretacoes_visao`, que já existe e foi desenhada exatamente para isto
 * ("global por hash de conteúdo: o mesmo recorte do mesmo PDF não é reinterpretado nem repago, em
 * nenhum processo"). Nenhuma tabela nova, nenhuma migration — e a chave única da tabela
 * (hash_documento, pagina, regiao_hash, receita_hash, modelo) é exatamente a chave que este caso
 * precisa. Linhas do Slot 5 e daqui nunca se confundem porque o `receita_hash` é diferente.
 *
 * O hash é do PDF INTEIRO, calculado UMA vez por requisição, e não da imagem da página: assim a
 * consulta ao cache acontece ANTES de rasterizar, que é justamente o trabalho caro que o cache
 * existe pra evitar.
 */
const REGIAO = { x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: 1024 };
const RECEITA_VERSAO = 1;

function sha256(s: string | Uint8Array): string {
  return createHash("sha256").update(s as any).digest("hex");
}

const REGIAO_HASH = sha256(JSON.stringify(REGIAO));
/** Muda o prompt ou a lista de papéis válidos, muda o hash — cache antigo é ignorado, nunca reusado errado. */
const RECEITA_HASH = sha256(`documentos_sei_paginas_ambiguas|v${RECEITA_VERSAO}|${PROMPT}|${PAPEIS_VALIDOS.join(",")}|${JSON.stringify(REGIAO)}`);

/** SHA-256 do PDF inteiro — a identidade do conteúdo, uma vez por requisição. */
export function hashPdf(pdf: Uint8Array): string {
  return sha256(pdf);
}

async function doCache(hashDocumento: string, pagina: number): Promise<{ papel: PapelPeca | null; bruto: string } | null> {
  const { data, error } = await supabase
    .from("mhd_interpretacoes_visao")
    .select("valores,bruto,abstencao")
    .eq("hash_documento", hashDocumento).eq("pagina", pagina)
    .eq("regiao_hash", REGIAO_HASH).eq("receita_hash", RECEITA_HASH).eq("modelo", GEMINI_MODEL)
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const d = data as any;
  const candidato = String(d.valores?.papel ?? "");
  return {
    papel: (PAPEIS_VALIDOS as string[]).includes(candidato) ? (candidato as PapelPeca) : null,
    bruto: d.bruto ?? "",
  };
}

/** Falha ao gravar cache nunca derruba a classificação — só significa que a próxima vez paga de novo. */
async function gravarCache(
  hashDocumento: string, pagina: number,
  r: { papel: PapelPeca | null; bruto: string; custoUsd: number; ms: number },
): Promise<void> {
  const { error } = await supabase.from("mhd_interpretacoes_visao").insert({
    hash_documento: hashDocumento, pagina, regiao: REGIAO, regiao_hash: REGIAO_HASH,
    receita_versao: RECEITA_VERSAO, receita_hash: RECEITA_HASH, modelo: GEMINI_MODEL,
    abstencao: r.papel === null, valores: { papel: r.papel }, bruto: r.bruto,
    custo_ia: r.custoUsd, ms_modelo: Math.round(r.ms),
  });
  if (error) console.error("[documentos-sei/visao] cache não gravado:", error.message);
}

/**
 * `pagina1Based` é a posição no PDF INTEIRO (1-based, mesma convenção de `EventoSei`/`PecaSei`) —
 * `recortar`/mupdf usam 0-based, a conversão acontece aqui, uma vez só.
 */
export async function classificarPaginaAmbigua(
  pdf: Uint8Array,
  pagina1Based: number,
  hashDocumento: string,
): Promise<ResultadoClassificacaoAmbigua> {
  const t0 = performance.now();

  // cache ANTES de rasterizar: reaproveitar não custa nada, então vem antes de qualquer trabalho
  // caro — mesma ordem (e mesmo motivo) de `lib/visao/index.ts`.
  const guardado = await doCache(hashDocumento, pagina1Based);
  if (guardado) {
    return {
      pagina: pagina1Based, papel: guardado.papel, bruto: guardado.bruto,
      tokensEntrada: 0, tokensSaida: 0, custoUsd: 0, ms: performance.now() - t0,
      reaproveitada: true,
    };
  }

  const recorte = await recortar(pdf, { pagina: pagina1Based - 1, ...REGIAO });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const corpo = JSON.stringify({
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: "image/png", data: Buffer.from(recorte.png).toString("base64") } },
        { text: PROMPT },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: "application/json" },
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo },
  );
  if (!res.ok) {
    const texto = (await res.text()).slice(0, 300);
    throw new Error(`Gemini respondeu ${res.status}: ${texto}`);
  }
  const data = await res.json();
  const bruto: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const u = data.usageMetadata ?? {};
  const tokensEntrada = u.promptTokenCount ?? 0;
  const tokensSaida = u.candidatesTokenCount ?? 0;
  const custoUsd = tokensEntrada * USD_POR_TOKEN_ENTRADA + tokensSaida * USD_POR_TOKEN_SAIDA;

  let papel: PapelPeca | null = null;
  try {
    const json = JSON.parse(bruto);
    const candidato = String(json?.papel ?? "").toLowerCase();
    if ((PAPEIS_VALIDOS as string[]).includes(candidato)) papel = candidato as PapelPeca;
  } catch {
    // resposta fora do formato esperado — fica sem papel, nunca chuta a partir de texto solto
  }

  const ms = performance.now() - t0;
  await gravarCache(hashDocumento, pagina1Based, { papel, bruto, custoUsd, ms });
  return { pagina: pagina1Based, papel, bruto, tokensEntrada, tokensSaida, custoUsd, ms, reaproveitada: false };
}
