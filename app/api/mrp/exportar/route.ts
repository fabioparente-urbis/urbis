// ============================================================
// GET /api/mrp/exportar?formato=xlsx|docx&usuario_id=&mes=&ano=
// Exporta os registros MRP filtrados.
//  - xlsx: planilha bruta (filtrável)
//  - docx: relatório no padrão Prefeitura/DIRAAP
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autenticar } from "@/lib/auth";
import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx";

async function podeVer(
  auth: { userId: string; irrestrito: boolean; gerencia: string | null },
  alvoId: string,
): Promise<boolean> {
  if (alvoId === auth.userId) return true;
  if (auth.irrestrito) return true;
  if (auth.gerencia) {
    const { data } = await supabaseAdmin.from("usuarios").select("gerencia").eq("id", alvoId).maybeSingle();
    return (data as any)?.gerencia === auth.gerencia;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const formato = (searchParams.get("formato") ?? "xlsx").toLowerCase();
  const hoje = new Date();
  const mes = Number(searchParams.get("mes") ?? hoje.getMonth() + 1);
  const ano = Number(searchParams.get("ano") ?? hoje.getFullYear());
  const usuarioId = searchParams.get("usuario_id") ?? auth.userId;

  if (!(await podeVer(auth, usuarioId))) {
    return NextResponse.json({ ok: false, erro: "Sem permissão" }, { status: 403 });
  }

  // Filtros opcionais
  let q = supabaseAdmin.from("mrp_registros").select("*").eq("usuario_id", usuarioId);
  if (mes) q = q.eq("mes", mes);
  if (ano) q = q.eq("ano", ano);
  const tipoProcesso = searchParams.get("tipo_processo");
  const tipoDespacho = searchParams.get("tipo_despacho");
  if (tipoProcesso) q = q.eq("tipo_processo", tipoProcesso);
  if (tipoDespacho) q = q.eq("tipo_despacho", tipoDespacho);
  const { data: regs } = await q.order("data_despacho", { ascending: true });
  const linhas = (regs ?? []) as any[];

  const { data: usuario } = await supabaseAdmin
    .from("usuarios").select("nome, matricula, gerencia").eq("id", usuarioId).maybeSingle();

  const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (formato === "xlsx") {
    const dados = linhas.map((r) => ({
      Data: new Date(r.data_despacho).toLocaleDateString("pt-BR"),
      Processo: r.processo_codigo,
      Interessado: r.interessado ?? "",
      Assunto: r.assunto ?? "",
      "Tipo Processo": r.tipo_processo,
      Porte: r.porte,
      "Área (m²)": Number(r.area_construida ?? 0),
      "Tipo Despacho": r.tipo_despacho,
      "Nº Despacho": r.numero_despacho ?? "",
      "Nº Análise": r.numero_analise ?? "",
      "Revisão?": r.revisao ? "Sim" : "Não",
      Pontos: Number(r.pontos ?? 0),
      Bairro: r.bairro ?? "",
      Observações: r.observacoes ?? "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);
    XLSX.utils.book_append_sheet(wb, ws, "MRP");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="MRP_${(usuario as any)?.nome ?? usuarioId}_${mes}_${ano}.xlsx"`,
      },
    });
  }

  // ── DOCX (padrão Prefeitura/DIRAAP) ────────────────────────
  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  const headRow = new TableRow({
    tableHeader: true,
    children: [
      "Data", "Processo", "Interessado", "Assunto", "Porte",
      "Área (m²)", "Tipo Despacho", "Nº Desp.", "Pts", "Obs.",
    ].map((h) => new TableCell({
      shading: { fill: "1e293b" },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });
  const rows = linhas.map((r) =>
    new TableRow({
      children: [
        new Date(r.data_despacho).toLocaleDateString("pt-BR"),
        r.processo_codigo,
        r.interessado ?? "",
        r.assunto ?? "",
        r.porte,
        Number(r.area_construida ?? 0).toLocaleString("pt-BR"),
        r.tipo_despacho,
        r.numero_despacho ?? "",
        String(Number(r.pontos ?? 0)),
        r.observacoes ?? "",
      ].map((t) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ""), size: 16 })] })],
      })),
    }));

  const totalPts = linhas.reduce((a, r) => a + Number(r.pontos ?? 0), 0);
  const totalArea = linhas.reduce((a, r) => a + Number(r.area_construida ?? 0), 0);

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "PREFEITURA DE GOIÂNIA", bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Secretaria Municipal de Eficiência" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "DIRAAP — Diretoria de Análise e Aprovação de Projetos" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Mapa de Resultados e Produtividade (MRP)", italics: true })],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: `Analista: ${(usuario as any)?.nome ?? ""}`, bold: true })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Matrícula: ${(usuario as any)?.matricula ?? "—"}` }),
            new TextRun({ text: `   |   Gerência: ${(usuario as any)?.gerencia ?? "DIRAAP"}` }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: `Período: ${nomeMes}`, bold: true })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: `Total de despachos: ${linhas.length}    `, bold: true }),
            new TextRun({ text: `Total de pontos: ${Math.round(totalPts * 10) / 10}    `, bold: true }),
            new TextRun({ text: `Área total: ${Math.round(totalArea * 100) / 100} m²`, bold: true }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headRow, ...rows],
          borders: {
            top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder,
            insideHorizontal: cellBorder, insideVertical: cellBorder,
          },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [new TextRun({ text: `Emitido em ${new Date().toLocaleDateString("pt-BR")}`, italics: true, size: 18 })],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="MRP_${(usuario as any)?.nome ?? usuarioId}_${mes}_${ano}.docx"`,
    },
  });
}
