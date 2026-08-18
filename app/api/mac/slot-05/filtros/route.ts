/**
 * app/api/mac/slot-05/filtros/route.ts — CRUD dos filtros de aplicabilidade do MAC Slot 5.
 *
 * Isolada do Slot 1: mexe só em `mac_slot5_filtros`, tabela exclusiva do Slot 5 (migration
 * 2026_08_17_mac_slot5_filtros.sql). Nenhuma outra parte do sistema lê essa tabela.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";

export const runtime = "nodejs";

const TIPOS = ["CAMPO_LIP_AUSENTE", "CAMPO_LIP_IGUAL", "PALAVRA_AUSENTE", "MANUAL"];
const STATUS = ["conforme", "nao_conforme", "nao_aplica"];

const TABELA_AUSENTE =
  "a tabela de filtros ainda não existe — rode a migration 2026_08_17_mac_slot5_filtros.sql";

/** Lista os filtros + o catálogo de grupos e papéis, para a tela montar os seletores. */
export async function GET(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const { data: filtros, error } = await supabaseAdmin
    .from("mac_slot5_filtros").select("*").order("ordem").limit(300);
  if (error) {
    return NextResponse.json({ ok: false, erro: TABELA_AUSENTE, detalhe: error.message }, { status: 503 });
  }

  // Só os grupos do checklist DO SLOT 5 — sem este recorte a lista traria grupos da
  // Regularização e do Aceite, que vivem na mesma tabela.
  const modeloId = await modeloDoSlot5();
  const { data: itens } = modeloId
    ? await supabaseAdmin.from("mac_checklist_itens")
      .select("id, grupo, texto, ordem").eq("modelo_id", modeloId).eq("ativo", true)
      .order("ordem").limit(2000)
    : { data: [] as any[] };

  const grupos = new Map<string, number>();
  for (const i of (itens ?? []) as any[]) grupos.set(i.grupo, (grupos.get(i.grupo) ?? 0) + 1);

  return NextResponse.json({
    ok: true,
    filtros: filtros ?? [],
    grupos: [...grupos.entries()].map(([nome, qtd]) => ({ nome, qtd })),
    itens: itens ?? [],
    papeis: ["projeto", "uso_solo", "certidao_matricula", "requerimento", "declaracao",
             "art_projeto", "art_execucao", "art_caixa", "documentos_pessoais"],
    tipos: TIPOS,
  });
}

function normalizarCorpo(b: any) {
  return {
    nome: String(b.nome ?? "").trim(),
    descricao: b.descricao ? String(b.descricao) : null,
    ordem: Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 100,
    ativo: b.ativo !== false,
    tipo_condicao: TIPOS.includes(b.tipo_condicao) ? b.tipo_condicao : "MANUAL",
    campos_lip: Array.isArray(b.campos_lip) ? b.campos_lip.filter(Boolean) : [],
    valor_esperado: b.valor_esperado ? String(b.valor_esperado) : null,
    termos: Array.isArray(b.termos) ? b.termos.filter(Boolean) : [],
    papeis_documento: Array.isArray(b.papeis_documento) ? b.papeis_documento.filter(Boolean) : [],
    grupos: Array.isArray(b.grupos) ? b.grupos.filter(Boolean) : [],
    itens_ids: Array.isArray(b.itens_ids) ? b.itens_ids.filter(Boolean) : [],
    termos_item: Array.isArray(b.termos_item) ? b.termos_item.filter(Boolean) : [],
    status_alvo: STATUS.includes(b.status_alvo) ? b.status_alvo : "nao_aplica",
  };
}

export async function POST(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const corpo = normalizarCorpo(await req.json().catch(() => ({})));
  if (!corpo.nome) return NextResponse.json({ ok: false, erro: "nome obrigatório" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("mac_slot5_filtros").insert({ ...corpo, criado_por: usuario.id }).select().maybeSingle();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, filtro: data });
}

export async function PUT(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body?.id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const corpo = normalizarCorpo(body);
  if (!corpo.nome) return NextResponse.json({ ok: false, erro: "nome obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin.from("mac_slot5_filtros")
    .update({ ...corpo, atualizado_em: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin.from("mac_slot5_filtros").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
