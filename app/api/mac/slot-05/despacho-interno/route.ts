/**
 * app/api/mac/slot-05/despacho-interno/route.ts — Despacho Interno, EXCLUSIVO do Slot 5.
 *
 * Rota própria por decisão do Fábio (25/08/2026): o despacho interno da Aprovação de Projeto é
 * idêntico ao da Regularização hoje, mas se refere única e exclusivamente aos processos do Slot 5.
 * Não usa `/api/despacho-interno` nem `lib/geradores.ts`.
 *
 * Além da separação, isso corrige um risco real: a rota compartilhada busca o processo só por
 * `codigo` (`.eq("codigo", codigo).maybeSingle()`). O URBIS admite o MESMO código em slots
 * diferentes — ali ela poderia achar o processo errado. Aqui passa por `resolverProcessoSlot5`,
 * que exige o trio (codigo, assunto_id, tipo_processo) e aplica a regra de visibilidade.
 *
 * NÃO consome número: quem consome é /api/numeracao/proximo, chamado pela tela DEPOIS do download.
 * A série é a mesma de todos os slots, com `documento=despacho_interno` como discriminante.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "@/lib/mac-motor/slot5/constantes";
import { gerarDespachoInternoSlot5 } from "@/lib/mac-motor/slot5/gerarDespachoInterno";
import { enviarEmail } from "@/lib/email";
import { normalizarBusca } from "@/lib/texto";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
  || "https://urbis-production.up.railway.app";

function escaparHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });

    const { codigo, numeroDespacho, data, destino, corpo, numero_analise } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    if (!numeroDespacho) return NextResponse.json({ ok: false, erro: "número do despacho obrigatório" }, { status: 400 });
    if (!destino) return NextResponse.json({ ok: false, erro: "destinatário obrigatório" }, { status: 400 });
    if (!String(corpo ?? "").trim()) return NextResponse.json({ ok: false, erro: "conteúdo obrigatório" }, { status: 400 });

    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });

    const dados = (resolucao.processo.dados ?? {}) as Record<string, any>;
    const interessado = String(dados?.proprietario?.valor ?? "").trim() || codigo;
    // No documento o código serve de fallback; no MDP não — ali `interessado` é coluna de nome e
    // alimenta a busca. Sem nome real, fica nulo.
    const interessadoMdp = interessado === codigo ? null : interessado;
    const dataFinal = String(data ?? "").match(/^\d{2}\/\d{2}\/\d{4}$/)
      ? String(data) : new Date().toLocaleDateString("pt-BR");

    // Assina quem EMITE (usuário logado), não o dono do processo.
    const { data: membro } = await supabaseAdmin
      .from("usuarios").select("nome, cargo, cau_crea").eq("id", usuario.id).maybeSingle();

    const buffer = await gerarDespachoInternoSlot5({
      processo: codigo,
      interessado,
      numeroDespacho: String(numeroDespacho),
      data: dataFinal,
      assunto: "Aprovação de Projeto",
      destino: String(destino),
      corpo: String(corpo),
      assinante: {
        nome: (membro as any)?.nome || "—",
        cargo: (membro as any)?.cargo || null,
        registro: (membro as any)?.cau_crea || null,
      },
    });

    // ── E-mail ao analista responsável pelo processo (best-effort) ──────────
    const { data: proc } = await supabaseAdmin
      .from("processos").select("analista_id").eq("id", resolucao.processo.id).maybeSingle();
    const analistaId = (proc as any)?.analista_id;
    if (analistaId) {
      try {
        const { data: resp } = await supabaseAdmin
          .from("usuarios").select("nome, email").eq("id", analistaId).maybeSingle();
        const email = (resp as any)?.email;
        if (email) {
          const link = `${APP_URL}/processo/${encodeURIComponent(codigo)}?tipo=${encodeURIComponent(TIPO_PROCESSO_SLOT5)}`;
          const corpoHtml = escaparHtml(String(corpo)).replace(/\n/g, "<br>");
          await enviarEmail({
            to: email,
            subject: `[URBIS] Despacho interno Nº ${numeroDespacho} — processo ${codigo}`,
            html: `
              <p>Olá${(resp as any)?.nome ? `, <strong>${escaparHtml((resp as any).nome)}</strong>` : ""},</p>
              <p>Foi registrado um <strong>despacho interno</strong> no processo sob sua responsabilidade:</p>
              <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
                <tr><td style="color:#555">Processo</td><td><strong>${escaparHtml(codigo)}</strong></td></tr>
                <tr><td style="color:#555">Tipo</td><td>Aprovação de Projeto</td></tr>
                <tr><td style="color:#555">Despacho Nº</td><td>${escaparHtml(String(numeroDespacho))}</td></tr>
                <tr><td style="color:#555">Destinatário</td><td>${escaparHtml(String(destino))}</td></tr>
                <tr><td style="color:#555">Data</td><td>${escaparHtml(dataFinal)}</td></tr>
                <tr><td style="color:#555" valign="top">Texto</td><td>${corpoHtml || "—"}</td></tr>
              </table>
              <p style="margin-top:16px">
                <a href="${link}" style="background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;font-size:13px">Abrir processo no URBIS</a>
              </p>
              <p style="color:#666;font-size:12px">Notificação automática do URBIS — Prefeitura de Goiânia.</p>`,
            text:
              `Despacho interno Nº ${numeroDespacho} — processo ${codigo}\n`
              + `Tipo: Aprovação de Projeto\nDestinatário: ${destino}\nData: ${dataFinal}\n\n`
              + `${corpo}\n\nAbrir processo: ${link}\n`,
          });
        }
      } catch (e) {
        console.warn("[MAC/slot-05/despacho-interno] e-mail falhou (best-effort):", e);
      }
    }

    // ── MDP: registro do que SAIU (best-effort) ─────────────────────────────
    try {
      await supabaseAdmin.from("mdp_registros").insert({
        processo_codigo: codigo,
        assunto_id: ASSUNTO_ID_SLOT5,
        interessado: interessadoMdp,
        busca_norm: normalizarBusca(interessadoMdp, codigo),
        tipo: "interno",
        numero: String(numeroDespacho),
        destinatario: String(destino),
        data_despacho: dataFinal,
        conteudo: { corpo: String(corpo), numero_analise: numero_analise ?? null },
        usuario_id: usuario.id,
      });
    } catch (e) {
      console.warn("[MAC/slot-05/despacho-interno] MDP falhou (best-effort):", e);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="DespachoInterno_${codigo}_${numeroDespacho}.docx"`,
      },
    });
  } catch (e: any) {
    console.error("[MAC/slot-05/despacho-interno]", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
