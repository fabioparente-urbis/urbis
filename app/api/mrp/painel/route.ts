// ============================================================
// GET /api/mrp/painel?mes=&ano=&usuario_id=
// Devolve o painel completo do analista (próprio ou — se o
// chamador for gerente/admin/diretora — de outro analista).
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import {
  calcularMetaEfetiva,
  calcularProjecao,
  calcularStatus,
  diasEfetivos,
  pontosPorDiaNecessarios,
  faixaArea,
  type PainelResposta,
  type StatusMRP,
} from "@/lib/mrp";

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const mes = Number(searchParams.get("mes") ?? hoje.getMonth() + 1);
  const ano = Number(searchParams.get("ano") ?? hoje.getFullYear());
  const usuarioIdParam = searchParams.get("usuario_id");

  // ── Autorização: quem pode ver quem? ──────────────────────
  // - Analista comum: só ele mesmo.
  // - Gerente da gerência X: ele mesmo + analistas com usuarios.gerencia = X.
  // - Admin/Diretora: qualquer um.
  let alvoId = auth.userId;
  if (usuarioIdParam && usuarioIdParam !== auth.userId) {
    if (auth.irrestrito) {
      alvoId = usuarioIdParam;
    } else if (auth.gerencia) {
      const { data: alvo } = await supabaseAdmin
        .from("usuarios")
        .select("gerencia")
        .eq("id", usuarioIdParam)
        .maybeSingle();
      if ((alvo as any)?.gerencia === auth.gerencia) {
        alvoId = usuarioIdParam;
      } else {
        return NextResponse.json({ ok: false, erro: "Sem permissão para ver este analista" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ ok: false, erro: "Sem permissão para ver este analista" }, { status: 403 });
    }
  }

  // ── Dados do analista (meta ajustável) ────────────────────
  const { data: alvoUsuario } = await supabaseAdmin
    .from("usuarios")
    .select("id, nome, reducao_meta, meta_base_legal, meta_vigencia_inicio")
    .eq("id", alvoId)
    .maybeSingle();

  const reducao = Number((alvoUsuario as any)?.reducao_meta ?? 0);
  const metaEfetiva = calcularMetaEfetiva(reducao);

  // ── Calendário do mês ─────────────────────────────────────
  const { data: calRow } = await supabaseAdmin
    .from("mrp_calendario")
    .select("dias_uteis, ferias, atestado, feriados, facultativo")
    .eq("usuario_id", alvoId)
    .eq("ano", ano).eq("mes", mes)
    .maybeSingle();
  const calendario = {
    dias_uteis: Number((calRow as any)?.dias_uteis ?? 22),
    ferias: Number((calRow as any)?.ferias ?? 0),
    atestado: Number((calRow as any)?.atestado ?? 0),
    feriados: Number((calRow as any)?.feriados ?? 0),
    facultativo: Number((calRow as any)?.facultativo ?? 0),
  };
  const totalEfetivos = diasEfetivos(calendario);

  // ── Registros do mês ──────────────────────────────────────
  const { data: registros } = await supabaseAdmin
    .from("mrp_registros")
    .select("*")
    .eq("usuario_id", alvoId)
    .eq("ano", ano).eq("mes", mes)
    .order("data_despacho", { ascending: true });
  const linhas = (registros ?? []) as any[];

  const pontosAcumulados = Math.round(
    linhas.reduce((acc, r) => acc + Number(r.pontos ?? 0), 0) * 10,
  ) / 10;
  const areaTotal = Math.round(
    linhas.reduce((acc, r) => acc + Number(r.area_construida ?? 0), 0) * 100,
  ) / 100;

  // ── Dias efetivos passados vs restantes (proporcional) ────
  // Aproximação: distribui dias úteis linearmente ao longo do mês
  // calendário. Se for mês passado, "passados" = todos.
  const ehMesCorrente = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
  let diasPassados: number, diasRestantes: number;
  if (ano < hoje.getFullYear() || (ano === hoje.getFullYear() && mes < hoje.getMonth() + 1)) {
    diasPassados = totalEfetivos; diasRestantes = 0;
  } else if (ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes > hoje.getMonth() + 1)) {
    diasPassados = 0; diasRestantes = totalEfetivos;
  } else {
    // Calcula dias úteis passados contando dias corridos até hoje
    // independente de totalEfetivos — evita distorção ao mudar feriados
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const diaCorrente = Math.min(hoje.getDate(), diasNoMes);
    const diasUteisBase = Number(calendario.dias_uteis);
    const fracBase = diaCorrente / diasNoMes;
    // Ausências pessoais (férias/atestado) podem estar nos dias passados
    const ausenciasPessoais = Number(calendario.ferias ?? 0) + Number(calendario.atestado ?? 0);
    const ausenciasPassadas = Math.round(ausenciasPessoais * fracBase);
    diasPassados = Math.max(0, Math.round(diasUteisBase * fracBase) - ausenciasPassadas);
    diasRestantes = Math.max(0, totalEfetivos - diasPassados);
  }
  if (!ehMesCorrente && diasPassados === 0 && diasRestantes === 0) {
    diasPassados = totalEfetivos;
  }

  const projecao = calcularProjecao(pontosAcumulados, diasPassados, diasRestantes);
  const status: StatusMRP = calcularStatus(projecao, metaEfetiva);
  const pontosNecDia = pontosPorDiaNecessarios(pontosAcumulados, metaEfetiva, diasRestantes);

  // ── Histórico 12 meses ────────────────────────────────────
  const historico: PainelResposta["historico_mensal"] = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(ano, mes - 1 - i, 1);
    const m = dt.getMonth() + 1;
    const a = dt.getFullYear();
    const { data: rs } = await supabaseAdmin
      .from("mrp_registros")
      .select("pontos")
      .eq("usuario_id", alvoId)
      .eq("ano", a).eq("mes", m);
    const pts = Math.round((rs ?? []).reduce((acc, r: any) => acc + Number(r.pontos ?? 0), 0) * 10) / 10;
    historico.push({
      mes: m, ano: a, pontos: pts, despachos: (rs ?? []).length,
      resultado: pts >= metaEfetiva * 1.2 ? "EXCELENTE" : pts >= metaEfetiva ? "OK" : "RUIM",
    });
  }

  // ── Estatísticas agregadas do mês ─────────────────────────
  const acc = <K extends string>(k: K) => {
    const m = new Map<string, { count: number; pontos: number; area_total: number }>();
    for (const r of linhas) {
      const key = String(r[k] ?? "—") || "—";
      const cur = m.get(key) ?? { count: 0, pontos: 0, area_total: 0 };
      cur.count += 1;
      cur.pontos += Number(r.pontos ?? 0);
      cur.area_total += Number(r.area_construida ?? 0);
      m.set(key, cur);
    }
    return m;
  };

  const porTipoDespacho = Array.from(acc("tipo_despacho").entries()).map(([tipo, v]) => ({
    tipo, count: v.count, pontos: Math.round(v.pontos * 10) / 10,
  }));
  const porTipoProcesso = Array.from(acc("tipo_processo").entries()).map(([tipo, v]) => ({
    tipo, count: v.count, area_total: Math.round(v.area_total * 100) / 100,
  }));
  const porPorte = Array.from(acc("porte").entries()).map(([porte, v]) => ({
    porte, count: v.count, area_total: Math.round(v.area_total * 100) / 100,
  }));
  const porBairro = Array.from(acc("bairro").entries())
    .sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    .map(([bairro, v]) => ({ bairro, count: v.count, area_total: Math.round(v.area_total * 100) / 100 }));
  const porAssunto = Array.from(acc("assunto").entries())
    .sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    .map(([assunto, v]) => ({ assunto, count: v.count }));

  // Faixa de área
  const faixas = new Map<string, number>();
  for (const r of linhas) {
    const f = faixaArea(Number(r.area_construida ?? 0));
    faixas.set(f, (faixas.get(f) ?? 0) + 1);
  }
  const porFaixaArea = Array.from(faixas.entries()).map(([faixa, count]) => ({ faixa, count }));

  // Dia da semana
  const diaSem = new Map<string, number>();
  for (const r of linhas) {
    const dt = new Date(r.data_despacho);
    const nome = NOMES_DIA[dt.getDay()];
    diaSem.set(nome, (diaSem.get(nome) ?? 0) + 1);
  }
  const porDiaSemana = NOMES_DIA.map((dia) => ({ dia, count: diaSem.get(dia) ?? 0 }));

  // Taxas e tempo médio
  const totRevisao = linhas.filter((r) => r.revisao).length;
  const totInd = linhas.filter((r) => r.tipo_despacho === "indeferimento").length;
  const taxaRevisao = linhas.length ? Math.round((totRevisao / linhas.length) * 1000) / 10 : 0;
  const taxaInd = linhas.length ? Math.round((totInd / linhas.length) * 1000) / 10 : 0;

  const duracoes = linhas
    .filter((r) => r.data_inicio && r.data_despacho)
    .map((r) => (new Date(r.data_despacho).getTime() - new Date(r.data_inicio).getTime()) / 86400000)
    .filter((d) => d >= 0);
  const tempoMedio = duracoes.length
    ? Math.round((duracoes.reduce((a, b) => a + b, 0) / duracoes.length) * 10) / 10
    : 0;

  const resposta: PainelResposta = {
    pontos_acumulados: pontosAcumulados,
    total_despachos: linhas.length,
    area_total: areaTotal,
    meta_efetiva: metaEfetiva,
    projecao,
    status,
    pontos_necessarios_por_dia: pontosNecDia,
    dias_efetivos_passados: diasPassados,
    dias_efetivos_restantes: diasRestantes,
    calendario,
    historico_mensal: historico,
    stats: {
      por_tipo_despacho: porTipoDespacho,
      por_tipo_processo: porTipoProcesso,
      por_porte: porPorte,
      por_faixa_area: porFaixaArea,
      taxa_revisao: taxaRevisao,
      taxa_indeferimento: taxaInd,
      tempo_medio_analise_dias: tempoMedio,
      top_assuntos: porAssunto,
      por_dia_semana: porDiaSemana,
      por_bairro: porBairro,
    },
  };

  return NextResponse.json({
    ok: true,
    data: resposta,
    analista: {
      id: alvoId,
      nome: (alvoUsuario as any)?.nome ?? "",
      reducao_meta: reducao,
      meta_base_legal: (alvoUsuario as any)?.meta_base_legal ?? null,
      meta_vigencia_inicio: (alvoUsuario as any)?.meta_vigencia_inicio ?? null,
    },
  });
}
