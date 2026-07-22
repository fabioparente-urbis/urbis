import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "@/lib/email";

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
      .select("dados, analista_id, tipo_processo")
      .eq("codigo", codigo)
      .maybeSingle();
    const dadosProc = (proc as any)?.dados || {};
    const interessado = dadosProc?.nome_proprietario?.valor || dadosProc?.proprietario?.valor || codigo;

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

    // Resolve nome legível do assunto (ex.: "regularizacao" → "Alvará de Regularização")
    let assuntoNome: string = tipoProcesso || "regularizacao";
    try {
      const { data: assunto } = await supabase
        .from("assuntos")
        .select("nome")
        .eq("slug", String(tipoProcesso || "regularizacao"))
        .maybeSingle();
      if ((assunto as any)?.nome) assuntoNome = (assunto as any).nome;
    } catch { /* usa slug como fallback */ }

    const { gerarDespachoInterno } = await import("@/lib/geradores");
    const buffer = await gerarDespachoInterno({
      processo: codigo,
      interessado,
      numeroDespacho,
      data,
      tipoProcesso: assuntoNome,
      destino,
      corpo,
      assinante,
    });

    // ── E-mail ao analista responsável (item 4 Cowork). Best-effort:
    //    qualquer falha é apenas logada; o docx continua sendo devolvido
    //    e o fluxo do front segue normalmente. ────────────────────────
    if (analistaEmail) {
      try {
        const tipoProcessoNorm = String(tipoProcesso || (proc as any)?.tipo_processo || "");
        const slugTipo = tipoProcessoNorm || "regularizacao";
        const linkProcesso = `${APP_URL}/processo/${encodeURIComponent(codigo)}?tipo=${encodeURIComponent(slugTipo)}`;
        const subject = `[URBIS] Despacho interno Nº ${numeroDespacho} — processo ${codigo}`;
        const corpoHtml = escapeHtml(String(corpo || "")).replace(/\n/g, "<br>");
        const html = `
          <p>Olá${analistaNome ? `, <strong>${escapeHtml(analistaNome)}</strong>` : ""},</p>
          <p>Foi registrado um <strong>despacho interno</strong> no processo sob sua responsabilidade:</p>
          <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
            <tr><td style="color:#555">Processo</td><td><strong>${escapeHtml(codigo)}</strong></td></tr>
            <tr><td style="color:#555">Tipo</td><td>${escapeHtml(tipoProcessoNorm || "—")}</td></tr>
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
          `Tipo: ${tipoProcessoNorm || "—"}\nData: ${data || "—"}\n\n` +
          `${corpo || ""}\n\nAbrir processo: ${linkProcesso}\n`;
        await enviarEmail({ to: analistaEmail, subject, html, text });
      } catch (mailErr) {
        console.warn("[despacho-interno] e-mail falhou (best-effort):", mailErr);
      }
    }

    // ── MDP: registra o despacho interno (falha silenciosa) ──
    try {
      const cookieHdr = req.headers.get("cookie") ?? "";
      const usuarioId = cookieHdr.match(/urbis_id=([^;]+)/)?.[1] ?? null;
      if (usuarioId) {
        await supabase.from("mdp_registros").insert({
          processo_codigo: codigo,
          assunto_id: (body.assunto_id as string | null) || null,
          tipo: "interno",
          numero: String(numeroDespacho ?? ""),
          destinatario: destino || null,
          data_despacho: data || null,
          conteudo: {
            corpo: corpo || "",
            pendencias_lip: Array.isArray(body.pendencias_lip) ? body.pendencias_lip : [],
          },
          usuario_id: usuarioId,
        });
      }
    } catch (_) {}

    // ── TAG no processo: rótulo visível na lista de processos ──
    try {
      const novaTag = {
        tipo: "despacho_interno",
        numero_despacho: String(numeroDespacho ?? ""),
        // Despacho Interno nasce de uma análise — a tag precisa dizer de qual.
        ...(Number.isInteger(Number(numero_analise)) ? { numero_analise: Number(numero_analise) } : {}),
        // Mesmo formato das demais tags (gravarTag no MAC) — a lista de
        // processos exibe o valor direto, sem reformatar.
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
    } catch (_) {}

    // ── MRP: grava o despacho interno automaticamente (falha silenciosa) ──
    try {
      const { gravarRegistroMRP } = await import("@/lib/mrpGravar");
      const tipoProc = String(tipoProcesso || (proc as any)?.tipo_processo || "regularizacao");
      await gravarRegistroMRP({
        processo_codigo: codigo,
        tipo_processo: tipoProc,
        tipo_despacho: "interno",
        numero_despacho: String(numeroDespacho ?? ""),
        analise_id: null,
        numero_revisao: null,
        cookie_header: req.headers.get("cookie") ?? "",
      });
    } catch (mrpErr) {
      console.warn("[MRP] falha ao gravar despacho interno:", mrpErr);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="DespachoInterno_${codigo}_${numeroDespacho}.docx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
