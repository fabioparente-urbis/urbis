/**
 * app/api/mac/slot-05/indeferimento/route.ts — emite o Parecer de INDEFERIMENTO do Slot 5, EXCLUSIVO do Slot 5.
 *
 * Devolve o .docx pronto. Mesma peça e mesma mecânica do Slot 1 (decisão do Fábio, 02/10/2026), com o
 * assunto Aprovação de Projeto: cabeçalho ← LIP; lista de análises ← analises_mac (data e nº do despacho
 * de cada uma); assinatura ← usuário logado (quem emite assina), gerente e diretora lidos do cadastro.
 *
 * NÃO consome número de parecer: quem faz isso é /api/numeracao/proximo?tipo=parecer, chamado pela
 * tela DEPOIS do documento pronto — a mesma série única de todos os slots. Aqui o número chega pronto,
 * então um erro na geração não queima um número da faixa.
 *
 * Diferente do Slot 1, NÃO regrava `processos.dados` inteiro (o Slot 1 faz `{...dados, ultimo_documento}`,
 * o padrão que apagou 95 campos em 15-16/09/2026): aqui nenhum campo do LIP é tocado.
 *
 * Isolada do Slot 1: não importa app/api/despacho-regularizacao nem lib/geradores.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { valorPainel } from "@/lib/mac-motor/slot5/laudoSlot5";
import { gerarIndeferimentoSlot5, type Assinante } from "@/lib/mac-motor/slot5/gerarIndeferimento";

export const runtime = "nodejs";

const HOJE_BR = () => new Date().toLocaleDateString("pt-BR");

const pessoa = (u: any): Assinante | undefined =>
  u?.nome ? { nome: u.nome, cargo: u.cargo || undefined, registro: u.cau_crea || undefined } : undefined;

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, numeroParecer, dataEmissao, motivos, observacoes, fotos, analiseId } =
      await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    if (!numeroParecer) return NextResponse.json({ ok: false, erro: "número do parecer obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const dados = (resolucao.processo.dados ?? {}) as Record<string, any>;
    const valor = (chave: string) => {
      const v = dados?.[chave]?.valor;
      return v === null || v === undefined ? "" : String(v).trim();
    };
    const data = String(dataEmissao ?? "").match(/^\d{2}\/\d{2}\/\d{4}$/) ? String(dataEmissao) : HOJE_BR();

    // Análises até a atual, com a data e o nº do despacho de cada uma. A que está sendo indeferida agora
    // ainda não tem data gravada: usa a data de emissão do parecer.
    const { data: analises } = await supabaseAdmin
      .from("analises_mac")
      .select("id, numero_analise, numero_despacho, data_despacho")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .is("excluido_em", null).order("numero_analise", { ascending: true }).limit(10);
    if (!analises?.length) {
      return NextResponse.json({ ok: false, erro: "este processo ainda não tem análise gravada" }, { status: 400 });
    }
    const alvo = (analiseId ? analises.find((a: any) => a.id === analiseId) : null) ?? analises[analises.length - 1];
    const listaAnalises = (analises as any[])
      .filter((a) => a.numero_analise <= (alvo as any).numero_analise)
      .map((a) => ({
        numero: Number(a.numero_analise),
        data: a.id === (alvo as any).id ? (a.data_despacho || data) : (a.data_despacho || ""),
        despacho: a.numero_despacho ? String(a.numero_despacho) : undefined,
      }));

    // Assinatura: o usuário logado. Gerente = perfil "Gerência {gerência de quem assina}"; diretora = perfil "Diretora".
    const { data: membro } = await supabaseAdmin
      .from("usuarios").select("nome, cargo, cau_crea, gerencia").eq("id", usuario.id).maybeSingle();
    let gerente: Assinante | undefined;
    if ((membro as any)?.gerencia) {
      const { data: ger } = await supabaseAdmin
        .from("usuarios").select("nome, cargo, cau_crea")
        .contains("perfis", [`Gerência ${(membro as any).gerencia}`]).limit(1).maybeSingle();
      gerente = pessoa(ger);
    }
    const { data: dir } = await supabaseAdmin
      .from("usuarios").select("nome, cargo, cau_crea").contains("perfis", ["Diretora"]).limit(1).maybeSingle();

    const fotosValidas = Array.isArray(fotos)
      ? fotos.filter((f: any) => f?.base64 && (f?.tipo === "png" || f?.tipo === "jpg"))
          .map((f: any) => ({ base64: String(f.base64), tipo: f.tipo as "png" | "jpg", legenda: String(f.legenda ?? "") }))
      : undefined;

    // Endereço como no laudo (D6): logradouro, quadra e lote do LIP (linhas 2, 7 e 8 do Painel).
    const q = valorPainel(dados, 7), l = valorPainel(dados, 8);
    const endereco = [valorPainel(dados, 2), q && `Q.${q}`, l && `L.${l}`].filter(Boolean).join(", ");

    const buffer = await gerarIndeferimentoSlot5({
      processo: codigo,
      interessado: valor("proprietario") || codigo,
      endereco: endereco || undefined,
      analises: listaAnalises,
      naoConformes: Array.isArray(motivos) ? motivos.map(String).filter(Boolean) : undefined,
      observacoes: observacoes ? String(observacoes) : undefined,
      assinante: pessoa(membro),
      gerente,
      diretora: pessoa(dir),
      numeroParecer: String(numeroParecer),
      assunto: "APROVAÇÃO DE PROJETO",
      data,
      fotos: fotosValidas,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="indeferimento_${codigo}_${numeroParecer}.docx"`,
      },
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/indeferimento]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
