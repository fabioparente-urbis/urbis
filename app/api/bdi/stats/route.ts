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

  // vw_bdi_autores saiu do painel em 02/09/2026 (decisão do Fábio). Dois
  // motivos: a view agrupa pelo JSON serializado do campo em vez do nome, e
  // infla erros_por_processo contando não-conformidades depois de juntar por
  // análise; e, mesmo consertada, o autor aparece em 1 processo cada — não há
  // densidade para ranquear ninguém. Ranking de pessoa com número errado é
  // pior que nenhum ranking. A view continua no banco, só não é exibida.
  const [resumo, porAssunto, porAnalista, porBairro, produtividade, analistas, naoConformidades,
         retrabalho, exigenciasContexto, desempenhoReferencia, camposCriticos, numeracao,
         tempoEtapas, retornoPorSlot, coberturaSatelite, retrabalhoPorPassada] = await Promise.all([
    supabaseAdmin.from("vw_bdi_resumo_geral").select("*").maybeSingle(),
    supabaseAdmin.from("vw_bdi_por_assunto").select("*"),
    supabaseAdmin.from("vw_bdi_por_analista").select("*"),
    supabaseAdmin.from("vw_bdi_por_bairro").select("*").order("total_processos", { ascending: false }).limit(20),
    supabaseAdmin.from("vw_bdi_produtividade_mensal").select("*").order("ano", { ascending: false }).order("mes", { ascending: false }),
    supabaseAdmin.from("vw_bdi_analistas_desempenho").select("*"),
    supabaseAdmin.from("vw_bdi_nao_conformidades").select("*").limit(30),
    // Views novas (migration 2026_09_02_bdi_views_vivas.sql): leem o que já
    // estava gravado em mac_historico e nas faixas de numeração.
    supabaseAdmin.from("vw_bdi_retrabalho").select("*").order("trocas_totais", { ascending: false }).limit(20),
    supabaseAdmin.from("vw_bdi_exigencias_por_contexto").select("*").order("processos", { ascending: false }).limit(40),
    supabaseAdmin.from("vw_bdi_desempenho_referencia").select("*").order("reprovou", { ascending: false }).limit(20),
    supabaseAdmin.from("vw_bdi_campos_criticos").select("*").order("campos_vazios", { ascending: false }).limit(30),
    supabaseAdmin.from("vw_bdi_numeracao_saldo").select("*").order("restantes", { ascending: true }),
    // Recorte "BDI vivo — inteligência por evidência" (02/09/2026): views
    // aplicadas nas duas migrations anteriores (bdi_views_vivas e
    // bdi_retorno_cobertura), lidas mas nunca ligadas a esta rota até agora.
    supabaseAdmin.from("vw_bdi_tempo_etapas").select("*").order("dias", { ascending: false }).limit(30),
    supabaseAdmin.from("vw_bdi_retorno_por_slot").select("*"),
    supabaseAdmin.from("vw_bdi_cobertura_satelite").select("*"),
    // vw_bdi_retrabalho_por_passada (02/09/2026): separa troca de status
    // dentro da mesma passada de troca que só veio depois que uma passada
    // nova começou — retrabalho de verdade, com a exigência e a passada em
    // que voltou.
    supabaseAdmin.from("vw_bdi_retrabalho_por_passada").select("*"),
  ]);

  const porView: Record<string, { error: { message: string } | null }> = {
    vw_bdi_resumo_geral: resumo, vw_bdi_por_assunto: porAssunto, vw_bdi_por_analista: porAnalista,
    vw_bdi_por_bairro: porBairro, vw_bdi_produtividade_mensal: produtividade,
    vw_bdi_analistas_desempenho: analistas, vw_bdi_nao_conformidades: naoConformidades,
    vw_bdi_retrabalho: retrabalho, vw_bdi_exigencias_por_contexto: exigenciasContexto,
    vw_bdi_desempenho_referencia: desempenhoReferencia, vw_bdi_campos_criticos: camposCriticos,
    vw_bdi_numeracao_saldo: numeracao, vw_bdi_tempo_etapas: tempoEtapas,
    vw_bdi_retorno_por_slot: retornoPorSlot, vw_bdi_cobertura_satelite: coberturaSatelite,
    vw_bdi_retrabalho_por_passada: retrabalhoPorPassada,
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
    retrabalho: retrabalho.data ?? [],
    exigencias_contexto: exigenciasContexto.data ?? [],
    desempenho_referencia: desempenhoReferencia.data ?? [],
    campos_criticos: camposCriticos.data ?? [],
    numeracao: numeracao.data ?? [],
    nao_conformidades: naoConformidades.data ?? [],
    tempo_etapas: tempoEtapas.data ?? [],
    retorno_por_slot: retornoPorSlot.data ?? [],
    cobertura_satelite: coberturaSatelite.data ?? [],
    retrabalho_por_passada: retrabalhoPorPassada.data ?? [],
  });
}
