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
    .from("mac_analises_puladas").select("numero_analise, fixada").eq("processo_codigo", codigo);
  if (error) return NextResponse.json({ ok: true, puladas: [] }); // tabela ainda não migrada
  return NextResponse.json({
    ok: true,
    puladas: (data ?? []).map((r: any) => ({ numero: Number(r.numero_analise), fixada: !!r.fixada })),
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

  // Não pula análise que já existe (tem itens/despacho): a marca é só para o que NÃO foi feito aqui.
  const { data: existente } = await supabaseAdmin.from("analises_mac")
    .select("id").eq("processo_codigo", codigo).eq("numero_analise", numero).is("excluido_em", null).limit(1);
  if (existente?.length)
    return NextResponse.json({ ok: false, erro: `A Análise ${numero} já existe neste processo; só dá para pular uma análise que ainda não foi aberta.` }, { status: 409 });

  const { error } = await supabaseAdmin.from("mac_analises_puladas").upsert(
    { processo_codigo: codigo, numero_analise: numero, fixada: false, usuario_id: u.id },
    { onConflict: "processo_codigo,numero_analise", ignoreDuplicates: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
