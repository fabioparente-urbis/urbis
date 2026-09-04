import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

/**
 * Mudanças de catálogo (LIP/MAC) — Fase D do plano de Inteligência URBIS.
 * Só lê mac_checklist_itens_historico (trigger de banco, ver migration
 * 2026_09_03_mac_checklist_itens_historico.sql). Nunca expõe dado de processo nem de
 * interessado — a tabela de origem não tem nenhuma coluna assim (é sobre o ITEM do
 * checklist, não sobre um processo).
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const slot = searchParams.get("slot");
  const acao = searchParams.get("acao");
  const desde = searchParams.get("desde");
  const ate = searchParams.get("ate");
  const limitParam = parseInt(searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 300) : 100;

  let query = supabaseAdmin
    .from("mac_checklist_itens_historico")
    .select("id, item_id, tipo_processo, acao, campos_alterados, criado_em, registrado_por")
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (slot) query = query.eq("tipo_processo", slot);
  if (acao) query = query.eq("acao", acao);
  if (desde) query = query.gte("criado_em", desde);
  // "ate" é uma data (YYYY-MM-DD) — soma 1 dia pra incluir o dia inteiro, não só 00:00 dele.
  if (ate) {
    const fimDoDia = new Date(`${ate}T00:00:00Z`);
    fimDoDia.setUTCDate(fimDoDia.getUTCDate() + 1);
    query = query.lt("criado_em", fimDoDia.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/urbi/catalogo GET] falha ao consultar:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar mudanças de catálogo." }, { status: 500 });
  }

  const itemIds = [...new Set((data ?? []).map((l: any) => l.item_id))];
  const { data: itens } = itemIds.length
    ? await supabaseAdmin.from("mac_checklist_itens").select("id, grupo, texto").in("id", itemIds)
    : { data: [] as any[] };
  const itemPorId = new Map((itens ?? []).map((i: any) => [i.id, i]));

  // Autor — coluna registrado_por (mac_checklist_itens_historico) só passou a ser preenchida de
  // verdade a partir da correção da trilha (as rotas de escrita gravam mac_checklist_itens.
  // alterado_por, o trigger prefere isso a auth.uid()) — evento anterior a essa correção continua
  // com registrado_por NULL, mesmo dentro da janela de 03/09/2026 em diante.
  const idsAutor = [...new Set((data ?? []).map((l: any) => l.registrado_por).filter(Boolean))];
  const { data: usuarios } = idsAutor.length
    ? await supabaseAdmin.from("usuarios").select("id, nome").in("id", idsAutor)
    : { data: [] as any[] };
  const nomePorId = new Map((usuarios ?? []).map((u: any) => [u.id, u.nome]));

  const linhas = (data ?? []).map((l: any) => {
    const item = itemPorId.get(l.item_id);
    return {
      id: l.id,
      criado_em: l.criado_em,
      slot: l.tipo_processo,
      item_grupo: item?.grupo ?? null,
      // Texto ATUAL do item (não o histórico) — só pra identificar qual item é, na dúvida o
      // analista abre o checklist do slot pra ver o resto.
      item_texto_atual: item?.texto ?? "(item não encontrado no catálogo atual)",
      acao: l.acao,
      campos_alterados: l.campos_alterados,
      autor_nome: l.registrado_por ? (nomePorId.get(l.registrado_por) ?? null) : null,
    };
  });

  return NextResponse.json({ ok: true, data: linhas });
}
