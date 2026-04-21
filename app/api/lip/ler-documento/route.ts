import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lerPdf } from "@/lib/lerPdf";
import { extrairDadosBasicos } from "@/lib/extrairDadosBasicos";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_DOCUMENTOS = "documentos";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const processo_id = body.processo_id;

    console.log("PROCESSO_ID RECEBIDO:", processo_id);

    if (!processo_id) {
      return NextResponse.json(
        { error: "processo_id é obrigatório" },
        { status: 400 }
      );
    }

    const { data: documentos, error: erroBusca } = await supabase
      .from("documentos_processo")
      .select("*");

    console.log("ERRO BUSCA:", erroBusca);
    console.log("DOCUMENTOS ENCONTRADOS:", documentos);

    if (erroBusca) {
      return NextResponse.json(
        {
          error: "Erro ao buscar documentos do processo",
          detalhes: erroBusca.message,
        },
        { status: 500 }
      );
    }

    if (!documentos || documentos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum documento encontrado no banco" },
        { status: 404 }
      );
    }

    const docsDoProcesso = documentos.filter(
      (d) => String(d.processo_id) === String(processo_id)
    );

    console.log("DOCS DO PROCESSO:", docsDoProcesso);

    if (!docsDoProcesso || docsDoProcesso.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhum documento encontrado para esse processo (filtro manual)",
          processo_id_recebido: processo_id,
        },
        { status: 404 }
      );
    }

    const documento =
      docsDoProcesso.find((d) =>
        String(d.nome_arquivo || "").toUpperCase().includes("PROJETO")
      ) || docsDoProcesso[0];

    console.log("DOCUMENTO ESCOLHIDO:", documento);

    if (!documento.caminho_storage) {
      return NextResponse.json(
        {
          error: "Documento sem caminho_storage",
          documento,
        },
        { status: 500 }
      );
    }

    const { data: arquivo, error: erroDownload } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .download(documento.caminho_storage);

    console.log("ERRO DOWNLOAD:", erroDownload);
    console.log("CAMINHO STORAGE:", documento.caminho_storage);

    if (erroDownload || !arquivo) {
      return NextResponse.json(
        {
          error: "Erro ao baixar arquivo do storage",
          detalhes: erroDownload?.message ?? null,
          bucket: BUCKET_DOCUMENTOS,
          caminho_storage: documento.caminho_storage,
          nome_arquivo: documento.nome_arquivo,
        },
        { status: 500 }
      );
    }

    const buffer = await arquivo.arrayBuffer();
    const resultado = await lerPdf(new Uint8Array(buffer));
    const dadosBasicos = extrairDadosBasicos(resultado.texto || "");

    const { error: erroSalvarResultado } = await supabase
      .from("lip_resultados")
      .insert({
        processo_id: String(processo_id),
        documento_id: String(documento.id),
        nome_arquivo: documento.nome_arquivo,
        paginas: resultado.paginas,
        dados: dadosBasicos,
      });

    console.log("ERRO SALVAR RESULTADO:", erroSalvarResultado);

    return NextResponse.json({
      sucesso: true,
      documento_id: documento.id,
      nome_arquivo: documento.nome_arquivo,
      paginas: resultado.paginas,
      preview: resultado.texto.slice(0, 800),
      dadosBasicos,
      salvo_no_banco: !erroSalvarResultado,
      erro_salvar_resultado: erroSalvarResultado?.message ?? null,
    });
  } catch (e: any) {
    console.error("ERRO INTERNO LIP:", e);

    return NextResponse.json(
      {
        error: "Erro interno no LIP",
        detalhes: e.message,
      },
      { status: 500 }
    );
  }
}