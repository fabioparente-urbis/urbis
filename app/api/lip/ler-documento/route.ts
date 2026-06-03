import { NextRequest, NextResponse } from "next/server";
import { GEMINI_MODEL } from "@/lib/constants";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const processo_id = body.processo_id;

    if (!processo_id) {
      return NextResponse.json({ error: "processo_id é obrigatório" }, { status: 400 });
    }

    const { data: documentos, error: erroBusca } = await supabase
      .from("documentos_processo")
      .select("*");

    if (erroBusca || !documentos?.length) {
      return NextResponse.json({ error: "Erro ao buscar documentos" }, { status: 500 });
    }

    const docsDoProcesso = documentos.filter(
      (d) => String(d.processo_id) === String(processo_id)
    );

    if (!docsDoProcesso?.length) {
      return NextResponse.json({ error: "Nenhum documento encontrado" }, { status: 404 });
    }

    const documento =
      docsDoProcesso.find((d) =>
        String(d.nome_arquivo || "").toUpperCase().includes("PROJETO")
      ) || docsDoProcesso[0];

    if (!documento.caminho_storage) {
      return NextResponse.json({ error: "Documento sem caminho_storage" }, { status: 500 });
    }

    // Baixa do Supabase
    const { data: arquivo, error: erroDownload } = await supabase.storage
      .from("documentos")
      .download(documento.caminho_storage);

    if (erroDownload || !arquivo) {
      return NextResponse.json({ error: "Erro ao baixar arquivo" }, { status: 500 });
    }

    // Envia para R2
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const r2Key = `lip/${Date.now()}-${documento.nome_arquivo}`;

    await R2.send(new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: r2Key,
      Body: buffer,
      ContentType: "application/pdf",
    }));

    // Gemini lê o PDF direto
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
      {
        text: `Você é um auditor de obras municipais. Extraia do PDF as seguintes informações em JSON:
- proprietario (nome do proprietário)
- endereco (endereço completo)
- area_construida (em m²)
- area_terreno (em m²)
- uso (residencial/comercial/misto)
- numero_pavimentos
- numero_sei (número do processo SEI)
- observacoes (outras informações relevantes)
Responda APENAS com o JSON, sem texto adicional.`,
      },
    ]);

    const texto = result.response.text();
    let dadosBasicos = {};
    try {
      const clean = texto.replace(/```json|```/g, "").trim();
      dadosBasicos = JSON.parse(clean);
    } catch {
      dadosBasicos = { raw: texto };
    }

    const { error: erroSalvar } = await supabase
      .from("lip_resultados")
      .insert({
        processo_id: String(processo_id),
        documento_id: String(documento.id),
        nome_arquivo: documento.nome_arquivo,
        dados: dadosBasicos,
      });

    return NextResponse.json({
      sucesso: true,
      documento_id: documento.id,
      nome_arquivo: documento.nome_arquivo,
      dadosBasicos,
      salvo_no_banco: !erroSalvar,
    });
  } catch (e: any) {
    console.error("ERRO INTERNO LIP:", e);
    return NextResponse.json({ error: "Erro interno", detalhes: e.message }, { status: 500 });
  }
}