/**
 * lib/documentosSei/lerComGemini.ts — Fase 7 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("ligar fatiador à leitura").
 *
 * Client-side. REPRODUZ por leitura a sequência S1→S2→S3 que `app/processo/ProcessoClient.tsx`
 * (`lerLip`, linha ~1346) já usa pra ler o processo inteiro — mesmo contrato de rota
 * (`/api/lip/s1`, `/api/lip/s2`, `/api/lip/s3` + polling em `/api/lip/s3/status`), só que aqui
 * chamado sobre um LOTE menor (montado por `agruparParaLeitura.ts`), não o PDF inteiro.
 *
 * Não foi extraído de dentro do `ProcessoClient.tsx` de propósito: é arquivo enorme e crítico do
 * Slot 1/2, mexer nele exige pedido explícito (CLAUDE.md) — este módulo é código NOVO e ISOLADO,
 * mesmo espírito de isolamento já praticado entre os Organizadores dos dois slots.
 *
 * LIMITAÇÃO CONHECIDA: não manda `assunto_id` (o Fatiador só conhece o código do processo, não o
 * UUID do assunto) — as rotas S2/S3 já tratam isso com segurança (`assuntoValido` cai pra `null`,
 * usa o prompt genérico em vez do prompt específico do assunto). Resultado pode ser um pouco menos
 * afinado que a leitura de dentro do processo; aceitável para uma leitura de conferência.
 */

export type CampoLido = { valor: string; fonte: string };
export type ResultadoLote = {
  campos: Record<string, CampoLido>;
  documentos: any[];
  pendencias: string[];
};

async function aguardarJobS3(jobId: string): Promise<any> {
  if (!jobId) throw new Error("S3: jobId ausente");
  return new Promise((resolve, reject) => {
    let tentativas = 0;
    const MAX = 144; // 144 × 5s = 12 minutos — mesmo teto de ProcessoClient.tsx
    const intervalo = setInterval(async () => {
      tentativas++;
      try {
        const poll = await fetch(`/api/lip/s3/status?jobId=${encodeURIComponent(jobId)}`);
        if (!poll.ok) return;
        const data = await poll.json();
        if (data.status === "concluido") {
          if (!data.resultado) return; // ainda salvando, aguarda o próximo ciclo
          clearInterval(intervalo);
          resolve(data.resultado);
        } else if (data.status === "erro") {
          clearInterval(intervalo);
          reject(new Error("S3: " + (data.erro || "Erro no processamento")));
        } else if (tentativas >= MAX) {
          clearInterval(intervalo);
          reject(new Error("S3: tempo esgotado (12 minutos)"));
        }
      } catch {
        // erro de rede — continua tentando, mesmo comportamento de ProcessoClient.tsx
      }
    }, 5000);
  });
}

/** Lê UM arquivo (um lote) pelo pipeline S1→S2→S3. */
export async function lerArquivoComGemini(
  arquivo: File,
  contexto: { processoCodigo: string; slot: string },
  aoProgredir?: (mensagem: string, percentual: number) => void,
): Promise<ResultadoLote> {
  aoProgredir?.("Enviando lote para o Gemini...", 10);
  const s1Res = await fetch("/api/lip/s1", {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-File-Type": "application/pdf",
      "X-File-Size": arquivo.size.toString(),
      "X-File-Name": arquivo.name,
      "X-Processo-Codigo": contexto.processoCodigo,
      "X-Slot": contexto.slot,
    },
    body: arquivo,
  });
  const s1Data = await s1Res.json();
  if (!s1Data.ok) throw new Error("S1: " + (s1Data.erro || "Erro ao enviar o lote"));
  const { fileUri } = s1Data;

  aoProgredir?.("Mapeando documentos do lote...", 40);
  const s2Res = await fetch("/api/lip/s2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUri, assunto_id: null, mimeType: s1Data.mimeType,
      codigo: contexto.processoCodigo, tipoProcesso: contexto.slot, tamanhoBytes: arquivo.size,
    }),
  });
  const s2Data = await s2Res.json();
  const documentos = s2Data.ok ? (s2Data.documentos ?? []) : [];

  aoProgredir?.("Extraindo campos do lote...", 65);
  const pdfBase64 = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.readAsDataURL(arquivo);
  });
  const s3Init = await fetch("/api/lip/s3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUri, documentos, codigo: contexto.processoCodigo, fileName: arquivo.name, pdfBase64,
      assunto_id: null, mimeType: s1Data.mimeType, tamanhoBytes: arquivo.size,
    }),
  }).then((r) => r.json());
  if (!s3Init.ok) throw new Error("S3: " + (s3Init.erro || "Erro ao iniciar a leitura"));

  aoProgredir?.("Lendo com IA... pode levar alguns minutos", 80);
  const s3Data = await aguardarJobS3(s3Init.jobId);

  return {
    campos: s3Data.campos ?? {},
    documentos,
    pendencias: [...(s3Data.pendencias ?? []), ...(s3Data.alertasMAC ?? [])],
  };
}

/**
 * Lê vários lotes em sequência e mescla os campos — "processado depois vence" quando dois lotes
 * disputam a mesma chave, mesmo critério já usado em `ProcessoClient.tsx` pra mesclar múltiplos
 * arquivos (o lote posterior no processo tende a ser a versão mais recente do documento).
 */
export async function lerLotes(
  lotes: File[],
  contexto: { processoCodigo: string; slot: string },
  aoProgredir?: (mensagem: string, percentual: number) => void,
): Promise<ResultadoLote> {
  const mesclado: Record<string, CampoLido> = {};
  const documentos: any[] = [];
  const pendencias: string[] = [];

  for (let i = 0; i < lotes.length; i++) {
    aoProgredir?.(`Lote ${i + 1} de ${lotes.length}...`, Math.round((i / lotes.length) * 100));
    const resultado = await lerArquivoComGemini(lotes[i], contexto, (msg, pct) =>
      aoProgredir?.(`Lote ${i + 1} de ${lotes.length}: ${msg}`, Math.round((i / lotes.length) * 100 + pct / lotes.length)),
    );
    for (const [chave, campo] of Object.entries(resultado.campos)) mesclado[chave] = campo;
    documentos.push(...resultado.documentos);
    pendencias.push(...resultado.pendencias);
  }
  aoProgredir?.("Leitura concluída", 100);
  return { campos: mesclado, documentos, pendencias };
}
