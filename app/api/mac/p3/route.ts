import { NextRequest, NextResponse } from "next/server";
import { escolherModeloPorTamanho, ehModeloDeArquivoGrande, LIMITE_BYTES_MODELO_PADRAO } from "@/lib/modeloGemini";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300;

type ChecklistItemIn = { id: string; texto: string; grupo: string };
type StatusItem = "conforme" | "nao_conforme" | "nao_aplica" | null;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { ok: false, erro: "GEMINI_API_KEY nao configurada" },
        { status: 500 }
      );

    // Recebe via multipart: file (PDF, modo 1 arquivo) OU files (vários, modo lote — ver
    // abaixo), codigo, checklistItens (JSON string), analiseId
    const form = await req.formData();
    const file = form.get("file") as File | null;
    /* "files" (plural, vários campos com o mesmo nome) = LER ARQUIVOS INDIVIDUAIS manda todos
     * os documentos numa chamada só, em vez de uma chamada por arquivo. Existe desde 16/09/2026
     * — antes disso cada arquivo virava uma chamada isolada e o modelo não enxergava os outros
     * documentos ao mesmo tempo, o que gerava respostas divergentes entre arquivos pro mesmo
     * item do checklist (ver auditoria da sessão: 15 itens divergentes em 24 arquivos, processo
     * 25.5.000012012-9). "file" (singular) continua servindo LER PROCESSO e qualquer chamador
     * que manda 1 arquivo só — comportamento intocado. */
    const filesRaw = form.getAll("files");
    const filesLote = filesRaw.filter((f): f is File => f instanceof File && f.size > 0);
    const modoLote = filesLote.length > 0;
    const arquivos: File[] = modoLote ? filesLote : file ? [file] : [];
    const codigo = (form.get("codigo") as string | null) ?? "";
    const analiseId = (form.get("analiseId") as string | null) ?? null;
    const checklistItensRaw = (form.get("checklistItens") as string | null) ?? "[]";
    const assunto_id = (form.get("assunto_id") as string | null) ?? null;
    /* "documento_isolado" = comportamento ANTIGO do botão LER ARQUIVOS INDIVIDUAIS (uma chamada
     * por arquivo, sem ver os outros) — só existe hoje pra não quebrar quem ainda chama assim.
     * O modo "files" (lote) não usa isto: os documentos vêm todos juntos, então não há nada
     * "isolado" pra avisar o modelo. */
    const documentoIsolado = !modoLote && (form.get("modoLeitura") as string | null) === "documento_isolado";

    if (arquivos.length === 0) {
      return NextResponse.json(
        { ok: false, erro: "Arquivo PDF nao informado" },
        { status: 400 }
      );
    }
    if (!codigo) {
      return NextResponse.json(
        { ok: false, erro: "codigo obrigatorio" },
        { status: 400 }
      );
    }

    let checklistItens: ChecklistItemIn[] = [];
    try {
      checklistItens = JSON.parse(checklistItensRaw);
    } catch {
      return NextResponse.json(
        { ok: false, erro: "checklistItens invalido (JSON malformado)" },
        { status: 400 }
      );
    }
    if (!Array.isArray(checklistItens) || checklistItens.length === 0) {
      return NextResponse.json(
        { ok: false, erro: "checklistItens vazio" },
        { status: 400 }
      );
    }

    // Confirma que o processo existe (mesma checagem que o S3 faz no final)
    const { data: proc } = await supabaseAdmin
      .from("processos")
      .select("id")
      .eq("codigo", codigo)
      .maybeSingle();
    if (!proc?.id) {
      return NextResponse.json(
        { ok: false, erro: "Processo nao encontrado" },
        { status: 404 }
      );
    }

    // Carrega prompt P3_MAC por slot: tenta o do assunto; se o slot não tiver o
    // seu próprio, cai no global (maior versão) — comportamento antigo, nada quebra.
    const assuntoValido = typeof assunto_id === "string" && /^[0-9a-f-]{36}$/i.test(assunto_id);
    let promptData: { conteudo: string; versao: number } | null = null;
    if (assuntoValido) {
      const { data } = await supabaseAdmin
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P3_MAC").eq("assunto_id", assunto_id)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData) {
      const { data } = await supabaseAdmin
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P3_MAC")
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    if (!promptData) {
      return NextResponse.json(
        { ok: false, erro: "Prompt P3_MAC nao cadastrado" },
        { status: 500 }
      );
    }
    console.log(`[P3_MAC] Prompt versao ${promptData.versao} carregado.`);

    // 1) Upload dos PDF(s) ao Gemini Files API — em paralelo quando é lote.
    // Modelo escolhido pelo MAIOR arquivo do lote, não pela soma — o teto de 50MB é do que o
    // modelo padrão consegue processar de UM PDF por vez (ver lib/modeloGemini.ts), não do
    // tamanho total da chamada. Escolher pela soma escalava lotes de muitos arquivos PEQUENOS
    // pro modelo caro (5,2x) sem nenhum deles precisar — achado em auditoria de 16/09/2026,
    // corrigido antes do primeiro teste real deste modo.
    const tamanhoTotal = arquivos.reduce((soma, f) => soma + f.size, 0);
    const maiorArquivo = Math.max(...arquivos.map((f) => f.size));
    const modelo = escolherModeloPorTamanho(maiorArquivo);
    console.log(`[P3_MAC] Upload: ${arquivos.length} arquivo(s), ${(tamanhoTotal / 1024 / 1024).toFixed(2)}MB total, maior ${(maiorArquivo / 1024 / 1024).toFixed(2)}MB | modelo: ${modelo}`);
    if (ehModeloDeArquivoGrande(modelo)) {
      console.log(`[P3_MAC] Arquivo do lote acima de ${LIMITE_BYTES_MODELO_PADRAO / 1024 / 1024}MB — leitura escalada para ${modelo}.`);
    }

    async function uploadParaGemini(f: File): Promise<{ uri: string; nome: string }> {
      const uploadRes = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/pdf",
            "X-Goog-Upload-Command": "upload, finalize",
            "X-Goog-Upload-Header-Content-Length": String(f.size),
            "X-Goog-Upload-Header-Content-Type": "application/pdf",
          },
          body: Buffer.from(await f.arrayBuffer()),
        }
      );
      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Upload Gemini falhou (${f.name}): ${err}`);
      }
      const uploadData = await uploadRes.json();
      const uri = uploadData.file?.uri;
      if (!uri) throw new Error(`Upload Gemini nao retornou fileUri (${f.name})`);
      return { uri, nome: f.name };
    }

    let arquivosSubidos: { uri: string; nome: string }[];
    try {
      arquivosSubidos = await Promise.all(arquivos.map(uploadParaGemini));
    } catch (e: any) {
      return NextResponse.json({ ok: false, erro: e?.message || "Upload Gemini falhou" }, { status: 500 });
    }

    // 2) Monta prompt final com o checklist
    const checklistEnxuto = checklistItens.map((i) => ({
      id: i.id,
      texto: i.texto,
      grupo: i.grupo,
    }));
    const ctxChecklist = `\n\n---\nCHECKLIST MAC (analisar cada item contra o PDF e classificar):\n${JSON.stringify(
      checklistEnxuto,
      null,
      2
    )}\n---`;
    /* O prompt salvo descreve os documentos como se o processo INTEIRO
     * estivesse no PDF. Lendo um documento por vez, o modelo interpretava "não
     * vejo a prancha aqui" como "a prancha está ausente do processo" e
     * respondia `nao_conforme` — e, como a mesclagem no cliente trava o item na
     * PRIMEIRA resposta não nula, o primeiro arquivo da fila (uma ART, por
     * ordem alfabética) fixava negativa em quase todo o checklist antes de a
     * prancha sequer ser lida. Daí 39 "não conforme" de 54 num processo cujos
     * documentos existiam.
     *
     * Este bloco vai DEPOIS do prompt do slot, sem alterar o que está salvo em
     * `lip_prompts` (compartilhado entre slots — ver a regra de não mexer no
     * Slot 1). Só entra quando o cliente declara leitura por documento. */
    const blocoDocumentoIsolado = documentoIsolado
      ? `\n\n---\n===== LEITURA POR DOCUMENTO — REGRA QUE VENCE AS ANTERIORES =====
Este PDF é UM documento de um processo. Os demais documentos do processo
EXISTEM, mas estão sendo enviados em outras chamadas — eles NÃO estão neste
arquivo e você NÃO tem como vê-los agora.

Por isso:
1. NÃO conclua que um documento está ausente do processo só porque ele não
   está neste PDF. Você não tem essa informação.
2. Responda APENAS os itens do checklist que este documento, sozinho, permite
   julgar. Para todos os outros, responda null — inclusive quando o item
   depender de um documento que não está aqui.
3. null NÃO é falha sua: é a resposta correta quando a prova está em outro
   documento. Outra chamada vai avaliar esse item com o documento certo.
4. NUNCA use "nao_conforme" com o sentido de "não encontrei". "nao_conforme" é
   só para o que este documento mostra estar de fato irregular.
5. Em "incompatibilidades", não relate ausência de documento nem falta de
   informação que não esteja neste arquivo. Relate só divergência que você
   consegue constatar DENTRO deste documento.
---`
      : "";
    /* Modo lote (16/09/2026): os documentos vêm TODOS juntos nesta mesma chamada — o modelo os
     * vê ao mesmo tempo, então pode e deve cruzar informação entre eles. Substitui o bloco de
     * isolamento acima, que existe só pro modo antigo (1 chamada por arquivo). */
    const blocoLote = modoLote
      ? `\n\n---\n===== LEITURA DE MÚLTIPLOS DOCUMENTOS — REGRA QUE VENCE AS ANTERIORES =====
Você recebeu ${arquivosSubidos.length} arquivos PDF anexados nesta mesma mensagem, cada um sendo
um documento distinto do mesmo processo: ${arquivosSubidos.map((a) => a.nome).join(", ")}.

Por isso:
1. Considere os arquivos EM CONJUNTO: se um documento não mostra algo mas outro mostra, a
   informação existe no processo — cruze todos antes de decidir um item.
2. Só responda "nao_conforme" quando a irregularidade estiver de fato demonstrada em algum dos
   arquivos. Se nenhum dos arquivos anexados traz a prova (a favor ou contra) de um item, responda
   null — não invente ausência.
3. Ao listar em "documentos" ou "incompatibilidades", identifique de qual arquivo cada achado
   veio (pelo nome do arquivo ou pelo nº SEI que ele contém).
---`
      : "";
    const promptFinal = promptData.conteudo + ctxChecklist + blocoDocumentoIsolado + blocoLote;
    console.log(`[P3_MAC] Prompt tamanho: ${promptFinal.length} chars${documentoIsolado ? " (documento isolado)" : ""}${modoLote ? ` (lote, ${arquivosSubidos.length} arquivos)` : ""}`);

    // 3) Chama Gemini 2.5 Flash com PDF + prompt
    // Igual ao S3 do LIP (app/api/lip/s3/route.ts): sob sobrecarga o Gemini
    // devolve 503 OU 200 com prosa em vez do JSON pedido. Sem retry aqui, uma
    // chamada síncrona só — o analista via a leitura falhar na hora, sem
    // segunda chance, exatamente o problema que já tinha sido resolvido no
    // LIP e nunca chegou a este endpoint.
    console.log(`[P3_MAC] Enviando para Gemini...`);
    let texto = "";
    let geminiOk = false;
    let dados: Record<string, any> = {};
    let ultimoStatus = 0;
    let ultimoCorpo = "";
    const MAX_TENTATIVAS = 7;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      console.log(`[P3_MAC] tentativa ${tentativa}/${MAX_TENTATIVAS}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  ...arquivosSubidos.map((a) => ({ fileData: { mimeType: "application/pdf", fileUri: a.uri } })),
                  { text: promptFinal },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 65536, temperature: 0.1 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const candidato = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        if (candidato) {
          const testeJson = candidato.replace(/```json|```/g, "").trim();
          try {
            dados = JSON.parse(testeJson);
            texto = candidato;
            geminiOk = true;
            console.log(`[P3_MAC] OK — resposta:`, texto.substring(0, 300));
            break;
          } catch (e: any) {
            ultimoStatus = 200;
            ultimoCorpo = `JSON inválido: ${testeJson.slice(0, 300)}`;
          }
        } else {
          ultimoStatus = 200;
          ultimoCorpo = "Resposta vazia. finishReason: " + (data.candidates?.[0]?.finishReason ?? "?");
        }
      } else {
        ultimoStatus = res.status;
        ultimoCorpo = (await res.text()).slice(0, 500);
      }
      console.log(`[P3_MAC] falhou (${ultimoStatus}): ${ultimoCorpo.slice(0, 200)}`);
      const sobrecarga = ultimoStatus === 503 || ultimoCorpo.toLowerCase().includes("overloaded") || ultimoCorpo.toLowerCase().includes("high demand");
      if ((sobrecarga || ultimoStatus === 200) && tentativa < MAX_TENTATIVAS) {
        await new Promise((r) => setTimeout(r, Math.min(tentativa * 5000, 30000)));
        continue;
      }
      break;
    }

    if (!geminiOk) {
      console.error("[P3_MAC] fileUris:", arquivosSubidos.map((a) => a.uri).join(", "), "| modelo:", modelo);
      if (ultimoStatus === 429 || ultimoCorpo.toLowerCase().includes("resource_exhausted") || ultimoCorpo.toLowerCase().includes("quota")) {
        return NextResponse.json({ ok: false, erro: "LIMITE_DIARIO_GEMINI" }, { status: 429 });
      }
      return NextResponse.json(
        { ok: false, erro: ultimoCorpo || "Falha ao ler o PDF com o Gemini" },
        { status: ultimoStatus || 500 }
      );
    }

    // Compatibilidade: aceita tanto o formato novo { itens, documentos,
    // incompatibilidades } quanto o antigo (mapa flat { id: status }).
    const mapaItens: Record<string, any> =
      dados && typeof dados.itens === "object" && dados.itens !== null
        ? dados.itens
        : dados;
    const documentosLidos: any[] = Array.isArray(dados?.documentos) ? dados.documentos : [];
    const incompatibilidades: string[] = Array.isArray(dados?.incompatibilidades)
      ? dados.incompatibilidades.filter(Boolean).map(String)
      : [];

    const STATUS_VALIDOS = new Set<StatusItem>([
      "conforme",
      "nao_conforme",
      "nao_aplica",
      null,
    ]);
    const idsValidos = new Set(checklistEnxuto.map((i) => i.id));
    const itensOut: Record<string, StatusItem> = {};
    const fontesOut: Record<string, "p2"> = {};

    for (const [id, raw] of Object.entries(mapaItens)) {
      if (!idsValidos.has(id)) continue;
      let status: StatusItem = null;
      if (raw === null) status = null;
      else {
        const v = String(raw).toLowerCase().trim();
        if (v === "conforme") status = "conforme";
        else if (v === "nao_conforme" || v === "não_conforme") status = "nao_conforme";
        else if (v === "nao_aplica" || v === "não_aplica") status = "nao_aplica";
        else status = null;
      }
      if (!STATUS_VALIDOS.has(status)) status = null;
      itensOut[id] = status;
      fontesOut[id] = "p2";
    }

    const preenchidos = Object.values(itensOut).filter((v) => v !== null).length;
    console.log(`[P3_MAC] Concluido. ${preenchidos} item(ns) preenchido(s).`);

    // Audita leitura
    try {
      await supabaseAdmin.from("auditoria_log").insert({
        tabela: "analises_mac",
        registro_id: analiseId,
        operacao: "MAC_P3",
        dados_antes: null,
        dados_depois: {
          arquivo: arquivos.length === 1 ? arquivos[0].name : `${arquivos.length} arquivos: ${arquivos.map((a) => a.name).join(", ")}`,
          itensPreenchidos: preenchidos,
          status: "OK",
        },
      });
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      itens: itensOut,
      fontes: fontesOut,
      documentos: documentosLidos,
      incompatibilidades,
    });
  } catch (e: any) {
    console.error("[P3_MAC] Erro:", e?.message);
    return NextResponse.json(
      { ok: false, erro: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
