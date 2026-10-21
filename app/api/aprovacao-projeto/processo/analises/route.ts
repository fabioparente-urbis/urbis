// ============================================================
// SLOT 5 — APROVAÇÃO DE PROJETO · lista das análises do MAC do processo, só leitura, rota PRÓPRIA
// do slot. CÓPIA POR LEITURA do GET de app/api/analise-regularizacao/route.ts, 16/10/2026
// (separação do Slot 5, molde da Etapa 2 em docs/URBIS_PLANO_SLOTS_3_4_PED.md). Usada pela faixa
// "Análise N concluída — Despacho nº … e Parecer nº …" da ficha do LIP do Slot 5, que antes lia
// pela rota da Regularização (ela descobria o slot pelo processo, então o resultado era o mesmo).
// Diferenças: tipo fixo slot_05 (não depende do processo); exige sessão (a original não exigia);
// só GET — criar/salvar análise do Slot 5 continua em /api/mac/slot-05/*.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { SLUG_APROVACAO_PROJETO } from "@/lib/aprovacaoProjeto/identidade";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const codigo = req.nextUrl.searchParams.get("codigo");
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatorio" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("analises_mac")
    .select("*")
    .eq("processo_codigo", codigo)
    // `ilike` como na original: uma troca de grafia não esconde histórico.
    .ilike("tipo_processo", SLUG_APROVACAO_PROJETO)
    // Análise na lixeira não aparece, mas continua no banco e em /admin/lixeira.
    .is("excluido_em", null)
    .order("numero_analise", { ascending: false });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}
