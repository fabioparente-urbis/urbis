import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolverUsuarioIdPorCookie } from "@/lib/auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Identidade sempre validada pelo token do Supabase — ver numeracao/proximo.
async function getUsuarioId(req: NextRequest): Promise<string | null> {
  return resolverUsuarioIdPorCookie(req.headers.get("cookie") ?? "");
}

export async function GET(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const ano = new Date().getFullYear();
  const { data, error } = await supabase
    .from("urbis_numeracao_faixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("ano", ano)
    .order("tipo", { ascending: true })
    .order("criado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const { tipo, numero_inicial, numero_final } = await req.json();
  if (!["despacho", "parecer"].includes(tipo))
    return NextResponse.json({ ok: false, erro: "tipo inválido" }, { status: 400 });

  const ni = Number(numero_inicial);
  const nf = Number(numero_final);
  if (!Number.isInteger(ni) || !Number.isInteger(nf) || ni > nf)
    return NextResponse.json({ ok: false, erro: "Faixa inválida" }, { status: 400 });

  const ano = new Date().getFullYear();

  // Sobreposição conferida contra as faixas de TODOS os analistas, não só as do próprio (furo
  // achado pelo Fábio em 22/09/2026): os números de despacho/parecer são do analista a quem foram
  // atribuídos, fora do URBIS inclusive. Conferindo só as próprias, outro analista podia cadastrar
  // a mesma faixa e os dois emitiriam o mesmo número sem aviso. A trava definitiva é a constraint
  // `urbis_numeracao_faixas_sem_sobreposicao` (migration 2026_09_22) — esta checagem existe para
  // devolver mensagem legível antes de o banco recusar.
  const { data: existentes, error: erroExistentes } = await supabase
    .from("urbis_numeracao_faixas")
    .select("usuario_id, numero_inicial, numero_final")
    .eq("tipo", tipo)
    .eq("ano", ano);

  if (erroExistentes) return NextResponse.json({ ok: false, erro: erroExistentes.message }, { status: 500 });

  for (const f of existentes ?? []) {
    if (ni <= f.numero_final && nf >= f.numero_inicial) {
      // Faixa de outro analista: não expõe o intervalo dele, só recusa.
      const erro = f.usuario_id === usuarioId
        ? `Faixa sobrepõe intervalo já cadastrado (${f.numero_inicial}–${f.numero_final})`
        : "Parte desta faixa já pertence a outro analista. Confira os números atribuídos a você.";
      return NextResponse.json({ ok: false, erro }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("urbis_numeracao_faixas")
    .insert({ usuario_id: usuarioId, tipo, numero_inicial: ni, numero_final: nf, proximo: ni, ano })
    .select()
    .single();

  // 23P01 = exclusion_violation: duas gravações simultâneas passaram pela checagem acima e a
  // constraint barrou a segunda.
  if (error?.code === "23P01")
    return NextResponse.json({ ok: false, erro: "Parte desta faixa já está cadastrada. Recarregue e confira." }, { status: 409 });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("urbis_numeracao_faixas")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
