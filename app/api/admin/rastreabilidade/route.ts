import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { MATRIZES, matriz, hashFuncional, registros, idDoRegistro } from "@/lib/rastreabilidade";

/**
 * GET /api/admin/rastreabilidade?modulo=LIP&slot=slot_05&processo=CODIGO
 *
 * A matriz vem DO CÓDIGO, nunca de cópia no banco — é isso que impede a tela de divergir da
 * especificação. Do banco vêm só nome exibido e seção, que pertencem a `lip_campos`/`lip_abas`:
 * duplicá-los na matriz criaria uma segunda verdade que envelhece quando o rótulo muda no admin.
 *
 * `processo` é opcional: sem ele, a tela mostra só a DECLARAÇÃO (a regra, sempre igual). Com ele,
 * junta o RESULTADO daquela execução — gravado em `mhd_resultados_campo` por
 * `/api/lip/aceitar-pasta` — por chave. É por isso que os dois nunca podem divergir: um vem do
 * código, o outro vem do que aconteceu de fato, e a tela só junta os dois pela mesma chave.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const modulo = (req.nextUrl.searchParams.get("modulo") ?? "LIP") as "LIP" | "MAC";
    const slot = req.nextUrl.searchParams.get("slot") ?? "slot_05";
    const processo = req.nextUrl.searchParams.get("processo")?.trim() || null;
    const m = matriz(modulo, slot);
    if (!m) return NextResponse.json({ ok: false, erro: "matriz não encontrada" }, { status: 404 });

    // resultado da execução: só quando um processo é informado
    const resultadosPorChave: Record<string, any> = {};
    let resultadosIndisponiveis = false;
    if (processo) {
      const { data: resultados, error } = await supabaseAdmin
        .from("mhd_resultados_campo").select("*")
        .eq("processo_codigo", processo).eq("modulo", modulo).eq("slot", slot);
      if (error) {
        resultadosIndisponiveis = true;
      } else {
        for (const r of resultados ?? []) resultadosPorChave[(r as any).chave] = r;
      }
    }

    // rótulo e seção: do banco, casados pela chave
    const rotulos: Record<string, { nome: string; secao: string; ordem: number; ordemAba: number }> = {};
    if (modulo === "LIP") {
      const { data: abas } = await supabaseAdmin
        .from("lip_abas").select("id,nome,ordem").eq("assunto_id", m.assuntoId).order("ordem");
      const porAba = new Map((abas ?? []).map((a: any) => [a.id, a]));
      const { data: campos } = await supabaseAdmin
        .from("lip_campos").select("chave,label,aba_id,ordem").limit(2000);
      for (const c of campos ?? []) {
        const aba = porAba.get((c as any).aba_id);
        if (!aba) continue;
        rotulos[(c as any).chave] = {
          nome: (c as any).label, secao: (aba as any).nome,
          ordem: (c as any).ordem, ordemAba: (aba as any).ordem,
        };
      }
    }

    const linhas = registros(m).map((r: any) => {
      const id = idDoRegistro(r);
      const rot = rotulos[id];
      const execucao = resultadosPorChave[id];
      return {
        ...r,
        id,
        nome: rot?.nome ?? id,
        secao: rot?.secao ?? "(sem seção)",
        ordem: rot?.ordem ?? 0,
        ordemAba: rot?.ordemAba ?? 99,
        hash: hashFuncional(r),
        resultado: execucao ? {
          resultado: execucao.resultado, valor: execucao.valor, fonte: execucao.fonte,
          tentativa: execucao.tentativa, evidencia: execucao.evidencia,
          valorManual: execucao.valor_manual, autorManualId: execucao.autor_manual_id,
          complementadoEm: execucao.complementado_em, atualizadoEm: execucao.atualizado_em,
        } : null,
      };
    }).sort((a: any, b: any) => a.ordemAba - b.ordemAba || a.ordem - b.ordem);

    // campos do LIP que a matriz não cobre — não deveria haver, e o teste garante
    const semRastro = modulo === "LIP"
      ? Object.keys(rotulos).filter((k) => !linhas.some((l: any) => l.id === k))
      : [];

    return NextResponse.json({
      ok: true,
      matrizes: MATRIZES.map((x) => ({ modulo: x.modulo, slot: x.slot, nome: x.nome, total: registros(x).length })),
      modulo, slot, nome: m.nome,
      linhas, semRastro,
      processo, resultadosIndisponiveis,
      totais: {
        campos: linhas.length,
        implementados: linhas.filter((l: any) => l.implementado).length,
        usamIA: linhas.filter((l: any) => l.usaIA).length,
        porStatus: linhas.reduce((acc: Record<string, number>, l: any) => {
          acc[l.declaracao] = (acc[l.declaracao] ?? 0) + 1; return acc;
        }, {}),
        porResultado: processo ? linhas.reduce((acc: Record<string, number>, l: any) => {
          const k = l.resultado?.resultado ?? "SEM_RESULTADO";
          acc[k] = (acc[k] ?? 0) + 1; return acc;
        }, {}) : null,
      },
    });
  } catch (e: any) {
    console.error("[rastreabilidade]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
