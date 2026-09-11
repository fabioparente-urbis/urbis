/**
 * app/api/documentos-sei/regras-identificacao/route.ts — CRUD das regras de identificação de
 * peça/documento do fatiador de PDF do SEI (Fase 4 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md).
 *
 * Mexe só em `documentos_sei_regras_identificacao` (migration
 * 2026_09_10_documentos_sei_regras_identificacao.sql). Toda escrita invalida o cache de
 * `lib/documentosSei/regrasIdentificacao.ts` para a regra valer na próxima leitura, sem esperar o
 * TTL nem publicação de versão.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { invalidarCacheRegras } from "@/lib/documentosSei/regrasIdentificacao";
import { ROTULO_PAPEL_PECA, type PapelPeca } from "@/lib/documentosSei/pecas";

export const runtime = "nodejs";

const TABELAS = ["peca", "conteudo"] as const;
type Tabela = (typeof TABELAS)[number];

const PAPEIS_PECA = (Object.keys(ROTULO_PAPEL_PECA) as PapelPeca[]).filter(
  (p) => p !== "classificacao_pendente",
);
const PAPEIS_CONTEUDO = ["busca", "vistoria", "foto"] as const;

const PAPEIS_POR_TABELA: Record<Tabela, readonly string[]> = {
  peca: PAPEIS_PECA,
  conteudo: PAPEIS_CONTEUDO,
};

const TABELA_AUSENTE =
  "a tabela de regras ainda não existe — rode a migration 2026_09_10_documentos_sei_regras_identificacao.sql";

/** Lista as regras + os catálogos de papel válido por tabela, para a tela montar os seletores. */
export async function GET(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const { data: regras, error } = await supabaseAdmin
    .from("documentos_sei_regras_identificacao").select("*").order("tabela").order("ordem").limit(500);
  if (error) {
    return NextResponse.json({ ok: false, erro: TABELA_AUSENTE, detalhe: error.message }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    regras: regras ?? [],
    papeisPorTabela: PAPEIS_POR_TABELA,
    rotulosPapelPeca: ROTULO_PAPEL_PECA,
  });
}

function compilarRegex(tabela: Tabela, fonte: string): RegExp {
  return tabela === "conteudo" ? new RegExp(fonte, "i") : new RegExp(fonte);
}

function normalizarCorpo(b: any): { erro: string } | {
  tabela: Tabela; papel: string; regex: string; descricao: string | null; ordem: number; ativo: boolean;
} {
  const tabela = TABELAS.includes(b.tabela) ? (b.tabela as Tabela) : null;
  if (!tabela) return { erro: "tabela precisa ser 'peca' ou 'conteudo'" };

  const papel = String(b.papel ?? "").trim();
  if (!PAPEIS_POR_TABELA[tabela].includes(papel)) {
    return { erro: `papel "${papel}" não é reconhecido pelo código para a tabela "${tabela}"` };
  }

  const regex = String(b.regex ?? "").trim();
  if (!regex) return { erro: "regex obrigatória" };
  try {
    compilarRegex(tabela, regex);
  } catch (e: any) {
    return { erro: `regex inválida: ${e?.message ?? e}` };
  }

  return {
    tabela, papel, regex,
    descricao: b.descricao ? String(b.descricao) : null,
    ordem: Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 100,
    ativo: b.ativo !== false,
  };
}

export async function POST(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const corpo = normalizarCorpo(await req.json().catch(() => ({})));
  if ("erro" in corpo) return NextResponse.json({ ok: false, erro: corpo.erro }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("documentos_sei_regras_identificacao").insert({ ...corpo, criado_por: usuario.id }).select().maybeSingle();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  invalidarCacheRegras(corpo.tabela);
  return NextResponse.json({ ok: true, regra: data });
}

export async function PUT(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body?.id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const corpo = normalizarCorpo(body);
  if ("erro" in corpo) return NextResponse.json({ ok: false, erro: corpo.erro }, { status: 400 });

  const { error } = await supabaseAdmin.from("documentos_sei_regras_identificacao")
    .update({ ...corpo, atualizado_em: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  invalidarCacheRegras(corpo.tabela);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const { data: existente } = await supabaseAdmin
    .from("documentos_sei_regras_identificacao").select("tabela").eq("id", id).maybeSingle();

  const { error } = await supabaseAdmin.from("documentos_sei_regras_identificacao").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  invalidarCacheRegras(existente?.tabela as Tabela | undefined);
  return NextResponse.json({ ok: true });
}
