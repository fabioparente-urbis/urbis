import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { autenticar, verificarOwnership } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    const usuarioId = auth.userId;

    const body = await req.json();
    const { id, dados, camposAlterados } = body;

    if (!id) {
      return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });
    }

    const { data: existente, error: erroBusca } = await supabase
      .from("processos")
      .select("id, codigo, analista_id")
      .eq("codigo", id)
      .limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error }));

    if (erroBusca) {
      return NextResponse.json({ ok: false, erro: erroBusca.message }, { status: 500 });
    }

    let processoId: string | null = null;
    let acao = "inserido";

    if (existente?.id) {
      // UPDATE: so o analista dono (ou perfil irrestrito) pode salvar
      const ownerErr = verificarOwnership(auth, existente.analista_id);
      if (ownerErr) return ownerErr;

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
