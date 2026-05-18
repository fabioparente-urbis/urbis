// ============================================================
// GET /api/mrp/equipe?mes=&ano=
// Devolve uma linha por analista visível para o chamador:
//   - Gerente da gerência X → analistas com usuarios.gerencia=X
//   - Admin/Diretora        → todos os analistas
//   - Analista              → vazio (não tem visão de equipe)
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import {
  calcularMetaEfetiva,
  calcularProjecao,
  calcularStatus,
  diasEfetivos,
} from "@/lib/mrp";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const mes = Number(searchParams.get("mes") ?? hoje.getMonth() + 1);
  const ano = Number(searchParams.get("ano") ?? hoje.getFullYear());

  // ── Decide o universo de analistas visíveis ──────────────
  let q = supabaseAdmin
    .from("usuarios")
    .select("id, nome, gerencia, reducao_meta, meta_base_legal, status")
    .eq("status", "Ativo")
    .order("nome");

  if (auth.irrestrito) {
    // todos
  } else if (auth.gerencia) {
    q = q.eq("gerencia", auth.gerencia);
  } else {
    return NextResponse.json({ ok: true, data: [] });
  }

  const { data: analistas, error } = await q;
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // ── Para cada analista: pontos, projeção, status ─────────
  const ehMesCorrente = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diaCorrente = Math.min(hoje.getDate(), diasNoMes);

  const linhas = await Promise.all(
    (analistas ?? []).map(async (u: any) => {
      // Calendário
      const { data: cal } = await supabaseAdmin
        .from("mrp_calendario")
        .select("dias_uteis, ferias, atestado, feriados, facultativo")
        .eq("usuario_id", u.id).eq("ano", ano).eq("mes", mes)
        .maybeSingle();
      const calendario = {
        dias_uteis: Number((cal as any)?.dias_uteis ?? 22),
        ferias: Number((cal as any)?.ferias ?? 0),
        atestado: Number((cal as any)?.atestado ?? 0),
        feriados: Number((cal as any)?.feriados ?? 0),
        facultativo: Number((cal as any)?.facultativo ?? 0),
      };
      const totalEfetivos = diasEfetivos(calendario);

      let passados = totalEfetivos, restantes = 0;
      if (ehMesCorrente) {
        const frac = diaCorrente / diasNoMes;
        passados = Math.round(totalEfetivos * frac);
        restantes = Math.max(0, totalEfetivos - passados);
      } else if (ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes > hoje.getMonth() + 1)) {
        passados = 0; restantes = totalEfetivos;
      }

      // Pontos + área
      const { data: regs } = await supabaseAdmin
        .from("mrp_registros")
        .select("pontos, area_construida")
        .eq("usuario_id", u.id).eq("ano", ano).eq("mes", mes);

      const pts = Math.round((regs ?? []).reduce((a, r: any) => a + Number(r.pontos ?? 0), 0) * 10) / 10;
      const area = Math.round((regs ?? []).reduce((a, r: any) => a + Number(r.area_construida ?? 0), 0) * 100) / 100;
      const meta = calcularMetaEfetiva(Number(u.reducao_meta ?? 0));
      const projecao = calcularProjecao(pts, passados, restantes);
      const status = calcularStatus(projecao, meta);

      return {
        usuario_id: u.id,
        usuario_nome: u.nome,
        gerencia: u.gerencia,
        pontos_mes: pts,
        meta_efetiva: meta,
        projecao,
        status,
        despachos: (regs ?? []).length,
        area_total: area,
        reducao_meta: Number(u.reducao_meta ?? 0),
        meta_base_legal: u.meta_base_legal ?? null,
      };
    }),
  );

  return NextResponse.json({ ok: true, data: linhas });
}

// Admin/Diretora pode atualizar a redução de meta de um analista.
export async function PUT(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!auth.irrestrito) return NextResponse.json({ ok: false, erro: "Apenas admin/diretora" }, { status: 403 });

  const { usuario_id, reducao_meta, meta_base_legal, meta_vigencia_inicio } = await req.json();
  if (!usuario_id) return NextResponse.json({ ok: false, erro: "usuario_id obrigatório" }, { status: 400 });

  const patch: any = {};
  if (reducao_meta !== undefined) patch.reducao_meta = Math.max(0, Math.min(100, Number(reducao_meta)));
  if (meta_base_legal !== undefined) patch.meta_base_legal = meta_base_legal || null;
  if (meta_vigencia_inicio !== undefined) patch.meta_vigencia_inicio = meta_vigencia_inicio || null;

  const { error } = await supabaseAdmin.from("usuarios").update(patch).eq("id", usuario_id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
