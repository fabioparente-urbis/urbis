import { NextRequest, NextResponse } from "next/server";
import { fatiarPdfSei } from "@/lib/documentosSei/fatiar";
import { documentosVivosAceiteSeiAtivo } from "@/lib/documentosSei/config";
import { autorizar } from "@/lib/autorizacao";

/**
 * POST /api/analise-aceite-sei/documentos-sei — Fase 2 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md), exclusiva do Aceite SEI (Slot 2).
 *
 * REPRODUZIDA por leitura a partir de `app/api/analise-regularizacao/documentos-sei/route.ts`
 * (Slot 1) — pedido explícito do Fábio de ter um idêntico no Aceite SEI (06/09/2026). Isolamento
 * entre slots é regra do CLAUDE.md: as duas rotas são cópias deliberadas, não uma rota genérica
 * com `if (slot)`. Só `fatiarPdfSei` é de fato compartilhado — é puro e não conhece slot nenhum.
 *
 * Recebe o PDF único do SEI (multipart) e devolve a linha do tempo de eventos. ZERO IA, zero
 * gravação: a resposta é só a proposta — nem MHD, nem `processos.dados` são tocados aqui. O PDF
 * original NUNCA fica no servidor depois da resposta.
 *
 * Atrás de interruptor próprio, desligado por padrão
 * (`urbis_config.documentos_vivos_aceite_sei_ativo`).
 */

export const runtime = "nodejs"; // pdfjs-dist (legacy) precisa de Node, não roda no edge
export const maxDuration = 120;

// PDF único do SEI mesclado pode passar de 250MB (medido em processos reais na Fase 0/1) —
// bem maior que a pasta inteira de outro fluxo, porque aqui é um arquivo só com o processo todo.
const MAX_BYTES = 350 * 1024 * 1024;

function linha(o: unknown) {
  return new TextEncoder().encode(JSON.stringify(o) + "\n");
}

export async function POST(req: NextRequest) {
  const ligado = await documentosVivosAceiteSeiAtivo();
  if (!ligado) {
    return NextResponse.json(
      { ok: false, erro: "Aba Documentos ainda não está ativada para o Aceite SEI." },
      { status: 403 },
    );
  }

  // multipart consumido ANTES de abrir o stream — mesmo motivo de app/api/lip/ler-pasta/route.ts:
  // ler o corpo depois de já ter devolvido resposta arrisca o runtime fechar a entrada no meio.
  const form = await req.formData();

  const fluxo = new TransformStream();
  const escritor = fluxo.writable.getWriter();

  processar(req, form, escritor).catch(async (e: any) => {
    console.error("[documentos-sei/aceite]", e);
    try { await escritor.write(linha({ tipo: "erro", ok: false, erro: e?.message ?? "Falha ao fatiar o PDF" })); } catch {}
  }).finally(() => { escritor.close().catch(() => {}); });

  return new Response(fluxo.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function processar(
  req: NextRequest,
  form: FormData,
  escritor: WritableStreamDefaultWriter<Uint8Array>,
) {
  const enviar = (o: unknown) => escritor.write(linha(o));
  try {
    const arquivo = form.get("arquivo");
    const processoCodigo = String(form.get("processo_codigo") ?? "");

    if (!(arquivo instanceof File)) {
      return enviar({ tipo: "erro", ok: false, erro: "Nenhum PDF enviado" });
    }
    if (arquivo.size > MAX_BYTES) {
      return enviar({
        tipo: "erro", ok: false,
        erro: `PDF com ${(arquivo.size / 1024 / 1024).toFixed(0)}MB — o limite é ${MAX_BYTES / 1024 / 1024}MB`,
      });
    }

    const permissao = await autorizar(req, processoCodigo);
    if (!permissao.ok) {
      return enviar({ tipo: "erro", ok: false, erro: permissao.erro });
    }

    const buffer = new Uint8Array(await arquivo.arrayBuffer());
    const resultado = await fatiarPdfSei(buffer, (a) => {
      void enviar({ tipo: "progresso", ...a });
    });

    return enviar({ tipo: "resultado", ok: true, ...resultado });
  } catch (e: any) {
    console.error("[documentos-sei/aceite]", e);
    return enviar({ tipo: "erro", ok: false, erro: e?.message ?? "Falha ao fatiar o PDF" });
  }
}
