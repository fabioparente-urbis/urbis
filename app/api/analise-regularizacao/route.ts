import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIPO = "regularizacao";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo");
  // Sessão 5A: filtro opcional por assunto. Se não vier, mantém compatibilidade
  // legada (rota usada hoje só pelo front de Regularização, que segue passando
  // apenas `codigo`).
  const assunto_id = searchParams.get("assunto_id");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });

  let query = supabase
    .from("analises_mac")
    .select("*")
    .eq("processo_codigo", codigo)
    .eq("tipo_processo", TIPO)
    .order("numero_analise", { ascending: false });

  // Só aplica o filtro se assunto_id for um UUID válido — evita injeção no .or().
  if (assunto_id && /^[0-9a-f-]{36}$/i.test(assunto_id)) {
    query = query.or(`assunto_id.eq.${assunto_id},assunto_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      processo_codigo, itens, observacoes, observacoes_por_aba, status, numero_revisao, historico_analises, fontes, aceites,
      // Sessão 5A: opcional, grava se vier.
      assunto_id,
    } = body;
    if (!processo_codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });

    const cookieHeader = req.headers.get("cookie") || "";
    const analistaId = cookieHeader.match(/urbis_id=([^;]+)/)?.[1] ?? null;

    const { data: existentes } = await supabase
      .from("analises_mac")
      .select("numero_analise")
      .eq("processo_codigo", processo_codigo)
      .eq("tipo_processo", TIPO)
      .order("numero_analise", { ascending: false })
      .limit(1);

    const proximoNumero = existentes && existentes.length > 0 ? existentes[0].numero_analise + 1 : 1;

    if (proximoNumero > 5) {
      return NextResponse.json({ ok: false, erro: "Limite de 5 analises atingido. Processo deve ser indeferido." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("analises_mac")
      .insert({
        processo_codigo,
        tipo_processo: TIPO,
        analista_id: analistaId,
        numero_analise: proximoNumero,
        status: status || "em_andamento",
        itens: itens || {},
        fontes: fontes || {},
        aceites: aceites || {},
        observacoes: observacoes || "",
        observacoes_por_aba: observacoes_por_aba || {},
        modelo_id: body.modelo_id || null,
        ...(Number.isInteger(Number(numero_revisao)) ? { numero_revisao: Number(numero_revisao) } : {}),
        ...(historico_analises !== undefined ? { historico_analises: historico_analises ?? "" } : {}),
        ...(assunto_id !== undefined ? { assunto_id: assunto_id ?? null } : {}),
      })
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id, itens, observacoes, observacoes_por_aba, status, modelo_id, numero_revisao, historico_analises, fontes, aceites,
      // Sessão 5A: opcional, atualiza se vier.
      assunto_id,
    } = body;
    if (!id) return NextResponse.json({ ok: false, erro: "id obrigatorio" }, { status: 400 });

    // ── Histórico BDI ────────────────────────────────────────
    if (itens) {
      const { data: analiseAtual } = await supabase
        .from("analises_mac")
        .select("itens, processo_codigo, tipo_processo, modelo_id, analista_id")
        .eq("id", id).maybeSingle();
      const itensAnteriores = ((analiseAtual as any)?.itens || {}) as Record<string, string>;
      const itensNovos = (itens || {}) as Record<string, string>;
      const alterados = Object.keys(itensNovos).filter(k => itensNovos[k] !== itensAnteriores[k]);
      if (alterados.length > 0 && analiseAtual) {
        const [{ data: proc }, { data: analista }, { data: checkItens }] = await Promise.all([
          supabase.from("processos").select("dados").eq("codigo", (analiseAtual as any).processo_codigo).maybeSingle(),
          supabase.from("usuarios").select("nome, gerencia").eq("id", (analiseAtual as any).analista_id || "").maybeSingle(),
          supabase.from("mac_checklist_itens").select("id, grupo, texto, ref").eq("modelo_id", (analiseAtual as any).modelo_id).eq("ativo", true),
        ]);
        const d = (proc as any)?.dados || {};
        const v = (campo: string) => d[campo]?.valor ?? null;
        const idxItem = new Map(((checkItens || []) as any[]).map((i: any) => [i.id, i]));
        const registros = alterados.map(itemId => {
          const it = idxItem.get(itemId) as any;
          return {
            analise_id: id,
            processo_codigo: (analiseAtual as any).processo_codigo,
            tipo_processo: (analiseAtual as any).tipo_processo,
            area_total: v("areaTotal") ? Number(v("areaTotal")) : null,
            analista_id: (analiseAtual as any).analista_id,
            analista_nome: (analista as any)?.nome ?? null,
            analista_gerencia: (analista as any)?.gerencia ?? null,
            proprietario: v("proprietario"),
            autor_levantamento: v("autorLevantamento") ?? v("autor_levantamento"),
            autor_projeto: v("autorProjeto") ?? v("autor_projeto"),
            checklist_item_id: itemId,
            aba: it?.grupo ?? null,
            item_texto: it?.texto ?? null,
            referencia_legal: it?.ref ?? null,
            status_anterior: itensAnteriores[itemId] ?? null,
            status_novo: itensNovos[itemId],
          };
        });
        await supabase.from("mac_historico").insert(registros);
      }
      // Observações por aba
      if (body.observacoes_por_aba) {
        const obsAntes = ((analiseAtual as any).itens && (analiseAtual as any).observacoes_por_aba || {}) as Record<string, string>;
        const obsNovo = body.observacoes_por_aba as Record<string, string>;
        const { data: obsAnalise } = await supabase.from("analises_mac").select("observacoes_por_aba").eq("id", id).maybeSingle();
        const obsAntesReal = ((obsAnalise as any)?.observacoes_por_aba || {}) as Record<string, string>;
        const abasAlteradas = Object.keys(obsNovo).filter(k => obsNovo[k] !== obsAntesReal[k] && obsNovo[k]?.trim());
        if (abasAlteradas.length > 0) {
          const obsRegistros = abasAlteradas.map(aba => ({
            analise_id: id,
            processo_codigo: (analiseAtual as any).processo_codigo,
            tipo_processo: (analiseAtual as any).tipo_processo,
            analista_id: (analiseAtual as any).analista_id,
            analista_nome: null,
            analista_gerencia: null,
            aba,
            item_texto: obsNovo[aba],
            status_anterior: obsAntesReal[aba] ?? null,
            status_novo: "observacao",
          }));
          await supabase.from("mac_historico").insert(obsRegistros);
        }
      }
    }
    // ─────────────────────────────────────────────────────────

    const { error } = await supabase
      .from("analises_mac")
      .update({
        itens,
        fontes: fontes || {},
        aceites: aceites || {},
        observacoes,
        observacoes_por_aba,
        status,
        ...(modelo_id ? { modelo_id } : {}),
        ...(Number.isInteger(Number(numero_revisao)) ? { numero_revisao: Number(numero_revisao) } : {}),
        ...(historico_analises !== undefined ? { historico_analises: historico_analises ?? "" } : {}),
        ...(assunto_id !== undefined ? { assunto_id: assunto_id ?? null } : {}),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
