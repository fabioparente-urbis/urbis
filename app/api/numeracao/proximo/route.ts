import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUsuarioId(req: NextRequest): Promise<string | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/me`, {
    headers: { cookie },
  });
  const json = await res.json();
  return json?.data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") as "despacho" | "parecer" | null;
  const processo = searchParams.get("processo") ?? "";

  if (!tipo || !["despacho", "parecer"].includes(tipo))
    return NextResponse.json({ ok: false, motivo: "TIPO_INVALIDO" }, { status: 400 });

  const usuarioId = await getUsuarioId(req);
  if (!usuarioId) return NextResponse.json({ ok: false, motivo: "NAO_AUTENTICADO" }, { status: 401 });

  const ano = new Date().getFullYear();

  // Busca todas as faixas do ano corrente ordenadas por criado_em
  const { data: faixas, error } = await supabase
    .from("urbis_numeracao_faixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo)
    .eq("ano", ano)
    .order("criado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, motivo: "ERRO_BD" }, { status: 500 });

  if (!faixas || faixas.length === 0)
    return NextResponse.json({
      ok: false,
      motivo: tipo === "despacho" ? "SOLICITAR_NUMERO_DESPACHO" : "SOLICITAR_NUMERO_PARECER",
    });

  // Percorre faixas em ordem até encontrar uma com número disponível
  const faixaDisponivel = faixas.find(f => f.proximo <= f.numero_final);

  if (!faixaDisponivel)
    return NextResponse.json({
      ok: false,
      motivo: tipo === "despacho" ? "SOLICITAR_NUMERO_DESPACHO" : "SOLICITAR_NUMERO_PARECER",
      esgotado: true,
    });

  const numero = faixaDisponivel.proximo;

  // Avança cursor
  await supabase
    .from("urbis_numeracao_faixas")
    .update({ proximo: numero + 1 })
    .eq("id", faixaDisponivel.id);

  // Grava uso
  await supabase.from("urbis_numeracao_uso").insert({
    faixa_id: faixaDisponivel.id,
    usuario_id: usuarioId,
    numero,
    processo_codigo: processo,
    tipo_documento: tipo,
  });

  // Calcula total restante em todas as faixas
  const restantes = faixas.reduce((acc, f) => {
    if (f.id === faixaDisponivel.id) return acc + Math.max(0, f.numero_final - numero);
    if (f.proximo <= f.numero_final) return acc + (f.numero_final - f.proximo + 1);
    return acc;
  }, 0);

  return NextResponse.json({ ok: true, numero, restantes });
}
