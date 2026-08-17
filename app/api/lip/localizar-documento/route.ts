import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { lerPastaSlot5, OBRIGATORIOS, SO_PRESENCA, DISPENSAVEIS, type ArquivoEntrada } from "@/lib/lerPastaSlot5";
import { autorizar } from "@/lib/autorizacao";

/**
 * POST /api/lip/localizar-documento — o analista aponta, arquivo a arquivo, um obrigatório que não
 * estava na pasta.
 *
 * A leitura da pasta só enxerga o que está DENTRO dela. Quando um obrigatório falta, hoje o
 * analista só tem a informação de que faltou; se o documento existe em outro lugar (outra pasta,
 * anexo de e-mail, outro processo), não havia como aproveitá-lo sem refazer a leitura inteira.
 *
 * Aqui o arquivo é lido pelo MESMO leitor da pasta — mesma identificação de papel, mesmos
 * extratores — e volta como PROPOSTA, para se juntar à proposta da pasta. Nada é gravado.
 *
 * NÃO grava no MHD de propósito: a memória documental é organizada por RODADA, e um arquivo de
 * fora da pasta não tem rodada. Registrá-lo como rodada 1 o faria vencer ou perder vigência contra
 * documentos que ele nunca disputou. O registro do achado vai para as observações do LIP no aceite,
 * junto com a recomendação de mover o arquivo para dentro da pasta — e aí a leitura normal o pega.
 */

export const runtime = "nodejs"; // pdfjs-dist (legacy) precisa de Node
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const arquivo = form.get("arquivo");
    const papel = String(form.get("papel") ?? "");
    const processoCodigo = String(form.get("processo_codigo") ?? "");
    const local = String(form.get("local") ?? "").trim();

    if (!(arquivo instanceof File)) {
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo enviado" }, { status: 400 });
    }
    const esperado = OBRIGATORIOS.find(([p]) => p === papel);
    if (!esperado) {
      return NextResponse.json({ ok: false, erro: `Papel desconhecido: ${papel}` }, { status: 400 });
    }

    // autorização é a PRIMEIRA coisa depois da validação de forma — nenhum retorno antecipado
    // pode ficar acima dela sem furar o guarda
    if (processoCodigo) {
      const permissao = await autorizar(req, processoCodigo);
      if (!permissao.ok) {
        return NextResponse.json({ ok: false, erro: permissao.erro }, { status: permissao.status });
      }
    }
    if (arquivo.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, erro: `Arquivo de ${(arquivo.size / 1024 / 1024).toFixed(0)}MB — o limite é 40MB` },
        { status: 400 },
      );
    }

    const buffer = new Uint8Array(await arquivo.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    /* rodada 1 para valer a pista do nome: os 10 slots do SEI são nomeados no padrão, e um
     * documento avulso quase sempre chega com esse nome. */
    const entrada: ArquivoEntrada = { nome: arquivo.name, rodada: 1, hash, buffer };

    const t0 = Date.now();
    const resultado = await lerPastaSlot5([entrada]);
    const item = resultado.catalogo[0];

    const papeisLidos = item?.papeis ?? [];
    const confere = papeisLidos.includes(papel);
    const avisos: string[] = [];

    if (!confere) {
      const rotulo = (p: string) => OBRIGATORIOS.find(([x]) => x === p)?.[1] ?? p;
      avisos.push(
        papeisLidos.length && papeisLidos[0] !== "outros"
          ? `O arquivo foi identificado como ${papeisLidos.map(rotulo).join(" + ")}, e não como ${esperado[1]}.`
          : `Não foi possível reconhecer este arquivo como ${esperado[1]}` +
            (item && !item.temCamadaTexto ? " — o PDF não tem camada de texto (digitalizado)." : "."),
      );
    }

    /* Só-presença nunca tem informação a conferir: documentos pessoais e declaração são escopo da
     * CHEADV e o DWG não é legível. Para os demais, papel certo e nenhum campo extraído significa
     * documento incompleto — é ISSO que o analista precisa ver, não um "localizado" verde. */
    const soPresenca = SO_PRESENCA.has(papel);
    const campos = soPresenca ? {} : resultado.campos;
    const nCampos = Object.keys(campos).length;
    if (confere && !soPresenca && nCampos === 0) {
      avisos.push(
        `O arquivo é ${esperado[1]}, mas nenhuma das informações esperadas foi lida nele — ` +
        `conferir se está completo ou se veio digitalizado sem camada de texto.`,
      );
    }

    return NextResponse.json({
      ok: true,
      papel,
      nome: esperado[1],
      arquivo: arquivo.name,
      local: local || arquivo.name,
      dispensavel: DISPENSAVEIS.has(papel),
      confere,
      soPresenca,
      paginas: item?.paginas ?? 0,
      papeisLidos,
      prova: item?.prova ?? "",
      campos,
      avisos,
      // o arquivo veio de fora da pasta: a recomendação vale sempre, mesmo quando tudo confere
      recomendacao:
        `Documento localizado FORA da pasta do processo. Recomenda-se colocá-lo dentro da pasta ` +
        `(na rodada correspondente) para que entre na leitura e na memória documental.`,
      ms: Date.now() - t0,
    });
  } catch (e: any) {
    console.error("[localizar-documento]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao ler o documento" }, { status: 500 });
  }
}
