import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

// Política de retenção do urbi_historico, decidida pelo Fábio em 02/09/2026:
// preserva estatística e auditoria (linha, pose_usada, usuario_id, criado_em),
// mas não guarda o texto de pergunta/resposta pessoais para sempre. Anonimiza
// (não apaga a linha) quando `criado_em` passa de 18 meses.
//
// Nunca roda sozinho: não há cron nenhum chamando esta rota. É ação manual do
// Administrador, um clique de cada vez — mesmo espírito de "nunca emitir
// documento no lugar do analista" do CLAUDE.md, aplicado a apagar dado.
const MESES_RETENCAO = 18;
const TEXTO_ANONIMIZADO = "[anonimizado — retenção de 18 meses, ver política de urbi_historico]";

function limiteData(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - MESES_RETENCAO);
  return d.toISOString();
}

/** GET — quantas linhas seriam afetadas agora, sem alterar nada (pré-visualização). */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao Administrador." }, { status: 403 });
  }

  const { count, error } = await supabaseAdmin
    .from("urbi_historico")
    .select("*", { count: "exact", head: true })
    .lt("criado_em", limiteData())
    .neq("mensagem_usuario", TEXTO_ANONIMIZADO);

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, elegiveis: count ?? 0, limiteMeses: MESES_RETENCAO });
}

/** POST — anonimiza de verdade as linhas elegíveis. Ação explícita, um clique por vez. */
export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.perfis.includes("Administrador")) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao Administrador." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("urbi_historico")
    .update({ mensagem_usuario: TEXTO_ANONIMIZADO, resposta_urbi: TEXTO_ANONIMIZADO })
    .lt("criado_em", limiteData())
    .neq("mensagem_usuario", TEXTO_ANONIMIZADO)
    .select("id");

  if (error) {
    console.error("[urbi-historico/retencao] falha ao anonimizar:", error.message);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, anonimizadas: data?.length ?? 0 });
}
