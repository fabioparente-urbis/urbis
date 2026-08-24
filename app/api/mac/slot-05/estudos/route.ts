/**
 * app/api/mac/slot-05/estudos/route.ts — números do LIP que decidem EIT, EIV e carga e descarga.
 *
 * Exclusiva do Slot 5. Só LÊ: devolve os campos que `estudosExigencias.ts` consome, junto com o
 * valor bruto e a origem de cada um, para a tela mostrar de onde veio cada número (o analista
 * precisa saber se aquilo foi digitado por ele, lido pelo URBIS ou veio de documento).
 *
 * O cálculo NÃO acontece aqui: mora nas funções puras, que a tela também importa e recalcula a
 * cada tecla quando o analista informa depósito/produção e pátio projetado — dados que o LIP não
 * tem hoje.
 */

import { NextRequest, NextResponse } from "next/server";
import { dadosDoLip } from "@/lib/mac-motor/slot5/estudosExigencias";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";

export const runtime = "nodejs";

const CAMPOS_MOSTRADOS = [
  "cnae",
  "areaOcupadaPelaAtividade",
  "totalDeVagasAtendidasParaAtividade",
  "totalDeVagasExigidasParaEssas",
  "habitacional",
  "habSeriada",
  "habColetiva",
  "tipoUso",
  "tipoProcessoLip",
  "areaTotal",
  "areaTerreno",
];

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const dados = (resolucao.processo.dados ?? {}) as Record<string, any>;

    const campos: Record<string, { valor: string | null; origem: string | null; fonte: string | null }> = {};
    for (const chave of CAMPOS_MOSTRADOS) {
      const c = dados?.[chave];
      campos[chave] = {
        valor: c?.valor ?? null,
        origem: c?.origem ?? null,
        fonte: c?.fonte ?? null,
      };
    }

    return NextResponse.json({ ok: true, codigo, lip: dadosDoLip(dados), campos });
  } catch (e: any) {
    console.error("[MAC/slot-05/estudos] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
