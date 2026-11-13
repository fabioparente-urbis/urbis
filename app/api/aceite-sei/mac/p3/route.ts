// ============================================================
// SLOT 2 — ACEITE SEI · rota PRÓPRIA do slot. CÓPIA POR LEITURA de app/api/mac/p3/route.ts,
// 16/10/2026 (Etapa 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md — "5 programas
// independentes"). Diferença: prompt P3_MAC SÓ do Slot 2, sem queda para o de outro assunto.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { assuntoIdDoSlot2 } from "@/lib/aceiteSei/assuntoDoSlot";
import { escolherModeloPorTamanho, ehModeloDeArquivoGrande, LIMITE_BYTES_MODELO_PADRAO } from "@/lib/modeloGemini";
import { createClient } from "@supabase/supabase-js";
import { indexarRodapes, provaConfere } from "@/lib/pdf/rodapeSei";

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
      .select("id, dados")
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
    // Assunto SEMPRE o do Slot 2 (resolvido no servidor), nunca o que vem da tela.
    void assunto_id;
    const assuntoDoSlot = await assuntoIdDoSlot2();
    let promptData: { conteudo: string; versao: number } | null = null;
    if (assuntoDoSlot) {
      const { data } = await supabaseAdmin
        .from("lip_prompts")
        .select("conteudo, versao")
        .eq("ativo", true).eq("chave", "P3_MAC").eq("assunto_id", assuntoDoSlot)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      promptData = data;
    }
    // Sem cair no prompt de outro assunto: sem P3_MAC do Slot 2, para e avisa.
    if (!promptData) {
      return NextResponse.json(
        { ok: false, erro: "Prompt P3_MAC do Slot 2 (Aceite SEI) não cadastrado ou inativo." },
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
    /* Fatos que a ficha do LIP deste processo já tem (Fábio, 05/11/2026: no 25.28.000001552-8 o MAC
     * "aprovou tudo" — marcou conforme certidão de limites que não existe, memorial de caixa que não
     * há e imagem aérea ausente). O MAC lia o PDF sem saber o que o LIP já apurou. Vai como contexto:
     * o MAC decide pelo PDF, e o que contrariar a ficha vai em incompatibilidades. */
    const CAMPOS_FATO: Array<[string, string]> = [
      ["areaAceite", "Á. do Aceite (prancha)"], ["areaArt", "Área na ART/RRT"],
      ["areaVistoria", "Área na vistoria"], ["areaTerreno", "Área do terreno"],
      ["areaNaoVerticalRecuo", "Á. não vertical no recuo"], ["areaNaoVerticalForaRecuo", "Á. não vertical fora do recuo"],
      ["pav", "Nº de pavimentos"], ["unid", "Nº de unidades"],
      ["caixa", "Caixa de recarga apresentada?"], ["remembramento", "Certidão de remembramento (SEI)"],
      ["certLimites", "Certidão de limites e confrontações (SEI)"], ["foto", "Imagem aérea anterior a 1995 (SEI)"],
      ["tipoComprovacao", "Comprovação do tempo de existência"], ["dataEnergizacao", "Data de energização"], ["docSeiEnergizacao", "DOC SEI — Energização ou Outros"],
      ["seiComprovacao", "SEI da comprovação"],
      ["embargo", "Tem embargo?"], ["seiEmbargo", "SEI do embargo"],
      ["onerosa", "Tem outorga onerosa (documento)?"], ["numero_do_sei_da_onerosa", "SEI da onerosa"],
      ["corredor", "Corredor viário?"], ["faixa", "Faixa de ampliação"], ["numeroUso", "Uso do Solo (SEI)"],
      ["procuracao", "Tem procuração?"], ["tombado", "Área tombada?"],
    ];
    const dadosLip = ((proc as any)?.dados ?? {}) as Record<string, { valor?: string; origem?: string }>;
    const linhasFato = CAMPOS_FATO
      .map(([k, rot]) => {
        const v = String(dadosLip[k]?.valor ?? "").trim();
        /* Padrão é chute de fábrica — fica de fora, exceto NP, que as regras do LIP gravam
         * como "não possui" depois da leitura (certidões, caixa, unidade territorial). */
        if (!v || (dadosLip[k]?.origem === "padrao" && v.toUpperCase() !== "NP")) return null;
        return `- ${rot}: ${v}${dadosLip[k]?.origem === "manual" ? " (conferido pelo analista)" : ""}`;
      })
      .filter(Boolean);
    const blocoFatosLip = linhasFato.length
      ? `\n\n---\n===== FATOS JÁ APURADOS NA FICHA DO LIP DESTE PROCESSO =====
Use estes fatos para julgar os itens (NP = não possui / não se aplica). Se o PDF contrariar algum
deles, siga o PDF e registre a divergência em "incompatibilidades".
${linhasFato.join("\n")}
---`
      : "";
    const promptFinal = promptData.conteudo + ctxChecklist + blocoDocumentoIsolado + blocoLote + blocoFatosLip;
    console.log(`[P3_MAC] Prompt tamanho: ${promptFinal.length} chars${documentoIsolado ? " (documento isolado)" : ""}${modoLote ? ` (lote, ${arquivosSubidos.length} arquivos)` : ""}`);

    /* Rodapé do PDF lido em paralelo com o Gemini: é com ele que a prova de cada item é conferida
     * depois (Fábio, 05/11/2026). Nunca lança — falhou, a conferência só não acontece. */
    const indiceRodapePromise = Promise.all(arquivos.map(async (f) => new Uint8Array(await f.arrayBuffer())))
      .then((bufs) => indexarRodapes(bufs))
      .catch(() => ({ paginas: [], temRodapeSei: false }));

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
    const indiceRodape = await indiceRodapePromise;
    /* Prova de cada resposta (Fábio, 05/11/2026). Conferida contra o rodapé do PDF: SEI citado
     * tem de estar na página citada. Sem rodapé do SEI no arquivo, não há como conferir — a prova
     * é exigida, mas fica marcada como "não conferida". */
    type Prova = { documento: string; sei: string; pagina: number; trecho: string; conferida: boolean | null };
    const lerProva = (p: any): Omit<Prova, "conferida"> | null => {
      if (!p || typeof p !== "object") return null;
      const sei = String(p.sei ?? "").replace(/\D/g, "");
      const pagina = Number(String(p.pagina ?? "").replace(/\D/g, ""));
      const trecho = String(p.trecho ?? "").trim();
      if (!sei || !pagina || !trecho) return null;
      return { documento: String(p.documento ?? "").trim() || "Documento", sei, pagina, trecho };
    };
    const conferir = (p: Omit<Prova, "conferida">): Prova => ({
      ...p,
      conferida: indiceRodape.temRodapeSei ? provaConfere(indiceRodape, p.sei, p.pagina) : null,
    });
    const refProva = (p: Prova) => `${p.documento}, SEI ${p.sei}, pág. ${p.pagina}`;
    const incompatibilidades: string[] = (Array.isArray(dados?.incompatibilidades) ? dados.incompatibilidades : [])
      .filter(Boolean)
      .map((x: any) => {
        if (typeof x === "string") return `[sem prova — conferir] ${x}`;
        const texto = String(x?.texto ?? "").trim();
        if (!texto) return null;
        const bruta = lerProva(x);
        if (!bruta) return `[sem prova — conferir] ${texto}`;
        const p = conferir(bruta);
        if (p.conferida === false) return `[prova não confere com o PDF — conferir] ${texto} (${refProva(p)})`;
        return `${texto} (${refProva(p)}: "${p.trecho}")`;
      })
      .filter((x: string | null): x is string => !!x);
    const provasBrutas: Record<string, any> = dados && typeof dados.provas === "object" && dados.provas ? dados.provas : {};
    const provasOut: Record<string, Prova> = {};
    const itensSemProva: Array<{ id: string; respostaIa: string; motivo: string }> = [];

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
      /* "conforme"/"nao_conforme" sem prova que confira volta em branco para o analista —
       * nunca some em silêncio: vai em itensSemProva com o motivo. */
      if (status === "conforme" || status === "nao_conforme") {
        const bruta = lerProva(provasBrutas[id]);
        if (!bruta) {
          itensSemProva.push({ id, respostaIa: status, motivo: "a IA não mostrou documento, página e trecho" });
          status = null;
        } else {
          const p = conferir(bruta);
          if (p.conferida === false) {
            itensSemProva.push({ id, respostaIa: status, motivo: `prova não confere com o PDF (${refProva(p)})` });
            status = null;
          } else {
            provasOut[id] = p;
          }
        }
      } else if (status === "nao_aplica") {
        const bruta = lerProva(provasBrutas[id]);
        if (bruta) provasOut[id] = conferir(bruta);
      }
      itensOut[id] = status;
      fontesOut[id] = "p2";
    }
    if (itensSemProva.length) console.log(`[P3_MAC] ${itensSemProva.length} item(ns) sem prova devolvidos ao analista.`);

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
          itensSemProva: itensSemProva.length,
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
      provas: provasOut,
      itensSemProva,
      provaConferidaNoPdf: indiceRodape.temRodapeSei,
    });
  } catch (e: any) {
    console.error("[P3_MAC] Erro:", e?.message);
    return NextResponse.json(
      { ok: false, erro: e?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
