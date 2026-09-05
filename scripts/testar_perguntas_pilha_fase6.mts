/**
 * scripts/testar_perguntas_pilha_fase6.mts — Fase 6 do mandato de 12 fases (05/09/2026):
 * completar as perguntas factuais da Pilha. Valida com dado real que:
 *  - as perguntas NOVAS respondem sem Gemini;
 *  - TODA resposta traz cobertura + data da pré-análise + confirmação de Gemini (rodapé único).
 *
 * Complementa scripts/testar_perguntas_pilha.mts (Camada 2 original) — não repete os testes
 * daquele arquivo, só cobre o que a Fase 6 acrescentou.
 *
 *   npx tsx --env-file=.env.local scripts/testar_perguntas_pilha_fase6.mts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { processarProximoPendente, type VisibilidadeUsuario } from "../lib/urbi/radar";
import { responderPerguntaPilha } from "../lib/urbi/perguntasPilha";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };

// Garante que pelo menos 1 processo real tem retrato fresco antes de testar (mesma necessidade
// já documentada em testar_perguntas_pilha.mts/testar_linha_evidencia.mts).
await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", "25.5.000046759-5").eq("estado", "pendente");
await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: "25.5.000046759-5", tipo_processo: "regularizacao", versao: 1, estado: "pendente", motivo_disparo: "teste fase 6", criado_em: new Date(Date.now() - 999_000_000).toISOString() });
await processarProximoPendente(ADMIN);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · perguntas novas respondem (não caem no fluxo normal)");
const PERGUNTAS_NOVAS = [
  "quais aguardam retorno?",
  "quais têm menos pendências?",
  "quais têm retrato desatualizado?",
  "quais sofreram mudança de catálogo?",
  "quais não têm base jurídica suficiente?",
  "quais retornaram sem nova análise?",
];
for (const pergunta of PERGUNTAS_NOVAS) {
  const resposta = await responderPerguntaPilha(pergunta, ADMIN);
  t(`"${pergunta}" → respondida (nunca null)`, typeof resposta === "string" && resposta.length > 0, String(resposta));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · TODA resposta traz cobertura + data da pré-análise + confirmação de Gemini (rodapé único)");
for (const pergunta of [...PERGUNTAS_NOVAS, "quais têm onerosa?", "qual está mais perto de emitir?"]) {
  const resposta = await responderPerguntaPilha(pergunta, ADMIN);
  t(`"${pergunta}" → declara cobertura (X de Y)`, /Cobertura: \d+ de \d+/.test(resposta ?? ""), resposta ?? "");
  t(`"${pergunta}" → declara data da última pré-análise`, /última pré-análise:/.test(resposta ?? ""), resposta ?? "");
  t(`"${pergunta}" → confirma que Gemini não foi acionado`, /Gemini não foi acionado/.test(resposta ?? ""), resposta ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · pergunta fora do escopo continua devolvendo null (rodapé não se aplica a resposta nenhuma)");
{
  const resposta = await responderPerguntaPilha("qual é a capital da frança?", ADMIN);
  t("devolve null, não inventa nem anexa rodapé a nada", resposta === null);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · zero chamada Gemini");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  for (const pergunta of PERGUNTAS_NOVAS) await responderPerguntaPilha(pergunta, ADMIN);
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
