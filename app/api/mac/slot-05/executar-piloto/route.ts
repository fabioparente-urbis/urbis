/**
 * app/api/mac/slot-05/executar-piloto/route.ts — piloto do motor híbrido do MAC, Slot 5.
 *
 * NÃO referenciada por nenhuma tela (por instrução do usuário: "não integrar à tela ainda").
 * Isolada do Slot 1: não importa nada de app/api/mac/p3 (P3_MAC da Regularização/Aceite), não lê
 * nem grava lip_prompts, não toca em app/analise-regularizacao nem em app/api/analise-regularizacao.
 *
 * v3 em 2026-07-30 — terceira rodada de correções de revisão independente:
 *   1. Autentica com `usuarioDaRequisicao` ANTES de `req.formData()` — uma requisição anônima
 *      recusa em 401 sem o servidor gastar memória carregando os PDFs do multipart.
 *   2. O processo é resolvido pelo trio exato (codigo, assunto_id, tipo_processo) em
 *      lib/mac-motor/slot5/autorizacao.ts, não mais pela busca genérica de lib/autorizacao.ts
 *      (que resolve só por `codigo` com `.maybeSingle()` — o URBIS permite o mesmo código em
 *      slots diferentes, e essa resolução genérica podia pegar o processo errado). Não alteramos
 *      lib/autorizacao.ts — é compartilhado, e o Slot 1 é intocável.
 *   3. Os valores do LIP chegam como CampoLipCongelado (valor bruto + normalizado + origem),
 *      lidos de `processos.dados` no servidor — não mais números soltos convertidos na rota.
 *
 * Entrada (multipart/form-data):
 *   codigo    — código do processo (obrigatório; precisa existir no Slot 5 e o usuário poder acessá-lo)
 *   certidao  — PDF da Certidão de Matrícula, opcional
 *   prancha   — PDF da prancha de projeto (carimbo + ICCAP + planta de situação), opcional
 */

import { NextRequest, NextResponse } from "next/server";
import { executarPilotoSlot5 } from "@/lib/mac-motor/slot5";
import type { DocumentoEntrada } from "@/lib/mac-motor/slot5/tipos";
import { lerCampoLip } from "@/lib/mac-motor/slot5/camposLip";
import { validarPdf } from "@/lib/mac-motor/slot5/validacaoDocumento";
import { resolverProcessoSlot5, usuarioDaRequisicao } from "@/lib/mac-motor/slot5/autorizacao";

export const maxDuration = 300;

async function paraDocumentoValidado(
  file: File | null,
  papel: string,
): Promise<{ ok: true; doc: DocumentoEntrada | null } | { ok: false; erro: string }> {
  if (!file) return { ok: true, doc: null };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validacao = validarPdf({ bytes, mimeDeclarado: file.type || null, nomeArquivo: file.name, tamanhoBytes: file.size });
  if (!validacao.ok) return { ok: false, erro: validacao.motivo };
  return { ok: true, doc: { papel, nomeArquivo: file.name, mimeType: "application/pdf", bytes } };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });
    }

    // 1 — autentica ANTES de tocar no corpo da requisição: uma chamada anônima nunca chega a
    // fazer o servidor parsear multipart/carregar PDF nenhum em memória.
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) {
      return NextResponse.json({ ok: false, erro: "Sessão não encontrada" }, { status: 401 });
    }

    const form = await req.formData();
    const codigo = (form.get("codigo") as string | null) ?? "";
    if (!codigo) {
      return NextResponse.json({ ok: false, erro: "codigo obrigatório" }, { status: 400 });
    }

    // 2 — resolve o processo pelo trio exato (codigo, assunto_id, tipo_processo do Slot 5) e
    // aplica a regra de visibilidade sobre ESSE registro — nunca pela busca genérica só por código.
    const resolucao = await resolverProcessoSlot5(usuario, codigo);
    if (!resolucao.ok) {
      return NextResponse.json({ ok: false, erro: resolucao.erro }, { status: resolucao.status });
    }
    const { processo } = resolucao;

    // 3 — valores do LIP congelados (valor bruto + normalizado + origem) de processos.dados,
    // lidos no servidor depois da autorização — nunca do formulário do cliente.
    const areaTerreno = lerCampoLip(processo.dados, "areaTerreno");
    const areaImpermeabilizada = lerCampoLip(processo.dados, "areaImpermeabilizada");
    const volumeDaCaixaDeRecarga = lerCampoLip(processo.dados, "volumeDaCaixaDeRecarga");

    // 10 — valida PDF antes de gastar upload/cota no Gemini
    const certidaoResult = await paraDocumentoValidado(form.get("certidao") as File | null, "certidao_matricula");
    if (!certidaoResult.ok) {
      return NextResponse.json({ ok: false, erro: `certidão inválida: ${certidaoResult.erro}` }, { status: 400 });
    }
    const pranchaResult = await paraDocumentoValidado(form.get("prancha") as File | null, "projeto");
    if (!pranchaResult.ok) {
      return NextResponse.json({ ok: false, erro: `prancha inválida: ${pranchaResult.erro}` }, { status: 400 });
    }

    // 4 — criado_por sempre da sessão autenticada, nunca de um campo do formulário
    const resultado = await executarPilotoSlot5({
      processoId: processo.id,
      processoCodigo: codigo,
      criadoPor: usuario.id,
      apiKey,
      areaTerreno,
      areaImpermeabilizada,
      volumeDaCaixaDeRecarga,
      documentoCertidao: certidaoResult.doc,
      documentoPrancha: pranchaResult.doc,
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    console.error("[MAC/slot-05/executar-piloto] erro:", e?.message);
    return NextResponse.json({ ok: false, erro: e?.message || "erro interno" }, { status: 500 });
  }
}
