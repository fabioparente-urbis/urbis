import { NextRequest, NextResponse } from "next/server";
import { historicoDoProcesso, mhdDisponivel } from "@/lib/mhd";

/**
 * GET /api/mhd?processo=<codigo> — histórico documental de um processo.
 *
 * Módulo SATÉLITE: serve qualquer slot e qualquer assunto. O LIP e o MAC apenas consultam.
 *
 * Devolve os documentos lógicos com todas as versões e a linha do tempo. O texto extraído sai
 * resumido — a tela pede o texto inteiro de uma versão específica por `?versao=<id>`.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (!(await mhdDisponivel())) {
      return NextResponse.json({
        ok: true, ativo: false, documentos: [], eventos: [],
        aviso: "MHD ainda não instalado — rode supabase/migrations/2026_07_27_mhd_historico_documentos.sql",
      });
    }

    const processo = req.nextUrl.searchParams.get("processo");
    if (!processo) {
      return NextResponse.json({ ok: false, erro: "processo é obrigatório" }, { status: 400 });
    }

    const { documentos, eventos } = await historicoDoProcesso(processo);

    // o texto completo de cada versão pode ter dezenas de KB; a listagem manda só o tamanho
    const enxuto = documentos.map((d: any) => ({
      ...d,
      versoes: d.versoes.map((v: any) => ({ ...v, dados: v.dados ?? null })),
    }));

    return NextResponse.json({
      ok: true,
      ativo: true,
      documentos: enxuto,
      eventos,
      totais: {
        documentos: documentos.length,
        versoes: documentos.reduce((s: number, d: any) => s + d.versoes.length, 0),
        paginasIA: documentos.reduce(
          (s: number, d: any) => s + d.versoes.reduce((t: number, v: any) => t + (v.custo_paginas_ia ?? 0), 0), 0),
      },
    });
  } catch (e: any) {
    console.error("[mhd]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao ler o histórico" }, { status: 500 });
  }
}
