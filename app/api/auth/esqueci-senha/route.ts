import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Envia o e-mail de redefinição de senha para o usuário usando a API
// nativa do Supabase Auth (envio gerenciado pelo próprio Supabase, sem
// dependência de provedor SMTP no projeto). Sempre responde { ok: true }
// para evitar enumeração de e-mails cadastrados.

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { ok: false, erro: "E-mail obrigatório" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // A origem de QUEM fez a requisição — nunca uma env var separada que pode
    // divergir do ambiente real (já aconteceu apontar para o domínio de outro
    // projeto). NEXT_PUBLIC_APP_URL vira só um override explícito, opcional.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;

    // Não bloqueamos por erro do provedor: sempre devolvemos ok:true.
    // O Supabase já trata silenciosamente e-mails inexistentes.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/redefinir-senha`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Mesmo em falha de parsing/transporte respondemos ok para não vazar.
    return NextResponse.json({ ok: true });
  }
}
