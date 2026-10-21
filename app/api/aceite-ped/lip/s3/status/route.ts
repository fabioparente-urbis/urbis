// ============================================================
// SLOT 4 — ACEITE PED · rota PRÓPRIA do slot. CÓPIA POR LEITURA de app/api/lip/s3/status/route.ts,
// 16/10/2026 (Etapa 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md — "5 programas
// independentes"). Código idêntico ao original na data da cópia.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId)
    return NextResponse.json({ ok: false, erro: "jobId obrigatório" }, { status: 400 });

  const { data: job } = await supabaseAdmin
    .from("lip_jobs")
    .select("id, status, resultado, erro, criado_em, atualizado_em")
    .eq("id", jobId)
    .maybeSingle();

  if (!job)
    return NextResponse.json({ ok: false, erro: "Job não encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, ...(job as any) });
}
