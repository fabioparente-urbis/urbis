/**
 * app/api/mac/vinculos-fila/decidir/route.ts — passos 7-8 do procedimento manual: revisão e
 * aprovação administrativa. Só quem tem perfil irrestrito (Administrador/Diretora) decide — e
 * nunca a própria pessoa que propôs (separação mínima de papéis: quem propõe não se auto-aprova).
 *
 * Aprovar é o ÚNICO caminho que grava em mac_lip_vinculos/mac_bip_vinculos nesta fila — antes
 * disso, a proposta nunca afeta nenhum vínculo real (ver .../propor/route.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { registrarEventoVinculo } from "@/lib/mac/vinculosFila";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "só Administrador/Diretora pode aprovar ou rejeitar uma proposta" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  const { propostaId, decisao, motivo } = body;
  if (!propostaId || typeof propostaId !== "string") return NextResponse.json({ ok: false, erro: "propostaId obrigatório" }, { status: 400 });
  if (decisao !== "aprovado" && decisao !== "rejeitado") return NextResponse.json({ ok: false, erro: "decisao deve ser aprovado ou rejeitado" }, { status: 400 });
  if (decisao === "rejeitado" && (typeof motivo !== "string" || motivo.trim() === "")) {
    return NextResponse.json({ ok: false, erro: "motivo é obrigatório para rejeitar" }, { status: 400 });
  }

  const { data: proposta, error: erroProposta } = await supabaseAdmin
    .from("mac_vinculos_propostas").select("*").eq("id", propostaId).maybeSingle();
  if (erroProposta) return NextResponse.json({ ok: false, erro: erroProposta.message }, { status: 500 });
  if (!proposta) return NextResponse.json({ ok: false, erro: "proposta não encontrada" }, { status: 404 });
  if (proposta.status !== "pendente") {
    return NextResponse.json({ ok: false, erro: `proposta já foi decidida (status atual: ${proposta.status})` }, { status: 409 });
  }
  if (proposta.criado_por === ctx.userId) {
    return NextResponse.json({ ok: false, erro: "quem propôs não pode decidir a própria proposta" }, { status: 403 });
  }

  const { data: modeloDoItem } = await supabaseAdmin
    .from("mac_checklist_itens").select("modelo_id").eq("id", proposta.mac_item_id).maybeSingle();
  const { data: modelo } = modeloDoItem
    ? await supabaseAdmin.from("mac_checklist_modelos").select("assunto_id").eq("id", modeloDoItem.modelo_id).maybeSingle()
    : { data: null };
  const assuntoId = modelo?.assunto_id ?? null;

  if (decisao === "aprovado") {
    // Mesma checagem de não-duplicar já usada em app/api/mac/slot-05/bip-vinculos.
    if (proposta.tipo === "LIP") {
      const { data: existente } = await supabaseAdmin
        .from("mac_lip_vinculos").select("id").eq("mac_item_id", proposta.mac_item_id).eq("lip_chave", proposta.lip_chave).maybeSingle();
      if (!existente) {
        const { error: erroInsert } = await supabaseAdmin.from("mac_lip_vinculos").insert({
          mac_item_id: proposta.mac_item_id, lip_chave: proposta.lip_chave, papel: proposta.papel,
          obrigatorio: proposta.obrigatorio, confianca: proposta.confianca, justificativa: proposta.justificativa,
        });
        if (erroInsert) return NextResponse.json({ ok: false, erro: `falha ao gravar vínculo LIP: ${erroInsert.message}` }, { status: 500 });
      }
    } else {
      const { data: existente } = await supabaseAdmin
        .from("mac_bip_vinculos").select("id").eq("mac_item_id", proposta.mac_item_id).eq("bip_fragmento_id", proposta.bip_fragmento_id).maybeSingle();
      if (!existente) {
        const { error: erroInsert } = await supabaseAdmin.from("mac_bip_vinculos").insert({
          mac_item_id: proposta.mac_item_id, bip_fragmento_id: proposta.bip_fragmento_id, confianca: proposta.confianca,
        });
        if (erroInsert) return NextResponse.json({ ok: false, erro: `falha ao gravar vínculo BIP: ${erroInsert.message}` }, { status: 500 });
      }
    }
  }

  const { error: erroUpdate } = await supabaseAdmin
    .from("mac_vinculos_propostas")
    .update({ status: decisao, decidido_por: ctx.userId, decidido_em: new Date().toISOString(), motivo_decisao: motivo?.trim() || null })
    .eq("id", propostaId).eq("status", "pendente"); // defesa contra corrida: só atualiza se ainda estiver pendente
  if (erroUpdate) return NextResponse.json({ ok: false, erro: erroUpdate.message }, { status: 500 });

  const { data: usuario } = await supabaseAdmin.from("usuarios").select("nome").eq("id", ctx.userId).maybeSingle();
  await registrarEventoVinculo({
    acao: decisao === "aprovado" ? "MAC_VINCULO_APROVADO" : "MAC_VINCULO_REJEITADO",
    analistaId: ctx.userId,
    analistaNome: usuario?.nome ?? "",
    assuntoId,
    detalhe: { propostaId, itemId: proposta.mac_item_id, tipo: proposta.tipo, motivo: motivo?.trim() || null },
  });

  return NextResponse.json({ ok: true, status: decisao });
}
