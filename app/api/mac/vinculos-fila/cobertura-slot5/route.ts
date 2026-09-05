/**
 * app/api/mac/vinculos-fila/cobertura-slot5/route.ts — Fase Q (05/09/2026): visão de cobertura
 * jurídica por slot pedida explicitamente ("Regularização SEI, Aceite SEI e Slot 5"). Slot 5 NÃO
 * usa a fila de propostas (mac_vinculos_propostas é escoped por API a regularizacao/aceite_sei,
 * ver lib/mac/vinculosFila.ts) — tem mecanismo e tela próprios (/admin/filtros-slot5). Esta rota
 * é SÓ LEITURA de cobertura, pra completar a comparação de 3 assuntos sem tocar no mecanismo do
 * Slot 5 nem estender a fila pra ele.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { vinculosBipPossivelmenteDesatualizados } from "@/lib/mac/vinculosFila";

export const runtime = "nodejs";

async function emLotes<T>(
  ids: string[],
  tamanho: number,
  buscar: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; erro: string | null }> {
  const saida: T[] = [];
  for (let i = 0; i < ids.length; i += tamanho) {
    const { data, error } = await buscar(ids.slice(i, i + tamanho));
    if (error) return { data: saida, erro: error.message };
    saida.push(...(data ?? []));
  }
  return { data: saida, erro: null };
}

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const { data: modelo, error: erroModelo } = await supabaseAdmin
    .from("mac_checklist_modelos").select("id").eq("tipo_processo", "slot_05").maybeSingle();
  if (erroModelo) return NextResponse.json({ ok: false, erro: erroModelo.message }, { status: 500 });
  if (!modelo) return NextResponse.json({ ok: false, erro: "sem modelo de checklist para slot_05" }, { status: 404 });

  const { data: itens, error: erroItens } = await supabaseAdmin
    .from("mac_checklist_itens").select("id, chave_lip").eq("modelo_id", modelo.id).eq("ativo", true);
  if (erroItens) return NextResponse.json({ ok: false, erro: erroItens.message }, { status: 500 });
  const todosOsItens = itens ?? [];
  const ids = todosOsItens.map((i) => i.id);

  // .in() com os ~539 itens do Slot 5 numa chamada só estoura o tamanho de URL do GET do
  // PostgREST — mesma família de achado já documentada em selecionarEmLotes
  // (lib/urbi/dossieProcesso.ts) e na paginação de mac_historico (app/api/admin/urbi/recorrencia).
  const [{ data: vinculosLip, erro: erroLip }, { data: vinculosBip, erro: erroBip }] = await Promise.all([
    emLotes<{ mac_item_id: string }>(ids, 150, (lote) => supabaseAdmin.from("mac_lip_vinculos").select("mac_item_id").in("mac_item_id", lote)),
    emLotes<{ mac_item_id: string; criado_em: string }>(ids, 150, (lote) => supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id, criado_em").in("mac_item_id", lote)),
  ]);
  if (erroLip) return NextResponse.json({ ok: false, erro: erroLip }, { status: 500 });
  if (erroBip) return NextResponse.json({ ok: false, erro: erroBip }, { status: 500 });

  const itensComVinculoLip = new Set([
    ...todosOsItens.filter((i) => i.chave_lip && i.chave_lip.trim() !== "").map((i) => i.id),
    ...vinculosLip.map((v) => v.mac_item_id),
  ]);
  const itensComVinculoBip = new Set(vinculosBip.map((v) => v.mac_item_id));
  const semNenhumVinculo = todosOsItens.filter((i) => !itensComVinculoLip.has(i.id) && !itensComVinculoBip.has(i.id)).length;

  // Fase 8 (05/09/2026) — mesmo sinal de "vínculo possivelmente desatualizado" da fila de
  // Regularização/Aceite SEI, aplicado aqui: Slot 5 tem 727 vínculos reais, é onde este sinal
  // mais importa na prática.
  const bipPossivelmenteDesatualizados = await vinculosBipPossivelmenteDesatualizados(vinculosBip);

  return NextResponse.json({
    ok: true,
    cobertura: {
      total_itens: todosOsItens.length,
      lip: { vinculado: itensComVinculoLip.size, sem_vinculo: todosOsItens.length - itensComVinculoLip.size },
      bip: { vinculado: itensComVinculoBip.size, sem_vinculo: todosOsItens.length - itensComVinculoBip.size },
      sem_nenhum_vinculo: semNenhumVinculo,
      bip_possivelmente_desatualizado: {
        quantidade: bipPossivelmenteDesatualizados.size,
        motivo: "vínculo aprovado antes da última mudança real do item no catálogo (mac_checklist_itens_historico) — sinal de revisão, nunca desfaz o vínculo sozinho",
      },
    },
    fonte: "mac_lip_vinculos/mac_bip_vinculos + chave_lip legado — mecanismo do Slot 5 é /admin/filtros-slot5, esta rota só lê cobertura pra comparação, não interfere nele.",
  });
}
