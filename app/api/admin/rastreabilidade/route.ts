import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import {
  MATRIZES, matriz, hashFuncional, registros, idDoRegistro, CAMPOS_LIP_SLOT5,
} from "@/lib/rastreabilidade";

/**
 * GET /api/admin/rastreabilidade?modulo=LIP&slot=slot_05&processo=CODIGO
 *
 * A matriz vem DO CÓDIGO, nunca de cópia no banco — é isso que impede a tela de divergir da
 * especificação. Do banco vêm só nome exibido e seção (para LIP) e texto/classificações/vínculos
 * (para MAC).
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

    // rótulo e seção: do banco, casados pela chave (LIP only)
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

    // MAC: enriquecer com texto, classificações e vínculos BIP+LIP
    const macDados: Record<string, any> = {};
    const macBipVinculos: Record<string, any[]> = {};
    const macLipVinculos: Record<string, any[]> = {};
    const macDocsPorId: Record<string, any> = {};

    if (modulo === "MAC") {
      const [{ data: macItens }, { data: bipV }, { data: lipV }] = await Promise.all([
        supabaseAdmin.from("mac_checklist_itens")
          .select("id, texto, ordem, ativo, classificacao_bip, classificacao_lip, fundamento_legal, nota_analista, versao_compatibilizacao")
          .limit(1000),
        supabaseAdmin.from("mac_bip_vinculos")
          .select("mac_item_id, bip_fragmento_id, confianca, bdi_lei_fragmentos(referencia, documento_id)")
          .limit(2000),
        supabaseAdmin.from("mac_lip_vinculos")
          .select("mac_item_id, lip_chave, papel, obrigatorio, confianca, justificativa")
          .limit(2000),
      ]);

      for (const item of macItens ?? []) macDados[(item as any).id] = item;

      for (const v of bipV ?? []) {
        const key = (v as any).mac_item_id;
        if (!macBipVinculos[key]) macBipVinculos[key] = [];
        macBipVinculos[key].push(v);
      }

      const docIds = [
        ...new Set(
          (bipV ?? [])
            .map((v: any) => (v.bdi_lei_fragmentos as any)?.documento_id)
            .filter(Boolean),
        ),
      ];
      if (docIds.length) {
        const { data: docs } = await supabaseAdmin
          .from("bdi_documentos_lei").select("id, titulo, sigla").in("id", docIds);
        for (const d of docs ?? []) macDocsPorId[(d as any).id] = d;
      }

      for (const v of lipV ?? []) {
        const key = (v as any).mac_item_id;
        if (!macLipVinculos[key]) macLipVinculos[key] = [];
        macLipVinculos[key].push(v);
      }
    }

    const lipCamposPorChave = modulo === "MAC"
      ? new Map(CAMPOS_LIP_SLOT5.map((c) => [c.chave, c]))
      : new Map<string, any>();

    const linhas = registros(m).map((r: any) => {
      const id = idDoRegistro(r);
      const rot = rotulos[id];
      const execucao = resultadosPorChave[id];
      const macItem = macDados[id] ?? null;

      return {
        ...r,
        id,
        nome: modulo === "MAC" ? (macItem?.texto ?? id) : (rot?.nome ?? id),
        secao: modulo === "MAC" ? ((r as any).grupo ?? "(sem grupo)") : (rot?.secao ?? "(sem seção)"),
        ordem: modulo === "MAC" ? (macItem?.ordem ?? 0) : (rot?.ordem ?? 0),
        ordemAba: rot?.ordemAba ?? 99,
        hash: hashFuncional(r),
        resultado: execucao ? {
          resultado: execucao.resultado, valor: execucao.valor, fonte: execucao.fonte,
          tentativa: execucao.tentativa, evidencia: execucao.evidencia,
          valorManual: execucao.valor_manual, autorManualId: execucao.autor_manual_id,
          complementadoEm: execucao.complementado_em, atualizadoEm: execucao.atualizado_em,
        } : null,
        // Campos MAC (undefined para LIP — o spread de r não inclui estes)
        ativo: macItem?.ativo,
        classificacao_bip: macItem?.classificacao_bip,
        classificacao_lip: macItem?.classificacao_lip,
        fundamento_legal: macItem?.fundamento_legal,
        nota_analista: macItem?.nota_analista,
        versao_compatibilizacao: macItem?.versao_compatibilizacao,
        bipVinculos: modulo === "MAC"
          ? (macBipVinculos[id] ?? []).map((v: any) => {
            const frag = (v.bdi_lei_fragmentos as any) ?? {};
            const doc = macDocsPorId[frag.documento_id] ?? {};
            return {
              fragmentoId: v.bip_fragmento_id,
              referencia: frag.referencia,
              documentoId: frag.documento_id,
              documentoTitulo: doc.titulo,
              documentoSigla: doc.sigla,
              confianca: v.confianca,
            };
          })
          : undefined,
        lipVinculos: modulo === "MAC"
          ? (macLipVinculos[id] ?? []).map((v: any) => {
            const campo = lipCamposPorChave.get(v.lip_chave);
            return {
              lip_chave: v.lip_chave,
              papel: v.papel,
              obrigatorio: v.obrigatorio,
              confianca: v.confianca,
              justificativa: v.justificativa,
              lip_declaracao: campo?.declaracao,
              lip_implementado: campo?.implementado,
            };
          })
          : undefined,
      };
    }).sort((a: any, b: any) => a.ordemAba - b.ordemAba || a.ordem - b.ordem);

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
        ...(modulo === "MAC" && {
          porClassifBip: linhas.reduce((acc: Record<string, number>, l: any) => {
            const k = l.classificacao_bip ?? "NAO_ANALISADO";
            acc[k] = (acc[k] ?? 0) + 1; return acc;
          }, {}),
          porClassifLip: linhas.reduce((acc: Record<string, number>, l: any) => {
            const k = l.classificacao_lip ?? "NAO_ANALISADO";
            acc[k] = (acc[k] ?? 0) + 1; return acc;
          }, {}),
          totalVinculosBip: linhas.reduce((acc: number, l: any) => acc + (l.bipVinculos?.length ?? 0), 0),
          totalVinculosLip: linhas.reduce((acc: number, l: any) => acc + (l.lipVinculos?.length ?? 0), 0),
          itensComVinculoBip: linhas.filter((l: any) => (l.bipVinculos?.length ?? 0) > 0).length,
          itensComVinculoLip: linhas.filter((l: any) => (l.lipVinculos?.length ?? 0) > 0).length,
        }),
      },
    });
  } catch (e: any) {
    console.error("[rastreabilidade]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
