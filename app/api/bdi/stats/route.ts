import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// Estatísticas agregadas de produtividade/conformidade por analista e por
// autor técnico — dado sensível o bastante para restringir a Administrador.
// Deliberadamente mais estrito que o `ctx.irrestrito` padrão do projeto
// (que também inclui Diretora): reproduz o mesmo gate que já existe no
// client desta tela (app/admin/bdi/page.tsx: `perfil !== "Administrador"`).
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json(
      { ok: false, erro: "Acesso restrito ao Administrador." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const assunto = searchParams.get("assunto") || null;
  // NOTA (Fase 0.3): parâmetro aceito mas não aplicado às queries — nenhuma
  // das views abaixo tem migration, e não foi possível confirmar nesta sessão
  // se alguma delas expõe uma coluna de assunto filtrável. Aplicar o filtro
  // sem essa confirmação seria tratar hipótese como fato. O filtro por
  // assunto continua sendo feito no client sobre o payload completo, como já
  // acontecia antes desta correção.
  void assunto;

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

  const porView: Record<string, { error: { message: string } | null }> = {
    vw_bdi_resumo_geral: resumo, vw_bdi_por_assunto: porAssunto, vw_bdi_por_analista: porAnalista,
    vw_bdi_por_bairro: porBairro, vw_bdi_produtividade_mensal: produtividade,
    vw_bdi_analistas_desempenho: analistas, vw_bdi_autores: autores, vw_bdi_nao_conformidades: naoConformidades,
  };
  const falhas = Object.entries(porView)
    .filter(([, r]) => r.error)
    .map(([nome, r]) => `${nome}: ${r.error!.message}`);
  if (falhas.length > 0) {
    console.error("[bdi/stats] falha ao consultar view(s):", falhas.join(" | "));
    return NextResponse.json(
      { ok: false, erro: `Falha ao consultar estatísticas do BDI: ${falhas.join("; ")}` },
      { status: 500 },
    );
  }

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
