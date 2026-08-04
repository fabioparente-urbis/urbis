import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { usuarioDaRequisicao } from "@/lib/autorizacao";
import { complementarCampo } from "@/lib/mhd";
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

/**
 * POST /api/admin/rastreabilidade — grava a resposta assistida do analista para UM campo.
 *
 * Corpo: { modulo: "LIP"|"MAC", slot, processo, chave, valorManual }.
 *
 * NUNCA aceita `chave` arbitrária para o módulo MAC — tem que ser um item real declarado na
 * matriz (`ITENS_MAC_SLOT5`), porque lá a chave é sempre o `id` de um item de
 * `mac_checklist_itens`. Para o módulo LIP, aceita chave fora dos 136 campos oficiais de
 * propósito — é o "fato complementar" do plano (ver memória `urbis-mac-slot5-plano-posturas`):
 * nasce como resposta assistida solta, só é promovido a campo oficial depois de uso repetido.
 */
export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, erro: "corpo da requisição inválido" }, { status: 400 });

    const modulo = body.modulo as "LIP" | "MAC";
    const slot = typeof body.slot === "string" ? body.slot : "";
    const processo = typeof body.processo === "string" ? body.processo.trim() : "";
    const chave = typeof body.chave === "string" ? body.chave.trim() : "";
    const valorManual = typeof body.valorManual === "string" ? body.valorManual.trim() : "";

    if (modulo !== "LIP" && modulo !== "MAC") return NextResponse.json({ ok: false, erro: 'modulo deve ser "LIP" ou "MAC"' }, { status: 400 });
    if (!slot) return NextResponse.json({ ok: false, erro: "slot obrigatório" }, { status: 400 });
    if (!processo) return NextResponse.json({ ok: false, erro: "processo obrigatório" }, { status: 400 });
    if (!chave) return NextResponse.json({ ok: false, erro: "chave obrigatória" }, { status: 400 });
    if (!valorManual) return NextResponse.json({ ok: false, erro: "valorManual obrigatório" }, { status: 400 });

    const m = matriz(modulo, slot);
    if (!m) return NextResponse.json({ ok: false, erro: "matriz não encontrada" }, { status: 404 });

    const registro = registros(m).find((r: any) => idDoRegistro(r) === chave);
    if (modulo === "MAC" && !registro) {
      return NextResponse.json({ ok: false, erro: `chave "${chave}" não é um item MAC declarado na matriz` }, { status: 400 });
    }

    const resumo = await complementarCampo({
      processoCodigo: processo, modulo, slot, chave, valorManual,
      autorId: usuario.id, assuntoId: m.assuntoId ?? null,
      versaoFallback: registro ? ((registro as any).versao ?? 1) : 1,
      // fato complementar (chave fora da matriz declarada) não tem regra pra reproduzir — marcador fixo
      hashFallback: registro ? hashFuncional(registro) : "fato-complementar-sem-declaracao",
    });

    if (!resumo.ativa || !resumo.gravou) {
      return NextResponse.json({ ok: false, erro: resumo.problemas.join("; ") || "falha ao gravar" }, { status: resumo.ativa ? 500 : 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[rastreabilidade POST]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "falha" }, { status: 500 });
  }
}
