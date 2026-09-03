// Gera embedding de UMA consulta de busca (não de indexação) — mesma família de modelo já
// usada em app/api/bdi/indexar-lei/route.ts (EMBED_MODEL/EMBED_DIM duplicados aqui de
// propósito: são constantes primitivas, e importar de dentro de app/api/.../route.ts pra um
// lib/ é frágil no Next.js — se um dia mudar lá, tem que mudar aqui também).
//
// taskType "RETRIEVAL_QUERY" (não "RETRIEVAL_DOCUMENT", usado na indexação) — é o par
// assimétrico correto da API do Gemini para embedding de busca contra embedding de documento
// já indexado; usar o taskType errado não quebra, só piora a qualidade do ranking.
//
// NUNCA chame isto num loop automático (ex.: a cada tecla digitada) — cada chamada é uma
// requisição real à Gemini, com custo real. Quem chama decide quando vale a pena.
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

export type ResultadoEmbeddingConsulta =
  | { status: "ok"; vetor: number[] }
  | { status: "erro"; motivo: string };

export async function gerarEmbeddingConsulta(
  texto: string,
  apiKey: string,
): Promise<ResultadoEmbeddingConsulta> {
  const limpo = texto.trim();
  if (!limpo) return { status: "erro", motivo: "texto de consulta vazio." };
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
    const body = {
      model: `models/${EMBED_MODEL}`,
      content: { role: "user", parts: [{ text: limpo }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBED_DIM,
    };
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return { status: "erro", motivo: `Gemini ${resp.status}: ${t.slice(0, 300)}` };
    }
    const json = await resp.json();
    const vetor = json?.embedding?.values;
    if (!Array.isArray(vetor) || vetor.length !== EMBED_DIM) {
      return { status: "erro", motivo: `embedding com formato inesperado (dimensão ${Array.isArray(vetor) ? vetor.length : "desconhecida"}, esperado ${EMBED_DIM}).` };
    }
    return { status: "ok", vetor };
  } catch (e: any) {
    return { status: "erro", motivo: e?.message ?? "falha técnica ao gerar embedding." };
  }
}

export { EMBED_DIM as DIMENSAO_EMBEDDING_BIP };
