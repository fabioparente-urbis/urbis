import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirUsuarioAtivo } from "@/lib/autorizacao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Apenas admin/gerente atribuem analista.
const PERFIS_ATRIBUEM = new Set(["administrador", "gerente"]);

export async function POST(req: NextRequest) {
  // C1 (21/10/2026): sessão validada + cadastro ATIVO + origem do URBIS. As regras de escopo da
  // atribuição (gerente só na própria gerência, Diretora entre gerências — D2/D3) são a etapa E5;
  // até lá a regra de perfil abaixo fica exatamente como estava.
  const barreira = await exigirUsuarioAtivo(req, { mutacao: true });
  if (!barreira.ok) return barreira.resposta;

  const perfis = barreira.usuario.perfis.map((p) =>
    String(p || "").toLowerCase(),
  );
  if (!perfis.some((p) => PERFIS_ATRIBUEM.has(p)))
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });

  const { processo_id, analista_id } = await req.json();
  if (!processo_id)
    return NextResponse.json({ ok: false, erro: "processo_id obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("processos")
    .update({ analista_id: analista_id || null })
    .eq("id", processo_id);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
