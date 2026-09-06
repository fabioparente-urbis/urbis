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
import { recortar } from "@/lib/visao/rasterizar";
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
};

/**
 * `pagina1Based` é a posição no PDF INTEIRO (1-based, mesma convenção de `EventoSei`/`PecaSei`) —
 * `recortar`/mupdf usam 0-based, a conversão acontece aqui, uma vez só.
 */
export async function classificarPaginaAmbigua(
  pdf: Uint8Array,
  pagina1Based: number,
): Promise<ResultadoClassificacaoAmbigua> {
  const t0 = performance.now();
  const recorte = await recortar(pdf, { pagina: pagina1Based - 1, x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: 1024 });

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

  return { pagina: pagina1Based, papel, bruto, tokensEntrada, tokensSaida, custoUsd, ms: performance.now() - t0 };
}
