/**
 * app/api/mac/vinculos-fila/route.ts — passo 1 do procedimento manual de vinculação LIP/BIP
 * (Regularização SEI / Aceite SEI). Lista os itens do checklist ainda sem vínculo E sem proposta
 * pendente ("fila" de trabalho), e as propostas já feitas aguardando decisão administrativa.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import { ASSUNTOS_PERMITIDOS_NA_FILA, type AssuntoPermitidoNaFila } from "@/lib/mac/vinculosFila";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return ctx;

  const assunto = req.nextUrl.searchParams.get("assunto");
  if (!assunto || !ASSUNTOS_PERMITIDOS_NA_FILA.includes(assunto as AssuntoPermitidoNaFila)) {
    return NextResponse.json({ ok: false, erro: `assunto obrigatório, um de: ${ASSUNTOS_PERMITIDOS_NA_FILA.join(", ")}` }, { status: 400 });
  }
  const tipoFiltro = req.nextUrl.searchParams.get("tipo"); // "LIP" | "BIP" | null (ambos)

  const { data: modelo, error: erroModelo } = await supabaseAdmin
    .from("mac_checklist_modelos").select("id, assunto_id").eq("tipo_processo", assunto).maybeSingle();
  if (erroModelo) return NextResponse.json({ ok: false, erro: erroModelo.message }, { status: 500 });
  if (!modelo) return NextResponse.json({ ok: false, erro: `sem modelo de checklist para ${assunto}` }, { status: 404 });

  const { data: itens, error: erroItens } = await supabaseAdmin
    .from("mac_checklist_itens")
    .select("id, grupo, texto, chave_lip, ref, fundamento_legal")
    .eq("modelo_id", modelo.id).eq("ativo", true);
  if (erroItens) return NextResponse.json({ ok: false, erro: erroItens.message }, { status: 500 });
  const todosOsItens = itens ?? [];
  const idsDoModelo = todosOsItens.map((i) => i.id);

  const [{ data: vinculosLip }, { data: vinculosBip }, { data: propostas }] = await Promise.all([
    idsDoModelo.length ? supabaseAdmin.from("mac_lip_vinculos").select("mac_item_id").in("mac_item_id", idsDoModelo) : Promise.resolve({ data: [] as any[] }),
    idsDoModelo.length ? supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id").in("mac_item_id", idsDoModelo) : Promise.resolve({ data: [] as any[] }),
    idsDoModelo.length
      ? supabaseAdmin.from("mac_vinculos_propostas")
          .select("id, mac_item_id, tipo, lip_chave, papel, obrigatorio, bip_fragmento_id, confianca, justificativa, status, criado_por, criado_em")
          .in("mac_item_id", idsDoModelo).eq("status", "pendente")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const itensComVinculoLip = new Set([
    ...todosOsItens.filter((i) => i.chave_lip && i.chave_lip.trim() !== "").map((i) => i.id),
    ...(vinculosLip ?? []).map((v: any) => v.mac_item_id),
  ]);
  const itensComVinculoBip = new Set((vinculosBip ?? []).map((v: any) => v.mac_item_id));
  const itensComPropostaPendenteLip = new Set((propostas ?? []).filter((p: any) => p.tipo === "LIP").map((p: any) => p.mac_item_id));
  const itensComPropostaPendenteBip = new Set((propostas ?? []).filter((p: any) => p.tipo === "BIP").map((p: any) => p.mac_item_id));

  const fila: {
    itemId: string; grupo: string; texto: string; tipo: "LIP" | "BIP";
    referenciaChecklist: string | null; fundamentoLegalCadastrado: string | null; campoLipRelacionado: string | null;
  }[] = [];
  for (const item of todosOsItens) {
    const precisaLip = !itensComVinculoLip.has(item.id) && !itensComPropostaPendenteLip.has(item.id);
    const precisaBip = !itensComVinculoBip.has(item.id) && !itensComPropostaPendenteBip.has(item.id);
    const base = {
      itemId: item.id, grupo: item.grupo, texto: item.texto,
      referenciaChecklist: (item as any).ref ?? null,
      fundamentoLegalCadastrado: (item as any).fundamento_legal ?? null,
      campoLipRelacionado: item.chave_lip && item.chave_lip.trim() !== "" ? item.chave_lip : null,
    };
    if ((!tipoFiltro || tipoFiltro === "LIP") && precisaLip) fila.push({ ...base, tipo: "LIP" });
    if ((!tipoFiltro || tipoFiltro === "BIP") && precisaBip) fila.push({ ...base, tipo: "BIP" });
  }

  // Cobertura por assunto — pedido explícito do Fábio ("mostrar cobertura por slot"). Mesma
  // conta que app/api/bdi/prioridades/route.ts já faz por tipo_processo, só que aqui já temos
  // os sets prontos, sem precisar de query nova.
  const semNenhumVinculo = todosOsItens.filter((i) => !itensComVinculoLip.has(i.id) && !itensComVinculoBip.has(i.id)).length;
  const cobertura = {
    total_itens: todosOsItens.length,
    lip: { vinculado: itensComVinculoLip.size, sem_vinculo: todosOsItens.length - itensComVinculoLip.size },
    bip: { vinculado: itensComVinculoBip.size, sem_vinculo: todosOsItens.length - itensComVinculoBip.size },
    sem_nenhum_vinculo: semNenhumVinculo,
  };

  const itemPorId = new Map(todosOsItens.map((i) => [i.id, i]));
  const fragmentoIds = [...new Set((propostas ?? []).filter((p: any) => p.bip_fragmento_id).map((p: any) => p.bip_fragmento_id))];
  const { data: fragmentos } = fragmentoIds.length
    ? await supabaseAdmin.from("bdi_lei_fragmentos").select("id, referencia, documento_id").in("id", fragmentoIds)
    : { data: [] as any[] };
  const documentoIds = [...new Set((fragmentos ?? []).map((f: any) => f.documento_id))];
  const { data: leis } = documentoIds.length
    ? await supabaseAdmin.from("bdi_documentos_lei").select("id, titulo, numero").in("id", documentoIds)
    : { data: [] as any[] };
  const leiPorDocumento = new Map((leis ?? []).map((l: any) => [l.id, l]));
  const fragmentoPorId = new Map((fragmentos ?? []).map((f: any) => [f.id, f]));

  const criadoresIds = [...new Set((propostas ?? []).map((p: any) => p.criado_por))];
  const { data: criadores } = criadoresIds.length
    ? await supabaseAdmin.from("usuarios").select("id, nome").in("id", criadoresIds)
    : { data: [] as any[] };
  const nomePorUsuario = new Map((criadores ?? []).map((u: any) => [u.id, u.nome]));

  const pendentes = (propostas ?? []).map((p: any) => {
    const item = itemPorId.get(p.mac_item_id);
    const frag = p.bip_fragmento_id ? fragmentoPorId.get(p.bip_fragmento_id) : null;
    const lei = frag ? leiPorDocumento.get(frag.documento_id) : null;
    return {
      propostaId: p.id, itemId: p.mac_item_id,
      grupo: item?.grupo ?? "?", texto: item?.texto ?? "?",
      tipo: p.tipo, lipChave: p.lip_chave, papel: p.papel, obrigatorio: p.obrigatorio,
      bipFragmentoId: p.bip_fragmento_id,
      bipReferencia: frag?.referencia ?? null,
      bipLei: lei ? `${lei.titulo}${lei.numero ? ` (${lei.numero})` : ""}` : null,
      confianca: p.confianca, justificativa: p.justificativa,
      criadoPorNome: nomePorUsuario.get(p.criado_por) ?? "?", criadoEm: p.criado_em,
    };
  });

  return NextResponse.json({
    ok: true,
    assunto, assuntoId: modelo.assunto_id,
    totalItensAtivos: todosOsItens.length,
    cobertura,
    fila, pendentes,
  });
}
