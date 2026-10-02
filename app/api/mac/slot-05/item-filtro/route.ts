/**
 * app/api/mac/slot-05/item-filtro/route.ts — classificação manual item → filtro do MAC do Slot 5.
 *
 * Exclusiva do Slot 5 (tabela `mac_slot5_item_filtro`, migration 2026_10_02). A classificação manual vence
 * a regra automática dos filtros (ver a migration). Só vale para as próximas aplicações de filtro.
 *
 * GET  → { overrides: { item_id: filtro }, filtrosBanco: [{id, nome}], podeEditar }  (qualquer usuário logado)
 * PUT  → { item_id, filtro }  filtro = "banco:<uuid>" | "tema:<id>" | "nenhum" | "auto" (volta ao automático)
 *        SÓ o perfil "Administrador" (não basta ser irrestrito — Diretor/a não): a classificação muda o
 *        comportamento dos filtros para TODOS os analistas.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";

export const runtime = "nodejs";

const ehAdmin = (u: { perfis: string[] }) => (u.perfis ?? []).includes("Administrador");

const TABELA_AUSENTE = "a tabela mac_slot5_item_filtro ainda não existe — rode a migration 2026_10_02_mac_slot5_item_filtro.sql";

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const [{ data: linhas, error }, { data: filtros }] = await Promise.all([
      supabaseAdmin.from("mac_slot5_item_filtro").select("item_id, filtro").limit(5000),
      supabaseAdmin.from("mac_slot5_filtros").select("id, nome, ativo").order("ordem").limit(300),
    ]);
    // Sem a tabela a tela continua funcionando sem o botão (podeEditar=false) — nunca quebra o MAC.
    const tabelaOk = !error;
    const overrides: Record<string, string> = {};
    for (const l of (linhas ?? []) as any[]) overrides[l.item_id] = l.filtro;
    return NextResponse.json({
      ok: true, tabelaOk,
      overrides,
      filtrosBanco: ((filtros ?? []) as any[]).filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nome })),
      podeEditar: tabelaOk && ehAdmin(usuario),
      aviso: tabelaOk ? undefined : TABELA_AUSENTE,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });
    if (!ehAdmin(usuario)) {
      return NextResponse.json({ ok: false, erro: "Só o administrador classifica itens em filtros" }, { status: 403 });
    }

    const { item_id, filtro } = await req.json().catch(() => ({}));
    if (!item_id || !filtro) return NextResponse.json({ ok: false, erro: "item_id e filtro obrigatórios" }, { status: 400 });

    // O item tem que ser do modelo do Slot 5.
    const modeloId = await modeloDoSlot5();
    const { data: item } = await supabaseAdmin.from("mac_checklist_itens")
      .select("id").eq("id", item_id).eq("modelo_id", modeloId ?? "").maybeSingle();
    if (!item) return NextResponse.json({ ok: false, erro: "item não é do checklist do Slot 5" }, { status: 404 });

    if (filtro === "auto") {
      const { error } = await supabaseAdmin.from("mac_slot5_item_filtro").delete().eq("item_id", item_id);
      if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (filtro !== "nenhum") {
      const m = String(filtro).match(/^(banco|tema):(.+)$/);
      if (!m) return NextResponse.json({ ok: false, erro: "filtro inválido" }, { status: 400 });
      if (m[1] === "banco") {
        const { data: f } = await supabaseAdmin.from("mac_slot5_filtros").select("id").eq("id", m[2]).maybeSingle();
        if (!f) return NextResponse.json({ ok: false, erro: "filtro do banco não existe" }, { status: 404 });
      } else if (!/^[a-z0-9_]+$/i.test(m[2])) {
        return NextResponse.json({ ok: false, erro: "filtro de tema inválido" }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin.from("mac_slot5_item_filtro")
      .upsert({ item_id, filtro, atualizado_por: usuario.id, atualizado_em: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, erro: error.message.includes("does not exist") ? TABELA_AUSENTE : error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
