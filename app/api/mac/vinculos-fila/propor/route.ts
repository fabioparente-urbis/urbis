/**
 * app/api/mac/vinculos-fila/propor/route.ts — passos 4-6 do procedimento manual: escolher
 * campo/artigo, indicar confiança, registrar justificativa. Cria uma linha PENDENTE em
 * mac_vinculos_propostas — nunca escreve em mac_lip_vinculos/mac_bip_vinculos diretamente (isso só
 * acontece em .../decidir, na aprovação administrativa).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { itemNoEscopoDaFila, fragmentoBipExiste, registrarEventoVinculo } from "@/lib/mac/vinculosFila";

export const runtime = "nodejs";

const CONFIANCAS = new Set(["ALTA", "MEDIA", "BAIXA"]);
const PAPEIS = new Set(["ENTRADA_REGRA", "CONDICAO_APLICABILIDADE", "EVIDENCIA", "PARAMETRO_CALCULO", "CONTEXTO", "RESULTADO_ESPERADO"]);

export async function POST(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  const { itemId, tipo, confianca, justificativa } = body;

  if (!itemId || typeof itemId !== "string") return NextResponse.json({ ok: false, erro: "itemId obrigatório" }, { status: 400 });
  if (tipo !== "LIP" && tipo !== "BIP") return NextResponse.json({ ok: false, erro: "tipo deve ser LIP ou BIP" }, { status: 400 });
  if (!CONFIANCAS.has(confianca)) return NextResponse.json({ ok: false, erro: "confianca deve ser ALTA, MEDIA ou BAIXA" }, { status: 400 });
  if (typeof justificativa !== "string" || justificativa.trim().length === 0) {
    return NextResponse.json({ ok: false, erro: "justificativa é obrigatória" }, { status: 400 });
  }

  const escopo = await itemNoEscopoDaFila(itemId);
  if (!escopo.ok) return NextResponse.json({ ok: false, erro: escopo.erro }, { status: escopo.erro.includes("não encontrado") ? 404 : 400 });

  const insertBase = {
    mac_item_id: itemId,
    tipo,
    confianca,
    justificativa: justificativa.trim(),
    criado_por: ctx.userId,
  };

  let insertRow: Record<string, unknown>;
  if (tipo === "LIP") {
    const { lipChave, papel, obrigatorio } = body;
    if (typeof lipChave !== "string" || lipChave.trim() === "") return NextResponse.json({ ok: false, erro: "lipChave obrigatória para tipo LIP" }, { status: 400 });
    if (!PAPEIS.has(papel)) return NextResponse.json({ ok: false, erro: "papel inválido" }, { status: 400 });
    if (typeof obrigatorio !== "boolean") return NextResponse.json({ ok: false, erro: "obrigatorio (booleano) é obrigatório" }, { status: 400 });
    // "Não citar lei sem vínculo real" aplica-se igual ao LIP: a chave tem que existir de verdade
    // no formulário do assunto — nunca uma string livre inventada pelo analista.
    const { data: campoReal } = await supabaseAdmin
      .from("lip_campos").select("chave, aba_id, lip_abas!inner(assunto_id)")
      .eq("chave", lipChave).eq("lip_abas.assunto_id", escopo.item.assuntoId).maybeSingle();
    if (!campoReal) return NextResponse.json({ ok: false, erro: `campo "${lipChave}" não existe no formulário LIP deste assunto` }, { status: 400 });
    insertRow = { ...insertBase, lip_chave: lipChave, papel, obrigatorio };
  } else {
    const { bipFragmentoId } = body;
    if (typeof bipFragmentoId !== "string" || bipFragmentoId.trim() === "") return NextResponse.json({ ok: false, erro: "bipFragmentoId obrigatório para tipo BIP" }, { status: 400 });
    if (!(await fragmentoBipExiste(bipFragmentoId))) {
      return NextResponse.json({ ok: false, erro: "fragmento do BIP não encontrado — só é possível propor um fragmento real, escolhido pela busca" }, { status: 400 });
    }
    insertRow = { ...insertBase, bip_fragmento_id: bipFragmentoId };
  }

  const { data: proposta, error } = await supabaseAdmin.from("mac_vinculos_propostas").insert(insertRow).select("id").single();
  if (error) {
    const jaPendente = error.message.includes("mac_vinculos_propostas_pendente");
    return NextResponse.json({ ok: false, erro: jaPendente ? "já existe uma proposta pendente para este item e alvo" : error.message }, { status: jaPendente ? 409 : 500 });
  }

  const { data: usuario } = await supabaseAdmin.from("usuarios").select("nome").eq("id", ctx.userId).maybeSingle();
  await registrarEventoVinculo({
    acao: "MAC_VINCULO_PROPOSTO",
    analistaId: ctx.userId,
    analistaNome: usuario?.nome ?? "",
    assuntoId: escopo.item.assuntoId,
    detalhe: { propostaId: proposta.id, itemId, tipo, grupo: escopo.item.grupo },
  });

  return NextResponse.json({ ok: true, propostaId: proposta.id });
}
