/**
 * lib/documentosSei/interpretacaoAssistidaFluxo.ts — Fase 13 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("Interpretação assistida": IA cruzando as
 * estatísticas do Módulo de Análise de Fluxo — lib/documentosSei/analiseFluxo.ts — para propor
 * melhorias).
 *
 * Escrito e pronto em 11/09/2026, a pedido do Fábio, mas INERTE de propósito — o próprio plano
 * (§9, tabela de riscos) escreve a mitigação para "IA opinando sobre base estatística pequena":
 * "Fase 13 só depois da carga do acervo e de meses de operação". No dia em que isto foi escrito,
 * a base tinha 101 processos, carregados NO MESMO DIA (Fase 10) — o oposto de "meses de
 * operação". Por isso dois portões, não um:
 *
 *   1. `interpretacaoAssistidaFluxoAtiva()` — interruptor manual em `urbis_config`, false por
 *      padrão (mesmo padrão de todo o resto do plano).
 *   2. `avaliarProntidaoBase()` — portão OBJETIVO, medido nos dados, que nem o Fábio pode ligar
 *      antes da hora sem editar este arquivo: exige um mínimo de processos distintos E um mínimo
 *      de dias desde a carga do PRIMEIRO evento em `fluxo_processo_eventos`.
 *
 * A rota que usa isto (`/api/admin/fluxo/interpretar`) checa os dois antes de gastar um tostão
 * com o Gemini. Nunca escreve nada sozinha: a saída é sempre proposta de leitura, para o analista
 * avaliar como plausível ou não — mesmo princípio de todas as fases anteriores.
 */
import { GEMINI_MODEL } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { registrarChamadaIA } from "@/lib/iaUso";
import type { AnalisePortfolio } from "./analiseFluxo";

export async function interpretacaoAssistidaFluxoAtiva(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("urbis_config")
    .select("interpretacao_assistida_fluxo_ativo")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return false;
  return (data as any).interpretacao_assistida_fluxo_ativo === true;
}

/** Critérios do portão objetivo — únicos números que decidem "chegou a hora". Mudar isto é uma
 *  decisão do Fábio, não um ajuste de código: qualquer alteração merece registro no OBS COD. */
export const MINIMO_PROCESSOS_PARA_INTERPRETACAO = 150;
export const MINIMO_DIAS_DESDE_PRIMEIRA_CARGA = 90; // ~3 meses, "meses de operação" do §9

export type ProntidaoBase = {
  pronta: boolean;
  totalProcessos: number;
  diasDesdePrimeiraCarga: number | null;
  motivos: string[];
};

export function avaliarProntidaoBase(
  totalProcessos: number,
  primeiraCargaEm: string | null,
): ProntidaoBase {
  const diasDesdePrimeiraCarga = primeiraCargaEm
    ? Math.floor((Date.now() - Date.parse(primeiraCargaEm)) / 86_400_000)
    : null;

  const motivos: string[] = [];
  if (totalProcessos < MINIMO_PROCESSOS_PARA_INTERPRETACAO) {
    motivos.push(
      `Só ${totalProcessos} processo(s) na base — precisa de pelo menos ${MINIMO_PROCESSOS_PARA_INTERPRETACAO}.`,
    );
  }
  if (diasDesdePrimeiraCarga === null || diasDesdePrimeiraCarga < MINIMO_DIAS_DESDE_PRIMEIRA_CARGA) {
    const dias = diasDesdePrimeiraCarga ?? 0;
    motivos.push(
      `Só ${dias} dia(s) desde a primeira carga — precisa de pelo menos ${MINIMO_DIAS_DESDE_PRIMEIRA_CARGA} (§9 do plano: "meses de operação").`,
    );
  }

  return { pronta: motivos.length === 0, totalProcessos, diasDesdePrimeiraCarga, motivos };
}

/**
 * Prompt puro — não chama nada, só monta o texto. Pedido explícito: SUGESTÕES, nunca comando;
 * o formato de saída pede justificativa e nunca decisão automática, porque isto nunca vai gravar
 * nada sozinho.
 */
export function montarPromptInterpretacaoFluxo(portfolio: AnalisePortfolio): string {
  return `Você está olhando para as estatísticas agregadas do fluxo de processos administrativos de
uma prefeitura (Módulo de Análise de Fluxo, Regularização e Aceite SEI). Os dados abaixo já foram
calculados por código determinístico (mediana, não média — um processo esquecido anos num setor
não pode distorcer o retrato do caso comum); você não está vendo processo nenhum individualmente,
só o agregado.

DADOS:
${JSON.stringify(portfolio, null, 2)}

Proponha até 5 melhorias operacionais concretas, cada uma com:
- "observacao": o padrão nos dados que motiva a sugestão (cite o número).
- "sugestao": o que mudar na rotina do setor ou do processo.
- "confianca": "alta" | "media" | "baixa" — alta só se o número for claro e a amostra não for
  pequena; baixa se a base ainda for fina para generalizar.

Regra inegociável: você está PROPONDO para um analista humano avaliar, nunca decidindo por ele.
Nunca afirme causa sem o dado provar — "setor X demora mais" é fato; "setor X é ineficiente" é
opinião que os números sozinhos não sustentam. Responda só com JSON: um array de objetos no
formato acima.`;
}

export type SugestaoInterpretacao = { observacao: string; sugestao: string; confianca: "alta" | "media" | "baixa" };

/**
 * Chama o Gemini (texto puro, sem PDF/visão) com o prompt acima e registra o custo em
 * `registrarChamadaIA` — mesma trilha de auditoria de uso que todo o resto do URBIS usa
 * (ver memória "urbis_ia_uso_tracking"). Não grava nada no processo nem em tabela nenhuma: a
 * chamada devolve a proposta, quem decide o que fazer com ela é o Administrador na tela.
 */
export async function interpretarPortfolio(
  portfolio: AnalisePortfolio,
): Promise<{ ok: true; sugestoes: SugestaoInterpretacao[] } | { ok: false; erro: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, erro: "GEMINI_API_KEY não configurada." };

  const prompt = montarPromptInterpretacaoFluxo(portfolio);
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    await registrarChamadaIA({
      modulo: "ANALISE_FLUXO", operacao: "interpretacao_assistida", modelo: GEMINI_MODEL,
      duracaoMs: Date.now() - t0, status: "erro", motivoErro: err.slice(0, 500),
    });
    return { ok: false, erro: err };
  }

  const data = await res.json();
  await registrarChamadaIA({
    modulo: "ANALISE_FLUXO", operacao: "interpretacao_assistida", modelo: GEMINI_MODEL,
    duracaoMs: Date.now() - t0, status: "ok",
    tokensEntrada: data.usageMetadata?.promptTokenCount ?? null,
    tokensSaida: data.usageMetadata?.candidatesTokenCount ?? null,
  });

  const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const bruto = texto.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  let sugestoes: SugestaoInterpretacao[] = [];
  try {
    const parsed = JSON.parse(bruto);
    if (Array.isArray(parsed)) {
      sugestoes = parsed.filter(
        (s) => s && typeof s.observacao === "string" && typeof s.sugestao === "string",
      ).map((s) => ({
        observacao: s.observacao,
        sugestao: s.sugestao,
        confianca: s.confianca === "alta" || s.confianca === "media" || s.confianca === "baixa" ? s.confianca : "baixa",
      }));
    }
  } catch {
    return { ok: false, erro: "Resposta da IA não veio em JSON válido." };
  }

  return { ok: true, sugestoes };
}
