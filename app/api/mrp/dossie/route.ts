// ============================================================
// GET /api/mrp/dossie?codigo=
// Devolve o dossiê de produtividade de um processo:
//   - dados básicos extraídos de processos.dados
//   - timeline das análises (analises_mac) + despachos do MRP
//   - score de complexidade
//   - resumo do checklist (% conformes / não / NA)
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { calcularScoreComplexidade, extrairMetricasProcesso } from "@/lib/mrp";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const codigo = new URL(req.url).searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

  // Processo (qualquer tipo do mesmo código)
  const { data: procs } = await supabaseAdmin
    .from("processos")
    .select("codigo, tipo_processo, dados, analista_id, tags, numero_processo_fisico")
    .eq("codigo", codigo);

  if (!procs || procs.length === 0) {
    return NextResponse.json({ ok: false, erro: "Processo não encontrado" }, { status: 404 });
  }

  const proc = procs[0] as any;

  // Autorização: analista só vê os próprios processos; gerente, da gerência;
  // admin/diretora, todos.
  if (!auth.irrestrito) {
    if (auth.gerencia) {
      // gerente: confere se o analista responsável pertence à sua gerência
      if (proc.analista_id) {
        const { data: an } = await supabaseAdmin
          .from("usuarios").select("gerencia").eq("id", proc.analista_id).maybeSingle();
        if ((an as any)?.gerencia !== auth.gerencia) {
          return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });
        }
      }
    } else {
      if (proc.analista_id !== auth.userId) {
        return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });
      }
    }
  }

  // Análises do MAC (todos os tipos)
  const { data: analises } = await supabaseAdmin
    .from("analises_mac")
    .select("id, tipo_processo, numero_analise, numero_revisao, status, criado_em, atualizado_em, analista_id, itens, modelo_id")
    .eq("processo_codigo", codigo)
    .order("criado_em", { ascending: true });

  // Despachos do MRP
  const { data: despachos } = await supabaseAdmin
    .from("mrp_registros")
    .select("*")
    .eq("processo_codigo", codigo)
    .order("data_despacho", { ascending: true });

  // Nomes dos analistas envolvidos
  const ids = Array.from(new Set([
    proc.analista_id,
    ...((analises ?? []).map((a: any) => a.analista_id)),
    ...((despachos ?? []).map((d: any) => d.usuario_id)),
  ].filter(Boolean)));
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await supabaseAdmin.from("usuarios").select("id, nome").in("id", ids);
    for (const u of us ?? []) nomes.set((u as any).id, (u as any).nome);
  }

  // Timeline ordenada cronologicamente
  type EventoTimeline = {
    tipo: "analise" | "despacho";
    data: string;
    titulo: string;
    detalhe: string;
    analista_id: string | null;
    analista_nome: string;
    duracao_dias?: number;
    status?: string;
  };
  const timeline: EventoTimeline[] = [];
  let ultimaData: number | null = null;
  for (const a of analises ?? []) {
    const inicio = new Date((a as any).criado_em).getTime();
    const dur = ultimaData ? (inicio - ultimaData) / 86400000 : 0;
    timeline.push({
      tipo: "analise",
      data: (a as any).criado_em,
      titulo: `A${(a as any).numero_analise}${(a as any).numero_revisao > 1 ? ` (rev ${(a as any).numero_revisao})` : ""}`,
      detalhe: `Análise ${(a as any).tipo_processo} — status: ${(a as any).status}`,
      analista_id: (a as any).analista_id ?? null,
      analista_nome: nomes.get((a as any).analista_id) ?? "—",
      duracao_dias: dur > 0 ? Math.round(dur * 10) / 10 : 0,
      status: (a as any).status,
    });
    ultimaData = inicio;
  }
  for (const d of despachos ?? []) {
    timeline.push({
      tipo: "despacho",
      data: (d as any).data_despacho,
      titulo: `Despacho ${(d as any).numero_despacho ?? "—"}`,
      detalhe: `${(d as any).tipo_despacho} (${(d as any).pontos} pts)`,
      analista_id: (d as any).usuario_id ?? null,
      analista_nome: nomes.get((d as any).usuario_id) ?? "—",
    });
  }
  timeline.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  // Resumo do checklist (última análise)
  const ultima = (analises ?? [])[analises!.length - 1] as any;
  let checklist = { conformes: 0, nao_conformes: 0, nao_aplica: 0, nao_respondido: 0, total: 0 };
  if (ultima?.itens) {
    const itens = ultima.itens as Record<string, string>;
    for (const v of Object.values(itens)) {
      checklist.total += 1;
      if (v === "conforme") checklist.conformes += 1;
      else if (v === "nao_conforme") checklist.nao_conformes += 1;
      else if (v === "nao_aplica") checklist.nao_aplica += 1;
      else checklist.nao_respondido += 1;
    }
  }

  // Score de complexidade do processo
  const teveInd = (despachos ?? []).some((d: any) => d.tipo_despacho === "indeferimento");
  const numAnaliseMax = (analises ?? []).reduce((m, a: any) => Math.max(m, Number(a.numero_analise ?? 1)), 1);
  const teveRevisao = (analises ?? []).some((a: any) => Number(a.numero_revisao ?? 1) > 1);
  const complexidade = calcularScoreComplexidade({
    revisao: teveRevisao,
    numero_analise: numAnaliseMax,
    teve_ind: teveInd,
    teve_embargo: false,
  });

  const metricas = extrairMetricasProcesso(proc.dados);

  return NextResponse.json({
    ok: true,
    data: {
      processo: {
        codigo,
        tipo_processo: proc.tipo_processo,
        numero_processo_fisico: proc.numero_processo_fisico,
        tags: proc.tags ?? [],
        analista_id: proc.analista_id,
        analista_nome: nomes.get(proc.analista_id) ?? "—",
        ...metricas,
      },
      timeline,
      checklist,
      complexidade,
    },
  });
}
