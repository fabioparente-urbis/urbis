/**
 * app/api/mac/slot-05/exportar/route.ts — exporta a análise do MAC do Slot 5 em Excel.
 *
 * Isolada do Slot 1: não importa nada de app/api/mac/exportar-mac; só enxerga
 * tipo_processo = slot_05 e o modelo de checklist do Slot 5.
 *
 * Diferença para a exportação do Slot 1: aqui vai TUDO o que é preciso para RESTAURAR — o id de
 * cada item, o status cru, e a fonte (o filtro que marcou). A planilha do Slot 1 leva só rótulo
 * legível, que serve para leitura mas não para reimportar sem ambiguidade.
 *
 * Abas:
 *   MAC   — uma linha por item do checklist, com id, status cru e origem
 *   OBS   — observações da análise
 *   META  — processo, número da análise e versão do formato (a importação confere)
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { modeloDoSlot5 } from "@/lib/mac-motor/slot5/modeloChecklist";
import { TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";

export const runtime = "nodejs";

/** Muda junto com o formato das colunas — a importação recusa arquivo de versão desconhecida.
 * v2 (25/08/2026): ganhou "Observação do item" (restaurável) e "Lei/artigo (BIP)" (só leitura). */
export const VERSAO_FORMATO = "slot5-mac-2";
/** Formatos antigos que a importação ainda lê — planilha exportada ontem tem que continuar valendo. */
export const FORMATOS_ACEITOS = ["slot5-mac-1", "slot5-mac-2"];

const ROTULO: Record<string, string> = {
  conforme: "✅ Conforme",
  nao_conforme: "❌ Não Conforme",
  nao_aplica: "⬜ Não se Aplica",
};

export async function GET(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const codigo = req.nextUrl.searchParams.get("codigo")?.trim();
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }

    const modeloId = await modeloDoSlot5();
    if (!modeloId) {
      return NextResponse.json({ ok: false, erro: "nenhum modelo de checklist do Slot 5" }, { status: 404 });
    }

    // Análise pedida, ou a mais recente
    const numero = Number(req.nextUrl.searchParams.get("analise") ?? "");
    let q = supabaseAdmin.from("analises_mac").select("*")
      .eq("processo_codigo", codigo).eq("tipo_processo", TIPO_PROCESSO_SLOT5)
      .is("excluido_em", null);
    if (Number.isFinite(numero) && numero > 0) q = q.eq("numero_analise", numero);
    const { data: analises } = await q.order("numero_analise", { ascending: false }).limit(1);
    const analise = (analises ?? [])[0] as any;

    const { data: itens } = await supabaseAdmin
      .from("mac_checklist_itens").select("id, grupo, ordem, texto, ref")
      .eq("modelo_id", modeloId).eq("ativo", true).order("ordem").limit(2000);

    const marcas = (analise?.itens ?? {}) as Record<string, string>;
    const fontes = (analise?.fontes ?? {}) as Record<string, string>;
    const obsPorItem = (analise?.observacoes_por_item ?? {}) as Record<string, string>;

    // Vínculos com lei/artigo do BIP. São do MODELO (valem para todo processo que usa este
    // checklist), então não são restaurados na importação — vão na planilha como referência de
    // leitura, para o analista ver a lei junto do item.
    const { data: vinculos } = await supabaseAdmin
      .from("mac_bip_vinculos").select("mac_item_id, bip_fragmento_id").limit(5000);
    const fragmentoIds = [...new Set((vinculos ?? []).map((v: any) => v.bip_fragmento_id))];
    const { data: fragmentos } = fragmentoIds.length
      ? await supabaseAdmin.from("bdi_lei_fragmentos").select("id, referencia").in("id", fragmentoIds)
      : { data: [] as any[] };
    const refPorFragmento = new Map((fragmentos ?? []).map((f: any) => [f.id, f.referencia ?? ""]));
    const leisPorItem = new Map<string, string[]>();
    for (const v of vinculos ?? []) {
      const ref = refPorFragmento.get((v as any).bip_fragmento_id);
      if (!ref) continue;
      const lista = leisPorItem.get((v as any).mac_item_id) ?? [];
      lista.push(ref);
      leisPorItem.set((v as any).mac_item_id, lista);
    }

    const linhas = (itens ?? []).map((it: any) => {
      const fonte = fontes[it.id] ?? "";
      const filtro = fonte.startsWith('Filtro "') ? fonte.slice(8, fonte.indexOf('"', 8)) : "";
      return {
        "ID do Item": it.id,
        "Grupo": it.grupo,
        "Item": it.texto,
        "Referência": it.ref ?? "",
        "Status": ROTULO[marcas[it.id]] ?? "— Não respondido",
        "status_valor": marcas[it.id] ?? "",
        "Marcado por": filtro ? `Filtro: ${filtro}` : (marcas[it.id] ? "Analista" : ""),
        "fonte_completa": fonte,
        "Observação do item": obsPorItem[it.id] ?? "",
        "Lei/artigo (BIP)": (leisPorItem.get(it.id) ?? []).join(" · "),
      };
    });

    const wsMac = XLSX.utils.json_to_sheet(linhas);
    wsMac["!cols"] = [
      { wch: 38 }, { wch: 34 }, { wch: 80 }, { wch: 18 },
      { wch: 18 }, { wch: 14 }, { wch: 26 }, { wch: 70 },
      { wch: 60 }, { wch: 30 },
    ];

    const wsObs = XLSX.utils.json_to_sheet(
      String(analise?.observacoes ?? "").split("\n").map((linha) => ({ "Observações": linha })),
    );
    wsObs["!cols"] = [{ wch: 120 }];

    const dados = (resolucao.processo.dados ?? {}) as any;
    const wsMeta = XLSX.utils.json_to_sheet([
      { Campo: "formato", Valor: VERSAO_FORMATO },
      { Campo: "processo_codigo", Valor: codigo },
      { Campo: "tipo_processo", Valor: TIPO_PROCESSO_SLOT5 },
      { Campo: "modelo_id", Valor: modeloId },
      { Campo: "numero_analise", Valor: analise?.numero_analise ?? "" },
      { Campo: "analise_id", Valor: analise?.id ?? "" },
      { Campo: "interessado", Valor: dados?.proprietario?.valor ?? "" },
      { Campo: "exportado_em", Valor: new Date().toISOString() },
      { Campo: "total_itens", Valor: linhas.length },
      { Campo: "respondidos", Valor: linhas.filter((l) => l.status_valor).length },
    ]);
    wsMeta["!cols"] = [{ wch: 22 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsMac, "MAC");
    XLSX.utils.book_append_sheet(wb, wsObs, "OBS");
    XLSX.utils.book_append_sheet(wb, wsMeta, "META");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const nome = `MAC_Slot5_${codigo}_analise${analise?.numero_analise ?? "0"}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/exportar]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
