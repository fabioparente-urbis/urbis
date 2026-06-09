import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";

export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { arquivos } = await req.json();
    if (!arquivos || arquivos.length === 0)
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo informado" }, { status: 400 });

    const resumo = arquivos.map((a: any) => {
      const camposRelevantes: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.campos ?? {})) {
        const val = (v as any)?.valor;
        if (val && val !== "NP" && val !== "null") camposRelevantes[k] = val;
      }
      return { arquivo: a.nome, tipo: a.tipo, sei: a.sei, campos: camposRelevantes };
    });

    const prompt = `Você é um auditor de processos de regularização de obras da Prefeitura de Goiânia.
Analise os dados extraídos dos documentos abaixo e identifique INCONSISTÊNCIAS, DIVERGÊNCIAS e ALERTAS entre eles.

DOCUMENTOS ANALISADOS:
${JSON.stringify(resumo, null, 2)}

VERIFICAÇÕES OBRIGATÓRIAS:
1. PROPRIETÁRIO/INTERESSADO: nome no PROCESSO/CERTIDÃO deve coincidir com VISTORIA e USO DO SOLO
2. ÁREAS: areaTotal do PROJETO deve coincidir com área encontrada na VISTORIA
3. ENDEREÇO: logradouro/quadra/lote devem ser iguais em todos os documentos
4. RESPONSÁVEL TÉCNICO: nome e CAU/CREA devem ser consistentes entre PROJETO e ART
5. VERTICALIZAÇÃO: se vistoriaMais12m=Sim então areaVertical deve estar preenchido
6. RECUO: se vistoriaOcupaRecuo=Sim então areaRecuo deve ser > 0
7. ONEROSA: se onerosa=Sim deve haver documento ONEROSA com SEI preenchido
8. EMBARGO: se embargo=Sim deve haver documento EMBARGO
9. PROCURAÇÃO: se procuracao=Sim deve haver SEI de procuração
10. OUTRO PROCESSO: se outro=Sim deve haver documento BUSCA com número identificado
11. CAIXA DE RECARGA: se caixa=Sim os campos volMin/volAt/caixas devem estar preenchidos
12. CORREDOR VIÁRIO: se corredor=Sim deve haver faixa preenchida

FORMATO — retornar APENAS JSON válido sem markdown:
{
  "inconsistencias": [
    {
      "tipo": "DIVERGÊNCIA|ALERTA|ERRO",
      "campo": "nome do campo",
      "descricao": "descrição clara do problema",
      "documentos_envolvidos": ["PROJETO", "VISTORIA"]
    }
  ],
  "resumo": "texto corrido com resumo geral, máximo 3 linhas"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const txt = data?.content?.[0]?.text ?? "";
    const clean = txt.replace(/```json|```/g, "").trim();

    let resultado: any = { inconsistencias: [], resumo: "" };
    try { resultado = JSON.parse(clean); } catch { resultado.resumo = "Erro ao processar cruzamento."; }

    const linhas: string[] = [];
    linhas.push(`=== VCP — VERIFICAÇÃO CRUZADA DE PDFs (${new Date().toLocaleDateString("pt-BR")}) ===`);
    linhas.push(`Documentos: ${arquivos.map((a: any) => `${a.tipo}(${a.sei ?? "sem SEI"})`).join(", ")}`);
    linhas.push("");

    if (resultado.inconsistencias?.length > 0) {
      linhas.push(`⚠️ ${resultado.inconsistencias.length} inconsistência(s):`);
      for (const inc of resultado.inconsistencias) {
        const icone = inc.tipo === "ERRO" ? "❌" : inc.tipo === "DIVERGÊNCIA" ? "⚠️" : "ℹ️";
        linhas.push(`${icone} [${inc.tipo}] ${inc.campo}: ${inc.descricao}`);
        if (inc.documentos_envolvidos?.length) linhas.push(`   Docs: ${inc.documentos_envolvidos.join(", ")}`);
      }
    } else {
      linhas.push("✅ Nenhuma inconsistência encontrada.");
    }

    if (resultado.resumo) { linhas.push(""); linhas.push(resultado.resumo); }

    return NextResponse.json({
      ok: true,
      obsTexto: linhas.join("\n"),
      inconsistencias: resultado.inconsistencias ?? [],
      total: resultado.inconsistencias?.length ?? 0,
    });

  } catch (e: any) {
    console.error("[S4]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
