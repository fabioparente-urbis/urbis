/**
 * lib/mhd.ts — MHD, Módulo de Histórico e Documentos.
 *
 * Módulo SATÉLITE: não pertence ao LIP nem ao MAC, e serve todos os slots e assuntos. O LIP e o
 * MAC apenas consultam.
 *
 * Guarda o CONHECIMENTO extraído dos documentos. Nunca guarda PDF, DWG ou imagem: o arquivo
 * continua no SEI e na pasta do analista.
 *
 * ── O MODELO ──────────────────────────────────────────────────────────────────
 *   mhd_conteudos  → a extração, UMA VEZ POR HASH. Global entre processos.
 *   mhd_documentos → o documento lógico: (processo, papel, escopo).
 *   mhd_versoes    → o VÍNCULO: qual conteúdo é a versão N daquele documento.
 *   mhd_eventos    → a linha do tempo.
 *
 * Separar conteúdo de versão não é purismo: sem isso, uma ART que exerce dois papéis grava o texto
 * e as coordenadas duas vezes, e o mesmo Uso do Solo em dez processos grava dez cópias.
 *
 * ── SEGURANÇA ─────────────────────────────────────────────────────────────────
 * Usa SERVICE ROLE, que ignora o RLS — quem autoriza é `lib/autorizacao.ts`, na rota, ANTES de
 * chamar qualquer função daqui. O conteúdo é global, mas o vínculo é do processo: a autorização se
 * aplica ao vínculo, nunca ao conteúdo, senão reaproveitar por hash vazaria texto entre processos.
 *
 * ── FALHA NUNCA É SILENCIOSA ──────────────────────────────────────────────────
 * Falhar sem derrubar a análise é correto; esconder a falha não é. Toda função devolve o que
 * conseguiu fazer E o que falhou, em `problemas[]`, que a tela mostra ao analista. `gravou` só é
 * true quando NADA falhou — relatar sucesso parcial como sucesso é pior que relatar falha, porque
 * o analista passa a confiar numa memória que não existe.
 */

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { rotuloDe, camposAfetados, conferenciasAfetadas } from "@/lib/mhdDependencias";

/**
 * Versão do extrator. SUBIR ISTO quando a extração mudar de forma que valha reprocessar o que já
 * está na memória — é o que permite saber o que está velho sem reler tudo por precaução.
 */
export const EXTRATOR_VERSAO = "v1";

export type EntradaMHD = {
  hash: string;
  nome: string;
  rodada: number;
  bytes: number;
  paginas: number;
  /** os papéis em que ESTE arquivo é o vigente nesta leitura — é o que gera versão */
  papeis: string[];
  /**
   * TODOS os papéis que o conteúdo exerce, independentemente de vigência.
   *
   * Tem que ser guardado inteiro: papel é propriedade do CONTEÚDO (sai do quadro de atividade
   * técnica), não daquela leitura. Guardar a lista filtrada pela vigência fazia o arquivo voltar da
   * memória exercendo MENOS papéis do que exerce — bug observado com a ART que registra projeto e
   * águas pluviais na mesma folha.
   */
  papeisTodos?: string[];
  /** discriminante quando o processo tem dois documentos do mesmo papel. Vazio no caso normal. */
  escopo?: string;
  dataDocumento?: string | null;
  dataElaboracao?: string | null;
  dataRevisao?: string | null;
  dataAssinatura?: string | null;
  dataRegistro?: string | null;
  revisao?: string | null;
  texto?: string | null;
  linhas?: unknown;
  dados?: unknown;
  origem?: "texto" | "visao" | "manual";
  modelo?: string | null;
  paginasIA?: number;
  /**
   * true = a extração veio da memória (hash já conhecido) e NÃO foi refeita.
   *
   * Mesmo assim a VERSÃO é criada: o conteúdo é global por hash, mas o vínculo é do processo.
   * Pular o vínculo junto com a extração — como a primeira versão deste código fazia — deixava sem
   * histórico neste processo o documento que já havia sido lido em outro.
   */
  reaproveitado?: boolean;
};

export type MemoriaConteudo = {
  id: string;
  hash: string;
  paginas: number | null;
  texto: string | null;
  linhas: unknown;
  dados: any;
  papeis: string[] | null;
  revisao: string | null;
  data_documento: string | null;
  origem: string;
  paginas_ia: number;
  extrator_versao: string;
  extraido_em: string;
};

export type ResumoLeitura = {
  /** as tabelas existem e a consulta funcionou */
  ativa: boolean;
  /** a gravação foi CONFIRMADA. false com ativa=true significa falha parcial. */
  gravou: boolean;
  /** o que deu errado, em português, para mostrar ao analista */
  problemas: string[];
  encontrados: number;
  jaConhecidos: number;
  novos: number;
  corrigidos: number;
  versoesCriadas: { papel: string; rotulo: string; versao: number; nome: string }[];
  alteracoes: { campo: string; de: string; para: string; papel: string }[];
  papeisAlterados: string[];
  conferenciasAfetadas: string[];
  conferenciasNaoAfetadas: string[];
  paginasEconomizadas: number;
  paginasLidas: number;
  custoIA: number;
};

// ─────────────────────────── disponibilidade ───────────────────────────

let avisou = false;

/** As tabelas do MHD existem? Checa também `mhd_conteudos`, da 2ª migration. */
export async function mhdDisponivel(): Promise<boolean> {
  const [d, c] = await Promise.all([
    supabase.from("mhd_documentos").select("id").limit(1),
    supabase.from("mhd_conteudos").select("id").limit(1),
  ]);
  if (d.error || c.error) {
    if (!avisou) {
      console.warn(
        "[MHD] indisponível — rode as migrations 2026_07_27_mhd_historico_documentos.sql e " +
        "2026_07_27_mhd_conteudos_por_hash.sql. Detalhe: " + (d.error?.message ?? c.error?.message),
      );
      avisou = true;
    }
    return false;
  }
  return true;
}

// ─────────────────────────── consulta ───────────────────────────

/**
 * Conteúdo já extraído, por hash. Escopo GLOBAL: hash igual são bytes iguais, então a extração é a
 * mesma esteja o arquivo em que processo estiver.
 *
 * Conteúdo produzido por extrator ANTIGO não é reaproveitado — volta em `desatualizados`, para ser
 * reextraído sem que ninguém precise adivinhar o que está velho.
 */
export async function buscarPorHash(
  hashes: string[],
): Promise<{ conhecidos: Map<string, MemoriaConteudo>; desatualizados: Set<string> }> {
  const conhecidos = new Map<string, MemoriaConteudo>();
  const desatualizados = new Set<string>();
  if (!hashes.length) return { conhecidos, desatualizados };

  const { data, error } = await supabase
    .from("mhd_conteudos")
    .select("id,hash,paginas,texto,linhas,dados,papeis,revisao,data_documento,origem,paginas_ia,extrator_versao,extraido_em")
    .in("hash", hashes)
    .eq("status", "ok");
  if (error || !data) return { conhecidos, desatualizados };

  for (const c of data as MemoriaConteudo[]) {
    if (c.extrator_versao !== EXTRATOR_VERSAO) { desatualizados.add(c.hash); continue; }
    conhecidos.set(c.hash, c);
  }
  return { conhecidos, desatualizados };
}

/**
 * Documentos lógicos do processo, com versões e conteúdo, mais a linha do tempo de eventos —
 * alimenta a tela do MHD.
 *
 * Os EVENTOS são buscados sempre, mesmo sem nenhum `mhd_documentos` — corrigido 06/09/2026: o
 * Organizador de PDF SEI grava eventos direto (`registrarEvento`, sem criar documento/versão,
 * de propósito — ver docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §16.3), e o retorno antecipado daqui
 * quando `docs` vinha vazio jogava fora eventos que TINHAM sido gravados com sucesso — a tela do
 * MHD (e a Home) mostravam "vazio" para um processo que na verdade tinha histórico.
 */
export async function historicoDoProcesso(processoCodigo: string) {
  const { data: docs } = await supabase
    .from("mhd_documentos").select("*")
    .eq("processo_codigo", processoCodigo).order("papel");

  const { data: eventos } = await supabase
    .from("mhd_eventos").select("*")
    .eq("processo_codigo", processoCodigo)
    .order("criado_em", { ascending: false }).limit(300);

  if (!docs?.length) return { documentos: [], eventos: eventos ?? [] };

  const { data: versoes } = await supabase
    .from("mhd_versoes")
    .select("id,documento_id,versao,vigente,hash,nome_arquivo,rodada,lido_em,conteudo_id," +
            "mhd_conteudos(paginas,papeis,revisao,data_documento,origem,paginas_ia,extrator_versao,dados)")
    .in("documento_id", docs.map((d: any) => d.id))
    .order("versao", { ascending: false });

  return {
    documentos: docs.map((d: any) => ({
      ...d,
      rotulo: d.rotulo ?? rotuloDe(d.papel),
      versoes: (versoes ?? [])
        .filter((v: any) => v.documento_id === d.id)
        .map((v: any) => {
          const { mhd_conteudos: c, ...resto } = v;
          return { ...resto, ...(c ?? {}) };
        }),
    })),
    eventos: eventos ?? [],
  };
}

// ─────────────────────────── gravação ───────────────────────────

/**
 * Exportada (06/09/2026) pro Organizador de PDF SEI (Slots 1/2, `lib/documentosSei/persistencia.ts`)
 * reaproveitar sem duplicar a query — mudança de visibilidade só, sem tocar comportamento nem
 * `registrarLeitura` (Slot 5), que continua chamando isto do mesmo jeito.
 */
export async function acharOuCriarDocumento(
  processoCodigo: string, assuntoId: string | null, papel: string, escopo: string,
): Promise<{ id: string | null; erro?: string }> {
  const { data: existente } = await supabase
    .from("mhd_documentos").select("id")
    .eq("processo_codigo", processoCodigo).eq("papel", papel).eq("escopo", escopo).maybeSingle();
  if (existente?.id) return { id: existente.id };

  const { data, error } = await supabase
    .from("mhd_documentos")
    .insert({ processo_codigo: processoCodigo, assunto_id: assuntoId, papel, escopo, rotulo: rotuloDe(papel) })
    .select("id").single();
  if (error) {
    console.error("[MHD] documento lógico não criado:", papel, error.message);
    return { id: null, erro: `documento "${rotuloDe(papel)}": ${error.message}` };
  }
  return { id: data.id };
}

/**
 * Grava a extração de um hash, ou reaproveita a que já existe. Exportada (06/09/2026) pelo mesmo
 * motivo de `acharOuCriarDocumento` acima.
 */
export async function acharOuCriarConteudo(e: EntradaMHD): Promise<{ id: string | null; erro?: string }> {
  const { data: existente } = await supabase
    .from("mhd_conteudos").select("id,extrator_versao").eq("hash", e.hash).maybeSingle();

  // veio da memória: a extração já está guardada e não foi refeita, então não há payload novo
  if (e.reaproveitado) {
    if (existente?.id) return { id: existente.id };
    return { id: null, erro: `"${e.nome}" foi marcado como conhecido mas não está na memória` };
  }

  const payload = {
    hash: e.hash, bytes: e.bytes, paginas: e.paginas,
    texto: e.texto ?? null, linhas: e.linhas ?? null, dados: e.dados ?? null,
    papeis: e.papeisTodos ?? e.papeis, revisao: e.revisao ?? null,
    data_documento: e.dataDocumento ?? null,
    data_elaboracao: e.dataElaboracao ?? null,
    data_revisao: e.dataRevisao ?? null,
    data_assinatura: e.dataAssinatura ?? null,
    data_registro: e.dataRegistro ?? null,
    origem: e.origem ?? "texto", modelo: e.modelo ?? null,
    paginas_ia: e.paginasIA ?? 0,
    extrator_versao: EXTRATOR_VERSAO, status: "ok",
    extraido_em: new Date().toISOString(),
  };

  // extrator novo sobre conteúdo antigo: atualiza a extração preservando o mesmo id,
  // para que as versões que já apontam para ele continuem válidas
  if (existente?.id) {
    if (existente.extrator_versao === EXTRATOR_VERSAO) return { id: existente.id };
    const { error } = await supabase.from("mhd_conteudos").update(payload).eq("id", existente.id);
    if (error) return { id: existente.id, erro: `reextração de "${e.nome}": ${error.message}` };
    return { id: existente.id };
  }

  const { data, error } = await supabase.from("mhd_conteudos").insert(payload).select("id").single();
  if (error) {
    console.error("[MHD] conteúdo não gravado:", e.nome, error.message);
    return { id: null, erro: `conteúdo de "${e.nome}": ${error.message}` };
  }
  return { id: data.id };
}

export async function registrarEvento(ev: {
  processoCodigo: string; assuntoId?: string | null; documentoId?: string | null;
  versaoId?: string | null; tipo: string; titulo: string; detalhe?: unknown; usuarioId?: string | null;
}): Promise<string | null> {
  const { error } = await supabase.from("mhd_eventos").insert({
    processo_codigo: ev.processoCodigo, assunto_id: ev.assuntoId ?? null,
    documento_id: ev.documentoId ?? null, versao_id: ev.versaoId ?? null,
    tipo: ev.tipo, titulo: ev.titulo, detalhe: ev.detalhe ?? null, usuario_id: ev.usuarioId ?? null,
  });
  return error ? error.message : null;
}

/** Compara os dados de duas versões e devolve as diferenças, campo a campo. */
export function compararVersoes(antes: any, depois: any, papel: string) {
  const alteracoes: { campo: string; de: string; para: string; papel: string }[] = [];
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  for (const k of chaves) {
    if (k === "carimboFaltando" || k === "carimboVariantes" || k === "atividades") continue;
    const a = antes?.[k], b = depois?.[k];
    if (a == null && b == null) continue;
    const sa = a == null ? "" : String(a), sb = b == null ? "" : String(b);
    if (sa !== sb) alteracoes.push({ campo: k, de: sa || "—", para: sb || "—", papel });
  }
  return alteracoes;
}

/**
 * Grava a leitura e devolve o resumo. NUNCA lança.
 *
 * `entradas` deve conter UM registro por arquivo distinto, já com apenas os papéis em que aquele
 * arquivo é o VIGENTE — quem decide isso é `lerPastaSlot5`, não este módulo.
 */
export async function registrarLeitura(args: {
  processoCodigo: string;
  assuntoId?: string | null;
  usuarioId?: string | null;
  /** TODOS os arquivos da leitura, reaproveitados inclusive — cada um precisa do seu vínculo. */
  entradas: EntradaMHD[];
  conferencias: { nome: string }[];
}): Promise<ResumoLeitura> {
  const reaproveitados = args.entradas.filter((e) => e.reaproveitado);
  const base: ResumoLeitura = {
    ativa: false, gravou: false, problemas: [],
    encontrados: args.entradas.length,
    jaConhecidos: reaproveitados.length,
    novos: 0, corrigidos: 0,
    versoesCriadas: [], alteracoes: [], papeisAlterados: [],
    conferenciasAfetadas: [], conferenciasNaoAfetadas: args.conferencias.map((c) => c.nome),
    paginasEconomizadas: reaproveitados.reduce((s, k) => s + (k.paginas || 0), 0),
    paginasLidas: 0, custoIA: 0,
  };

  try {
    if (!(await mhdDisponivel())) {
      return { ...base, problemas: ["O Histórico Documental não está instalado — nada foi registrado."] };
    }

    const { processoCodigo, assuntoId = null, usuarioId = null, entradas } = args;
    const r: ResumoLeitura = { ...base, ativa: true };
    const papeisAlterados = new Set<string>();

    const errEvento = await registrarEvento({
      processoCodigo, assuntoId, tipo: "leitura_iniciada", usuarioId,
      titulo: `Leitura da pasta — ${r.encontrados} arquivo(s)`,
      detalhe: { extraidos: entradas.length - r.jaConhecidos, reaproveitados: r.jaConhecidos },
    });
    if (errEvento) r.problemas.push(`linha do tempo: ${errEvento}`);

    for (const e of entradas) {
      if (e.reaproveitado) {
        const err = await registrarEvento({
          processoCodigo, assuntoId, tipo: "documento_conhecido", usuarioId,
          titulo: `${e.nome} já estava na memória — extração reaproveitada`,
          detalhe: { hash: e.hash, paginasEconomizadas: e.paginas },
        });
        if (err) r.problemas.push(`evento de "${e.nome}": ${err}`);
      } else {
        r.paginasLidas += e.paginas || 0;
        r.custoIA += e.paginasIA ?? 0;
      }

      const conteudo = await acharOuCriarConteudo(e);
      if (conteudo.erro) r.problemas.push(conteudo.erro);
      if (!conteudo.id) continue;

      const escopo = e.escopo ?? "";
      for (const papel of e.papeis) {
        const doc = await acharOuCriarDocumento(processoCodigo, assuntoId, papel, escopo);
        if (doc.erro) r.problemas.push(doc.erro);
        if (!doc.id) continue;

        const { data: anteriores } = await supabase
          .from("mhd_versoes")
          .select("id,versao,conteudo_id,nome_arquivo,mhd_conteudos(dados)")
          .eq("documento_id", doc.id).order("versao", { ascending: false }).limit(1);
        const anterior: any = anteriores?.[0] ?? null;

        // o MESMO conteúdo já é a versão vigente deste documento: nada a criar
        if (anterior?.conteudo_id === conteudo.id) continue;

        const versao = (anterior?.versao ?? 0) + 1;
        if (anterior) await supabase.from("mhd_versoes").update({ vigente: false }).eq("documento_id", doc.id);

        const { data: nova, error: errVersao } = await supabase.from("mhd_versoes").insert({
          documento_id: doc.id, conteudo_id: conteudo.id, versao, vigente: true,
          hash: e.hash, nome_arquivo: e.nome, rodada: e.rodada, usuario_id: usuarioId,
        }).select("id").single();
        if (errVersao) { r.problemas.push(`versão de "${rotuloDe(papel)}": ${errVersao.message}`); continue; }

        await supabase.from("mhd_documentos")
          .update({ status: "ativo", atualizado_em: new Date().toISOString() }).eq("id", doc.id);

        r.versoesCriadas.push({ papel, rotulo: rotuloDe(papel), versao, nome: e.nome });
        papeisAlterados.add(papel);

        if (anterior) {
          r.corrigidos++;
          const difs = compararVersoes(anterior.mhd_conteudos?.dados, e.dados, papel);
          r.alteracoes.push(...difs);
          await registrarEvento({
            processoCodigo, assuntoId, documentoId: doc.id, versaoId: nova?.id ?? null,
            tipo: "alteracao_detectada", usuarioId,
            titulo: `${rotuloDe(papel)} — versão ${versao} substitui a ${anterior.versao}`,
            detalhe: { de: anterior.nome_arquivo, para: e.nome, alteracoes: difs },
          });
        } else {
          r.novos++;
          await registrarEvento({
            processoCodigo, assuntoId, documentoId: doc.id, versaoId: nova?.id ?? null,
            tipo: "documento_novo", usuarioId,
            titulo: `${rotuloDe(papel)} — versão 1 (${e.nome})`,
            detalhe: { hash: e.hash, rodada: e.rodada },
          });
        }
      }
    }

    // a matriz de dependências EXPLICA o impacto; não pula cálculo (ver mhdDependencias.ts)
    r.papeisAlterados = [...papeisAlterados];
    const afetada = conferenciasAfetadas(r.papeisAlterados);
    r.conferenciasAfetadas = [];
    r.conferenciasNaoAfetadas = [];
    for (const c of args.conferencias) {
      (afetada(c.nome) ? r.conferenciasAfetadas : r.conferenciasNaoAfetadas).push(c.nome);
    }

    await registrarEvento({
      processoCodigo, assuntoId, tipo: "compatibilizacao", usuarioId,
      titulo: `Compatibilização — ${r.conferenciasAfetadas.length} análise(s) afetada(s)`,
      detalhe: {
        papeisAlterados: r.papeisAlterados,
        camposAfetados: [...camposAfetados(r.papeisAlterados)],
        afetadas: r.conferenciasAfetadas, naoAfetadas: r.conferenciasNaoAfetadas,
        problemas: r.problemas,
      },
    });

    r.gravou = r.problemas.length === 0;
    return r;
  } catch (err: any) {
    console.error("[MHD] falha ao registrar leitura:", err);
    return {
      ...base, ativa: true, gravou: false,
      problemas: [`falha inesperada ao registrar: ${err?.message ?? err}`],
    };
  }
}

// ─────────────────────────── resultado por campo ───────────────────────────

export type ResultadoParaMHD = {
  chave: string;
  resultado: string;
  valor?: string;
  fonte?: string;
  tentativa?: unknown;
  evidencia?: string;
  /** versão e hash do campo NA MATRIZ no momento desta execução — reproduz a regra que decidiu */
  versao: number;
  hash: string;
  /** só para resultado INFERIDO: o quanto o modelo se diz seguro, e o que aquilo custou */
  confianca?: number;
  custoIA?: number;
  /** aponta para a interpretação reaproveitável em `mhd_interpretacoes_visao` */
  interpretacaoId?: string;
};

export type ResumoResultados = {
  ativa: boolean;
  gravou: boolean;
  problemas: string[];
  gravados: number;
};

/**
 * Grava o RESULTADO de cada campo de uma execução. NUNCA lança — mesmo padrão de
 * `registrarLeitura`.
 *
 * VERSIONA, não sobrescreve. Cada execução vira um conjunto novo de linhas com o mesmo
 * `execucao_id`, e as anteriores passam a `vigente = false` — o mesmo padrão de `mhd_versoes`,
 * que nunca apaga versão de documento.
 *
 * A versão anterior fazia upsert e destruía a execução passada. Para extrator determinístico isso
 * quase não se notava; para visão seria perda real: some o valor que fundamentou o laudo no dia em
 * que ele saiu, e some a divergência entre execuções, que é o indicador mais forte de que o campo
 * não é confiável.
 *
 * As colunas de complementação manual (`valor_manual`, `autor_manual_id`, `complementado_em`) não
 * entram neste payload: uma nova leitura nunca apaga o que o analista corrigiu.
 */
export async function registrarResultados(args: {
  processoCodigo: string;
  modulo?: "LIP" | "MAC";
  slot?: string;
  resultados: ResultadoParaMHD[];
}): Promise<ResumoResultados & { execucaoId?: string }> {
  const { processoCodigo, modulo = "LIP", slot = "slot_05", resultados } = args;
  const base: ResumoResultados = { ativa: false, gravou: false, problemas: [], gravados: 0 };

  try {
    const { error: probe } = await supabase.from("mhd_resultados_campo").select("id,vigente").limit(1);
    if (probe) {
      return {
        ...base,
        problemas: [
          "O registro de resultados por campo não está instalado ou está desatualizado — rode as migrations " +
          "2026_07_29_mhd_resultados_campo.sql e 2026_07_29_resultados_versionados_e_visao.sql.",
        ],
      };
    }

    const execucaoId = crypto.randomUUID();
    const agora = new Date().toISOString();

    /* Aposenta a execução anterior ANTES de inserir a nova: o índice único parcial
     * (um vigente por campo) recusaria a inserção enquanto a antiga ainda estivesse vigente. */
    const { error: erroAposentar } = await supabase
      .from("mhd_resultados_campo")
      .update({ vigente: false })
      .eq("processo_codigo", processoCodigo).eq("modulo", modulo).eq("slot", slot)
      .eq("vigente", true);
    if (erroAposentar) return { ...base, ativa: true, problemas: [erroAposentar.message] };

    const linhas = resultados.map((r) => ({
      processo_codigo: processoCodigo, modulo, slot, chave: r.chave,
      execucao_id: execucaoId, vigente: true,
      resultado: r.resultado, valor: r.valor ?? null, fonte: r.fonte ?? null,
      tentativa: r.tentativa ?? null, evidencia: r.evidencia ?? null,
      confianca: r.confianca ?? null, custo_ia: r.custoIA ?? null,
      interpretacao_id: r.interpretacaoId ?? null,
      versao: r.versao, hash: r.hash, atualizado_em: agora,
    }));

    const { error } = await supabase.from("mhd_resultados_campo").insert(linhas);
    if (error) return { ...base, ativa: true, problemas: [error.message] };

    return { ativa: true, gravou: true, problemas: [], gravados: linhas.length, execucaoId };
  } catch (err: any) {
    console.error("[MHD] falha ao registrar resultados:", err);
    return {
      ...base, ativa: true, gravou: false,
      problemas: [`falha inesperada ao registrar resultados: ${err?.message ?? err}`],
    };
  }
}

// ─────────────────────────── resultado automático de UM item ───────────────────────────

export type ResumoResultadoItem = { ativa: boolean; gravou: boolean; problemas: string[] };

/**
 * Grava o resultado automático de UM item — nunca mexe em outras chaves do mesmo
 * (processo,modulo,slot). Ao contrário de `registrarResultados()` (substitui o LOTE inteiro de
 * uma vez, pensada pra leitura completa da pasta do LIP: `fecharResultados` sempre entrega os
 * 136/768 campos juntos), o motor do MAC Slot 5 resolve só alguns dos 768 itens por execução —
 * chamar `registrarResultados` aqui aposentaria por engano as respostas manuais de TODOS os
 * outros itens do processo. Esta função existe pra isso: só toca a chave dada.
 *
 * Se a chave já tinha uma resposta manual (`valor_manual`) e agora chega um resultado
 * automático novo, a linha nova nasce sem `valor_manual` — mas o valor anterior nunca some de
 * verdade, fica registrado em `mhd_eventos` (mesmo princípio de auditoria de `complementarCampo`).
 */
export async function registrarResultadoItem(args: {
  processoCodigo: string;
  modulo: "LIP" | "MAC";
  slot: string;
  chave: string;
  resultado: string;
  valor?: string | null;
  fonte?: string | null;
  evidencia?: string | null;
  confianca?: number | null;
  versao: number;
  hash: string;
}): Promise<ResumoResultadoItem> {
  const {
    processoCodigo, modulo, slot, chave, resultado,
    valor = null, fonte = null, evidencia = null, confianca = null, versao, hash,
  } = args;

  try {
    const { data: atual, error: erroBusca } = await supabase
      .from("mhd_resultados_campo").select("id, valor_manual, autor_manual_id")
      .eq("processo_codigo", processoCodigo).eq("modulo", modulo).eq("slot", slot).eq("chave", chave)
      .eq("vigente", true).maybeSingle();
    if (erroBusca) {
      return {
        ativa: false, gravou: false,
        problemas: [
          "O registro de resultados por campo não está instalado ou está desatualizado — rode as migrations " +
          `2026_07_29_mhd_resultados_campo.sql e 2026_07_29_resultados_versionados_e_visao.sql. Detalhe: ${erroBusca.message}`,
        ],
      };
    }

    if ((atual as any)?.id) {
      const { error: erroAposentar } = await supabase
        .from("mhd_resultados_campo").update({ vigente: false }).eq("id", (atual as any).id);
      if (erroAposentar) return { ativa: true, gravou: false, problemas: [erroAposentar.message] };
    }

    const agora = new Date().toISOString();
    const { error } = await supabase.from("mhd_resultados_campo").insert({
      processo_codigo: processoCodigo, modulo, slot, chave,
      execucao_id: crypto.randomUUID(), vigente: true,
      resultado, valor, fonte, tentativa: null, evidencia,
      confianca, versao, hash, atualizado_em: agora,
    });
    if (error) return { ativa: true, gravou: false, problemas: [error.message] };

    if ((atual as any)?.valor_manual) {
      await registrarEvento({
        processoCodigo, tipo: "resultado_automatico_substitui_manual",
        usuarioId: (atual as any).autor_manual_id ?? null,
        titulo: `${modulo}/${chave} — resultado automático substituiu resposta manual anterior`,
        detalhe: { valorManualAnterior: (atual as any).valor_manual, resultadoNovo: resultado, valorNovo: valor },
      }).catch(() => {});
    }

    return { ativa: true, gravou: true, problemas: [] };
  } catch (err: any) {
    console.error("[MHD] falha ao registrar resultado de item:", err);
    return { ativa: true, gravou: false, problemas: [`falha inesperada ao registrar resultado de item: ${err?.message ?? err}`] };
  }
}

// ─────────────────────────── complementação manual (fato/veredito assistido) ───────────────────────────

export type ResumoComplementacao = { ativa: boolean; gravou: boolean; problemas: string[] };

/**
 * Grava a resposta do analista para UM campo — fato do LIP (inclusive complementar, fora dos 136
 * campos oficiais) ou item do MAC — na MESMA linha vigente de `mhd_resultados_campo`, só nas
 * colunas `valor_manual`/`autor_manual_id`/`complementado_em`. NUNCA toca `resultado`/`valor`/
 * `fonte`/`tentativa`/`evidencia` — são o que a execução automática concluiu, e continuam intactos
 * ao lado (mesmo padrão documentado na migration `2026_07_29_mhd_resultados_campo.sql`).
 *
 * Se não existir NENHUMA linha vigente para esta chave ainda (item nunca teve tentativa
 * automática — comum nos itens `MANUAL_SEM_DADO_LIP` do MAC), cria uma com
 * `resultado: "MANUAL"` e `valor: null` — o fato/veredito nasce só pela resposta humana.
 *
 * Corrigir uma resposta anterior SOBRESCREVE `valor_manual` (é uma coluna só, não lista) — mas
 * nunca em silêncio: todo complemento grava um evento em `mhd_eventos` (append-only, nunca
 * apagado) com o valor anterior e o novo, preservando a trilha mesmo sem versionar a coluna em si.
 *
 * NUNCA lança — mesmo padrão do resto do módulo.
 */
export async function complementarCampo(args: {
  processoCodigo: string;
  modulo: "LIP" | "MAC";
  slot: string;
  chave: string;
  valorManual: string;
  autorId: string;
  assuntoId?: string | null;
  /** usados SÓ quando nenhuma linha vigente existe ainda para esta chave (cria uma nova) */
  versaoFallback: number;
  hashFallback: string;
}): Promise<ResumoComplementacao> {
  const {
    processoCodigo, modulo, slot, chave, valorManual, autorId,
    assuntoId = null, versaoFallback, hashFallback,
  } = args;
  const base: ResumoComplementacao = { ativa: false, gravou: false, problemas: [] };

  try {
    const { data: atual, error: erroBusca } = await supabase
      .from("mhd_resultados_campo").select("id, valor_manual")
      .eq("processo_codigo", processoCodigo).eq("modulo", modulo).eq("slot", slot).eq("chave", chave)
      .eq("vigente", true).maybeSingle();
    if (erroBusca) {
      return {
        ...base,
        problemas: [
          "O registro de resultados por campo não está instalado ou está desatualizado — rode as migrations " +
          `2026_07_29_mhd_resultados_campo.sql e 2026_07_29_resultados_versionados_e_visao.sql. Detalhe: ${erroBusca.message}`,
        ],
      };
    }

    const agora = new Date().toISOString();
    const valorAnterior = (atual as any)?.valor_manual ?? null;

    if ((atual as any)?.id) {
      const { error } = await supabase.from("mhd_resultados_campo")
        .update({ valor_manual: valorManual, autor_manual_id: autorId, complementado_em: agora, atualizado_em: agora })
        .eq("id", (atual as any).id);
      if (error) return { ativa: true, gravou: false, problemas: [error.message] };
    } else {
      const { error } = await supabase.from("mhd_resultados_campo").insert({
        processo_codigo: processoCodigo, modulo, slot, chave,
        execucao_id: crypto.randomUUID(), vigente: true,
        resultado: "MANUAL", valor: null, fonte: null, tentativa: null, evidencia: null,
        versao: versaoFallback, hash: hashFallback,
        valor_manual: valorManual, autor_manual_id: autorId, complementado_em: agora, atualizado_em: agora,
      });
      if (error) return { ativa: true, gravou: false, problemas: [error.message] };
    }

    const errEvento = await registrarEvento({
      processoCodigo, assuntoId, tipo: "fato_complementado", usuarioId: autorId,
      titulo: `${modulo}/${chave} — resposta assistida registrada`,
      detalhe: { modulo, slot, chave, valorAnterior, valorNovo: valorManual },
    });

    return { ativa: true, gravou: !errEvento, problemas: errEvento ? [`linha do tempo: ${errEvento}`] : [] };
  } catch (err: any) {
    console.error("[MHD] falha ao complementar campo:", err);
    return {
      ativa: true, gravou: false,
      problemas: [`falha inesperada ao complementar campo: ${err?.message ?? err}`],
    };
  }
}
