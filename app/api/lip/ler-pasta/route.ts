import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { lerPastaSlot5, VERSAO_EXTRATOR, type ArquivoEntrada, type Conhecido } from "@/lib/lerPastaSlot5";
import { buscarPorHash, registrarLeitura } from "@/lib/mhd";
import { autorizar, usuarioDaRequisicao } from "@/lib/autorizacao";
import { mapaDeRodadas } from "@/lib/rodadas";
import { camposDeDocumentosEmitidos, houveMudancaDeAnalista } from "@/lib/lipDocumentosEmitidos";
import { buscarVia } from "@/lib/cadastroImobiliario";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { matriz } from "@/lib/rastreabilidade";
import { fecharResultados } from "@/lib/rastreabilidade/fechar";
import { executarVisao } from "@/lib/visao";

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

/**
 * A resposta é NDJSON: uma linha JSON por evento.
 *
 *   {"tipo":"progresso","fase":"lendo","atual":3,"total":17,"documento":"ART.pdf"}
 *   {"tipo":"resultado", ...a proposta inteira...}
 *   {"tipo":"erro","erro":"..."}
 *
 * A leitura da pasta é uma requisição só que demora dezenas de segundos; devolvendo tudo no fim, a
 * tela só podia FINGIR progresso — encher por tempo e travar num número até a resposta chegar. Com
 * o andamento vindo durante a leitura, a porcentagem passa a significar arquivo lido.
 *
 * A última linha continua sendo exatamente o JSON que a rota devolvia antes, então quem já sabia
 * ler a resposta antiga só precisa pegar a linha de tipo "resultado".
 */
function linha(o: unknown) {
  return new TextEncoder().encode(JSON.stringify(o) + "\n");
}

export async function POST(req: NextRequest) {
  /* O multipart é consumido AQUI, antes de abrir o fluxo. Ler o corpo da requisição depois de já
   * ter devolvido a resposta é pedir para o runtime ter fechado a entrada no meio do caminho — e a
   * falha apareceria como upload truncado, que é péssimo de diagnosticar. Enquanto isto roda o
   * cliente ainda está enviando, então não custa tempo nenhum. */
  const form = await req.formData();

  const fluxo = new TransformStream();
  const escritor = fluxo.writable.getWriter();

  // roda solto: o corpo da resposta já foi devolvido e vai sendo preenchido conforme a leitura anda
  processar(req, form, escritor).catch(async (e: any) => {
    console.error("[ler-pasta]", e);
    try { await escritor.write(linha({ tipo: "erro", ok: false, erro: e?.message ?? "Falha ao ler a pasta" })); } catch {}
  }).finally(() => { escritor.close().catch(() => {}); });

  return new Response(fluxo.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // sem isto um proxy com buffer segura tudo e o progresso chega junto com o resultado
      "X-Accel-Buffering": "no",
    },
  });
}

async function processar(
  req: NextRequest,
  form: FormData,
  escritor: WritableStreamDefaultWriter<Uint8Array>,
) {
  const enviar = (o: unknown) => escritor.write(linha(o));
  try {
    const arquivos = form.getAll("arquivos").filter((f): f is File => f instanceof File);
    const caminhos = form.getAll("caminhos").map(String);
    const processoCodigo = String(form.get("processo_codigo") ?? "");
    const assuntoId = String(form.get("assunto_id") ?? "");

    if (!arquivos.length) {
      return enviar({ tipo: "erro", ok: false, erro: "Nenhum arquivo enviado" });
    }

    // esta rota GRAVA no MHD com service role: precisa saber quem é e se pode
    const usuario = await usuarioDaRequisicao(req);
    if (processoCodigo) {
      const permissao = await autorizar(req, processoCodigo);
      if (!permissao.ok) {
        return enviar({ tipo: "erro", ok: false, erro: permissao.erro });
      }
    }
    if (arquivos.length > MAX_ARQUIVOS) {
      return enviar({ tipo: "erro", ok: false,
        erro: `Pasta com ${arquivos.length} arquivos — o limite é ${MAX_ARQUIVOS}` });
    }
    const bytesTotal = arquivos.reduce((s, f) => s + f.size, 0);
    if (bytesTotal > MAX_BYTES_TOTAL) {
      return enviar({ tipo: "erro", ok: false,
        erro: `Pasta com ${(bytesTotal / 1024 / 1024).toFixed(0)}MB — o limite é 150MB` });
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
      return enviar({ tipo: "erro", ok: false, erro: "Nenhum arquivo legível na pasta" });
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
      /* Memória gravada por uma versão anterior dos extratores NÃO vale: ela devolveria o que a
       * leitura antiga sabia extrair, e a correção nova nunca apareceria. Ignorando aqui, o
       * documento é relido e regrava já na versão corrente. Custa páginas de texto, não IA. */
      if ((c.dados as any)?._v !== VERSAO_EXTRATOR) continue;
      conhecidos.set(hash, {
        papeis: c.papeis, dados: c.dados, paginas: c.paginas,
        charsTexto: c.texto ? c.texto.replace(/\s/g, "").length : 0,
        dataDocumento: c.data_documento, revisao: c.revisao, lidoEm: c.extraido_em,
      });
    }

    /* O andamento vai saindo enquanto a leitura acontece. `enviar` devolve promessa, mas aqui não
     * se espera: segurar a leitura para escrever a barra seria trocar velocidade por enfeite. */
    const resultado = await lerPastaSlot5(entradas, conhecidos, (a) => {
      void enviar({ tipo: "progresso", ...a });
    });

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

    // 3) obsDocumentos — valor padrão do assunto (lip_campos.valor_padrao). Nunca vem de
    // documento algum; sem isto o campo nunca recebia resultado nenhum.
    if (assuntoId) {
      const { data: abas } = await supabaseAdmin.from("lip_abas").select("id").eq("assunto_id", assuntoId);
      const abaIds = (abas ?? []).map((a: any) => a.id);
      if (abaIds.length) {
        const { data: campoObs } = await supabaseAdmin
          .from("lip_campos").select("valor_padrao").eq("chave", "obsDocumentos").in("aba_id", abaIds).maybeSingle();
        if (campoObs?.valor_padrao) {
          campos.obsDocumentos = { valor: campoObs.valor_padrao, resultado: "ENCONTRADO" as const, fonte: "valor padrão do assunto" };
        }
      }
    }

    /* 4) VISÃO LOCALIZADA — os campos que só existem como imagem na prancha.
     *
     * Roda AQUI, e não dentro de `lerPastaSlot5`, pelo mesmo motivo que o Cadastro de Logradouros
     * e o registro de documentos emitidos rodam aqui: `lerPastaSlot5` é puro e sem banco, e é isso
     * que mantém a suíte de governança rápida e determinística.
     *
     * NUNCA derruba a leitura: toda falha vira `pulos[]` e o campo cai para o estado que
     * `fecharResultados` daria de qualquer jeito. */
    const paraVisao = resultado.catalogo
      .filter((it) => !it.soPresenca)
      .map((it) => ({
        hash: it.hash,
        papeis: it.papeis,
        buffer: entradas.find((e) => e.hash === it.hash)?.buffer ?? new Uint8Array(),
      }))
      .filter((it) => it.buffer.length > 0);

    /* TETO DE TEMPO PARA A VISÃO — 17/08/2026.
     *
     * A visão é o ÚNICO trecho desta rota que depende de IA, e é opcional: ela só alcança os campos
     * que existem apenas como imagem no carimbo. Mas o módulo não tem timeout nenhum, e quando o
     * Gemini responde 503/UNAVAILABLE ou simplesmente pendura, a requisição inteira estoura o
     * tempo — e some a leitura toda, inclusive as dezenas de campos que vieram da camada de texto
     * e nunca precisaram de IA. Foi o que derrubou a leitura do 50724.
     *
     * Com o teto, indisponibilidade do Gemini vira degradação: o analista recebe tudo que o texto
     * deu, e os campos de imagem ficam por ler, com o motivo registrado em `pulos`. */
    const TETO_VISAO_MS = 45_000;
    const visao = await Promise.race([
      executarVisao({
        entradas: paraVisao,
        processoCodigo: processoCodigo || "sem-processo",
        usuarioId: usuario?.id ?? null,
        jaResolvidos: campos,
      }).catch((e: any) => ({
        campos: {}, chamadas: 0, reaproveitadas: 0, custoTotal: 0, msTotal: 0, meta: {},
        pulos: [`visão falhou e foi ignorada: ${e?.message ?? e}`],
      })),
      new Promise<any>((resolve) => setTimeout(() => resolve({
        campos: {}, chamadas: 0, reaproveitadas: 0, custoTotal: 0, msTotal: TETO_VISAO_MS, meta: {},
        pulos: [`visão passou de ${TETO_VISAO_MS / 1000}s e foi abandonada — os campos que só ` +
                `existem como imagem no carimbo ficaram por ler; o resto da leitura está completo`],
      }), TETO_VISAO_MS)),
    ]);
    Object.assign(campos, visao.campos);

    /* Fecha todo campo declarado que leitor e rota não tocaram — NAO_ENCONTRADO/AGUARDANDO_FATO/
     * DOCUMENTO_AUSENTE/BLOQUEADO/MANUAL/NAO_IMPLEMENTADO conforme a própria declaração da matriz.
     * `observacoes` (preenchidoPor "tela") fica de fora: só nasce no aceite. */
    const m = matriz("LIP", "slot_05");
    const camposFechados = m?.campos ? fecharResultados(m.campos, campos) : campos;

    // `extratos` fica no servidor: e a estrutura completa com coordenadas, centenas de KB que a
    // tela nao usa. Ele ja foi gravado no MHD acima.
    const { extratos: _extratos, campos: _campos, ...semExtratos } = resultado;

    return enviar({
      tipo: "resultado",
      ok: true,
      ...semExtratos,
      campos: camposFechados,
      catalogo,
      mhd: { ...mhd, problemas: [...mhd.problemas, ...problemasExtra], gravou: mhd.gravou && !problemasExtra.length },
      // medição e procedência da visão: o analista precisa ver o que custou e o que foi pulado
      visao: {
        chamadas: visao.chamadas, reaproveitadas: visao.reaproveitadas,
        custoUSD: Number(visao.custoTotal.toFixed(6)), ms: Math.round(visao.msTotal),
        pulos: visao.pulos, meta: visao.meta,
      },
      rodadas: [...new Set(entradas.map((e) => e.rodada))].sort((a, b) => a - b),
      // como as subpastas foram ordenadas, e se a ordem precisa da confirmação do analista
      pastas,
      rodadaAmbigua: ambigua,
      msLeitura: Date.now() - t0,
    });
  } catch (e: any) {
    console.error("[ler-pasta]", e);
    return enviar({ tipo: "erro", ok: false, erro: e?.message ?? "Falha ao ler a pasta" });
  }
}
