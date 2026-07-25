// app/api/mac/buscar/route.ts
//
// Busca semântica nos itens do checklist do MAC.
//
// Motivo: a Aprovação de Projeto tem 48 grupos e 561 itens. Achar "onde
// fala de vaga de idoso" percorrendo aba por aba é inviável, e a busca
// por texto puro não acha o item que diz "PCD" quando o analista digita
// "cadeirante". Aqui o Gemini lê os títulos dos grupos e os textos dos
// itens e devolve os que tratam do assunto perguntado.
//
//   POST { assunto_id, pergunta }
//     -> { ok, itens: [{ id, grupo, motivo }], grupos: [nomes] }
//
// O que esta rota NÃO faz: marcar item. Ela só encontra. Quem marca é o
// analista, na tela — inclusive a marcação em massa de "não se aplica".

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { GEMINI_MODEL } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido." }, { status: 400 });
  }

  const assunto_id: string | undefined = typeof body?.assunto_id === "string" ? body.assunto_id : undefined;
  const pergunta: string = typeof body?.pergunta === "string" ? body.pergunta.trim() : "";
  if (!assunto_id || !/^[0-9a-f-]{36}$/i.test(assunto_id)) {
    return NextResponse.json({ ok: false, erro: "assunto_id inválido." }, { status: 400 });
  }
  if (pergunta.length < 3) {
    return NextResponse.json({ ok: false, erro: "Escreva o que você procura." }, { status: 400 });
  }

  // Itens do checklist do assunto.
  const { data: modelos, error: eMod } = await supabaseAdmin
    .from("mac_checklist_modelos").select("id").eq("assunto_id", assunto_id);
  if (eMod) return NextResponse.json({ ok: false, erro: eMod.message }, { status: 500 });
  const modeloIds = (modelos ?? []).map((m: any) => m.id);
  if (modeloIds.length === 0) {
    return NextResponse.json({ ok: true, itens: [], grupos: [] });
  }

  const { data: itens, error: eIt } = await supabaseAdmin
    .from("mac_checklist_itens")
    .select("id, grupo, texto")
    .in("modelo_id", modeloIds)
    .eq("ativo", true)
    .order("ordem");
  if (eIt) return NextResponse.json({ ok: false, erro: eIt.message }, { status: 500 });
  if (!itens?.length) return NextResponse.json({ ok: true, itens: [], grupos: [] });

  // Índice numérico curto: mandar UUID para o modelo é desperdício de
  // token e convite a alucinação. Ele responde com o número da linha.
  const catalogo = itens
    .map((i: any, n: number) => `${n}\t[${i.grupo}]\t${String(i.texto).replace(/\s+/g, " ").slice(0, 260)}`)
    .join("\n");

  const prompt = `Você indexa o checklist de análise de projetos da Prefeitura de Goiânia.
Abaixo, uma linha por item, no formato: NUMERO<TAB>[GRUPO]<TAB>TEXTO.

O analista procura por: "${pergunta}"

Devolva os itens que tratam desse assunto, incluindo os que falam da mesma
coisa com outras palavras (ex.: "cadeirante" e "PCD" e "acessibilidade" são
o mesmo tema; "vaga de idoso" aparece junto de "estacionamento").
Não invente número que não esteja na lista. Se nada tratar do assunto,
devolva lista vazia.

Responda SOMENTE com JSON, sem markdown:
{"itens":[{"n":0,"motivo":"até 8 palavras"}]}

LISTA:
${catalogo}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
        }),
      },
    );
    if (!res.ok) {
      return NextResponse.json({ ok: false, erro: `Gemini: ${await res.text()}` }, { status: 500 });
    }
    const data = await res.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const limpo = texto.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(limpo);

    // Traduz o número de volta para o item real e descarta o que não existe.
    const achados = (Array.isArray(parsed?.itens) ? parsed.itens : [])
      .map((x: any) => ({ item: itens[Number(x?.n)], motivo: String(x?.motivo ?? "").slice(0, 80) }))
      .filter((x: any) => x.item)
      .map((x: any) => ({ id: x.item.id, grupo: x.item.grupo, texto: x.item.texto, motivo: x.motivo }));

    return NextResponse.json({
      ok: true,
      itens: achados,
      grupos: [...new Set(achados.map((a: any) => a.grupo))],
      total_analisado: itens.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha na busca." }, { status: 500 });
  }
}
