import { NextRequest, NextResponse } from "next/server";
import { registrarChamadaIA } from "@/lib/iaUso";
import { escolherModeloPorTamanho, ehModeloDeArquivoGrande, LIMITE_BYTES_PLATAFORMA, LIMITE_BYTES_MODELO_PADRAO } from "@/lib/modeloGemini";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const processoCodigo = req.headers.get("x-processo-codigo") || null;
  const slot = req.headers.get("x-slot") || null;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json({ ok: false, erro: "GEMINI_API_KEY não configurada" }, { status: 500 });

    const contentLength = req.headers.get("x-file-size") || "0";
    const fileSizeBytes = parseInt(contentLength);
    // Os 50MB que este ponto recusava eram teto do MODELO 2.5, não da plataforma nem do upload —
    // medido em 10/09/2026: o mesmo arquivo de 52MB que o 2.5 recusa com 400, o 3.6 lê inteiro.
    // Desde a Fase 2 do plano de leitura de PDF, tamanho não bloqueia mais: ele ESCOLHE o modelo
    // (ver lib/modeloGemini.ts). O que ainda bloqueia é o teto de plataforma, e para esse caso a
    // saída não é comprimir, é fatiar o PDF — que é coisa que o sistema já sabe fazer.
    if (fileSizeBytes > LIMITE_BYTES_PLATAFORMA) {
      return NextResponse.json({ ok: false, erro: `ARQUIVO_GRANDE: PDF com ${(fileSizeBytes/1024/1024).toFixed(0)}MB excede o limite de ${LIMITE_BYTES_PLATAFORMA/1024/1024}MB que o servidor aceita. Use o Organizador de PDF SEI para separar os documentos e leia por partes.` }, { status: 413 });
    }
    // O modelo vai junto na resposta para que o S2 e o S3 leiam o MESMO arquivo com o MESMO
    // modelo. Eles recebem só o fileUri, e do fileUri não dá para deduzir tamanho.
    const modelo = escolherModeloPorTamanho(fileSizeBytes);
    const fileName = req.headers.get("x-file-name") || "processo.pdf";
    // O tipo tem que ser o real: o pipeline mandava application/pdf fixo,
    // então print de tela (PNG/JPG) subia rotulado como PDF e o Gemini
    // recusava ou lia lixo. Aceita PDF e imagem; qualquer outra coisa cai
    // no PDF, que era o comportamento antigo.
    const tipoBruto = (req.headers.get("x-file-type") || req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const mimeType = /^(application\/pdf|image\/(png|jpeg|jpg|webp|heic|heif))$/.test(tipoBruto)
      ? (tipoBruto === "image/jpg" ? "image/jpeg" : tipoBruto)
      : "application/pdf";

    console.log(`[S1] Streaming: ${fileName} (${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB) | modelo: ${modelo}`);
    if (ehModeloDeArquivoGrande(modelo)) {
      console.log(`[S1] Arquivo acima de ${LIMITE_BYTES_MODELO_PADRAO / 1024 / 1024}MB — leitura escalada para ${modelo}.`);
    }

    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": mimeType,
          "X-Goog-Upload-Command": "upload, finalize",
          "X-Goog-Upload-Header-Content-Length": contentLength,
          "X-Goog-Upload-Header-Content-Type": mimeType,
        },
        body: Buffer.from(await req.arrayBuffer()),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      await registrarChamadaIA({
        modulo: "LIP", slot, operacao: "S1_UPLOAD", processoCodigo,
        tamanhoBytes: fileSizeBytes, duracaoMs: Date.now() - t0,
        status: "erro", motivoErro: err.slice(0, 500),
      });
      return NextResponse.json({ ok: false, erro: `Upload falhou: ${err}` }, { status: 500 });
    }

    const uploadData = await uploadRes.json();
    const fileUri = uploadData.file?.uri;
    const filName = uploadData.file?.name;
    let state = uploadData.file?.state;

    // Arquivo grande pode voltar do upload ainda em PROCESSING — se o S2/S3
    // usar o fileUri nesse estado, o Gemini responde 400 INVALID_ARGUMENT.
    // PDFs pequenos processavam rápido o bastante pra isso nunca aparecer;
    // a partir de ~50MB o processamento passa a durar mais que o upload.
    let tentativasEspera = 0;
    while (state === "PROCESSING" && tentativasEspera < 20) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${filName}?key=${apiKey}`
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        state = statusData.state;
      }
      tentativasEspera++;
    }

    console.log(`[S1] Concluído: ${filName} | state: ${state} | URI: ${fileUri}`);

    if (state !== "ACTIVE") {
      await registrarChamadaIA({
        modulo: "LIP", slot, operacao: "S1_UPLOAD", processoCodigo,
        tamanhoBytes: fileSizeBytes, duracaoMs: Date.now() - t0,
        status: "erro", motivoErro: `Arquivo não ficou ACTIVE a tempo (state: ${state})`,
      });
      return NextResponse.json({ ok: false, erro: `ARQUIVO_NAO_PRONTO: O Gemini ainda estava processando o arquivo (state: ${state}). Tente novamente em instantes.` }, { status: 503 });
    }

    await registrarChamadaIA({
      modulo: "LIP", slot, operacao: "S1_UPLOAD", processoCodigo, modelo,
      tamanhoBytes: fileSizeBytes, duracaoMs: Date.now() - t0, status: "ok",
    });

    return NextResponse.json({
      ok: true,
      fileUri,
      mimeType,
      fileName: filName,
      state,
      tamanhoMB: (parseInt(contentLength) / 1024 / 1024).toFixed(2),
      /** Repassados ao S2/S3 para que os três passos usem o mesmo modelo. */
      tamanhoBytes: fileSizeBytes,
      modelo,
    });
  } catch (e: any) {
    console.error("[S1] Erro:", e?.message);
    await registrarChamadaIA({
      modulo: "LIP", slot, operacao: "S1_UPLOAD", processoCodigo,
      duracaoMs: Date.now() - t0, status: "erro", motivoErro: e?.message,
    });
    return NextResponse.json({ ok: false, erro: e?.message || "Erro interno" }, { status: 500 });
  }
}
