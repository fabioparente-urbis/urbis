import { NextRequest, NextResponse } from "next/server";
import { autorizar, usuarioDaRequisicao } from "@/lib/autorizacao";
import { registrarEvento } from "@/lib/mhd";

/**
 * POST /api/mac/slot-05/organizador-evento — registra 1 evento de auditoria no MHD toda vez que
 * o "Organizador de Documentos" (`components/aprovacaoProjeto/OrganizadorSlot5.tsx`) é aberto.
 *
 * Mesmo procedimento do Organizador de PDF SEI dos Slots 1/2 (`documentos_sei_organizado`) —
 * pedido explícito do Fábio: "quero o mesmo procedimento" do MHD. Só metadado (processo, quantos
 * documentos existiam no momento) — nunca o arquivo, nunca reclassifica nada. Aparece na pilha e
 * no histórico do `/admin/mhd`, igual às demais ações do módulo.
 *
 * Nunca bloqueia a experiência do analista: falha aqui não derruba a tela, só não some com o
 * dado — mesmo padrão de "falha nunca é silenciosa" do restante do MHD.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const processoCodigo = String(body?.processo_codigo ?? "");
    const documentos = Number(body?.documentos ?? 0);
    if (!processoCodigo) {
      return NextResponse.json({ ok: false, erro: "processo_codigo é obrigatório" }, { status: 400 });
    }

    const permissao = await autorizar(req, processoCodigo);
    if (!permissao.ok) {
      return NextResponse.json({ ok: false, erro: permissao.erro }, { status: permissao.status });
    }

    const usuario = await usuarioDaRequisicao(req);
    const erroMhd = await registrarEvento({
      processoCodigo,
      assuntoId: permissao.assuntoId,
      tipo: "documentos_organizados_slot5",
      titulo: `Organizador de Documentos aberto — ${documentos} documento(s) no MHD`,
      detalhe: { documentos },
      usuarioId: usuario?.id ?? null,
    });
    if (erroMhd) console.error("[organizador-evento] MHD não gravou:", erroMhd);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[organizador-evento]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? String(e) }, { status: 500 });
  }
}
