// app/api/admin/lip/prompt-campos/route.ts
//
// Prévia dos marcadores de prompt resolvidos pelo banco. Serve para o
// admin ver (e copiar) exatamente o texto que o {{CAMPOS_DO_ASSUNTO}} e o
// {{ESQUELETO_JSON}} viram na hora da chamada, sem precisar rodar uma
// leitura de verdade para descobrir.
//
//   GET /api/admin/lip/prompt-campos?assunto_id=<uuid>[&codigo=<processo>]
//     -> { ok, total, campos, esqueleto, vazios }

import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { camposDoAssunto, blocoCampos, esqueletoJson, chavesVazias } from "@/lib/promptCampos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.irrestrito) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador / Diretora." }, { status: 403 });
  }

  const assunto_id = req.nextUrl.searchParams.get("assunto_id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(assunto_id)) {
    return NextResponse.json({ ok: false, erro: "assunto_id inválido." }, { status: 400 });
  }
  const codigo = req.nextUrl.searchParams.get("codigo");

  try {
    const campos = await camposDoAssunto(assunto_id);
    const vazias = codigo ? await chavesVazias(codigo, campos) : null;
    return NextResponse.json({
      ok: true,
      total: campos.length,
      campos: blocoCampos(campos),
      esqueleto: esqueletoJson(campos),
      vazios: vazias
        ? { quantidade: vazias.length, bloco: blocoCampos(campos.filter((c) => vazias.includes(c.chave))) }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao gerar." }, { status: 500 });
  }
}
