import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar, verificarOwnership } from "@/lib/auth";

/**
 * Última leitura S3 concluída de um processo, direto de `lip_jobs` — pra gravar no LIP uma leitura
 * que já rodou (e já custou) sem mandar o Gemini ler de novo. Pedido do Fábio, 15/09/2026, depois
 * de perder duas leituras que só existiam na memória da tela do fatiador.
 *
 * Só leitura. Ownership pelo processo (analista só vê o que é dele, irrestrito passa).
 */
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
  const tipo = req.nextUrl.searchParams.get("tipo")?.trim();
  if (!codigo || !tipo) {
    return NextResponse.json({ ok: false, erro: "codigo e tipo são obrigatórios" }, { status: 400 });
  }

  const { data: processo, error: erroProcesso } = await supabaseAdmin
    .from("processos")
    .select("analista_id")
    .eq("codigo", codigo)
    .eq("tipo_processo", tipo)
    .is("excluido_em", null)
    .limit(1)
    .maybeSingle();
  if (erroProcesso) return NextResponse.json({ ok: false, erro: erroProcesso.message }, { status: 500 });
  if (!processo) return NextResponse.json({ ok: false, erro: "Processo não encontrado" }, { status: 404 });

  const semPermissao = verificarOwnership(ctx, (processo as any).analista_id);
  if (semPermissao) return semPermissao;

  const { data: job, error } = await supabaseAdmin
    .from("lip_jobs")
    .select("id, resultado, criado_em")
    .eq("processo_codigo", codigo)
    .eq("status", "concluido")
    .not("resultado", "is", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ ok: false, erro: "Nenhuma leitura concluída para este processo" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    jobId: (job as any).id,
    criadoEm: (job as any).criado_em,
    campos: (job as any).resultado?.campos ?? {},
  });
}
