import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const isAdmin = ctx.perfis.includes("Administrador");
  const url = new URL(req.url);
  const analista = url.searchParams.get("analista") || "";
  const tipo     = url.searchParams.get("tipo") || "dashboard"; // dashboard | tempo | producao
  const periodo  = url.searchParams.get("periodo") || "mes";    // dia | semana | mes | ano

  const analistaFiltro = (!isAdmin || !analista) ? ctx.userId : analista;
  const adminTodos = isAdmin && !analista;

  // --- Janela de tempo ---
  const agora = new Date();
  let desde = new Date();
  if (periodo === "dia")    desde.setHours(0, 0, 0, 0);
  else if (periodo === "semana") desde.setDate(agora.getDate() - 7);
  else if (periodo === "mes")   desde.setDate(1), desde.setHours(0, 0, 0, 0);
  else if (periodo === "ano")   desde = new Date(agora.getFullYear(), 0, 1);

  let base = supabaseAdmin
    .from("auditoria_eventos")
    .select("modulo, acao, processo_codigo, criado_em, analista_nome")
    .gte("criado_em", desde.toISOString());

  if (!adminTodos) base = base.eq("analista_id", analistaFiltro);

  const { data: eventos, error } = await base;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const ev = eventos || [];

  if (tipo === "dashboard") {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const eventosHoje   = ev.filter(e => new Date(e.criado_em) >= hoje).length;
    const processos     = new Set(ev.map(e => e.processo_codigo).filter(Boolean)).size;
    const docs          = ev.filter(e =>
      ["DESPACHO_GERADO","DESPACHO_INTERNO_GERADO","LAUDO_EXCEL_GERADO"].includes(e.acao)
    ).length;

    // Por módulo
    const porModulo: Record<string, number> = {};
    for (const e of ev) porModulo[e.modulo] = (porModulo[e.modulo] || 0) + 1;

    // Top ações
    const porAcao: Record<string, number> = {};
    for (const e of ev) porAcao[e.acao] = (porAcao[e.acao] || 0) + 1;
    const topAcoes = Object.entries(porAcao)
      .sort((a,b) => b[1]-a[1]).slice(0,10)
      .map(([acao, total]) => ({ acao, total }));

    // Heatmap: eventos por dia últimos 365 dias
    const heatmap: Record<string, number> = {};
    const umAnoAtras = new Date(); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    const { data: heatEv } = await (adminTodos
      ? supabaseAdmin.from("auditoria_eventos").select("criado_em").gte("criado_em", umAnoAtras.toISOString())
      : supabaseAdmin.from("auditoria_eventos").select("criado_em").eq("analista_id", analistaFiltro).gte("criado_em", umAnoAtras.toISOString())
    );
    for (const e of (heatEv || [])) {
      const d = e.criado_em.slice(0,10);
      heatmap[d] = (heatmap[d] || 0) + 1;
    }

    return NextResponse.json({ ok: true, tipo: "dashboard", eventosHoje, processos, docs, porModulo, topAcoes, heatmap });
  }

  if (tipo === "tempo") {
    // Busca sessões
    let sessQ = supabaseAdmin
      .from("auditoria_sessoes")
      .select("*")
      .gte("iniciada_em", desde.toISOString())
      .order("iniciada_em", { ascending: true });
    if (!adminTodos) sessQ = sessQ.eq("analista_id", analistaFiltro);
    const { data: sessoes } = await sessQ;

    // Agrega por período
    const agg: Record<string, { bruto: number; liquido: number; idle: number }> = {};
    for (const s of (sessoes || [])) {
      let key = "";
      const d = new Date(s.iniciada_em);
      if (periodo === "dia")    key = `${String(d.getHours()).padStart(2,"0")}h`;
      else if (periodo === "semana" || periodo === "mes") key = s.iniciada_em.slice(0,10);
      else key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

      if (!agg[key]) agg[key] = { bruto: 0, liquido: 0, idle: 0 };
      agg[key].bruto   += s.tempo_bruto_s   || 0;
      agg[key].liquido += s.tempo_liquido_s  || 0;
      agg[key].idle    += Math.max(0, (s.tempo_bruto_s||0) - (s.tempo_liquido_s||0));
    }

    const serie = Object.entries(agg).map(([label, v]) => ({ label, ...v }));
    return NextResponse.json({ ok: true, tipo: "tempo", serie });
  }

  if (tipo === "producao") {
    // Agrupa por data
    const agg: Record<string, { processos: Set<string>; macItens: number; lipCampos: number; docs: number; docsTipos: Record<string,number> }> = {};

    for (const e of ev) {
      let key = "";
      const d = new Date(e.criado_em);
      if (periodo === "dia")    key = `${String(d.getHours()).padStart(2,"0")}h`;
      else if (periodo === "semana" || periodo === "mes") key = e.criado_em.slice(0,10);
      else key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

      if (!agg[key]) agg[key] = { processos: new Set(), macItens: 0, lipCampos: 0, docs: 0, docsTipos: {} };

      if (e.processo_codigo) agg[key].processos.add(e.processo_codigo);
      if (e.acao === "MAC_ITEM_MARCADO")         agg[key].macItens++;
      if (e.acao === "LIP_CAMPO_ALTERADO")       agg[key].lipCampos++;
      if (["DESPACHO_GERADO","DESPACHO_INTERNO_GERADO","LAUDO_EXCEL_GERADO"].includes(e.acao)) {
        agg[key].docs++;
        agg[key].docsTipos[e.acao] = (agg[key].docsTipos[e.acao] || 0) + 1;
      }
    }

    const serie = Object.entries(agg).map(([label, v]) => ({
      label,
      processos: v.processos.size,
      macItens: v.macItens,
      lipCampos: v.lipCampos,
      docs: v.docs,
      docsTipos: v.docsTipos,
    }));

    return NextResponse.json({ ok: true, tipo: "producao", serie });
  }

  return NextResponse.json({ ok: false, erro: "tipo inválido" }, { status: 400 });
}
