// app/api/mac/checklists/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const analista_id = searchParams.get("analista_id");
  // Sessão 5A: filtro opcional por assunto. Se não vier, mantém compatibilidade
  // legada e retorna todos os modelos (visíveis pelo dono_id) sem filtrar por
  // assunto.
  const assunto_id = searchParams.get("assunto_id");

  let query = supabase
    .from("mac_checklist_modelos")
    .select("*, mac_checklist_itens(*)")
    .or(`dono_id.is.null${analista_id && /^[0-9a-f-]{36}$/i.test(analista_id) ? `,dono_id.eq.${analista_id}` : ""}`)
    .order("criado_em", { ascending: true });

  // Inclui modelos globais (assunto_id null) E modelos do assunto solicitado.
  // Sem assunto_id na query → compatibilidade legada, retorna tudo.
  // Só aplica o filtro se assunto_id for um UUID válido — evita injeção no .or().
  if (assunto_id && /^[0-9a-f-]{36}$/i.test(assunto_id)) {
    query = query.or(`assunto_id.is.null,assunto_id.eq.${assunto_id}`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  // Sessão 5A: aceita `assunto_id` opcional no body. Se não vier, a coluna
  // (que é nullable) fica null — o backfill da migration já preencheu os
  // modelos antigos com o slug `regularizacao`.
  const { nome, tipo_processo, dono_id, copiar_de, assunto_id } = await req.json();

  const { data: modelo, error: em } = await supabase
    .from("mac_checklist_modelos")
    .insert({
      nome,
      tipo_processo: tipo_processo || null,
      dono_id: dono_id || null,
      criado_por: dono_id || null,
      assunto_id: assunto_id || null,
    })
    .select()
    .maybeSingle();

  if (em) return NextResponse.json({ ok: false, erro: em.message }, { status: 500 });

  if (copiar_de) {
    const { data: itens } = await supabase
      .from("mac_checklist_itens")
      .select("grupo, texto, ref, ordem, ativo")
      .eq("modelo_id", copiar_de);

    if (itens && itens.length > 0) {
      await supabase.from("mac_checklist_itens").insert(
        itens.map((i) => ({ ...i, modelo_id: modelo.id }))
      );
    }
  }

  return NextResponse.json({ ok: true, data: modelo });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const { error } = await supabase.from("mac_checklist_modelos").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}