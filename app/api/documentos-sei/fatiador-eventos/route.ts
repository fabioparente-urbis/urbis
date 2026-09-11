import { NextRequest, NextResponse } from "next/server";
import { autorizar, usuarioDaRequisicao } from "@/lib/autorizacao";
import { registrarEvento } from "@/lib/mhd";

/**
 * POST /api/documentos-sei/fatiador-eventos — Fase 6 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md (módulo próprio do fatiador).
 *
 * Rastreabilidade das correções manuais do analista (criar corte, corrigir, confirmar, excluir,
 * marcar lixo) — grava em `mhd_eventos` via `registrarEvento` (`lib/mhd.ts`, já existente, já é o
 * que alimenta as visões do BDI hoje). Sem tabela nova: `tipo` ganha valores novos
 * (`fatiador_corte`, `fatiador_correcao`, `fatiador_confirmacao`, `fatiador_lixo`,
 * `fatiador_exportacao`), o resto do formato é o mesmo dos eventos que a rota de fatiamento já
 * grava.
 *
 * `registrarEvento` usa `supabaseAdmin` (service role) — não pode ser chamado direto do cliente,
 * por isso esta rota fina existe só pra isso.
 */

const TIPOS_VALIDOS = new Set([
  "fatiador_corte", "fatiador_correcao", "fatiador_confirmacao", "fatiador_lixo",
  "fatiador_restauracao", "fatiador_exportacao",
  // A tela já mandava `fatiador_leitura` desde a Fase 7, mas o tipo não estava aqui: a rota
  // respondia 400 e o cliente engolia no .catch(), então o envio para leitura sumia do histórico
  // em silêncio — contra o princípio "nada some em silêncio" do §3.6 do plano.
  "fatiador_leitura",
]);

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({}));
  const processoCodigo = String(corpo.processoCodigo ?? "");
  const permissao = await autorizar(req, processoCodigo);
  if (!permissao.ok) {
    return NextResponse.json({ ok: false, erro: permissao.erro }, { status: 403 });
  }

  const tipo = String(corpo.tipo ?? "");
  if (!TIPOS_VALIDOS.has(tipo)) {
    return NextResponse.json({ ok: false, erro: "tipo de evento não reconhecido" }, { status: 400 });
  }
  const titulo = String(corpo.titulo ?? "").trim();
  if (!titulo) return NextResponse.json({ ok: false, erro: "titulo obrigatório" }, { status: 400 });

  const usuario = await usuarioDaRequisicao(req);
  const erro = await registrarEvento({
    processoCodigo,
    assuntoId: permissao.assuntoId,
    tipo,
    titulo,
    detalhe: corpo.detalhe ?? null,
    usuarioId: usuario?.id ?? null,
  });
  if (erro) return NextResponse.json({ ok: false, erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
