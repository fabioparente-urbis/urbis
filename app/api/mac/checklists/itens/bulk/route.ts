// Mesmo achado de segurança de app/api/mac/checklists/itens/route.ts — ver comentário lá.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";
import { podeEditarModeloChecklist } from "@/lib/mac/checklistsAutorizacao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const ctx = await autenticar(req);
    if (ctx instanceof NextResponse) return ctx;

    const { itens } = await req.json();
    if (!itens || itens.length === 0)
      return NextResponse.json({ ok: true });

    // Cada item traz seu próprio modelo_id (é assim que a tela usa, ex.: copiar itens
    // selecionados pro modelo recém-criado) — autoriza por modelo distinto, não por item.
    const modeloIds = [...new Set(itens.map((i: any) => i.modelo_id).filter(Boolean))];
    for (const modeloId of modeloIds) {
      const autorizacao = await podeEditarModeloChecklist(ctx, modeloId as string);
      if (!autorizacao.ok) return NextResponse.json({ ok: false, erro: autorizacao.erro }, { status: autorizacao.status });
    }

    const itensComAutor = itens.map((i: any) => ({ ...i, alterado_por: ctx.userId }));
    const { error } = await supabase.from("mac_checklist_itens").insert(itensComAutor);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}