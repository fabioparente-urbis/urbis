// app/api/bdi/indexar-lei/route.ts
//
// Endpoint: POST /api/bdi/indexar-lei
// Body: multipart/form-data
//   - documento_id : UUID (FK -> bdi_documentos_lei.id)
//   - pdf          : File (PDF da lei)
//
// Fluxo:
//   1. Valida input e busca o documento (incl. tipo / numero / ano).
//   2. Extrai texto do PDF (pdf-parse, sem OCR).
//   3. Fragmenta o texto conforme o tipo do documento:
//        - 'nbr' ou 'instrucao_aeronautica' -> seções numéricas
//          (regex `^\d+(\.\d+)*\s`), ex.: 4, 4.1, 4.1.1.
//        - demais tipos -> artigos (regex `^Art\.?\s*N...`).
//   4. Gera embeddings via Gemini text-embedding-004 em lotes de 100,
//      com retry exponencial em 429.
//   5. Apaga fragmentos antigos do documento (idempotência) e insere os novos.
//   6. Marca status_indexacao = 'indexado' (ou 'erro').

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import pdf from 'pdf-parse';

// -------------------------------------------------------------------
// Config
// -------------------------------------------------------------------

export const runtime = 'nodejs';        // pdf-parse não roda no Edge
export const maxDuration = 300;          // Vercel Pro: até 300s
export const dynamic = 'force-dynamic';

const EMBED_MODEL = 'text-embedding-004';
const EMBED_DIM = 768;
const BATCH_SIZE = 100;                  // limite prático do batchEmbedContents
const MAX_RETRIES = 5;
const DB_INSERT_BATCH = 500;
const MIN_FRAGMENTO_LEN = 20;            // descarta lixo (cabeçalho, página)

// -------------------------------------------------------------------
// Clientes
// -------------------------------------------------------------------

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars ausentes');
  return createClient(url, key, { auth: { persistSession: false } });
}

function getGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY ausente');
  return new GoogleGenerativeAI(key);
}

// -------------------------------------------------------------------
// Chunker — fragmenta por artigo (leis) ou por seção numérica (normas)
// -------------------------------------------------------------------

interface Fragmento {
  referencia: string;
  texto: string;
}

interface DocumentoMeta {
  tipo?: string | null;
  numero?: string | null;
  ano?: string | number | null;
  titulo?: string | null;
}

/** Tipos cujo texto é estruturado em seções numéricas (4, 4.1, 4.1.1 ...). */
const TIPOS_SECAO_NUMERICA = new Set(['nbr', 'instrucao_aeronautica']);

/** Normaliza o texto bruto vindo do PDF para um formato consistente. */
function normalizarTexto(textoBruto: string): string {
  return textoBruto
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Regex de "Art." ancorada em início de linha, tolerante a:
 *   Art. 1, Art. 1º, Art. 1.º, Art. 1o, Art. 10-A, Art 5
 * Não captura citações no meio da frase (ex: "...conforme Art. 14 da LC...").
 */
const RE_ARTIGO = /^Art\.?\s*(\d+(?:[\-–][A-Z])?)[ºo]?\.?[\s,.\-–:]/gm;

function chunkPorArtigo(textoBruto: string): Fragmento[] {
  const texto = normalizarTexto(textoBruto);

  const matches: Array<{ index: number; numero: string }> = [];
  let m: RegExpExecArray | null;
  RE_ARTIGO.lastIndex = 0;
  while ((m = RE_ARTIGO.exec(texto)) !== null) {
    matches.push({ index: m.index, numero: m[1] });
  }

  if (matches.length === 0) return [];

  const fragmentos: Fragmento[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : texto.length;
    const corpo = texto.slice(start, end).trim();
    if (corpo.length < MIN_FRAGMENTO_LEN) continue;
    fragmentos.push({
      referencia: `Art. ${matches[i].numero}`,
      texto: corpo,
    });
  }
  return fragmentos;
}

/**
 * Regex de seção numérica (NBR / instrução aeronáutica), ancorada em início
 * de linha. Aceita 1+ níveis hierárquicos (`4`, `4.1`, `4.1.1`, ...) e exige
 * espaço/tab seguido de conteúdo não-branco — evita falsos positivos como
 * números de página soltos na linha (`4\n`).
 */
const RE_SECAO_NUMERICA = /^(\d+(?:\.\d+)*)[ \t]+(?=\S)/gm;

/** Monta o prefixo canônico da referência conforme o tipo do documento. */
function prefixoReferencia(meta: DocumentoMeta): string {
  const tipo = (meta.tipo ?? '').toLowerCase();
  const numero = meta.numero ? String(meta.numero).trim() : '';
  const ano = meta.ano != null ? String(meta.ano).trim() : '';

  if (tipo === 'nbr') {
    if (numero && ano) return `NBR ${numero}:${ano}`;
    if (numero) return `NBR ${numero}`;
    return meta.titulo?.trim() || 'NBR';
  }
  if (tipo === 'instrucao_aeronautica') {
    // Instruções aeronáuticas variam (IAC, ICA, MCA). Sem um campo dedicado de
    // sigla, caímos no titulo (ou em "Instrução Aeronáutica" como fallback).
    return meta.titulo?.trim() || 'Instrução Aeronáutica';
  }
  return meta.titulo?.trim() || '';
}

function chunkPorSecaoNumerica(
  textoBruto: string,
  meta: DocumentoMeta
): Fragmento[] {
  const texto = normalizarTexto(textoBruto);

  const matches: Array<{ index: number; secao: string }> = [];
  let m: RegExpExecArray | null;
  RE_SECAO_NUMERICA.lastIndex = 0;
  while ((m = RE_SECAO_NUMERICA.exec(texto)) !== null) {
    matches.push({ index: m.index, secao: m[1] });
  }

  if (matches.length === 0) return [];

  const prefixo = prefixoReferencia(meta);
  const fragmentos: Fragmento[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : texto.length;
    const corpo = texto.slice(start, end).trim();
    if (corpo.length < MIN_FRAGMENTO_LEN) continue;
    const sec = matches[i].secao;
    const referencia = prefixo
      ? `${prefixo} - Seção ${sec}`
      : `Seção ${sec}`;
    fragmentos.push({ referencia, texto: corpo });
  }
  return fragmentos;
}

/** Dispatch principal — escolhe o chunker conforme `meta.tipo`. */
function fragmentar(textoBruto: string, meta: DocumentoMeta): Fragmento[] {
  const tipo = (meta.tipo ?? '').toLowerCase();
  if (TIPOS_SECAO_NUMERICA.has(tipo)) {
    return chunkPorSecaoNumerica(textoBruto, meta);
  }
  return chunkPorArtigo(textoBruto);
}

// -------------------------------------------------------------------
// Gemini — batch + retry 429
// -------------------------------------------------------------------

async function embedBatch(
  fragmentos: Fragmento[],
  ai: GoogleGenerativeAI
): Promise<number[][]> {
  const model = ai.getGenerativeModel({ model: EMBED_MODEL });

  let attempt = 0;
  while (true) {
    try {
      const res = await model.batchEmbedContents({
        requests: fragmentos.map((f) => ({
          content: { role: 'user', parts: [{ text: f.texto }] },
          taskType: TaskType.RETRIEVAL_DOCUMENT,
          title: f.referencia,
        })),
      });
      return res.embeddings.map((e) => e.values);
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        /quota|rate.?limit|429|RESOURCE_EXHAUSTED/i.test(err?.message ?? '');
      if (!isRateLimit || attempt >= MAX_RETRIES) throw err;
      const delay = Math.min(2 ** attempt * 1000, 32000) + Math.random() * 500;
      console.warn(
        `[indexar-lei] 429 da Gemini — retry em ${Math.round(delay)}ms (tentativa ${attempt + 1}/${MAX_RETRIES})`
      );
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}

async function embedAll(
  fragmentos: Fragmento[],
  ai: GoogleGenerativeAI
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < fragmentos.length; i += BATCH_SIZE) {
    const slice = fragmentos.slice(i, i + BATCH_SIZE);
    const vecs = await embedBatch(slice, ai);
    out.push(...vecs);
  }
  return out;
}

// -------------------------------------------------------------------
// Handler
// -------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // TODO: auth — confirmar que o usuário é admin do BDI antes de prosseguir.
  // Ex.: const session = await getServerSession(authOptions);
  //      if (!session || session.user.role !== 'admin') return 401.

  let documentoId: string;
  let buffer: Buffer;
  let fileName = 'desconhecido.pdf';

  try {
    const form = await req.formData();
    const idRaw = form.get('documento_id');
    const file = form.get('pdf');

    if (typeof idRaw !== 'string' || !idRaw) {
      return NextResponse.json(
        { erro: 'documento_id (UUID) é obrigatório' },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { erro: 'pdf (File em multipart/form-data) é obrigatório' },
        { status: 400 }
      );
    }
    documentoId = idRaw;
    fileName = file.name || fileName;
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (e: any) {
    return NextResponse.json(
      { erro: `formdata inválido: ${e.message}` },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const ai = getGemini();

  // 1. Confirma que o documento existe (tipo / numero / ano guiam o chunker
  //    e a montagem da referência canônica dos fragmentos).
  const { data: doc, error: errDoc } = await supabase
    .from('bdi_documentos_lei')
    .select('id, titulo, tipo, numero, ano, status_indexacao')
    .eq('id', documentoId)
    .single();

  if (errDoc || !doc) {
    return NextResponse.json(
      { erro: 'documento_id não encontrado em bdi_documentos_lei' },
      { status: 404 }
    );
  }

  try {
    // 2. Extrai texto do PDF (digital, sem OCR)
    const pdfData = await pdf(buffer);
    const textoBruto = pdfData.text ?? '';
    if (!textoBruto || textoBruto.length < 100) {
      throw new Error(
        'PDF vazio ou ilegível — pode ser escaneado (OCR não habilitado neste pipeline)'
      );
    }

    // 3. Fragmenta conforme o tipo do documento
    const meta: DocumentoMeta = {
      tipo: (doc as any).tipo ?? null,
      numero: (doc as any).numero ?? null,
      ano: (doc as any).ano ?? null,
      titulo: doc.titulo ?? null,
    };
    const fragmentos = fragmentar(textoBruto, meta);
    if (fragmentos.length === 0) {
      const tipoLc = (meta.tipo ?? '').toLowerCase();
      const padrao = TIPOS_SECAO_NUMERICA.has(tipoLc)
        ? 'seção numérica (ex.: "4.1 ...") no início de linha'
        : 'padrão "Art. N" no início de linha';
      throw new Error(`nenhum fragmento identificado (${padrao} não encontrado)`);
    }

    // 4. Embeddings em lote
    const vetores = await embedAll(fragmentos, ai);

    if (vetores.length !== fragmentos.length) {
      throw new Error(
        `mismatch: ${fragmentos.length} fragmentos vs ${vetores.length} embeddings`
      );
    }
    if (vetores[0]?.length !== EMBED_DIM) {
      throw new Error(
        `dimensão inesperada do embedding: ${vetores[0]?.length} (esperado ${EMBED_DIM})`
      );
    }

    // 5. Reindexação idempotente — apaga fragmentos antigos
    const { error: errDel } = await supabase
      .from('bdi_lei_fragmentos')
      .delete()
      .eq('documento_id', documentoId);
    if (errDel) throw new Error(`limpeza falhou: ${errDel.message}`);

    // 6. Insere em batch
    const linhas = fragmentos.map((f, i) => ({
      documento_id: documentoId,
      referencia: f.referencia,
      texto: f.texto,
      embedding: vetores[i],
    }));

    for (let i = 0; i < linhas.length; i += DB_INSERT_BATCH) {
      const slice = linhas.slice(i, i + DB_INSERT_BATCH);
      const { error } = await supabase.from('bdi_lei_fragmentos').insert(slice);
      if (error) throw new Error(`insert falhou no bloco ${i}: ${error.message}`);
    }

    // 7. Marca como indexado
    await supabase
      .from('bdi_documentos_lei')
      .update({ status_indexacao: 'indexado' })
      .eq('id', documentoId);

    return NextResponse.json({
      ok: true,
      documento_id: documentoId,
      titulo: doc.titulo,
      arquivo: fileName,
      paginas: pdfData.numpages,
      fragmentos_indexados: fragmentos.length,
      duracao_ms: Date.now() - t0,
    });
  } catch (err: any) {
    console.error('[indexar-lei]', err);
    await supabase
      .from('bdi_documentos_lei')
      .update({ status_indexacao: 'erro' })
      .eq('id', documentoId);
    return NextResponse.json(
      {
        ok: false,
        erro: err?.message ?? 'falha desconhecida',
        documento_id: documentoId,
      },
      { status: 500 }
    );
  }
}
