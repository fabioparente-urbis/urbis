// app/api/admin/numeracao/estornar/route.ts
//
// Estorno de numeração — desfaz uma emissão feita por engano: devolve o
// número à faixa e apaga o rastro dele nos módulos satélites (MDP, MRP,
// tag do processo, coluna da análise no MAC).
//
// Só é seguro reverter o ÚLTIMO número consumido de uma faixa — reverter um
// número no meio criaria buraco (a faixa é finita, ver CLAUDE.md) ou
// colisão com o que já foi emitido depois. Por isso a rota recusa qualquer
// pedido em que `faixa.proximo !== numero + 1`.
//
// GET  ?processo=&tipo=despacho|parecer&numero=  -> pré-visualização (nada é apagado)
// POST { processo, tipo, numero }                -> executa o estorno
//
// Pedido do Fábio em 08/09/2026, depois de reverter manualmente (via script)
// o Despacho Interno nº 1663 do processo 24.5.000024350-0 — esta rota faz a
// mesma cascata que foi feita à mão naquele dia, agora pela tela.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guarda(req: NextRequest) {
  const ctx = await autenticar(req);
  if (ctx instanceof NextResponse) return { erro: ctx };
  if (!ctx.perfis.includes("Administrador")) {
    return { erro: NextResponse.json({ ok: false, erro: "Estorno de numeração é exclusivo do Administrador." }, { status: 403 }) };
  }
  return { ctx };
}

type Levantamento = {
  uso: { id: string; faixa_id: string; emitido_em: string; numero_analise: number | null } | null;
  faixa: { id: string; numero_inicial: number; numero_final: number; proximo: number; usuario_id: string } | null;
  seguro: boolean;
  motivoInseguro: string | null;
  mdp: { id: string; tipo: string; destinatario: string | null; criado_em: string }[];
  mrp: { id: string; tipo_despacho: string; criado_em: string }[];
  tags: number; // quantas entradas em processos.tags batem
  analises: { id: string; numero_analise: number; coluna: string }[];
};

async function levantar(processo: string, tipo: "despacho" | "parecer", numero: number): Promise<Levantamento> {
  const numeroTxt = String(numero);

  const { data: uso } = await supabaseAdmin
    .from("urbis_numeracao_uso")
    .select("id, faixa_id, emitido_em, numero_analise")
    .eq("processo_codigo", processo)
    .eq("tipo_documento", tipo)
    .eq("numero", numero)
    .maybeSingle();

  let faixa: Levantamento["faixa"] = null;
  let seguro = false;
  let motivoInseguro: string | null = null;
  if (uso) {
    const { data: f } = await supabaseAdmin
      .from("urbis_numeracao_faixas")
      .select("id, numero_inicial, numero_final, proximo, usuario_id")
      .eq("id", uso.faixa_id)
      .maybeSingle();
    faixa = f ?? null;
    if (faixa) {
      seguro = faixa.proximo === numero + 1;
      if (!seguro) {
        motivoInseguro = faixa.proximo > numero + 1
          ? `Já foram emitidos números depois do ${numero} nesta faixa (próximo atual: ${faixa.proximo}). Reverter agora deixaria um buraco ou colidiria com o que já saiu.`
          : `A faixa já está em ${faixa.proximo}, menor que ${numero + 1} — estado inconsistente, não reverte sozinho.`;
      }
    } else {
      motivoInseguro = "Uso encontrado, mas a faixa correspondente sumiu.";
    }
  } else {
    motivoInseguro = "Nenhum uso de numeração encontrado para esse processo/tipo/número.";
  }

  const { data: mdp } = await supabaseAdmin
    .from("mdp_registros")
    .select("id, tipo, destinatario, criado_em")
    .eq("processo_codigo", processo)
    .eq("numero", numeroTxt);

  const { data: mrp } = await supabaseAdmin
    .from("mrp_registros")
    .select("id, tipo_despacho, criado_em")
    .eq("processo_codigo", processo)
    .eq("numero_despacho", numeroTxt);

  const { data: proc } = await supabaseAdmin
    .from("processos")
    .select("tags")
    .eq("codigo", processo)
    .maybeSingle();
  const tagsQtd = ((proc as any)?.tags ?? []).filter((t: any) => String(t?.numero_despacho ?? "") === numeroTxt).length;

  const { data: analisesRaw } = await supabaseAdmin
    .from("analises_mac")
    .select("id, numero_analise, numero_despacho, numero_parecer, numero_despacho_interno")
    .eq("processo_codigo", processo);
  const analises: Levantamento["analises"] = [];
  for (const a of analisesRaw ?? []) {
    if (String((a as any).numero_despacho ?? "") === numeroTxt) analises.push({ id: a.id, numero_analise: a.numero_analise, coluna: "numero_despacho" });
    if (String((a as any).numero_parecer ?? "") === numeroTxt) analises.push({ id: a.id, numero_analise: a.numero_analise, coluna: "numero_parecer" });
    if (String((a as any).numero_despacho_interno ?? "") === numeroTxt) analises.push({ id: a.id, numero_analise: a.numero_analise, coluna: "numero_despacho_interno" });
  }

  return { uso: uso ?? null, faixa, seguro, motivoInseguro, mdp: mdp ?? [], mrp: mrp ?? [], tags: tagsQtd, analises };
}

function validarEntrada(processo: unknown, tipo: unknown, numeroRaw: unknown) {
  const numero = Number(numeroRaw);
  if (!processo || typeof processo !== "string") return { erro: "processo obrigatório" as const };
  if (tipo !== "despacho" && tipo !== "parecer") return { erro: "tipo deve ser despacho ou parecer" as const };
  if (!Number.isInteger(numero) || numero <= 0) return { erro: "numero inválido" as const };
  return { processo, tipo: tipo as "despacho" | "parecer", numero };
}

export async function GET(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;

  const sp = req.nextUrl.searchParams;
  const v = validarEntrada(sp.get("processo"), sp.get("tipo"), sp.get("numero"));
  if ("erro" in v) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });

  const levantamento = await levantar(v.processo, v.tipo, v.numero);
  return NextResponse.json({ ok: true, ...levantamento });
}

export async function POST(req: NextRequest) {
  const g = await guarda(req);
  if (g.erro) return g.erro;

  const body = await req.json().catch(() => ({}));
  const v = validarEntrada(body?.processo, body?.tipo, body?.numero);
  if ("erro" in v) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
  const { processo, tipo, numero } = v;
  const numeroTxt = String(numero);

  const levantamento = await levantar(processo, tipo, numero);
  if (!levantamento.uso || !levantamento.faixa) {
    return NextResponse.json({ ok: false, erro: levantamento.motivoInseguro ?? "Uso não encontrado." }, { status: 404 });
  }
  if (!levantamento.seguro) {
    return NextResponse.json({ ok: false, erro: levantamento.motivoInseguro }, { status: 409 });
  }

  // 1) Devolve o número à faixa — CAS, só avança se ninguém mexeu no meio tempo.
  const { data: faixaAtualizada, error: erroFaixa } = await supabaseAdmin
    .from("urbis_numeracao_faixas")
    .update({ proximo: numero })
    .eq("id", levantamento.faixa.id)
    .eq("proximo", numero + 1)
    .select("id");
  if (erroFaixa) return NextResponse.json({ ok: false, erro: erroFaixa.message }, { status: 500 });
  if (!faixaAtualizada || faixaAtualizada.length === 0) {
    return NextResponse.json({ ok: false, erro: "A faixa mudou entre a checagem e o estorno. Tente de novo." }, { status: 409 });
  }

  // 2) Apaga o rastro nos módulos satélites — melhor esforço, cada apagamento
  // reportado individualmente (nunca em silêncio, ver CLAUDE.md).
  const relatorio: Record<string, unknown> = {};

  const { error: erroUso } = await supabaseAdmin.from("urbis_numeracao_uso").delete().eq("id", levantamento.uso.id);
  relatorio.uso = erroUso ? { ok: false, erro: erroUso.message } : { ok: true, id: levantamento.uso.id };

  const { data: mdpApagado, error: erroMdp } = await supabaseAdmin
    .from("mdp_registros").delete().eq("processo_codigo", processo).eq("numero", numeroTxt).select("id");
  relatorio.mdp = erroMdp ? { ok: false, erro: erroMdp.message } : { ok: true, apagados: mdpApagado?.length ?? 0 };

  const { data: mrpApagado, error: erroMrp } = await supabaseAdmin
    .from("mrp_registros").delete().eq("processo_codigo", processo).eq("numero_despacho", numeroTxt).select("id");
  relatorio.mrp = erroMrp ? { ok: false, erro: erroMrp.message } : { ok: true, apagados: mrpApagado?.length ?? 0 };

  const { data: proc } = await supabaseAdmin.from("processos").select("tags").eq("codigo", processo).maybeSingle();
  const tagsAntes = (proc as any)?.tags ?? [];
  const tagsDepois = tagsAntes.filter((t: any) => String(t?.numero_despacho ?? "") !== numeroTxt);
  if (tagsDepois.length !== tagsAntes.length) {
    const { error: erroTags } = await supabaseAdmin.from("processos").update({ tags: tagsDepois }).eq("codigo", processo);
    relatorio.tags = erroTags ? { ok: false, erro: erroTags.message } : { ok: true, removidas: tagsAntes.length - tagsDepois.length };
  } else {
    relatorio.tags = { ok: true, removidas: 0 };
  }

  const analiseErros: string[] = [];
  for (const a of levantamento.analises) {
    const { error: erroAn } = await supabaseAdmin.from("analises_mac").update({ [a.coluna]: null }).eq("id", a.id);
    if (erroAn) analiseErros.push(`${a.id}.${a.coluna}: ${erroAn.message}`);
  }
  relatorio.analises = analiseErros.length ? { ok: false, erros: analiseErros } : { ok: true, limpas: levantamento.analises.length };

  await supabaseAdmin.from("auditoria_log").insert({
    tabela: "urbis_numeracao_faixas",
    registro_id: levantamento.faixa.id,
    operacao: "NUMERACAO_ESTORNADA",
    dados_antes: { processo, tipo, numero, proximo_antes: numero + 1, ...levantamento },
    dados_depois: { por: g.ctx!.userId, proximo_depois: numero },
  });

  return NextResponse.json({ ok: true, processo, tipo, numero, proximo: numero, relatorio });
}
