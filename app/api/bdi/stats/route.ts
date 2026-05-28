import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const assunto = searchParams.get("assunto") || null;

  const [resumo, porAssunto, porAnalista, porBairro, produtividade, analistas, autores, naoConformidades] = await Promise.all([
    supabaseAdmin.from("vw_bdi_resumo_geral").select("*").maybeSingle(),
    supabaseAdmin.from("vw_bdi_por_assunto").select("*"),
    supabaseAdmin.from("vw_bdi_por_analista").select("*"),
    supabaseAdmin.from("vw_bdi_por_bairro").select("*").order("total_processos", { ascending: false }).limit(20),
    supabaseAdmin.from("vw_bdi_produtividade_mensal").select("*").order("ano", { ascending: false }).order("mes", { ascending: false }),
    supabaseAdmin.from("vw_bdi_analistas_desempenho").select("*"),
    supabaseAdmin.from("vw_bdi_autores").select("*").order("total_processos", { ascending: false }).limit(50),
    supabaseAdmin.from("vw_bdi_nao_conformidades").select("*").limit(30),
  ]);

  return NextResponse.json({
    ok: true,
    resumo: resumo.data ?? {},
    por_assunto: porAssunto.data ?? [],
    por_analista: porAnalista.data ?? [],
    por_bairro: porBairro.data ?? [],
    produtividade: produtividade.data ?? [],
    analistas: analistas.data ?? [],
    autores: autores.data ?? [],
    nao_conformidades: naoConformidades.data ?? [],
  });
}
