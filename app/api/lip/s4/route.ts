import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";

export const maxDuration = 30;

function get(campos: Record<string, any>, chave: string): string {
  return (campos[chave]?.valor ?? "").toString().trim();
}

function hasVal(campos: Record<string, any>, chave: string): boolean {
  const v = get(campos, chave);
  return v !== "" && v !== "NP" && v !== "null";
}

function sim(campos: Record<string, any>, chave: string): boolean {
  return get(campos, chave).toLowerCase() === "sim";
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { arquivos } = await req.json();
    if (!arquivos || arquivos.length === 0)
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo informado" }, { status: 400 });

    // Montar mapa tipo → campos
    const porTipo: Record<string, Record<string, any>> = {};
    for (const a of arquivos) {
      porTipo[a.tipo] = a.campos ?? {};
    }

    // Campos mesclados (todos os documentos juntos)
    const mesclado: Record<string, any> = {};
    for (const a of arquivos) {
      for (const [k, v] of Object.entries(a.campos ?? {})) {
        if (!mesclado[k] && (v as any)?.valor && (v as any).valor !== "NP") mesclado[k] = v;
      }
    }

    const inc: { tipo: string; campo: string; descricao: string; docs: string[] }[] = [];

    // 1. PROPRIETÁRIO/INTERESSADO — compara entre documentos
    const nomes: { tipo: string; nome: string }[] = [];
    for (const a of arquivos) {
      const n = get(a.campos, "interessado") || get(a.campos, "proprietario");
      if (n) nomes.push({ tipo: a.tipo, nome: n.toUpperCase() });
    }
    if (nomes.length >= 2) {
      const base = nomes[0].nome;
      for (const n of nomes.slice(1)) {
        if (!n.nome.includes(base.split(" ")[0]) && !base.includes(n.nome.split(" ")[0])) {
          inc.push({ tipo: "DIVERGÊNCIA", campo: "interessado/proprietário", descricao: `Nome divergente: "${nomes[0].nome}" (${nomes[0].tipo}) vs "${n.nome}" (${n.tipo})`, docs: [nomes[0].tipo, n.tipo] });
          break;
        }
      }
    }

    // 2. ENDEREÇO — quadra e lote iguais em todos
    const enderecos: { tipo: string; quadra: string; lote: string }[] = [];
    for (const a of arquivos) {
      const q = get(a.campos, "quadra");
      const l = get(a.campos, "lote");
      if (q || l) enderecos.push({ tipo: a.tipo, quadra: q, lote: l });
    }
    if (enderecos.length >= 2) {
      const base = enderecos[0];
      for (const e of enderecos.slice(1)) {
        if ((e.quadra && base.quadra && e.quadra !== base.quadra) ||
            (e.lote && base.lote && e.lote !== base.lote)) {
          inc.push({ tipo: "DIVERGÊNCIA", campo: "endereço (quadra/lote)", descricao: `Quadra/Lote divergente: QD${base.quadra}/LT${base.lote} (${base.tipo}) vs QD${e.quadra}/LT${e.lote} (${e.tipo})`, docs: [base.tipo, e.tipo] });
          break;
        }
      }
    }

    // 3. VERTICALIZAÇÃO — vistoriaMais12m=Sim → areaVertical preenchido
    if (sim(mesclado, "vistoriaMais12m") && !hasVal(mesclado, "areaVertical")) {
      inc.push({ tipo: "ALERTA", campo: "areaVertical", descricao: "Vistoria indica altura > 12m mas campo Área Vertical não está preenchido.", docs: ["VISTORIA", "PROJETO"] });
    }

    // 4. RECUO — vistoriaOcupaRecuo=Sim → areaRecuo > 0
    if (sim(mesclado, "vistoriaOcupaRecuo") && !hasVal(mesclado, "areaRecuo")) {
      inc.push({ tipo: "ALERTA", campo: "areaRecuo", descricao: "Vistoria indica ocupação de recuo frontal mas Área em Recuo não está preenchida.", docs: ["VISTORIA", "PROJETO"] });
    }

    // 5. ONEROSA — onerosa=Sim → SEI da onerosa preenchido
    if (sim(mesclado, "onerosa") && !hasVal(mesclado, "numero_do_sei_da_onerosa")) {
      inc.push({ tipo: "ALERTA", campo: "numero_do_sei_da_onerosa", descricao: "Onerosa marcada como Sim mas SEI do documento de onerosa não encontrado.", docs: ["PROJETO"] });
    }

    // 6. EMBARGO — embargo=Sim → documento EMBARGO presente
    if (sim(mesclado, "embargo") && !porTipo["EMBARGO"]) {
      inc.push({ tipo: "ERRO", campo: "embargo", descricao: "Embargo marcado como Sim mas nenhum documento de embargo foi carregado.", docs: ["PROCESSO"] });
    }

    // 7. PROCURAÇÃO — procuracao=Sim → SEI preenchido
    if (sim(mesclado, "procuracao") && !hasVal(mesclado, "seiProcuracao")) {
      inc.push({ tipo: "ALERTA", campo: "seiProcuracao", descricao: "Procuração marcada como Sim mas SEI da procuração não encontrado.", docs: ["PROCURACAO"] });
    }

    // 8. OUTRO PROCESSO — outro=Sim → qualOutro preenchido
    if (sim(mesclado, "outro") && !hasVal(mesclado, "qualOutro")) {
      inc.push({ tipo: "ALERTA", campo: "qualOutro", descricao: "Campo 'Existe outro processo' marcado Sim mas número do outro processo não identificado.", docs: ["BUSCA"] });
    }

    // 9. CAIXA DE RECARGA — caixa=Sim → volMin/volAt/caixas preenchidos
    if (sim(mesclado, "caixa")) {
      if (!hasVal(mesclado, "volMin")) inc.push({ tipo: "ALERTA", campo: "volMin", descricao: "Caixa de recarga marcada Sim mas volume mínimo não encontrado.", docs: ["PROJETO"] });
      if (!hasVal(mesclado, "volAt"))  inc.push({ tipo: "ALERTA", campo: "volAt",  descricao: "Caixa de recarga marcada Sim mas volume atendido não encontrado.", docs: ["PROJETO"] });
      if (!hasVal(mesclado, "caixas")) inc.push({ tipo: "ALERTA", campo: "caixas", descricao: "Caixa de recarga marcada Sim mas número de caixas não encontrado.", docs: ["PROJETO"] });
    }

    // 10. CORREDOR VIÁRIO — corredor=Sim → faixa preenchida
    if (sim(mesclado, "corredor") && !hasVal(mesclado, "faixa")) {
      inc.push({ tipo: "ALERTA", campo: "faixa", descricao: "Corredor viário marcado Sim mas faixa de ampliação não encontrada.", docs: ["USO_SOLO"] });
    }

    // 11. RT ARQ — nome sem CAU
    if (hasVal(mesclado, "nomeResponsavelArq") && !hasVal(mesclado, "cau")) {
      inc.push({ tipo: "ALERTA", campo: "cau", descricao: "Nome do responsável técnico (ARQ) preenchido mas CAU não encontrado.", docs: ["PROJETO"] });
    }

    // 12. ÁREAS — somatório (se areaTotal preenchido)
    const toNum = (k: string) => parseFloat((get(mesclado, k)).replace(",", ".")) || 0;
    const total = toNum("areaTotal");
    if (total > 0) {
      const soma = toNum("areaForaFrontal") + toNum("areaRecuo") + toNum("areaVertical");
      const diff = Math.abs(total - soma);
      if (diff > 0.5) {
        inc.push({ tipo: "DIVERGÊNCIA", campo: "somatório de áreas", descricao: `Área Total (${total}m²) ≠ ForaFrontal(${toNum("areaForaFrontal")}) + Recuo(${toNum("areaRecuo")}) + Vertical(${toNum("areaVertical")}) = ${soma.toFixed(2)}m². Diferença: ${diff.toFixed(2)}m².`, docs: ["PROJETO"] });
      }
    }

    // Montar texto OBS
    const data = new Date().toLocaleDateString("pt-BR");
    const linhas: string[] = [];
    linhas.push(`=== VCP — VERIFICAÇÃO CRUZADA DE PDFs (${data}) ===`);
    linhas.push(`Documentos: ${arquivos.map((a: any) => `${a.tipo}(${a.sei ?? "sem SEI"})`).join(", ")}`);
    linhas.push("");

    if (inc.length > 0) {
      linhas.push(`⚠️ ${inc.length} inconsistência(s) encontrada(s):`);
      for (const i of inc) {
        const icone = i.tipo === "ERRO" ? "❌" : i.tipo === "DIVERGÊNCIA" ? "⚠️" : "ℹ️";
        linhas.push(`${icone} [${i.tipo}] ${i.campo}: ${i.descricao}`);
        if (i.docs?.length) linhas.push(`   Docs: ${i.docs.join(", ")}`);
      }
    } else {
      linhas.push("✅ Nenhuma inconsistência encontrada.");
    }

    return NextResponse.json({
      ok: true,
      obsTexto: linhas.join("\n"),
      inconsistencias: inc,
      total: inc.length,
    });

  } catch (e: any) {
    console.error("[S4]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
