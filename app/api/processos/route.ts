import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sentinela usada para forcar lista vazia quando a gerencia nao possui
// analistas cadastrados (evita 'in' com array vazio retornar resultados
// indesejados pelo driver). UUID nulo nao colidirá com nenhum id real.
const SENTINELA_ID_VAZIO = "00000000-0000-0000-0000-000000000000";

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    const { userId, irrestrito, perfis, gerencia } = auth;

    const { searchParams } = new URL(req.url);
    const busca = searchParams.get("busca") || "";
    const tipo = searchParams.get("tipo") || "";
    const status = searchParams.get("status") || "";
    const analista = searchParams.get("analista") || "";

    let query = supabase
      .from("processos")
      .select("id, codigo, numero_sei, tipo_processo, status, criado_em, atualizado_em, dados, analista_id")
      .order("atualizado_em", { ascending: false })
      .limit(200);

    if (busca) query = query.or(`codigo.ilike.%${busca}%,numero_sei.ilike.%${busca}%`);
    if (tipo) query = query.eq("tipo_processo", tipo);
    if (status) query = query.eq("status", status);

    // Visibilidade de processos (item 3):
    // - Admin / Diretora                 → todos
    // - Gerência PP/MP/GP                → processos dos analistas onde usuarios.gerencia = sua gerencia
    // - Analista com gerencia != null    → apenas os próprios
    // - Analista com gerencia = null     → processos das 3 gerências (DIRAAP direto)
    const ehGerenteDeGerencia = perfis.some((p) => p && p.startsWith("Gerência "));

    if (irrestrito) {
      // Admin/Diretora podem usar o filtro opcional ?analista
      if (analista) query = query.eq("analista_id", analista);
    } else if (ehGerenteDeGerencia && gerencia) {
      // Coleta ids dos analistas da mesma gerencia
      const { data: ids } = await supabase
        .from("usuarios")
        .select("id")
        .eq("gerencia", gerencia);
      const idList = (ids ?? []).map((u) => u.id);
      if (analista) {
        // Intersecciona com o filtro vindo do cliente: so passa se o analista
        // pedido pertencer a essa gerencia.
        query = query.eq("analista_id", idList.includes(analista) ? analista : SENTINELA_ID_VAZIO);
      } else if (idList.length > 0) {
        query = query.in("analista_id", idList);
      } else {
        query = query.eq("analista_id", SENTINELA_ID_VAZIO);
      }
    } else if (gerencia) {
      // Analista de uma gerencia: somente os proprios processos.
      // Qualquer ?analista vindo do cliente e ignorado.
      query = query.eq("analista_id", userId);
    } else {
      // Analista DIRAAP direto (gerencia=null): ve todos os processos.
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, status, analista_id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });

    const atualizacao: any = { atualizado_em: new Date().toISOString() };
    if (status !== undefined) atualizacao.status = status;
    if (analista_id !== undefined) atualizacao.analista_id = analista_id;

    const { error } = await supabase.from("processos").update(atualizacao).eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatorio" }, { status: 400 });
    const { error } = await supabase.from("processos").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
