// ============================================================
// app/api/mac/aceite-sei/gerar-laudo/route.ts
// POST { processoId } → .xlsx do Laudo de Análise do ALVARÁ DE ACEITE
//
// ISOLAMENTO DE SLOT (CLAUDE.md): rota do Slot 2, própria. NÃO importa
// nada de `app/api/mac/gerar-laudo` (compartilhada Slot 1+2) nem de
// `lib/geradores/gerarLaudo.ts`. O laudo do Aceite é outro documento,
// com outro template e outras regras — reproduzido por LEITURA, nunca
// compartilhado. Um ajuste aqui não pode mudar a Regularização.
//
// O que ficou DE FORA de propósito, em relação à rota compartilhada:
//
//   • Conferência de compatibilidade de área (`compararAreas`) e o
//     respectivo 409 "AREA_DIVERGENTE": é verificação do Slot 1, que
//     cruza projeto × laudo × ART × vistoria. Aqui nunca rodava (era
//     gateada por `ehRegularizacaoSei`), então não há comportamento
//     perdido — só o código a menos.
//   • Seção de Uso do Solo e de poço de infiltração: o laudo do Aceite
//     não as tem. Ver o gerador.
//
// O que ficou A MAIS:
//
//   • Guarda de slot: processo que não é Aceite é RECUSADO aqui. O
//     isolamento vale nos dois sentidos.
//   • Rede de segurança do MDP no servidor, que o Slot 1 ganhou em
//     02/09/2026 e o Slot 2 nunca teve: o cliente também grava e as
//     duas convergem pra mesma linha. Sem isto, navegador fechado no
//     meio da emissão fazia o Slot 2 perder o registro em silêncio.
//   • Cabeçalhos `X-MRP-Falhou` / `X-MDP-Falhou`: falha de satélite não
//     é silenciosa (CLAUDE.md — "nunca deixar item sumir em silêncio").
//   • `X-Campos-Vazios` e `X-Comprovacao`: o que o laudo saiu sem, e
//     como a comprovação do tempo de existência foi resolvida.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gerarLaudoAceiteSei, type DadosLip } from "@/lib/geradores/aceiteSei/gerarLaudoAceiteSei";
import { ehAceiteSei } from "@/lib/aceiteSeiDispensas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const { processoId } = await req.json();
    if (!processoId) {
      return NextResponse.json({ erro: "processoId obrigatório" }, { status: 400 });
    }

    const { data: p, error: ep } = await supabase
      .from("processos")
      .select("*")
      .eq("codigo", processoId)
      .limit(1)
      .maybeSingle();

    if (ep || !p) {
      return NextResponse.json(
        { erro: "Processo não encontrado", detalhe: ep?.message },
        { status: 404 },
      );
    }

    /* Guarda de slot. Sem ela, um processo de Regularização emitiria o
     * laudo do Aceite por esta rota — e o isolamento só valeria pra um
     * lado. Recusa com a rota certa no texto, pra não virar adivinhação. */
    const tipoProc = String(p.tipo_processo || "");
    if (!ehAceiteSei(tipoProc)) {
      return NextResponse.json(
        {
          erro: "SLOT_INCORRETO",
          detalhe:
            `Este processo é "${tipoProc || "(sem tipo)"}", não Aceite SEI. O laudo do Aceite ` +
            `só é emitido para processos do Slot 2. Use /api/mac/gerar-laudo.`,
        },
        { status: 409 },
      );
    }

    // Análise MAC mais recente — reflete a revisão que vai pro laudo.
    const { data: mac } = await supabase
      .from("analises_mac")
      .select("id, numero_analise, observacoes")
      .eq("processo_codigo", processoId)
      .order("numero_analise", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dados: DadosLip = (p.dados || {}) as DadosLip;

    /** Avisos que o analista tem de ver ANTES de mandar o laudo adiante. */
    const headersAviso: string[] = [];

    /* Assinatura = o usuário do URBIS dono do processo (Fábio, 17/09/2026:
     * "a assinatura é a nossa do URBIS, do usuário"). Vai para a mesclagem
     * K73:N76 do laudo, entre a data e o rótulo "Analista Responsável".
     *
     * Isto substitui as 27 caixas de texto flutuantes do template — uma por
     * analista da diretoria, arrastadas à mão — que o ExcelJS perderia de
     * qualquer forma ao reescrever o arquivo. */
    let assinatura: string | null = null;
    if (p.analista_id) {
      const { data: membro } = await supabase
        .from("usuarios")
        .select("nome, cargo, cau_crea")
        .eq("id", p.analista_id)
        .maybeSingle();
      if (membro?.nome) {
        assinatura = [membro.nome, membro.cargo, membro.cau_crea]
          .filter((l) => typeof l === "string" && l.trim())
          .join("\n");
      }
    }
    if (!assinatura) {
      // Sem analista atribuído o laudo sai sem assinatura — mas o analista
      // precisa SABER disso antes de mandar o documento adiante.
      headersAviso.push("laudo emitido SEM assinatura: processo sem analista atribuído no URBIS");
    }

    const { buffer, comprovacao, camposVazios } = await gerarLaudoAceiteSei(dados, {
      codigoProcesso: p.codigo,
      assinatura,
    });

    const headersExtras: Record<string, string> = {
      "X-Comprovacao": encodeURIComponent(`${comprovacao.origem}: ${comprovacao.tipo || "(sem comprovação)"}`),
    };
    if (camposVazios.length > 0) {
      headersExtras["X-Campos-Vazios"] = encodeURIComponent(camposVazios.join(","));
    }
    if (headersAviso.length > 0) {
      headersExtras["X-Avisos"] = encodeURIComponent(headersAviso.join(" | "));
    }

    // Último documento emitido + relógio do processo (idempotente).
    await supabase
      .from("processos")
      .update({
        dados: { ...(p.dados || {}), ultimo_documento: "Laudo" },
        atualizado_em: new Date().toISOString(),
      })
      .eq("codigo", processoId);

    await supabase
      .from("processos")
      .update({ analise_concluida_em: new Date().toISOString() })
      .eq("codigo", processoId)
      .is("analise_concluida_em", null);

    const cookieHeader = req.headers.get("cookie") ?? "";
    const interessado = (dados["proprietario"]?.valor as string | undefined) ?? null;

    // ── MDP: o laudo é documento emitido e precisa constar no que SAIU ──
    try {
      const { gravarRegistroMDPLaudo } = await import("@/lib/mdpGravar");
      const r = await gravarRegistroMDPLaudo({
        processo_codigo: processoId,
        assunto_id: p.assunto_id ?? null,
        numero_analise: mac?.numero_analise ?? null,
        interessado,
        cookie_header: cookieHeader,
      });
      if (!r.ok) {
        console.warn("[MDP/slot2] laudo não gravado:", r.motivo);
        headersExtras["X-MDP-Falhou"] = encodeURIComponent(r.motivo ?? "motivo desconhecido");
      }
    } catch (mdpErr: any) {
      console.warn("[MDP/slot2] falha ao gravar laudo:", mdpErr);
      headersExtras["X-MDP-Falhou"] = encodeURIComponent(mdpErr?.message ?? "erro desconhecido");
    }

    // ── MRP: pontuação do analista ──
    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      const r = await gravarRegistroMRP({
        processo_codigo: processoId,
        tipo_processo: tipoProc,
        tipo_despacho: "laudo",
        numero_despacho: null,
        analise_id: mac?.id ?? null,
        numero_revisao: null,
        cookie_header: cookieHeader,
      });
      if (!r.ok) {
        console.warn("[MRP/slot2] laudo não gravado:", r.motivo);
        headersExtras["X-MRP-Falhou"] = encodeURIComponent(r.motivo ?? "motivo desconhecido");
      }
    } catch (mrpErr: any) {
      console.warn("[MRP/slot2] falha ao gravar laudo:", mrpErr);
      headersExtras["X-MRP-Falhou"] = encodeURIComponent(mrpErr?.message ?? "erro desconhecido");
    }

    const nomeArquivo = `Laudo_Aceite_${p.codigo.replace(/[/\\]/g, "-")}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...headersExtras,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e: any) {
    console.error("[gerar-laudo/aceite-sei]", e);
    return NextResponse.json(
      { erro: "Erro ao gerar laudo do Aceite", detalhe: e?.message },
      { status: 500 },
    );
  }
}
