/**
 * lib/mac-motor/slot5/gemini.ts — chamada ao Gemini ISOLADA e EXCLUSIVA do motor do Slot 5.
 *
 * Não importa nem é importado por `app/api/mac/p3/route.ts` (P3_MAC do Slot 1) nem por
 * `lib/visao/*` (MHD). O padrão de upload via Files API é o mesmo (é a API do provedor, não
 * lógica de negócio), mas o código é duplicado de propósito — regra suprema do usuário em
 * 2026-07-30: "não usar o prompt P3_MAC antigo por fallback" e "criar implementação própria,
 * isolada e versionada".
 *
 * Duas funções separadas de propósito: `chamarGemini` faz a rede (não testável sem mock de
 * fetch); `interpretarResposta` é pura e é o que os testes exercitam de verdade — parser de
 * JSON, rejeição de formato inválido, validação de fato.
 */

import type { DocumentoEntrada, FatoExtraido, ResultadoExtracao } from "./tipos";
import { hashPrompt, type PromptSlot5 } from "./prompts";

export class RespostaGeminiInvalidaError extends Error {}

/**
 * Faz o parse da resposta bruta do Gemini e valida a forma de cada fato. NUNCA lança em resposta
 * mal formada de um fato individual — marca esse fato como abstenção com o motivo do erro, para
 * que um fato ilegível não derrube os outros da mesma chamada (mesmo princípio de `lib/visao`:
 * abstenção é por campo, não pelo recorte inteiro).
 *
 * Lança RespostaGeminiInvalidaError só quando o JSON inteiro é ilegível ou não tem "fatos".
 */
export function interpretarResposta(textoBruto: string): FatoExtraido[] {
  const limpo = textoBruto.replace(/```json|```/g, "").trim();
  let json: any;
  try {
    json = JSON.parse(limpo);
  } catch (e: any) {
    throw new RespostaGeminiInvalidaError(`resposta não é JSON válido: ${e?.message}`);
  }
  if (!json || !Array.isArray(json.fatos)) {
    throw new RespostaGeminiInvalidaError('resposta não tem um array "fatos"');
  }

  const fatos: FatoExtraido[] = [];
  for (const bruto of json.fatos) {
    if (!bruto || typeof bruto.nome !== "string" || bruto.nome.trim() === "") {
      // fato sem nome não é atribuível a nada — descartado, não vira abstenção fantasma
      continue;
    }
    if (bruto.abstencao === true) {
      fatos.push({
        nome: bruto.nome,
        abstencao: true,
        motivo: typeof bruto.motivo === "string" ? bruto.motivo : "motivo não informado",
        documento: typeof bruto.documento === "string" ? bruto.documento : null,
      });
      continue;
    }
    if (typeof bruto.valor !== "string" || bruto.valor.trim() === "") {
      fatos.push({ nome: bruto.nome, abstencao: true, motivo: "campo 'valor' ausente ou vazio na resposta", documento: bruto.documento ?? null });
      continue;
    }
    const confiancaNum = Number(bruto.confianca);
    fatos.push({
      nome: bruto.nome,
      valor: bruto.valor,
      unidade: typeof bruto.unidade === "string" ? bruto.unidade : null,
      documento: typeof bruto.documento === "string" ? bruto.documento : "desconhecido",
      pagina: Number.isFinite(Number(bruto.pagina)) ? Number(bruto.pagina) : null,
      trecho: typeof bruto.trecho === "string" ? bruto.trecho : null,
      confianca: Number.isFinite(confiancaNum) ? Math.max(0, Math.min(1, confiancaNum)) : 0,
      observacao: typeof bruto.observacao === "string" ? bruto.observacao : null,
    });
  }
  return fatos;
}

/** Upload + generateContent no Gemini, mesma técnica de app/api/mac/p3/route.ts — implementação própria. */
export async function chamarGemini(
  documentos: DocumentoEntrada[],
  prompt: PromptSlot5,
  apiKey: string,
): Promise<ResultadoExtracao> {
  if (documentos.length === 0) {
    throw new Error("chamarGemini: nenhum documento informado");
  }

  const parts: any[] = [];
  for (const doc of documentos) {
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": doc.mimeType,
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Header-Content-Length": String(doc.bytes.byteLength),
          "X-Goog-Upload-Header-Content-Type": doc.mimeType,
        },
        body: Buffer.from(doc.bytes),
      },
    );
    if (!uploadRes.ok) {
      throw new Error(`upload Gemini falhou para ${doc.papel}: ${await uploadRes.text()}`);
    }
    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    if (!fileUri) throw new Error(`upload Gemini não retornou fileUri para ${doc.papel}`);
    parts.push({ fileData: { mimeType: doc.mimeType, fileUri } });
  }
  parts.push({ text: prompt.texto });

  const inicio = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${prompt.modelo}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: 32768, temperature: 0.1 },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini erro ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const bruto: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const fatos = interpretarResposta(bruto);

  return {
    fatos,
    modelo: prompt.modelo,
    promptId: prompt.id,
    promptVersao: prompt.versao,
    promptHash: hashPrompt(prompt),
    bruto,
    msModelo: Date.now() - inicio,
  };
}
