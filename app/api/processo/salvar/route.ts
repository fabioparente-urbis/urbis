import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, dados, camposAlterados } = body;

    // Pega o usuario_id do cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const usuarioId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1] ?? null;

    if (!id) {
      return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });
    }

    const { data: existente, error: erroBusca } = await supabase
      .from("processos")
      .select("id, codigo")
      .eq("codigo", id)
      .maybeSingle();

    if (erroBusca) {
      return NextResponse.json({ ok: false, erro: erroBusca.message }, { status: 500 });
    }

    let processoId: string | null = null;
    let acao = "inserido";

    if (existente?.id) {
      processoId = existente.id;
      acao = "atualizado";
      const { error } = await supabase
        .from("processos")
        .update({
          codigo: id,
          dados: dados,
          status: "CADASTRADO",
          tipo_processo: "REGULARIZACAO",
          edicao_autorizada: true,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", existente.id);

      if (error) {
        return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      }
    } else {
      const { data, error } = await supabase
        .from("processos")
        .insert([{
          codigo: id,
          dados: dados,
          status: "CADASTRADO",
          tipo_processo: "REGULARIZACAO",
          edicao_autorizada: true,
        }])
        .select();

      if (error) {
        return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
      }
      processoId = data?.[0]?.id ?? null;
    }

    if (processoId && camposAlterados && camposAlterados.length > 0) {
      await supabase
        .from("processo_historico")
        .insert([{
          processo_id: processoId,
          usuario_id: usuarioId,
          acao: acao === "inserido" ? "Processo criado" : "Auto-save",
          detalhe: { campos: camposAlterados },
        }]);
    }

    return NextResponse.json({ ok: true, acao });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
