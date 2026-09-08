import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { autenticar, verificarOwnership } from "@/lib/auth";
import { montarAvisos, triar, type EntradaVigia, type Aviso } from "@/lib/bdi/vigia";
import { lerRegrasBloqueio } from "@/lib/urbi/regrasBloqueio";

/** "DD/MM/AAAA" (formato usado em mdp_registros.data_despacho) → Date, ou null se ilegível. */
function parseDataBR(v: string | null | undefined): Date | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

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

  // --- condições que impedem a análise (Fase A, 08/09/2026) ---------------
  const regras = await lerRegrasBloqueio();

  const avisosExtras: Aviso[] = [];
  let marcoTemporalReprovado = false;
  let marcoTemporalEvidencia: EntradaVigia["marcoTemporalEvidencia"] = null;
  if (regras.COND_MARCO_TEMPORAL.ativo) {
    // Pega o evento MAIS RECENTE (não "algum dia já existiu") — achado real em 08/09/2026: o
    // registro é gravado toda vez que uma leitura reprova, mas NUNCA existe um evento de
    // correção quando uma leitura seguinte aprova (só `naoApta===true` grava, ver
    // ProcessoClient.tsx). Sem isso, um laudo antigo reprovado ficava bloqueando pra sempre,
    // mesmo com laudo novo corrigido depois e o processo seguindo normalmente (despacho
    // interno emitido — não indeferimento, contradição que o Fábio notou na tela).
    const { data: eventoMarco } = await supabase
      .from("auditoria_eventos")
      .select("id, detalhe, criado_em")
      .eq("processo_codigo", codigo)
      .eq("acao", "LIP_MARCO_TEMPORAL_REPROVADO")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eventoMarco) {
      const tagsProc: any[] = Array.isArray((processo as any).tags) ? (processo as any).tags : [];
      const tempoEvento = Date.parse((eventoMarco as any).criado_em) || 0;
      // Tag de despacho/despacho interno/laudo GRAVADA DEPOIS do evento = atividade seguiu sem
      // indeferir. Não prova que o marco foi corrigido, mas derruba a certeza — vira aviso não
      // bloqueante, pedindo conferência manual, em vez de intervenção afirmando fato que pode
      // estar superado.
      const tagPosterior = tagsProc.some((t) => {
        if (!t || typeof t !== "object") return false;
        if (!["despacho", "despacho_interno", "laudo"].includes(t.tipo)) return false;
        const tempoTag = Date.parse(t.criado_em ?? "") || 0;
        return tempoTag > tempoEvento;
      });
      marcoTemporalReprovado = !tagPosterior;
      const detalheEvento = (eventoMarco as any).detalhe ?? {};
      marcoTemporalEvidencia = {
        marco: detalheEvento.marco ?? null,
        parecerFiscal: detalheEvento.leitura?.parecerFiscal ?? null,
        estruturaConcluidaAntesDoMarco: detalheEvento.leitura?.estruturaConcluidaAntesDoMarco ?? null,
        dataConclusaoObra: detalheEvento.leitura?.dataConclusaoObra ?? null,
        trecho: detalheEvento.leitura?.trecho ?? null,
        fonte: detalheEvento.leitura?.fonte ?? null,
      };
      if (tagPosterior) {
        avisosExtras.push({
          id: "cond_marco_temporal_possivelmente_superado",
          titulo: "Marco temporal reprovado num laudo antigo — conferir",
          detalhe: `Uma leitura anterior reprovou o marco temporal, mas o processo teve despacho/despacho interno/laudo DEPOIS dessa leitura, sem indeferimento — pode ter sido corrigido por um laudo novo. Confira o laudo mais recente antes de confiar neste alerta.${detalheEvento?.leitura?.trecho ? ` Trecho da leitura antiga: "${detalheEvento.leitura.trecho}".` : ""}`,
          fonte: "auditoria",
          severidade: "alerta",
          bloqueante: false,
        });
      }
    }
  }

  let diasSemUltimaEmissao: number | null = null;
  if (regras.COND_180_DIAS.ativo) {
    const { data: ultimaEmissao } = await supabase
      .from("mdp_registros")
      .select("data_despacho, criado_em")
      .eq("processo_codigo", codigo)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimaEmissao) {
      const dataRef = parseDataBR((ultimaEmissao as any).data_despacho) ?? new Date((ultimaEmissao as any).criado_em);
      diasSemUltimaEmissao = Math.floor((Date.now() - dataRef.getTime()) / 86_400_000);
    }
  }

  const entrada: EntradaVigia = {
    processo: processo as any,
    retrabalho: retrabalho ?? null,
    exigenciasRecorrentes,
    vinculosLegais,
    numeracao: (numeracao ?? []) as any,
    regras,
    marcoTemporalReprovado,
    marcoTemporalEvidencia,
    diasSemUltimaEmissao,
  };

  return NextResponse.json({
    ok: true,
    avisos: [...montarAvisos(entrada), ...avisosExtras],
    triagem: triar(entrada),
  });
}
