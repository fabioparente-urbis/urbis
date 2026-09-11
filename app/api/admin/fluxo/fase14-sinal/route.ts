import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/fluxo/fase14-sinal — gatilho de prontidão da Fase 14 do plano de leitura de PDF
 * ("Aprendizado por correção": cada correção do analista na tela do Fatiador vira candidata a
 * regra). Diferente da Fase 13 (bloqueada por VOLUME estatístico, resolvido com um portão
 * numérico), a Fase 14 está bloqueada porque a matéria-prima dela — correção REAL de documento —
 * ainda não existe: `/fatiador-sei` (Fases 6/7) só foi testado com PDF sintético.
 *
 * Não é uma feature nova: é só um contador honesto sobre `mhd_eventos` (já gravado desde a Fase 6
 * via /api/documentos-sei/fatiador-eventos) — pra ninguém precisar "lembrar" de checar se já é
 * hora de desenhar a Fase 14. Assim que o Fábio corrigir um documento de verdade no Fatiador,
 * este número sai de zero sozinho.
 *
 * CORREÇÃO DA AUDITORIA DE 11/09/2026: contava só `fatiador_correcao`, que a tela emite num único
 * lugar ("juntar ao vizinho anterior"). Dividir um documento no lugar certo e mandar peça para o
 * lixo são correções do analista tanto quanto juntar — e são o que a Fase 14 aprenderia. Do jeito
 * antigo o gatilho tenderia a ficar em zero para sempre, que é exatamente o esquecimento que ele
 * foi criado para evitar. Fica registrado o que NÃO dá para contar ainda: `editarPapel` e
 * `editarTitulo` existem em lib/documentosSei/estadoEdicao.ts mas nenhuma tela os chama — o
 * diálogo de correção do §4.3 do plano ("o coração do aprendizado") ainda não foi construído.
 */
export const runtime = "nodejs";

/** Ações da tela que são, de fato, o analista corrigindo o que o fatiador propôs. */
const TIPOS_DE_CORRECAO = ["fatiador_correcao", "fatiador_corte", "fatiador_lixo"];

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador." }, { status: 403 });
  }

  const { data, error, count } = await supabaseAdmin
    .from("mhd_eventos")
    .select("processo_codigo, criado_em, tipo", { count: "exact" })
    .in("tipo", TIPOS_DE_CORRECAO)
    .order("criado_em", { ascending: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const linhas = (data ?? []) as { processo_codigo: string; criado_em: string; tipo: string }[];
  const porTipo: Record<string, number> = {};
  for (const l of linhas) porTipo[l.tipo] = (porTipo[l.tipo] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    correcoesReais: count ?? 0,
    porTipo,
    processosDistintos: new Set(linhas.map((l) => l.processo_codigo)).size,
    primeiraCorrecaoEm: linhas.length ? linhas[0].criado_em : null,
    pronta: (count ?? 0) > 0,
  });
}
