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

  const { data: faixa, error } = await supabase
    .from("urbis_numeracao_faixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("tipo", tipo)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, motivo: "ERRO_BD" }, { status: 500 });

  if (!faixa)
    return NextResponse.json({
      ok: false,
      motivo: tipo === "despacho" ? "SOLICITAR_NUMERO_DESPACHO" : "SOLICITAR_NUMERO_PARECER",
    });

  if (faixa.proximo > faixa.numero_final)
    return NextResponse.json({
      ok: false,
      motivo: tipo === "despacho" ? "SOLICITAR_NUMERO_DESPACHO" : "SOLICITAR_NUMERO_PARECER",
      esgotado: true,
    });

  const numero = faixa.proximo;

  await supabase
    .from("urbis_numeracao_faixas")
    .update({ proximo: numero + 1 })
    .eq("id", faixa.id);

  await supabase.from("urbis_numeracao_uso").insert({
    faixa_id: faixa.id,
    usuario_id: usuarioId,
    numero,
    processo_codigo: processo,
    tipo_documento: tipo,
  });

  return NextResponse.json({ ok: true, numero, restantes: faixa.numero_final - numero });
}
