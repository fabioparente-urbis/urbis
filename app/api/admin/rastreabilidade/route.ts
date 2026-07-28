import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { MATRIZES, matriz, hashFuncional, registros, idDoRegistro } from "@/lib/rastreabilidade";

/**
 * GET /api/admin/rastreabilidade?modulo=LIP&slot=slot_05
 *
 * A matriz vem DO CÓDIGO, nunca de cópia no banco — é isso que impede a tela de divergir da
 * especificação. Do banco vêm só nome exibido e seção, que pertencem a `lip_campos`/`lip_abas`:
 * duplicá-los na matriz criaria uma segunda verdade que envelhece quando o rótulo muda no admin.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const modulo = (req.nextUrl.searchParams.get("modulo") ?? "LIP") as "LIP" | "MAC";
    const slot = req.nextUrl.searchParams.get("slot") ?? "slot_05";
    const m = matriz(modulo, slot);
    if (!m) return NextResponse.json({ ok: false, erro: "matriz não encontrada" }, { status: 404 });

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
      return {
        ...r,
        id,
        nome: rot?.nome ?? id,
        secao: rot?.secao ?? "(sem seção)",
        ordem: rot?.ordem ?? 0,
        ordemAba: rot?.ordemAba ?? 99,
        hash: hashFuncional(r),
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
      totais: {
        campos: linhas.length,
        implementados: linhas.filter((l: any) => l.implementado).length,
        usamIA: linhas.filter((l: any) => l.usaIA).length,
        porStatus: linhas.reduce((acc: Record<string, number>, l: any) => {
          acc[l.status] = (acc[l.status] ?? 0) + 1; return acc;
        }, {}),
      },
    });
  } catch (e: any) {
    console.error("[rastreabilidade]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
