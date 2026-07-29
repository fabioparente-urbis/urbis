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

/** Documentos lógicos do processo, com versões e conteúdo — alimenta a tela do MHD. */
export async function historicoDoProcesso(processoCodigo: string) {
  const { data: docs, error } = await supabase
    .from("mhd_documentos").select("*")
    .eq("processo_codigo", processoCodigo).order("papel");
  if (error || !docs?.length) return { documentos: [], eventos: [] };

  const { data: versoes } = await supabase
    .from("mhd_versoes")
    .select("id,documento_id,versao,vigente,hash,nome_arquivo,rodada,lido_em,conteudo_id," +
            "mhd_conteudos(paginas,papeis,revisao,data_documento,origem,paginas_ia,extrator_versao,dados)")
    .in("documento_id", docs.map((d: any) => d.id))
    .order("versao", { ascending: false });

  const { data: eventos } = await supabase
    .from("mhd_eventos").select("*")
    .eq("processo_codigo", processoCodigo)
    .order("criado_em", { ascending: false }).limit(300);

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

async function acharOuCriarDocumento(
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

/** Grava a extração de um hash, ou reaproveita a que já existe. */
async function acharOuCriarConteudo(e: EntradaMHD): Promise<{ id: string | null; erro?: string }> {
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
 * Faz upsert só das colunas automáticas (`resultado`, `valor`, `fonte`, `tentativa`, `evidencia`,
 * `versao`, `hash`, `atualizado_em`). As colunas de complementação manual (`valor_manual`,
 * `autor_manual_id`, `complementado_em`) NUNCA entram neste payload — é isso que impede uma nova
 * leitura de apagar o que o analista já corrigiu, e impede a correção do analista de apagar o que
 * o leitor concluiu sozinho.
 */
export async function registrarResultados(args: {
  processoCodigo: string;
  modulo?: "LIP" | "MAC";
  slot?: string;
  resultados: ResultadoParaMHD[];
}): Promise<ResumoResultados> {
  const { processoCodigo, modulo = "LIP", slot = "slot_05", resultados } = args;
  const base: ResumoResultados = { ativa: false, gravou: false, problemas: [], gravados: 0 };

  try {
    const { error: probe } = await supabase.from("mhd_resultados_campo").select("id").limit(1);
    if (probe) {
      return {
        ...base,
        problemas: ["O registro de resultados por campo não está instalado — rode a migration 2026_07_29_mhd_resultados_campo.sql."],
      };
    }

    const agora = new Date().toISOString();
    const linhas = resultados.map((r) => ({
      processo_codigo: processoCodigo, modulo, slot, chave: r.chave,
      resultado: r.resultado, valor: r.valor ?? null, fonte: r.fonte ?? null,
      tentativa: r.tentativa ?? null, evidencia: r.evidencia ?? null,
      versao: r.versao, hash: r.hash, atualizado_em: agora,
    }));

    const { error } = await supabase
      .from("mhd_resultados_campo")
      .upsert(linhas, { onConflict: "processo_codigo,modulo,slot,chave" });
    if (error) return { ...base, ativa: true, problemas: [error.message] };

    return { ativa: true, gravou: true, problemas: [], gravados: linhas.length };
  } catch (err: any) {
    console.error("[MHD] falha ao registrar resultados:", err);
    return {
      ...base, ativa: true, gravou: false,
      problemas: [`falha inesperada ao registrar resultados: ${err?.message ?? err}`],
    };
  }
}
