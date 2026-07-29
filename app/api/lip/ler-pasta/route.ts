import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { lerPastaSlot5, type ArquivoEntrada, type Conhecido } from "@/lib/lerPastaSlot5";
import { buscarPorHash, registrarLeitura } from "@/lib/mhd";
import { autorizar, usuarioDaRequisicao } from "@/lib/autorizacao";
import { mapaDeRodadas } from "@/lib/rodadas";
import { camposDeDocumentosEmitidos, houveMudancaDeAnalista } from "@/lib/lipDocumentosEmitidos";
import { buscarVia } from "@/lib/cadastroImobiliario";

/**
 * POST /api/lip/ler-pasta — leitura da pasta do processo de Aprovação de Projeto (slot 5).
 *
 * Recebe a pasta inteira em multipart. Para cada arquivo vem também o caminho relativo
 * (`webkitRelativePath`), de onde sai a RODADA: a pasta é a rodada de análise — raiz = 1ª,
 * cada subpasta a seguinte.
 *
 * NÃO CHAMA IA. Tudo sai da camada de texto dos PDFs, lida com pdfjs-dist. Por isso não há
 * consumo de cota, e a rota pode ser chamada quantas vezes o analista quiser.
 *
 * A resposta é sempre uma PROPOSTA: nada é gravado no LIP aqui. Quem grava é a tela, depois do
 * aceite do analista.
 */

export const runtime = "nodejs"; // pdfjs-dist (legacy) precisa de Node, não roda no edge
export const maxDuration = 120;

const MAX_ARQUIVOS = 60;
const MAX_BYTES_TOTAL = 150 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const arquivos = form.getAll("arquivos").filter((f): f is File => f instanceof File);
    const caminhos = form.getAll("caminhos").map(String);
    const processoCodigo = String(form.get("processo_codigo") ?? "");
    const assuntoId = String(form.get("assunto_id") ?? "");

    if (!arquivos.length) {
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // esta rota GRAVA no MHD com service role: precisa saber quem é e se pode
    const usuario = await usuarioDaRequisicao(req);
    if (processoCodigo) {
      const permissao = await autorizar(req, processoCodigo);
      if (!permissao.ok) {
        return NextResponse.json({ ok: false, erro: permissao.erro }, { status: permissao.status });
      }
    }
    if (arquivos.length > MAX_ARQUIVOS) {
      return NextResponse.json(
        { ok: false, erro: `Pasta com ${arquivos.length} arquivos — o limite é ${MAX_ARQUIVOS}` },
        { status: 400 },
      );
    }
    const bytesTotal = arquivos.reduce((s, f) => s + f.size, 0);
    if (bytesTotal > MAX_BYTES_TOTAL) {
      return NextResponse.json(
        { ok: false, erro: `Pasta com ${(bytesTotal / 1024 / 1024).toFixed(0)}MB — o limite é 150MB` },
        { status: 400 },
      );
    }

    /**
     * A rodada NÃO sai da profundidade do caminho. Subpastas irmãs — "Correção 01", "Correção 02",
     * "Correção 03" — têm todas a mesma profundidade, e a versão anterior dava rodada 2 para as
     * três. Ver lib/rodadas.ts: a ordem vem de número no nome → data no nome → data do arquivo, e
     * quando nada decide o resultado é marcado como AMBÍGUO para a tela confirmar com o analista.
     */
    const { pastas, rodadaDoArquivo, ambigua } = mapaDeRodadas(
      arquivos.map((f) => ({
        caminhoRelativo: (f as File & { webkitRelativePath?: string }).name,
        nome: f.name,
        modificadoEm: f.lastModified || 0,
      })).map((a, i) => ({ ...a, caminhoRelativo: caminhos[i] ?? a.nome })),
    );

    const entradas: ArquivoEntrada[] = [];
    // lastModified serve de rótulo para o humano reconhecer o arquivo; NUNCA de identidade,
    // porque copiar ou baixar o arquivo muda essa data. Quem identifica é o hash.
    const datasArquivo = new Map<string, string>();
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      if (f.name.startsWith(".")) continue; // .DS_Store e afins
      const buffer = new Uint8Array(await f.arrayBuffer());
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      if (f.lastModified) datasArquivo.set(hash, new Date(f.lastModified).toISOString());
      entradas.push({
        nome: f.name,
        rodada: rodadaDoArquivo(caminhos[i] ?? "", f.name).rodada,
        hash,
        buffer,
      });
    }

    if (!entradas.length) {
      return NextResponse.json({ ok: false, erro: "Nenhum arquivo legível na pasta" }, { status: 400 });
    }

    const t0 = Date.now();

    /**
     * MEMÓRIA (MHD). Antes de abrir qualquer PDF, pergunta ao módulo o que já foi lido.
     * Hash conhecido não é reprocessado — o catálogo daquele arquivo vem da memória.
     * Se as tabelas do MHD ainda não existirem, `conhecidos` volta vazio e a leitura roda
     * exatamente como antes.
     */
    const memoria = await buscarPorHash(entradas.map((e) => e.hash));
    const conhecidos: Map<string, Conhecido> = new Map();
    for (const [hash, c] of memoria.conhecidos) {
      if (!c.papeis?.length) continue;
      conhecidos.set(hash, {
        papeis: c.papeis, dados: c.dados, paginas: c.paginas,
        charsTexto: c.texto ? c.texto.replace(/\s/g, "").length : 0,
        dataDocumento: c.data_documento, revisao: c.revisao, lidoEm: c.extraido_em,
      });
    }

    const resultado = await lerPastaSlot5(entradas, conhecidos);

    /**
     * O MHD recebe UM registro por arquivo distinto, com apenas os papéis em que aquele arquivo
     * é o VIGENTE. Sem isso: (a) a mesma folha salva com dois nomes viraria duas versões do
     * mesmo papel, e (b) a segunda apareceria como "correção" numa leitura em que nada mudou.
     */
    const porHash = new Map(resultado.extratos.map((x) => [x.hash, x]));
    const jaEnviado = new Set<string>();
    const paraMHD = resultado.catalogo
      .filter((it) => {
        if (jaEnviado.has(it.hash)) return false;
        jaEnviado.add(it.hash);
        return true;
      })
      .map((it) => ({
        ...it,
        papeisTodos: it.papeis,   // tudo que o conteúdo exerce — vai para mhd_conteudos
        papeis: it.papeis.filter( // só onde ESTE arquivo vence — é o que gera versão
          (p) => p !== "outros" && resultado.vigentesPorPapel[p] === it.hash,
        ),
      }))
      .filter((it) => it.papeis.length > 0);
    const mhd = await registrarLeitura({
      processoCodigo: processoCodigo || "sem-processo",
      assuntoId: assuntoId || null,
      usuarioId: usuario?.id ?? null,
      // TODOS os arquivos vão ao MHD, reaproveitados inclusive: o conteúdo é global por hash, mas
      // a VERSÃO é do processo. Mandar só os extraídos agora deixava sem histórico neste processo o
      // documento que já havia sido lido em outro.
      entradas: paraMHD.map((it) => ({
        reaproveitado: !!it.daMemoria,
        hash: it.hash, nome: it.nome, rodada: it.rodada, bytes: it.bytes, paginas: it.paginas,
        papeis: it.papeis, papeisTodos: it.papeisTodos,
        dataDocumento: it.dataDocumento, revisao: it.revisao,
        dataElaboracao: it.dados?.dataElaboracao ?? null,
        dataRevisao: it.dados?.dataRevisao ?? null,
        dataAssinatura: it.dados?.dataAssinatura ?? null,
        dataRegistro: it.dados?.dataRegistro ?? it.dados?.dataCelebracao ?? null,
        texto: porHash.get(it.hash)?.texto ?? null,
        linhas: porHash.get(it.hash)?.linhas ?? null,
        dados: it.dados ?? null,
        origem: "texto" as const,
        paginasIA: 0,
      })),
      conferencias: resultado.conferencias.map((c) => ({ nome: c.nome })),
    });

    // o buffer não volta para o cliente
    const catalogo = resultado.catalogo.map(({ dados, ...resto }) => ({
      ...resto,
      // só o que a tela precisa mostrar; o resto fica no servidor
      dados: dados ? { revisao: dados.revisao ?? null } : undefined,
    }));

    /* ── CAMPOS QUE NÃO SAEM DOS PDFs ────────────────────────────────────────────
     * Três fontes que a leitura da pasta não alcança porque não estão em documento nenhum:
     * o registro de documentos emitidos, o Cadastro de Logradouros e o próprio cadastro do
     * processo. Nenhuma delas usa IA. Rodam depois da leitura e completam os campos. */
    const campos = { ...resultado.campos };
    const problemasExtra: string[] = [];

    // 1) número e data de despacho, laudo e parecer — o URBIS emite e numera
    if (processoCodigo) {
      const emitidos = await camposDeDocumentosEmitidos(processoCodigo);
      if (emitidos.erro) problemasExtra.push(`documentos emitidos: ${emitidos.erro}`);
      for (const [chave, v] of Object.entries(emitidos.campos)) {
        campos[chave] = { valor: v.valor, resultado: "ENCONTRADO" as const, fonte: `registro de documentos — ${v.fonte}` };
      }
      const mudanca = await houveMudancaDeAnalista(processoCodigo);
      if (mudanca) campos.houveMudancaDeAnalista = { valor: mudanca.valor, resultado: "CALCULADO" as const, fonte: mudanca.fonte };

      campos.processo = { valor: processoCodigo, resultado: "ENCONTRADO" as const, fonte: "cadastro do processo no URBIS" };
    }

    /* 2) largura de via e de calçada — Cadastro de Logradouros (20.524 vias).
     * A hierarquia do cadastro vem junto: quando ela diverge da classificação do Uso do Solo,
     * muda porte, vagas e recuo, e essa divergência tem que aparecer para o analista em vez de
     * ser decidida em silêncio por um dos dois lados. */
    const bairro = campos.bairro?.valor, via = campos.logradouro?.valor;
    if (bairro && via) {
      const v = await buscarVia(bairro, via);
      if (v) {
        if (v.larguraVia != null) {
          campos.larguraDaVia1 = { valor: String(v.larguraVia).replace(".", ","), resultado: "ENCONTRADO" as const,
            fonte: `Cadastro de Logradouros — ${v.nome.trim()}, ${v.bairro}` };
        }
        if (v.larguraCalcada != null) {
          campos.larguraDoPasseio1 = { valor: String(v.larguraCalcada).replace(".", ","), resultado: "ENCONTRADO" as const,
            fonte: `Cadastro de Logradouros — ${v.nome.trim()}, ${v.bairro}` };
        }
        const doUds = campos.tipoDeVia1?.valor;
        if (v.hierarquia && doUds && !v.hierarquia.toUpperCase().includes(doUds.toUpperCase())) {
          resultado.conferencias.push({
            nome: "Hierarquia da via bate entre Uso do Solo e Cadastro Imobiliário?",
            estado: "ALERTA",
            detalhe: `Uso do Solo diz "${doUds}" e o Cadastro de Logradouros diz "${v.hierarquia}". ` +
                     `A hierarquia muda porte, vagas e recuo — qual prevalece é decisão do analista.`,
          });
        }
      }
    }

    // `extratos` fica no servidor: e a estrutura completa com coordenadas, centenas de KB que a
    // tela nao usa. Ele ja foi gravado no MHD acima.
    const { extratos: _extratos, campos: _campos, ...semExtratos } = resultado;

    return NextResponse.json({
      ok: true,
      ...semExtratos,
      campos,
      catalogo,
      mhd: { ...mhd, problemas: [...mhd.problemas, ...problemasExtra], gravou: mhd.gravou && !problemasExtra.length },
      rodadas: [...new Set(entradas.map((e) => e.rodada))].sort((a, b) => a - b),
      // como as subpastas foram ordenadas, e se a ordem precisa da confirmação do analista
      pastas,
      rodadaAmbigua: ambigua,
      msLeitura: Date.now() - t0,
    });
  } catch (e: any) {
    console.error("[ler-pasta]", e);
    return NextResponse.json({ ok: false, erro: e?.message ?? "Falha ao ler a pasta" }, { status: 500 });
  }
}
