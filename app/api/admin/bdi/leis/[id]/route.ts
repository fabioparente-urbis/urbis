// app/api/admin/bdi/leis/[id]/route.ts
//
// Endpoints por ID:
//   PUT    /api/admin/bdi/leis/:id   -> edita metadados (sem re-indexar)
//   DELETE /api/admin/bdi/leis/:id   -> remove R2 + fragmentos + lei
//
// DELETE seguro: por padrao, retorna 409 se houver referencias em
// `mac_checklist_itens.ref` apontando para a lei. Para forcar a exclusao
// apos confirmacao do usuario, passe `?force=1` ou body { force: true }.
//
// Acesso: somente perfis irrestritos (Administrador / Diretora).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { deleteFromR2, keyFromUrl } from "@/lib/r2";
import { buscarReferenciasChecklist } from "../_referencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Whitelist de colunas editaveis no PUT. Reindexacao tem endpoint proprio.
const COLUNAS_EDITAVEIS = new Set([
  "titulo",
  "tipo",
  "numero",
  "ano",
  "ementa",
]);

/**
 * PUT /api/admin/bdi/leis/:id
 *
 * Body JSON com qualquer subconjunto de { titulo, tipo, numero, ano, ementa }.
 * Nao re-indexa: e edicao de metadados pura. Os fragmentos existentes nao
 * sao tocados.
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, erro: "Parametro id ausente." },
      { status: 400 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, erro: "Body JSON invalido." },
      { status: 400 },
    );
  }

  const patch: Record<string, any> = {};
  for (const k of Object.keys(body ?? {})) {
    if (!COLUNAS_EDITAVEIS.has(k)) continue;
    let v = body[k];
    if (typeof v === "string") v = v.trim();
    if (k === "ano") {
      if (v === "" || v === null || v === undefined) v = null;
      else v = Number(v);
      if (v !== null && Number.isNaN(v)) {
        return NextResponse.json(
          { ok: false, erro: "Ano invalido." },
          { status: 400 },
        );
      }
      if (v !== null && (v < 1800 || v > 2100)) {
        return NextResponse.json(
          { ok: false, erro: "Ano fora do intervalo plausivel (1800-2100)." },
          { status: 400 },
        );
      }
    }
    if (k === "tipo" && v && !TIPOS_VALIDOS.has(v)) {
      return NextResponse.json(
        { ok: false, erro: `Tipo invalido: ${v}` },
        { status: 400 },
      );
    }
    if ((k === "numero" || k === "ementa") && v === "") v = null;
    patch[k] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum campo editavel fornecido." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, erro: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, erro: "Lei nao encontrada." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * DELETE /api/admin/bdi/leis/:id?force=1
 *
 * Sem `force`, retorna 409 com a lista de itens de checklist que referenciam
 * a lei. Com `force=1`, executa:
 *   1) DELETE de bdi_lei_fragmentos (FK + idempotente)
 *   2) DELETE do PDF no R2 (se url_pdf presente)
 *   3) DELETE da bdi_documentos_lei
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, erro: "Parametro id ausente." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(req.url);
  let force = searchParams.get("force") === "1" || searchParams.get("force") === "true";
  // Aceita tambem `{ force: true }` em body (DELETE com body e permitido)
  if (!force) {
    try {
      const body = await req.json().catch(() => null);
      if (body && body.force === true) force = true;
    } catch {
      // ignora
    }
  }

  // 1. Carrega a lei (precisamos do url_pdf para apagar do R2)
  const { data: lei, error: errSel } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errSel) {
    return NextResponse.json(
      { ok: false, erro: errSel.message },
      { status: 500 },
    );
  }
  if (!lei) {
    return NextResponse.json(
      { ok: false, erro: "Lei nao encontrada." },
      { status: 404 },
    );
  }

  // 2. Se nao houve confirmacao via force, verifica referencias.
  if (!force) {
    const refs = await buscarReferenciasChecklist(lei);
    if (refs.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          erro: "Existem itens de checklist que referenciam esta lei. Confirme a exclusao com `force=1`.",
          referencias: refs,
        },
        { status: 409 },
      );
    }
  }

  // 3. DELETE fragmentos (idempotente; nao bloqueia se nao houver)
  const { error: errFrag } = await supabaseAdmin
    .from("bdi_lei_fragmentos")
    .delete()
    .eq("documento_id", id);
  if (errFrag) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao remover fragmentos: ${errFrag.message}` },
      { status: 500 },
    );
  }

  // 4. DELETE PDF no R2 (se houver url_pdf que aponte para o bucket)
  let r2Removido = false;
  const url = (lei as any).url_pdf as string | null;
  if (url) {
    const key = keyFromUrl(url);
    if (key) {
      try {
        await deleteFromR2(key);
        r2Removido = true;
      } catch (e: any) {
        // Nao aborta a exclusao da lei se o R2 falhar — o registro precisa
        // sair de cena. Logamos para auditoria.
        console.warn(`[bdi-leis DELETE] falha no R2 para lei ${id}:`, e?.message);
      }
    }
  }

  // 5. DELETE lei
  const { error: errLei } = await supabaseAdmin
    .from("bdi_documentos_lei")
    .delete()
    .eq("id", id);
  if (errLei) {
    return NextResponse.json(
      { ok: false, erro: `Falha ao remover lei: ${errLei.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, r2_removido: r2Removido });
}
