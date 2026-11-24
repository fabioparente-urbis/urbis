import { NextRequest, NextResponse } from "next/server";
import { usuarioDaRequisicao, podeAcessarProcesso } from "@/lib/autorizacao";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * "Pular análise" no MAC dos 5 slots (Fábio, 24/11/2026). Liga/desliga enquanto o analista está no
 * MAC; ao sair, POST {acao:"fixar"} deixa a marca definitiva (o desfazer passa a ser recusado).
 * Só computador: nunca expor em /api/mobile/*.
 */
async function autorizar(req: NextRequest, codigo: string) {
  const u = await usuarioDaRequisicao(req);
  if (!u) return { erro: NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 }) };
  if (!codigo) return { erro: NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 }) };
  const aut = await podeAcessarProcesso(u, codigo);
  if (!aut.ok) return { erro: NextResponse.json({ ok: false, erro: aut.erro }, { status: aut.status }) };
  return { u };
}

export async function GET(req: NextRequest) {
  const codigo = new URL(req.url).searchParams.get("codigo") ?? "";
  const a = await autorizar(req, codigo);
  if (a.erro) return a.erro;
  const { data, error } = await supabaseAdmin
    .from("mac_analises_puladas").select("numero_analise, fixada, numero_documento, data_documento").eq("processo_codigo", codigo);
  if (error) return NextResponse.json({ ok: true, puladas: [] }); // tabela ainda não migrada
  return NextResponse.json({
    ok: true,
    puladas: (data ?? []).map((r: any) => ({ numero: Number(r.numero_analise), fixada: !!r.fixada, numeroDocumento: r.numero_documento ?? null, data: r.data_documento ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? "").trim();
  const a = await autorizar(req, codigo);
  if (a.erro) return a.erro;
  const u = a.u!;

  if (body.acao === "fixar") {
    const { error } = await supabaseAdmin.from("mac_analises_puladas")
      .update({ fixada: true, fixada_em: new Date().toISOString() })
      .eq("processo_codigo", codigo).eq("fixada", false);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const numero = Number(body.numero);
  if (!Number.isInteger(numero) || numero < 1 || numero > 20)
    return NextResponse.json({ ok: false, erro: "numero inválido" }, { status: 400 });

  const { data: atual } = await supabaseAdmin.from("mac_analises_puladas")
    .select("fixada").eq("processo_codigo", codigo).eq("numero_analise", numero).maybeSingle();

  if (body.pulada === false) {
    if ((atual as any)?.fixada)
      return NextResponse.json({ ok: false, erro: "Esta marca ficou fixa ao sair do MAC e não pode mais ser desfeita." }, { status: 409 });
    const { error } = await supabaseAdmin.from("mac_analises_puladas").delete()
      .eq("processo_codigo", codigo).eq("numero_analise", numero).eq("fixada", false);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Liberdade total ao analista: pode pular análise vazia OU já preenchida (a preenchida continua abrindo e copiável).
  // O que a marca garante é só a numeração: a próxima nasce depois dela, nunca no número dela.

  // Obrigatório informar o nº do despacho/parecer e a data da análise feita em outro ambiente:
  // despachos e pareceres passam a mostrá-los (Fábio, 24/11/2026).
  const numeroDocumento = String(body.numero_documento ?? "").trim().slice(0, 40);
  const dataDocumento = String(body.data ?? "").trim();
  if (!numeroDocumento)
    return NextResponse.json({ ok: false, erro: "Informe o número do despacho/parecer da análise feita em outro ambiente." }, { status: 400 });
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(dataDocumento) ? new Date(dataDocumento + "T12:00:00Z") : null;
  if (!dt || Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== dataDocumento)
    return NextResponse.json({ ok: false, erro: "Informe a data da análise (dia/mês/ano válidos)." }, { status: 400 });
  if (dt.getTime() > Date.now() + 86400000)
    return NextResponse.json({ ok: false, erro: "A data da análise não pode estar no futuro." }, { status: 400 });
  if ((atual as any)?.fixada)
    return NextResponse.json({ ok: false, erro: "Esta marca ficou fixa ao sair do MAC e não pode mais ser alterada." }, { status: 409 });

  const { error } = await supabaseAdmin.from("mac_analises_puladas").upsert(
    { processo_codigo: codigo, numero_analise: numero, fixada: false, usuario_id: u.id,
      numero_documento: numeroDocumento, data_documento: dataDocumento },
    { onConflict: "processo_codigo,numero_analise" });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
