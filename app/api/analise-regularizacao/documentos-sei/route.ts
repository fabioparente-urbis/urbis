import { NextRequest, NextResponse } from "next/server";
import { fatiarPdfSei, lerPaginasIntervalo, type EventoSei } from "@/lib/documentosSei/fatiar";
import { ehContainerGenerico, abrirContainer, type PecaSei } from "@/lib/documentosSei/pecas";
import { documentosVivosRegularizacaoAtivo } from "@/lib/documentosSei/config";
import { autorizar, usuarioDaRequisicao } from "@/lib/autorizacao";
import { registrarEvento } from "@/lib/mhd";
import { persistirDocumentosVivos } from "@/lib/documentosSei/persistencia";

/**
 * POST /api/analise-regularizacao/documentos-sei — Fase 2 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md), exclusiva da Regularização (Slot 1).
 *
 * Recebe o PDF único do SEI (multipart) e devolve a linha do tempo de eventos, fatiada por
 * `lib/documentosSei/fatiar.ts`. ZERO IA. O PDF original NUNCA fica no servidor depois da
 * resposta: quem mantém o arquivo (para "abrir no original" e "baixar recorte") é a própria tela,
 * com o `File` que o analista soltou.
 *
 * O QUE ESTA ROTA GRAVA (corrigido em 07/09/2026 — até então este cabeçalho dizia "zero gravação:
 * nem MHD", o que deixou de ser verdade no Passo 0 e ninguém atualizou aqui):
 * - `mhd_eventos`: 1 evento-log por organização (auditoria de que o PDF foi organizado);
 * - `mhd_documentos`/`mhd_versoes`: um documento por peça/evento, via
 *   `lib/documentosSei/persistencia.ts` (§20 do plano). São DADOS e METADADOS apenas — id SEI,
 *   título, páginas, hash do texto — nunca o PDF.
 * Ambas são gravações AUTOMÁTICAS, sem clique de aceite, por pedido explícito do Fábio
 * (06/09/2026, §16.3). Isso é uma exceção consciente ao princípio §5.4 do plano ("proposta, nunca
 * gravação automática"), que vale INTEGRALMENTE para o LIP: nenhum campo de `processos.dados` é
 * tocado aqui — a proposta para o LIP só vira gravação com aceite campo a campo na tela.
 *
 * Rota NOVA, própria da Regularização — não reaproveita `app/api/lip/ler-pasta` nem
 * `lib/lerPastaSlot5.ts` (isolamento entre slots do CLAUDE.md). Atrás de interruptor próprio,
 * desligado por padrão (`urbis_config.documentos_vivos_regularizacao_ativo`).
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
  const ligado = await documentosVivosRegularizacaoAtivo();
  if (!ligado) {
    return NextResponse.json(
      { ok: false, erro: "Aba Documentos ainda não está ativada para a Regularização." },
      { status: 403 },
    );
  }

  /**
   * AUTORIZAÇÃO ANTES DE LER O CORPO (§23.6 / M6 da auditoria). Antes, `autorizar()` só rodava
   * depois de `req.formData()` já ter materializado até 350 MB em memória — quem não tinha sessão
   * válida conseguia fazer o servidor engolir o arquivo inteiro para só então levar 403.
   *
   * Isso só é possível porque o número do processo passou a vir na QUERY STRING além do corpo: sem
   * ele não dá para saber a que processo autorizar, e lê-lo do multipart obrigaria a consumir o
   * corpo primeiro — que é exatamente o que se quer evitar. A tela manda nos dois lugares.
   */
  const processoDaUrl = req.nextUrl.searchParams.get("processo_codigo") ?? "";
  const permissao = await autorizar(req, processoDaUrl);
  if (!permissao.ok) {
    return NextResponse.json({ ok: false, erro: permissao.erro }, { status: 403 });
  }

  // multipart consumido ANTES de abrir o stream — mesmo motivo de app/api/lip/ler-pasta/route.ts:
  // ler o corpo depois de já ter devolvido resposta arrisca o runtime fechar a entrada no meio.
  const form = await req.formData();

  const fluxo = new TransformStream();
  const escritor = fluxo.writable.getWriter();

  processar(req, form, permissao, escritor).catch(async (e: any) => {
    console.error("[documentos-sei]", e);
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
  permissao: Extract<Awaited<ReturnType<typeof autorizar>>, { ok: true }>,
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

    // O processo do corpo tem que ser o mesmo já autorizado pela URL — senão alguém autorizado
    // num processo estaria gravando MHD em outro.
    if (processoCodigo !== (req.nextUrl.searchParams.get("processo_codigo") ?? "")) {
      return enviar({ tipo: "erro", ok: false, erro: "Processo do corpo diverge do autorizado na URL." });
    }

    const buffer = new Uint8Array(await arquivo.arrayBuffer());
    const { resultado, leitor } = await fatiarPdfSei(buffer, (a) => {
      void enviar({ tipo: "progresso", ...a });
    });

    /**
     * Fase 3 — abre os contêineres genéricos (ver lib/documentosSei/pecas.ts). Só reabre o PDF
     * (por intervalo) para os eventos que parecem esconder várias peças — nunca o documento
     * inteiro de novo. Contagem publicada no resultado (portão da fase: "medida, não estimada").
     */
    const eventosComPecas: (EventoSei & { pecas?: PecaSei[] })[] = [];
    let paginasContainer = 0;
    let paginasClassificadas = 0;
    for (const ev of resultado.eventos) {
      if (!ehContainerGenerico(ev.titulo)) {
        eventosComPecas.push(ev);
        continue;
      }
      const paginasDoEvento = await lerPaginasIntervalo(leitor, ev.paginaIni, ev.paginaFim);
      const pecas = await abrirContainer(paginasDoEvento);
      paginasContainer += paginasDoEvento.length;
      paginasClassificadas += pecas.filter((p) => p.papel !== "classificacao_pendente")
        .reduce((soma, p) => soma + (p.paginaFim - p.paginaIni + 1), 0);
      eventosComPecas.push({ ...ev, pecas });
      void enviar({ tipo: "progresso_pecas", idSei: ev.idSei, pecas: pecas.length });
    }
    const coberturaPecas = {
      totalPaginasContainer: paginasContainer,
      classificadas: paginasClassificadas,
      pendentes: paginasContainer - paginasClassificadas,
    };
    const resultadoComPecas = { ...resultado, eventos: eventosComPecas, coberturaPecas };

    /**
     * MHD guarda só DADOS e METADADOS (id SEI, título, páginas, data, assinante) — nunca o PDF,
     * seguindo o princípio do próprio módulo e pedido explícito do Fábio (06/09/2026: "no urbis
     * só os dados e meta dados... pra economizar espaço"). São duas gravações: o evento-log da
     * organização e, desde o Passo 0 (§20), um documento/versão por peça.
     *
     * A tela recebe o índice ANTES de qualquer gravação (§23.6 da auditoria). Antes, a resposta só
     * saía depois de centenas de idas ao banco em série: se `maxDuration` estourasse, o analista
     * perdia o índice inteiro E ficava com meia persistência gravada, sem nada dizendo isso. Agora
     * o trabalho dele está seguro na tela primeiro; a gravação vira uma segunda linha do stream, e
     * falhar nela custa só o registro — nunca a organização do PDF.
     */
    await enviar({ tipo: "resultado", ok: true, ...resultadoComPecas });

    let persistencia = null;
    if (processoCodigo) {
      const usuario = await usuarioDaRequisicao(req);
      const erroMhd = await registrarEvento({
        processoCodigo,
        assuntoId: permissao.assuntoId,
        tipo: "documentos_sei_organizado",
        titulo: `Organizador de PDF SEI — ${resultado.eventos.length} evento(s), ${resultado.totalPaginas} página(s)`,
        detalhe: resultadoComPecas,
        usuarioId: usuario?.id ?? null,
      });
      if (erroMhd) console.error("[documentos-sei] MHD não gravou:", erroMhd);

      /**
       * Passo 0 das Fases 6/7 (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §20) — cria/atualiza
       * mhd_documentos/mhd_versoes DE VERDADE por documento (não só o evento-log acima). Nunca
       * bloqueia a resposta: falha aqui também vira aviso, a organização da tela continua valendo.
       */
      try {
        persistencia = await persistirDocumentosVivos({
          leitor, processoCodigo, assuntoId: permissao.assuntoId, usuarioId: usuario?.id ?? null,
          eventos: eventosComPecas,
        });
        if (persistencia.problemas.length) console.error("[documentos-sei] persistência MHD:", persistencia.problemas);
      } catch (e: any) {
        console.error("[documentos-sei] persistência MHD falhou:", e);
      }
    }

    return enviar({ tipo: "persistencia", persistencia });
  } catch (e: any) {
    console.error("[documentos-sei]", e);
    return enviar({ tipo: "erro", ok: false, erro: e?.message ?? "Falha ao fatiar o PDF" });
  }
}
