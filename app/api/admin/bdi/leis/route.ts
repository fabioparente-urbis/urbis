// app/api/admin/bdi/leis/route.ts
//
// Gerenciador de leis do BDI — endpoints "list" e "create".
//
// GET    /api/admin/bdi/leis        -> lista todas as leis com fragmentos_count
// POST   /api/admin/bdi/leis        -> cria uma nova lei (JSON ou multipart)
//
// Edicao, exclusao e reindexacao moram em [id]/route.ts e
// [id]/reindexar/route.ts. Verificacao de referencias (checklist) em
// [id]/referencias/route.ts.
//
// Acesso: somente perfis irrestritos (Administrador / Diretora) via
// `autenticar` de lib/auth.ts. Cookie httpOnly `urbis_id` e a fonte
// de autoridade.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Catalogo canonico de tipos aceitos em bdi_documentos_lei.tipo.
const TIPOS_VALIDOS = new Set([
  "lei_complementar",
  "lei_ordinaria",
  "decreto",
  "instrucao_normativa",
  "instrucao_aeronautica",
  "nbr",
  "coletanea",
  "plano_diretor",
]);

export async function GET(req: NextRequest) {
  // 1. Autenticacao + autorizacao
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  // 2. Lista das leis — select * para tolerar variacoes do schema.
  const { data: leis, error: errLeis } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .select("*")
    .order("titulo", { ascending: true });

  if (errLeis) {
    return NextResponse.json(
      { ok: false, erro: errLeis.message },
      { status: 500 },
    );
  }

  const lista = leis ?? [];
  if (lista.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  // 3. Contagem de fragmentos por documento_id. O Supabase JS nao tem
  //    group-by direto, entao tras a lista de ids e conta em memoria.
  const ids = lista.map((l: any) => l.id).filter(Boolean);
  const { data: frags, error: errFrags } = await supabaseAdmin
    .from("bdi_lei_fragmentos")
    .select("documento_id")
    .in("documento_id", ids);

  if (errFrags) {
    return NextResponse.json(
      { ok: false, erro: errFrags.message },
      { status: 500 },
    );
  }

  const contagem = new Map<string, number>();
  for (const f of frags ?? []) {
    const id = (f as any).documento_id as string | null;
    if (!id) continue;
    contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }

  const data = lista.map((l: any) => ({
    ...l,
    fragmentos_count: contagem.get(l.id) ?? 0,
  }));

  return NextResponse.json({ ok: true, data });
}

/**
 * POST /api/admin/bdi/leis
 *
 * Aceita JSON ou multipart/form-data:
 *   - titulo  (obrigatorio)
 *   - tipo    (obrigatorio — um dos 7 tipos do catalogo)
 *   - numero  (opcional)
 *   - ano     (opcional, integer)
 *   - ementa  (opcional)
 *   - pdf     (opcional, File) - em multipart, dispara upload+indexacao.
 *
 * Resposta:
 *   { ok: true, data: <lei criada>, indexacao?: { ok, fragmentos_indexados, ... } }
 *
 * Se PDF for enviado, a indexacao roda inline. Em caso de falha so na
 * indexacao, a lei ja foi criada e a resposta retorna `ok: true` com
 * `indexacao.ok = false` para o cliente decidir como reagir.
 */
export async function POST(req: NextRequest) {
  // 1. Autenticacao
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  // 2. Parse de input — JSON ou multipart
  let titulo: string | undefined;
  let tipo: string | undefined;
  let numero: string | null = null;
  let ano: number | null = null;
  let ementa: string | null = null;
  let pdfFile: File | null = null;

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      titulo = (form.get("titulo") as string | null)?.trim() || undefined;
      tipo = (form.get("tipo") as string | null)?.trim() || undefined;
      numero = ((form.get("numero") as string | null) ?? "").trim() || null;
      const anoStr = ((form.get("ano") as string | null) ?? "").trim();
      ano = anoStr ? parseInt(anoStr, 10) : null;
      if (ano !== null && Number.isNaN(ano)) ano = null;
      ementa = ((form.get("ementa") as string | null) ?? "").trim() || null;
      const f = form.get("pdf");
      if (f instanceof File && f.size > 0) pdfFile = f;
    } else {
      const body = await req.json();
      titulo = body?.titulo ? String(body.titulo).trim() : undefined;
      tipo = body?.tipo ? String(body.tipo).trim() : undefined;
      numero = body?.numero != null ? String(body.numero).trim() || null : null;
      ano = body?.ano != null && body.ano !== "" ? Number(body.ano) : null;
      if (ano !== null && Number.isNaN(ano)) ano = null;
      ementa = body?.ementa != null ? String(body.ementa).trim() || null : null;
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, erro: `Body invalido: ${e?.message ?? "erro de parsing"}` },
      { status: 400 },
    );
  }

  // 3. Validacoes
  if (!titulo) {
    return NextResponse.json(
      { ok: false, erro: "Campo `titulo` e obrigatorio." },
      { status: 400 },
    );
  }
  if (!tipo) {
    return NextResponse.json(
      { ok: false, erro: "Campo `tipo` e obrigatorio." },
      { status: 400 },
    );
  }
  if (!TIPOS_VALIDOS.has(tipo)) {
    return NextResponse.json(
      {
        ok: false,
        erro: `Tipo invalido. Use um de: ${[...TIPOS_VALIDOS].join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (ano !== null && (ano < 1800 || ano > 2100)) {
    return NextResponse.json(
      { ok: false, erro: "Ano fora do intervalo plausivel (1800-2100)." },
      { status: 400 },
    );
  }

  // 4. Insert na tabela
  const payload: Record<string, any> = {
    titulo,
    tipo,
    numero,
    ano,
    ementa,
    status_indexacao: "pendente",
  };

  const { data: inserida, error: errIns } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .insert(payload)
    .select("*")
    .single();

  if (errIns || !inserida) {
    return NextResponse.json(
      { ok: false, erro: errIns?.message ?? "Falha ao criar lei." },
      { status: 500 },
    );
  }

  // 5. Se um PDF foi enviado, dispara a indexacao por chamada interna ao
  //    endpoint `/api/bdi/indexar-lei`. Reaproveita-se o pipeline existente
  //    (upload R2 + fragmentacao + embeddings) sem duplicar logica.
  let indexacao: any = null;
  if (pdfFile) {
    try {
      const fd = new FormData();
      fd.append("documento_id", (inserida as any).id);
      fd.append("pdf", pdfFile);
      const origin = new URL(req.url).origin;
      const cookie = req.headers.get("cookie") || "";
      const resp = await fetch(`${origin}/api/bdi/indexar-lei`, {
        method: "POST",
        body: fd,
        headers: { cookie },
      });
      indexacao = await resp.json().catch(() => ({ ok: false, erro: "resposta nao-JSON" }));
    } catch (e: any) {
      indexacao = { ok: false, erro: e?.message ?? "Falha ao disparar indexacao." };
    }
  }

  return NextResponse.json({ ok: true, data: inserida, indexacao });
}
