import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar, verificarOwnership } from "@/lib/auth";
import { montarAvisos, triar, type EntradaVigia } from "@/lib/bdi/vigia";

/**
 * Vigia de um processo: fatos verificáveis + triagem por evidência.
 *
 * CUSTO ZERO: só consulta o banco. Nenhuma chamada a Gemini, Groq, ElevenLabs
 * ou qualquer serviço cobrado.
 *
 * SÓ LEITURA: nenhum insert, update ou delete. Não escreve observação, não
 * muda status, não encosta no processo.
 *
 * PERMISSÃO: o processo é carregado e passa por verificarOwnership — analista
 * só enxerga o que é dele; Administrador e Diretora passam. Sem isso, o vigia
 * viraria um jeito de ler processo alheio pela porta dos fundos.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const codigo = new URL(req.url).searchParams.get("codigo");
  if (!codigo) {
    return NextResponse.json({ ok: false, erro: "codigo é obrigatório." }, { status: 400 });
  }

  const { data: processo, error } = await supabase
    .from("processos")
    .select("codigo, tipo_processo, area_construida, dados, tags, analista_id")
    .eq("codigo", codigo)
    .is("excluido_em", null)
    .maybeSingle();

  if (error) {
    console.error("[bdi/vigia] falha ao carregar processo:", error.message);
    return NextResponse.json({ ok: false, erro: "Falha ao carregar o processo." }, { status: 500 });
  }
  if (!processo) {
    return NextResponse.json({ ok: false, erro: "Processo não encontrado." }, { status: 404 });
  }

  const semPermissao = verificarOwnership(ctx, (processo as any).analista_id);
  if (semPermissao) return semPermissao;

  // --- retrabalho (view nova, alimentada por mac_historico)
  const { data: retrabalho } = await supabase
    .from("vw_bdi_retrabalho")
    .select("virou_nao_conforme, foi_resolvido, trocas_totais")
    .eq("processo_codigo", codigo)
    .maybeSingle();

  // --- exigências que costumam aparecer em processo do mesmo assunto
  const tipo = (processo as any).tipo_processo
    ? String((processo as any).tipo_processo).toLowerCase()
    : null;
  let exigenciasRecorrentes: any[] = [];
  if (tipo) {
    const { data } = await supabase
      .from("vw_bdi_exigencias_por_contexto")
      .select("exigencia, vezes, processos")
      .eq("tipo_processo", tipo)
      .order("processos", { ascending: false })
      .limit(5);
    exigenciasRecorrentes = data ?? [];
  }

  // --- referência legal: SÓ quando existe vínculo real MAC × BIP.
  // Sem vínculo, a resposta vai sem lei nenhuma — inventar artigo é pior que
  // ficar calado, e nenhuma outra fonte entra aqui.
  const vinculosLegais: { referencia: string; confianca: string }[] = [];
  const { data: itensDoProcesso } = await supabase
    .from("mac_historico")
    .select("checklist_item_id")
    .eq("processo_codigo", codigo)
    .not("checklist_item_id", "is", null)
    .limit(200);

  const idsItens = [...new Set((itensDoProcesso ?? []).map((i: any) => i.checklist_item_id))].slice(0, 50);
  if (idsItens.length > 0) {
    const { data: vinculos } = await supabase
      .from("mac_bip_vinculos")
      .select("confianca, bdi_lei_fragmentos(referencia)")
      .in("mac_item_id", idsItens)
      .limit(20);
    for (const v of vinculos ?? []) {
      const ref = (v as any)?.bdi_lei_fragmentos?.referencia;
      if (ref) vinculosLegais.push({ referencia: String(ref), confianca: String((v as any).confianca) });
    }
  }

  // --- numeração do próprio usuário (não expõe faixa de terceiro)
  const { data: numeracao } = await supabase
    .from("vw_bdi_numeracao_saldo")
    .select("tipo, restantes, situacao")
    .eq("usuario_id", ctx.userId);

  const entrada: EntradaVigia = {
    processo: processo as any,
    retrabalho: retrabalho ?? null,
    exigenciasRecorrentes,
    vinculosLegais,
    numeracao: (numeracao ?? []) as any,
  };

  return NextResponse.json({
    ok: true,
    avisos: montarAvisos(entrada),
    triagem: triar(entrada),
  });
}
