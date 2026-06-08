import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { gerarRelatorioPDF } from "@/lib/relatorio-pdf";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const isAdmin = auth.perfis.includes("Administrador");
  if (!isAdmin) return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });

  const url = new URL(req.url);
  const analistaId = url.searchParams.get("analista") || "";
  const periodo    = url.searchParams.get("periodo") || "mes";

  if (!analistaId) return NextResponse.json({ ok: false, erro: "analista obrigatório" }, { status: 400 });

  const agora = new Date();
  let mes = agora.getMonth() + 1;
  let ano = agora.getFullYear();
  let labelPeriodo = "";

  if (periodo === "mes") {
    labelPeriodo = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } else if (periodo === "ano") {
    labelPeriodo = String(ano);
  }

  // Busca analista
  const { data: usuario } = await supabaseAdmin
    .from("usuarios").select("nome, email").eq("id", analistaId).maybeSingle();
  const nomeAnalista = (usuario as any)?.nome || "Analista";

  // Busca registros MRP
  let q = supabaseAdmin
    .from("mrp_registros")
    .select("*")
    .eq("usuario_id", analistaId)
    .order("data_despacho", { ascending: false });

  if (periodo === "mes") q = q.eq("mes", mes).eq("ano", ano);
  else if (periodo === "ano") q = q.eq("ano", ano);

  const { data: registros } = await q;
  const regs = registros || [];

  const totalPontos = regs.reduce((a: number, r: any) => a + Number(r.pontos || 0), 0);
  const totalDespachos = regs.length;
  const totalArea = regs.reduce((a: number, r: any) => a + Number(r.area_construida || 0), 0);

  const conteudo = [
    {
      titulo: "Resumo de Produtividade",
      linhas: [
        { colunas: ["Total de pontos", totalPontos.toFixed(1)] },
        { colunas: ["Total de despachos/documentos", String(totalDespachos)] },
        { colunas: ["Área construída total (m²)", totalArea.toFixed(2)] },
      ],
    },
    {
      titulo: "Detalhamento por Processo",
      linhas: [
        { colunas: ["Data", "Processo", "Tipo", "Área (m²)", "Pontos", "Interessado"] },
        ...regs.map((r: any) => ({
          colunas: [
            new Date(r.data_despacho).toLocaleDateString("pt-BR"),
            r.processo_codigo || "—",
            r.tipo_despacho || "—",
            Number(r.area_construida || 0).toFixed(2),
            Number(r.pontos || 0).toFixed(1),
            r.interessado || "—",
          ],
        })),
      ],
    },
  ];

  const pdfBytes = await gerarRelatorioPDF({
    titulo: "Relatório de Produtividade — MRP",
    subtitulo: "Mapa de Resultados e Produtividade",
    analista: nomeAnalista,
    periodo: labelPeriodo,
    geradoPor: nomeAnalista,
    conteudo,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="MRP_${nomeAnalista.replace(/\s+/g,"-")}_${periodo}.pdf"`,
    },
  });
}
