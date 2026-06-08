import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { gerarRelatorioPDF } from "@/lib/relatorio-pdf";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;

  const isAdmin = auth.perfis.includes("Administrador") || auth.perfis.includes("Diretora");
  const url = new URL(req.url);
  const analistaId = isAdmin ? (url.searchParams.get("analista") || auth.userId) : auth.userId;
  const periodo    = url.searchParams.get("periodo") || "mes"; // dia|semana|mes|ano

  // Janela de tempo
  const agora = new Date();
  let desde = new Date();
  let labelPeriodo = "";
  if (periodo === "dia") {
    desde.setHours(0,0,0,0);
    labelPeriodo = `Hoje, ${agora.toLocaleDateString("pt-BR")}`;
  } else if (periodo === "semana") {
    desde.setDate(agora.getDate() - 7);
    labelPeriodo = `Últimos 7 dias (${desde.toLocaleDateString("pt-BR")} a ${agora.toLocaleDateString("pt-BR")})`;
  } else if (periodo === "mes") {
    desde = new Date(agora.getFullYear(), agora.getMonth(), 1);
    labelPeriodo = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } else {
    desde = new Date(agora.getFullYear(), 0, 1);
    labelPeriodo = String(agora.getFullYear());
  }

  // Busca analista
  const { data: usuario } = await supabaseAdmin
    .from("usuarios").select("nome, email").eq("id", analistaId).maybeSingle();
  const nomeAnalista = (usuario as any)?.nome || (usuario as any)?.email || "Analista";

  // Busca diretora
  const { data: diretora } = await supabaseAdmin
    .from("usuarios").select("nome").eq("perfil", "Diretora").maybeSingle();
  const nomeDiretora = (diretora as any)?.nome || "Diretora — DIRAAP";

  // Busca eventos
  const { data: eventos } = await supabaseAdmin
    .from("auditoria_eventos")
    .select("*")
    .eq("analista_id", analistaId)
    .gte("criado_em", desde.toISOString())
    .order("criado_em", { ascending: false });

  const ev = eventos || [];

  // Resumo
  const totalEventos = ev.length;
  const processos = new Set(ev.map((e: any) => e.processo_codigo).filter(Boolean)).size;
  const docs = ev.filter((e: any) => ["DESPACHO_GERADO","DESPACHO_INTERNO_GERADO","LAUDO_EXCEL_GERADO"].includes(e.acao)).length;
  const camposLip = ev.filter((e: any) => e.acao === "LIP_CAMPO_ALTERADO").length;
  const itensMAC = ev.filter((e: any) => e.acao === "MAC_ITEM_MARCADO").length;

  // Monta conteúdo
  const conteudo = [
    {
      titulo: "Resumo do Período",
      linhas: [
        { colunas: ["Total de eventos registrados", String(totalEventos)] },
        { colunas: ["Processos analisados", String(processos)] },
        { colunas: ["Documentos gerados", String(docs)] },
        { colunas: ["Campos LIP editados", String(camposLip)] },
        { colunas: ["Itens MAC verificados", String(itensMAC)] },
      ],
    },
    {
      titulo: "Log de Eventos",
      linhas: [
        { colunas: ["Data/Hora", "Módulo", "Ação", "Processo"] },
        ...ev.slice(0, 200).map((e: any) => ({
          colunas: [
            new Date(e.criado_em).toLocaleString("pt-BR"),
            e.modulo || "—",
            e.acao || "—",
            e.processo_codigo || "—",
          ],
        })),
      ],
    },
  ];

  // Seção de alterações LIP (auditoria detalhada)
  const alteracoesLIP = ev.filter((e: any) => e.acao === "LIP_CAMPO_ALTERADO");
  if (alteracoesLIP.length > 0) {
    conteudo.push({
      titulo: "Alterações de Campos LIP (Auditoria)",
      linhas: [
        { colunas: ["Data/Hora", "Campo", "Valor Anterior", "Valor Novo", "Processo"] },
        ...alteracoesLIP.slice(0, 100).map((e: any) => ({
          colunas: [
            new Date(e.criado_em).toLocaleString("pt-BR"),
            e.detalhe?.label || e.detalhe?.campo || "—",
            e.detalhe?.valor_anterior || "—",
            e.detalhe?.valor_novo || "—",
            e.processo_codigo || "—",
          ],
        })),
      ],
    });
  }

  const pdfBytes = await gerarRelatorioPDF({
    titulo: "Relatório de Auditoria — MAP",
    subtitulo: `Módulo de Auditoria e Produtividade`,
    analista: nomeAnalista,
    periodo: labelPeriodo,
    geradoPor: nomeDiretora,
    conteudo,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="MAP_${nomeAnalista.replace(/\s+/g,"-")}_${periodo}.pdf"`,
    },
  });
}
