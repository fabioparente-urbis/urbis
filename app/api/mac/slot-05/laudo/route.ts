/**
 * app/api/mac/slot-05/laudo/route.ts — gera o Laudo de Análise do Slot 5 (.xlsx), EXCLUSIVO do Slot 5.
 *
 * Devolve a planilha pronta para download. Todo o conteúdo sai do LIP (processos.dados) — o mesmo
 * cálculo que o Excel do Fábio faz hoje no Painel/Laudo5, reescrito em lib/mac-motor/slot5/laudoSlot5.ts.
 * A assinatura é o usuário logado (quem emite assina), como no despacho.
 *
 * NÃO consome número de faixa: o Laudo não é despacho nem parecer (manual do MAC, seção 8.3). O
 * que o LIP não tem sai vazio e volta em `X-Avisos` — nada é preenchido por chute.
 *
 * Isolada do Slot 1: não importa app/api/mac/gerar-laudo nem lib/geradores/gerarLaudo.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { gerarLaudoSlot5 } from "@/lib/geradores/gerarLaudoSlot5";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const dados = (resolucao.processo.dados ?? {}) as Record<string, { valor?: unknown }>;
    if (!Object.values(dados).some((v) => v?.valor)) {
      return NextResponse.json({
        ok: false, erro: "O LIP deste processo está vazio — leia a pasta no LIP antes de gerar o laudo.",
      }, { status: 400 });
    }

    const { data: membro } = await supabaseAdmin
      .from("usuarios").select("nome, cargo").eq("id", usuario.id).maybeSingle();
    const assinatura = [(membro as any)?.nome || "—", (membro as any)?.cargo, "DIRAAP/SEFIC", "PREFEITURA DE GOIÂNIA"]
      .filter(Boolean).join("\n");

    const { buffer, avisos } = await gerarLaudoSlot5({ dados, assinatura });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="LAUDO_${codigo}.xlsx"`,
        // A tela mostra o que ficou para o analista completar/conferir na planilha.
        "X-Avisos": encodeURIComponent(JSON.stringify(avisos)),
        "X-Avisos-Total": String(avisos.length),
      },
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/laudo]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
