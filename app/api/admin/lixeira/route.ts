// app/api/admin/lixeira/route.ts
//
// Lixeira de processos. Excluir deixou de apagar: marca `excluido_em` e o
// processo vem parar aqui, com quem criou, quem excluiu, o assunto e se
// chegou a sair documento — que é o que decide se vale restaurar.
//
//   GET    /api/admin/lixeira            -> lista o que está na lixeira
//   POST   /api/admin/lixeira { id }     -> restaura
//   DELETE /api/admin/lixeira { id }     -> apaga de vez (um)
//   DELETE /api/admin/lixeira { tudo:true } -> esvazia
//
// Restaurar: qualquer perfil irrestrito. Apagar de vez: só Administrador —
// é a única operação sem volta do sistema.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guarda(req: NextRequest, exigeAdmin = false) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return { erro: ctx };
  if (!ctx.irrestrito) {
    return { erro: NextResponse.json({ ok: false, erro: "Acesso restrito a Administrador / Diretora." }, { status: 403 }) };
  }
  if (exigeAdmin && !ctx.perfis.includes("Administrador")) {
    return { erro: NextResponse.json({ ok: false, erro: "Apagar definitivamente é exclusivo do Administrador." }, { status: 403 }) };
  }
  return { ctx };
}

export async function GET(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;

  // A lixeira guarda duas coisas: processos e análises do MAC. Análise
  // descartada nao pode sumir do mundo — o historico dela pode ser o
  // unico registro de um despacho que saiu para o interessado.
  if (req.nextUrl.searchParams.get("tipo") === "analises") {
    const { data, error } = await supabaseAdmin
      .from("analises_mac")
      .select("id, processo_codigo, tipo_processo, numero_analise, status, criado_em, analista_id, numero_despacho, numero_parecer, numero_despacho_interno, excluido_em, excluido_por, excluido_motivo")
      .not("excluido_em", "is", null)
      .order("excluido_em", { ascending: false });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    const ids = [...new Set((data ?? []).flatMap((a: any) => [a.analista_id, a.excluido_por]).filter(Boolean))];
    const { data: pes } = ids.length
      ? await supabaseAdmin.from("usuarios").select("id, nome").in("id", ids)
      : { data: [] as any[] };
    const nome = Object.fromEntries((pes ?? []).map((u: any) => [u.id, u.nome]));

    return NextResponse.json({
      ok: true,
      data: (data ?? []).map((a: any) => ({
        id: a.id,
        codigo: a.processo_codigo,
        assunto: a.tipo_processo,
        numero_analise: a.numero_analise,
        status: a.status,
        criado_em: a.criado_em,
        criado_por: nome[a.analista_id] ?? null,
        excluido_em: a.excluido_em,
        excluido_por: nome[a.excluido_por] ?? null,
        excluido_motivo: a.excluido_motivo ?? null,
        documentos: [
          a.numero_despacho ? `Despacho ${a.numero_despacho}` : null,
          a.numero_despacho_interno ? `Desp. Interno ${a.numero_despacho_interno}` : null,
          a.numero_parecer ? `Parecer ${a.numero_parecer}` : null,
        ].filter(Boolean),
      })),
    });
  }

  const { data: processos, error } = await supabaseAdmin
    .from("processos")
    .select("id, codigo, tipo_processo, assunto_id, criado_em, analista_id, excluido_em, excluido_por, excluido_motivo, dados")
    .not("excluido_em", "is", null)
    .order("excluido_em", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = processos ?? [];
  if (lista.length === 0) return NextResponse.json({ ok: true, data: [] });

  // Nomes de assunto e de pessoa, para a tela não mostrar UUID.
  const { data: assuntos } = await supabaseAdmin.from("assuntos").select("id, nome, slug");
  const idsPessoas = [...new Set(lista.flatMap((p: any) => [p.analista_id, p.excluido_por]).filter(Boolean))];
  const { data: pessoas } = idsPessoas.length
    ? await supabaseAdmin.from("usuarios").select("id, nome").in("id", idsPessoas)
    : { data: [] as any[] };
  const nomePessoa = Object.fromEntries((pessoas ?? []).map((u: any) => [u.id, u.nome]));
  const nomeAssunto = Object.fromEntries((assuntos ?? []).map((a: any) => [a.id, a.nome]));
  const assuntoPorSlug = Object.fromEntries((assuntos ?? []).map((a: any) => [a.slug, a.nome]));

  // Documento emitido é o que pesa na decisão de restaurar: processo que
  // já gerou despacho ou parecer saiu para o interessado.
  const codigos = lista.map((p: any) => p.codigo);
  const { data: analises } = await supabaseAdmin
    .from("analises_mac")
    .select("processo_codigo, numero_analise, numero_despacho, numero_parecer, numero_despacho_interno")
    .in("processo_codigo", codigos);

  const porCodigo: Record<string, { analises: number; documentos: string[] }> = {};
  for (const a of analises ?? []) {
    const r = porCodigo[a.processo_codigo] ?? (porCodigo[a.processo_codigo] = { analises: 0, documentos: [] });
    r.analises++;
    if (a.numero_despacho) r.documentos.push(`Despacho ${a.numero_despacho}`);
    if (a.numero_despacho_interno) r.documentos.push(`Desp. Interno ${a.numero_despacho_interno}`);
    if (a.numero_parecer) r.documentos.push(`Parecer ${a.numero_parecer}`);
  }

  return NextResponse.json({
    ok: true,
    data: lista.map((p: any) => ({
      id: p.id,
      codigo: p.codigo,
      assunto: nomeAssunto[p.assunto_id] ?? assuntoPorSlug[p.tipo_processo] ?? p.tipo_processo,
      interessado: p.dados?.proprietario?.valor ?? null,
      criado_em: p.criado_em,
      criado_por: nomePessoa[p.analista_id] ?? null,
      excluido_em: p.excluido_em,
      excluido_por: nomePessoa[p.excluido_por] ?? null,
      excluido_motivo: p.excluido_motivo ?? null,
      analises: porCodigo[p.codigo]?.analises ?? 0,
      documentos: porCodigo[p.codigo]?.documentos ?? [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;
  const { id, tipo } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório." }, { status: 400 });
  const tabela = tipo === "analises" ? "analises_mac" : "processos";

  const { error } = await supabaseAdmin
    .from(tabela)
    .update({ excluido_em: null, excluido_por: null, excluido_motivo: null })
    .eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  await supabaseAdmin.from("auditoria_log").insert({
    tabela, registro_id: id, operacao: "RESTAURADO_DA_LIXEIRA",
    dados_antes: null, dados_depois: { por: g.ctx!.userId },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guarda(req, true);
  if (g.erro) return g.erro;
  const body = await req.json().catch(() => ({}));

  // Só apaga o que já está na lixeira — nunca um processo ativo.
  const tabelaDel = body?.tipo === "analises" ? "analises_mac" : "processos";
  let alvo = supabaseAdmin.from(tabelaDel).delete().not("excluido_em", "is", null);
  if (body?.tudo === true) {
    // esvaziar
  } else if (body?.id) {
    alvo = alvo.eq("id", body.id);
  } else {
    return NextResponse.json({ ok: false, erro: "Informe `id` ou `tudo: true`." }, { status: 400 });
  }

  const { data: apagados, error } = await alvo.select("id");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  const count = apagados?.length ?? 0;

  await supabaseAdmin.from("auditoria_log").insert({
    tabela: tabelaDel, registro_id: body?.id ?? null, operacao: "LIXEIRA_ESVAZIADA",
    dados_antes: { quantidade: count ?? 0 }, dados_depois: { por: g.ctx!.userId },
  });
  return NextResponse.json({ ok: true, apagados: count ?? 0 });
}
