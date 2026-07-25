// app/api/admin/assuntos/zerar/route.ts
//
// Zerar um slot (assunto): apaga LIP + MAC + prompts clonados e devolve
// nome/slug de fábrica. Operação destrutiva e irreversível — por isso os
// guardas abaixo. Ver lib/slots.ts para o que é (e o que nunca é) apagado.
//
//   GET  /api/admin/assuntos/zerar?id=<uuid>
//        -> prévia: inventário do que será apagado + motivo de bloqueio,
//           se houver. É o que alimenta os dois avisos da tela.
//   POST /api/admin/assuntos/zerar  { id, confirmacao }
//        -> executa. `confirmacao` tem que ser exatamente o nome atual do
//           slot (o que o admin digita no segundo aviso).
//
// Guardas (todos no servidor — a tela não é autoridade):
//   1. sessão válida + perfil irrestrito (Administrador / Diretora)
//   2. o slot fixo `regularizacao` nunca pode ser zerado
//   3. o slot precisa estar INATIVO (desligue antes de zerar)
//   4. nenhum trabalho real vinculado (processos/análises/MRP/MDP)
//   5. confirmação digitada tem que bater com o nome do slot

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { inventariarSlot, zerarSlot, SLUG_FIXO } from "@/lib/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Assunto = { id: string; slug: string; nome: string; ativo: boolean; ordem: number };

async function carregarAlvo(req: NextRequest, id: string | undefined) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return { erro: ctx };
  if (!ctx.irrestrito) {
    return {
      erro: NextResponse.json(
        { ok: false, erro: "Acesso restrito a Administrador / Diretora." },
        { status: 403 },
      ),
    };
  }
  if (!id) {
    return { erro: NextResponse.json({ ok: false, erro: "Campo `id` obrigatório." }, { status: 400 }) };
  }
  const { data, error } = await supabaseAdmin
    .from("assuntos").select("id, slug, nome, ativo, ordem").eq("id", id).maybeSingle();
  if (error) return { erro: NextResponse.json({ ok: false, erro: error.message }, { status: 500 }) };
  if (!data) return { erro: NextResponse.json({ ok: false, erro: "Slot não encontrado." }, { status: 404 }) };
  return { ctx, assunto: data as Assunto };
}

/** Motivo pelo qual o slot NÃO pode ser zerado — null se estiver liberado. */
function impedimento(assunto: Assunto, bloqueiosTotal: number): string | null {
  if (assunto.slug === SLUG_FIXO) return "O slot Regularização é o modelo-mestre do sistema e não pode ser zerado.";
  if (assunto.ativo) return "Desative o slot antes de zerar (desligue o botão Ativo e salve).";
  if (bloqueiosTotal > 0) return "Este slot tem trabalho real vinculado (processos, análises, MRP ou MDP). Zerar aqui só apaga configuração — mova ou exclua esses registros primeiro.";
  return null;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? undefined;
  const alvo = await carregarAlvo(req, id);
  if (alvo.erro) return alvo.erro;
  const { assunto } = alvo;

  try {
    const inventario = await inventariarSlot(assunto!.id);
    return NextResponse.json({
      ok: true,
      data: {
        assunto,
        inventario,
        impedimento: impedimento(assunto!, inventario.bloqueios.total),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao inventariar." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: "Body inválido." }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id.trim() : undefined;
  const alvo = await carregarAlvo(req, id);
  if (alvo.erro) return alvo.erro;
  const { ctx, assunto } = alvo;

  try {
    const inventario = await inventariarSlot(assunto!.id);
    const motivo = impedimento(assunto!, inventario.bloqueios.total);
    if (motivo) {
      return NextResponse.json({ ok: false, erro: motivo, inventario }, { status: 409 });
    }

    const confirmacao = typeof body?.confirmacao === "string" ? body.confirmacao.trim() : "";
    if (confirmacao !== assunto!.nome.trim()) {
      return NextResponse.json(
        { ok: false, erro: `Confirmação não confere. Digite exatamente: ${assunto!.nome}` },
        { status: 400 },
      );
    }

    const resultado = await zerarSlot({ id: assunto!.id, ordem: assunto!.ordem });

    // Trilha de auditoria — operação destrutiva não pode passar em branco.
    await supabaseAdmin.from("auditoria_log").insert({
      tabela: "assuntos",
      registro_id: assunto!.id,
      operacao: "SLOT_ZERADO",
      dados_antes: { slug: assunto!.slug, nome: assunto!.nome, ordem: assunto!.ordem, apagado: resultado.apagado },
      dados_depois: { slug: resultado.slug, nome: resultado.nome, ativo: false, por: ctx!.userId },
    }).then(({ error }) => { if (error) console.error("[zerar] auditoria falhou:", error.message); });

    const { data: atualizado } = await supabaseAdmin
      .from("assuntos").select("id, slug, nome, ativo, ordem, criado_em").eq("id", assunto!.id).single();

    return NextResponse.json({ ok: true, data: atualizado, apagado: resultado.apagado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao zerar." }, { status: 500 });
  }
}
