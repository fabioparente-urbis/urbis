import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

/**
 * Fase F — "Conversas e ações": tornar visível a distinção entre conversa (urbi_historico,
 * aba Conversas), sugestão automática (urbi_sugestoes recém-geradas, aba Sugestões) e AÇÃO
 * ADMINISTRATIVA de um humano. Esta rota só junta as 2 fontes reais de ação administrativa que
 * já existem hoje — decisão sobre sugestão (urbi_sugestoes.decidido_por/decidido_em) e mudança
 * de configuração (urbi_config.atualizado_por/atualizado_em, coluna nova desta fase) — ordenadas
 * por data. Não é a trilha de auditoria unificada do plano original (Fase E "auditoria de TODA
 * ação do URBI" continua não implementada — pergunta/comando/resposta/bloqueio de custo seguem
 * fragmentados em tabelas sem vínculo comum); isto é só o que já tem fonte de "quem decidiu o
 * quê", sem inventar tabela nova.
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador/Diretora." }, { status: 403 });
  }

  const limitParam = parseInt(new URL(req.url).searchParams.get("limit") ?? "30", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 30;

  const [
    { data: decisoes, error: erroDecisoes },
    { data: configs, error: erroConfigs },
  ] = await Promise.all([
    supabaseAdmin
      .from("urbi_sugestoes")
      .select("id, processo_codigo, tipo, estado, decidido_por, decidido_em")
      .not("decidido_por", "is", null)
      .order("decidido_em", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("urbi_config")
      .select("chave, valor, atualizado_por, atualizado_em")
      .not("atualizado_por", "is", null)
      .order("atualizado_em", { ascending: false })
      .limit(limit),
  ]);

  if (erroDecisoes || erroConfigs) {
    const msg = erroDecisoes?.message ?? erroConfigs?.message ?? "falha desconhecida";
    console.error("[admin/urbi/acoes-administrativas GET] falha ao consultar:", msg);
    return NextResponse.json({ ok: false, erro: "Falha ao consultar ações administrativas." }, { status: 500 });
  }

  const idsUsuario = [...new Set([
    ...(decisoes ?? []).map((d: any) => d.decidido_por),
    ...(configs ?? []).map((c: any) => c.atualizado_por),
  ].filter(Boolean))];
  let nomesPorId = new Map<string, string>();
  if (idsUsuario.length) {
    const { data: usuarios } = await supabaseAdmin.from("usuarios").select("id, nome").in("id", idsUsuario);
    nomesPorId = new Map((usuarios ?? []).map((u: any) => [u.id, u.nome]));
  }

  const linhas = [
    ...(decisoes ?? []).map((d: any) => ({
      tipo: "sugestao_decidida" as const,
      quando: d.decidido_em as string,
      quem_nome: nomesPorId.get(d.decidido_por) ?? null,
      detalhe: `Sugestão "${d.tipo}" do processo ${d.processo_codigo} marcada como "${d.estado}".`,
    })),
    ...(configs ?? []).map((c: any) => ({
      tipo: "config_alterada" as const,
      quando: c.atualizado_em as string,
      quem_nome: nomesPorId.get(c.atualizado_por) ?? null,
      detalhe: `Configuração "${c.chave}" alterada para "${c.valor}".`,
    })),
  ]
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, limit);

  return NextResponse.json({ ok: true, data: linhas });
}
