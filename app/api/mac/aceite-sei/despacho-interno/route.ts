// ============================================================
// app/api/mac/aceite-sei/despacho-interno/route.ts
// POST → .docx do DESPACHO INTERNO do ALVARÁ DE ACEITE (Slot 2).
//
// ISOLAMENTO DE SLOT (CLAUDE.md): rota própria do Slot 2, reproduzida
// POR LEITURA de `app/api/despacho-interno` (que era compartilhada com
// o Slot 1). O Slot 5 já tinha a sua desde sempre
// (`app/api/mac/slot-05/despacho-interno`); o Slot 2 não tinha.
// Pedido do Fábio, 17/09/2026: "despacho interno tb".
//
// Conteúdo do documento IDÊNTICO ao Slot 1 — nenhuma redação mudou.
//
// Diferenças em relação à rota compartilhada, todas deliberadas:
//
//   • Guarda de slot: processo que não é Aceite é RECUSADO. O
//     isolamento vale nos dois sentidos.
//   • Os fallbacks de tipo deixam de ser "regularizacao". Na rota
//     compartilhada, processo sem `tipo_processo` caía em
//     "regularizacao" em DOIS pontos (o nome do assunto no cabeçalho do
//     documento e o `tipo_processo` do MRP) — num despacho do Aceite
//     isso imprimia o assunto errado e contava a produção no slot
//     errado.
//   • Falha de satélite vira cabeçalho visível em vez de `catch {}`
//     vazio (CLAUDE.md — "nunca deixar item sumir em silêncio"). Os
//     `catch (_) {}` da rota original engoliam falha de MDP e de tag
//     sem deixar rastro na tela.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "@/lib/email";
import { normalizarBusca } from "@/lib/texto";
import { resolverUsuarioIdPorCookie } from "@/lib/auth";
import { ehAceiteSei } from "@/lib/aceiteSeiDispensas";
import { gerarDespachoInternoAceiteSei } from "@/lib/geradores/aceiteSei/gerarDespachoInternoAceiteSei";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://urbis-production.up.railway.app";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { codigo, tipoProcesso, numeroDespacho, data, destino, corpo, numero_analise } = body;

    const { data: proc } = await supabase
      .from("processos")
      .select("dados, analista_id, tipo_processo, assunto_id")
      .eq("codigo", codigo)
      .maybeSingle();

    /* Guarda de slot: o tipo vem do BANCO, não do corpo da requisição —
     * quem chama não decide de que slot o processo é. */
    const tipoNoBanco = String((proc as any)?.tipo_processo || "");
    if (proc && !ehAceiteSei(tipoNoBanco)) {
      return NextResponse.json(
        {
          ok: false,
          erro: "SLOT_INCORRETO",
          detalhe:
            `Este processo é "${tipoNoBanco || "(sem tipo)"}", não Aceite SEI. ` +
            `Use /api/despacho-interno.`,
        },
        { status: 409 },
      );
    }

    const dadosProc = (proc as any)?.dados || {};
    const interessado = dadosProc?.nome_proprietario?.valor || dadosProc?.proprietario?.valor || codigo;
    // No documento o código serve de fallback; no MDP não — ali `interessado`
    // é coluna de nome e alimenta a busca. Sem nome real, fica nulo.
    const interessadoMdp: string | null = interessado === codigo ? null : interessado;

    /** Avisos que o analista tem de ver — nenhum satélite falha calado. */
    const headersAviso: string[] = [];

    let assinante: { nome: string; matricula?: string; cargo?: string; registro?: string } | undefined;
    let analistaEmail: string | null = null;
    let analistaNome: string | null = null;
    if ((proc as any)?.analista_id) {
      const { data: membro } = await supabase
        .from("usuarios")
        .select("nome, email, matricula, cargo, cau_crea")
        .eq("id", (proc as any).analista_id)
        .maybeSingle();
      if ((membro as any)?.nome) {
        assinante = {
          nome: (membro as any).nome,
          matricula: (membro as any).matricula || undefined,
          cargo: (membro as any).cargo || undefined,
          registro: (membro as any).cau_crea || undefined,
        };
        analistaNome = (membro as any).nome || null;
        analistaEmail = (membro as any).email || null;
      }
    }

    /* Nome legível do assunto para o cabeçalho ("aceite_sei" → "Aceite SEI").
     * Fallback é "aceite_sei", NÃO "regularizacao" como na rota compartilhada. */
    const slugTipo = String(tipoProcesso || tipoNoBanco || "aceite_sei");
    let assuntoNome: string = slugTipo;
    try {
      const { data: assunto } = await supabase
        .from("assuntos")
        .select("nome")
        .eq("slug", slugTipo)
        .maybeSingle();
      if ((assunto as any)?.nome) assuntoNome = (assunto as any).nome;
    } catch { /* usa o slug como fallback */ }

    const buffer = await gerarDespachoInternoAceiteSei({
      processo: codigo,
      interessado,
      numeroDespacho,
      data,
      tipoProcesso: assuntoNome,
      destino,
      corpo,
      assinante,
    });

    // ── E-mail ao analista responsável. Best-effort: falha só é logada,
    //    o docx continua sendo devolvido. ──
    if (analistaEmail) {
      try {
        const linkProcesso = `${APP_URL}/processo/${encodeURIComponent(codigo)}?tipo=${encodeURIComponent(slugTipo)}`;
        const subject = `[URBIS] Despacho interno Nº ${numeroDespacho} — processo ${codigo}`;
        const corpoHtml = escapeHtml(String(corpo || "")).replace(/\n/g, "<br>");
        const html = `
          <p>Olá${analistaNome ? `, <strong>${escapeHtml(analistaNome)}</strong>` : ""},</p>
          <p>Foi registrado um <strong>despacho interno</strong> no processo sob sua responsabilidade:</p>
          <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
            <tr><td style="color:#555">Processo</td><td><strong>${escapeHtml(codigo)}</strong></td></tr>
            <tr><td style="color:#555">Tipo</td><td>${escapeHtml(assuntoNome || "—")}</td></tr>
            <tr><td style="color:#555">Despacho Nº</td><td>${escapeHtml(String(numeroDespacho || "—"))}</td></tr>
            <tr><td style="color:#555">Data</td><td>${escapeHtml(String(data || "—"))}</td></tr>
            <tr><td style="color:#555" valign="top">Texto</td><td>${corpoHtml || "—"}</td></tr>
          </table>
          <p style="margin-top:16px">
            <a href="${linkProcesso}" style="background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;font-size:13px">
              Abrir processo no URBIS
            </a>
          </p>
          <p style="color:#666;font-size:12px">Esta é uma notificação automática do sistema URBIS — Prefeitura de Goiânia.</p>
        `;
        const text =
          `Despacho interno Nº ${numeroDespacho} — processo ${codigo}\n` +
          `Tipo: ${assuntoNome || "—"}\nData: ${data || "—"}\n\n` +
          `${corpo || ""}\n\nAbrir processo: ${linkProcesso}\n`;
        await enviarEmail({ to: analistaEmail, subject, html, text });
      } catch (mailErr: any) {
        console.warn("[despacho-interno/slot2] e-mail falhou (best-effort):", mailErr);
        headersAviso.push(`e-mail ao analista não saiu: ${mailErr?.message ?? "erro desconhecido"}`);
      }
    }

    /* ── MDP ──
     * Reemissão: mesmo (processo, tipo=interno, número) é o MESMO documento —
     * atualiza a linha em vez de inserir uma segunda (mesma trava de dedupe do
     * POST /api/mdp). Sem isso, reemitir dentro dos 15 min duplicava. */
    try {
      const usuarioId = await resolverUsuarioIdPorCookie(req.headers.get("cookie") ?? "");
      if (!usuarioId) {
        headersAviso.push("MDP não registrou o despacho interno: sessão inválida");
      } else {
        const payloadMdp = {
          processo_codigo: codigo,
          assunto_id: (body.assunto_id as string | null) || (proc as any)?.assunto_id || null,
          interessado: interessadoMdp,
          busca_norm: normalizarBusca(interessadoMdp, codigo),
          tipo: "interno",
          numero: String(numeroDespacho ?? ""),
          destinatario: destino || null,
          data_despacho: data || null,
          conteudo: {
            corpo: corpo || "",
            pendencias_lip: Array.isArray(body.pendencias_lip) ? body.pendencias_lip : [],
            padrao_id: (body.padrao_id as string | null) || null,
            padrao_titulo: (body.padrao_titulo as string | null) || null,
          },
          usuario_id: usuarioId,
        };
        const { data: existenteMdp } = await supabase
          .from("mdp_registros")
          .select("id")
          .eq("processo_codigo", codigo)
          .eq("tipo", "interno")
          .eq("numero", payloadMdp.numero)
          .maybeSingle();
        if (existenteMdp?.id) {
          await supabase.from("mdp_registros").update(payloadMdp).eq("id", existenteMdp.id);
        } else {
          await supabase.from("mdp_registros").insert(payloadMdp);
        }
      }
    } catch (mdpErr: any) {
      console.warn("[MDP/slot2] falha ao gravar despacho interno:", mdpErr);
      headersAviso.push(`MDP não registrou o despacho interno: ${mdpErr?.message ?? "erro desconhecido"}`);
    }

    // ── TAG no processo: rótulo visível na lista de processos ──
    try {
      const novaTag = {
        tipo: "despacho_interno",
        numero_despacho: String(numeroDespacho ?? ""),
        // Despacho Interno nasce de uma análise — a tag precisa dizer de qual.
        ...(Number.isInteger(Number(numero_analise)) ? { numero_analise: Number(numero_analise) } : {}),
        // Mesmo formato das demais tags (gravarTag no MAC).
        data: new Date().toLocaleDateString("pt-BR"),
      };
      const { data: procAtual } = await supabase
        .from("processos")
        .select("tags")
        .eq("codigo", codigo)
        .maybeSingle();
      const tagsAtuais: any[] = Array.isArray((procAtual as any)?.tags) ? (procAtual as any).tags : [];
      await supabase
        .from("processos")
        .update({ tags: [...tagsAtuais, novaTag] })
        .eq("codigo", codigo);
    } catch (tagErr: any) {
      console.warn("[TAG/slot2] falha ao gravar tag do despacho interno:", tagErr);
      headersAviso.push(`tag do despacho interno não gravada: ${tagErr?.message ?? "erro desconhecido"}`);
    }

    // ── MRP: pontuação do analista ──
    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      const r = await gravarRegistroMRP({
        processo_codigo: codigo,
        // Fallback "aceite_sei", não "regularizacao": esta rota é do Slot 2.
        tipo_processo: tipoNoBanco || String(tipoProcesso || "aceite_sei"),
        tipo_despacho: "interno",
        numero_despacho: String(numeroDespacho ?? ""),
        analise_id: null,
        numero_revisao: null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
      if (!r.ok) {
        console.warn("[MRP/slot2] despacho interno não gravado:", r.motivo);
        headersAviso.push(`MRP não registrou o despacho interno: ${r.motivo ?? "motivo desconhecido"}`);
      }
    } catch (mrpErr: any) {
      console.warn("[MRP/slot2] falha ao gravar despacho interno:", mrpErr);
      headersAviso.push(`MRP não registrou o despacho interno: ${mrpErr?.message ?? "erro desconhecido"}`);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...(headersAviso.length > 0 ? { "X-Avisos": encodeURIComponent(headersAviso.join(" | ")) } : {}),
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="DespachoInterno_${codigo}_${numeroDespacho}.docx"`,
      },
    });
  } catch (e: any) {
    console.error("[despacho-interno/aceite-sei]", e);
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
