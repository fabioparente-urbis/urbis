/**
 * lib/mhd.ts — MHD, Módulo de Histórico e Documentos.
 *
 * Módulo SATÉLITE: não pertence ao LIP nem ao MAC, e serve todos os slots e assuntos. O LIP e o
 * MAC apenas consultam.
 *
 * Guarda o CONHECIMENTO extraído dos documentos — texto, estrutura, dados, versões, linha do
 * tempo. Nunca guarda PDF, DWG ou imagem: o arquivo continua no SEI e na pasta do analista.
 *
 * A memória serve a um objetivo só: **documento já lido não é lido de novo**. Quando chega
 * correção, cria-se versão, compara-se com a anterior e a compatibilização roda sobre o que já
 * está guardado — sem tocar no arquivo e sem gastar IA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOLERANTE A AUSÊNCIA DE TABELA, DE PROPÓSITO
 *
 * Enquanto a migration 2026_07_27_mhd_historico_documentos.sql não for aplicada, TODA função
 * daqui falha em silêncio e devolve vazio. A leitura da pasta continua funcionando exatamente
 * como antes — só não ganha memória. Nada quebra em produção por causa de uma tabela que ainda
 * não existe, e o dia em que a migration rodar, a memória começa a funcionar sozinha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// SERVICE ROLE, não o cliente anônimo: RLS bloqueia escrita anônima em TODAS as tabelas do
// projeto — e de um jeito traiçoeiro, porque o SELECT passa devolvendo vazio e só o INSERT é
// recusado. Com o cliente anônimo a memória parecia "ligada" e não gravava nada. Este módulo só
// roda no servidor (rotas /api), nunca no navegador.
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { rotuloDe, camposAfetados, conferenciasAfetadas } from "@/lib/mhdDependencias";

export type EstadoDocumento = "novo" | "conhecido" | "corrigido";

export type EntradaMHD = {
  hash: string;
  nome: string;
  rodada: number;
  bytes: number;
  paginas: number;
  papeis: string[];
  dataArquivo?: string | null;
  dataDocumento?: string | null;
  revisao?: string | null;
  texto?: string | null;
  linhas?: unknown;
  dados?: unknown;
  origem?: "texto" | "visao" | "manual";
  custoPaginasIA?: number;
};

export type MemoriaVersao = {
  id: string;
  documento_id: string;
  versao: number;
  hash: string;
  nome_arquivo: string;
  rodada: number;
  paginas: number | null;
  data_documento: string | null;
  revisao: string | null;
  papeis: string[] | null;
  dados: any;
  texto: string | null;
  origem: string;
  custo_paginas_ia: number;
  lido_em: string;
  vigente: boolean;
};

export type ResumoLeitura = {
  ativa: boolean;                    // a memória está ligada? (tabelas existem)
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

// ─────────────────────────── infra tolerante ───────────────────────────

let avisou = false;

/** true = as tabelas do MHD existem. Falso silencia o módulo inteiro. */
export async function mhdDisponivel(): Promise<boolean> {
  const { error } = await supabase.from("mhd_documentos").select("id").limit(1);
  if (error) {
    if (!avisou) {
      console.warn("[MHD] tabelas ausentes — memória desligada. Rode supabase/migrations/2026_07_27_mhd_historico_documentos.sql");
      avisou = true;
    }
    return false;
  }
  return true;
}

// ─────────────────────────── consulta da memória ───────────────────────────

/**
 * Dado o conjunto de hashes de uma leitura, devolve o que já está na memória.
 * Escopo GLOBAL por hash: hash igual significa bytes idênticos, então o conhecimento é o mesmo
 * documento, esteja em que processo estiver. É o que evita reler o mesmo Uso do Solo que aparece
 * em vários processos do mesmo lote.
 */
export async function buscarPorHash(hashes: string[]): Promise<Map<string, MemoriaVersao>> {
  const out = new Map<string, MemoriaVersao>();
  if (!hashes.length) return out;
  const { data, error } = await supabase
    .from("mhd_versoes")
    .select("*")
    .in("hash", hashes)
    .order("lido_em", { ascending: false });
  if (error || !data) return out;
  for (const v of data as MemoriaVersao[]) if (!out.has(v.hash)) out.set(v.hash, v);
  return out;
}

/** Documentos lógicos do processo, com suas versões — alimenta a tela do MHD. */
export async function historicoDoProcesso(processoCodigo: string) {
  const { data: docs, error } = await supabase
    .from("mhd_documentos")
    .select("*")
    .eq("processo_codigo", processoCodigo)
    .order("papel");
  if (error || !docs?.length) return { documentos: [], eventos: [] };

  const { data: versoes } = await supabase
    .from("mhd_versoes")
    .select("id,documento_id,versao,vigente,hash,nome_arquivo,rodada,paginas,data_documento,revisao,papeis,origem,custo_paginas_ia,lido_em,dados")
    .in("documento_id", docs.map((d: any) => d.id))
    .order("versao", { ascending: false });

  const { data: eventos } = await supabase
    .from("mhd_eventos")
    .select("*")
    .eq("processo_codigo", processoCodigo)
    .order("criado_em", { ascending: false })
    .limit(300);

  return {
    documentos: docs.map((d: any) => ({
      ...d,
      rotulo: d.rotulo ?? rotuloDe(d.papel),
      versoes: (versoes ?? []).filter((v: any) => v.documento_id === d.id),
    })),
    eventos: eventos ?? [],
  };
}

// ─────────────────────────── gravação ───────────────────────────

async function acharOuCriarDocumento(
  processoCodigo: string, assuntoId: string | null, papel: string,
): Promise<string | null> {
  const { data: existente } = await supabase
    .from("mhd_documentos").select("id")
    .eq("processo_codigo", processoCodigo).eq("papel", papel).maybeSingle();
  if (existente?.id) return existente.id;

  const { data, error } = await supabase
    .from("mhd_documentos")
    .insert({ processo_codigo: processoCodigo, assunto_id: assuntoId, papel, rotulo: rotuloDe(papel) })
    .select("id").single();
  // falha aqui não pode ser silenciosa: foi exatamente assim que a memória ficou "ligada"
  // gravando nada, quando o módulo ainda usava o cliente anônimo e o RLS recusava o insert
  if (error) { console.error("[MHD] não consegui criar o documento lógico:", papel, error.message); return null; }
  return data.id;
}

export async function registrarEvento(e: {
  processoCodigo: string; assuntoId?: string | null; documentoId?: string | null;
  versaoId?: string | null; tipo: string; titulo: string; detalhe?: unknown; usuarioId?: string | null;
}) {
  await supabase.from("mhd_eventos").insert({
    processo_codigo: e.processoCodigo, assunto_id: e.assuntoId ?? null,
    documento_id: e.documentoId ?? null, versao_id: e.versaoId ?? null,
    tipo: e.tipo, titulo: e.titulo, detalhe: e.detalhe ?? null, usuario_id: e.usuarioId ?? null,
  });
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
 * Grava a leitura na memória e devolve o resumo.
 *
 * Contrato: NUNCA lança. Se a memória estiver indisponível, devolve resumo com `ativa: false` e a
 * leitura segue normalmente.
 */
export async function registrarLeitura(args: {
  processoCodigo: string;
  assuntoId?: string | null;
  usuarioId?: string | null;
  entradas: EntradaMHD[];
  conferencias: { nome: string }[];
}): Promise<ResumoLeitura> {
  const vazio: ResumoLeitura = {
    ativa: false, encontrados: args.entradas.length, jaConhecidos: 0, novos: 0, corrigidos: 0,
    versoesCriadas: [], alteracoes: [], papeisAlterados: [],
    conferenciasAfetadas: [], conferenciasNaoAfetadas: [],
    paginasEconomizadas: 0, paginasLidas: 0, custoIA: 0,
  };

  try {
    if (!(await mhdDisponivel())) return vazio;

    const { processoCodigo, assuntoId = null, usuarioId = null, entradas } = args;
    const memoria = await buscarPorHash(entradas.map((e) => e.hash));

    const resumo: ResumoLeitura = { ...vazio, ativa: true };
    const papeisAlterados = new Set<string>();

    await registrarEvento({
      processoCodigo, assuntoId, tipo: "leitura_iniciada", usuarioId,
      titulo: `Leitura da pasta — ${entradas.length} arquivo(s)`,
      detalhe: { rodadas: [...new Set(entradas.map((e) => e.rodada))].sort() },
    });

    for (const e of entradas) {
      const conhecido = memoria.get(e.hash);

      if (conhecido) {
        // MESMO HASH = mesmo conteúdo. Não relê, não extrai, não chama IA.
        resumo.jaConhecidos++;
        resumo.paginasEconomizadas += e.paginas || 0;
        await registrarEvento({
          processoCodigo, assuntoId, documentoId: conhecido.documento_id, versaoId: conhecido.id,
          tipo: "documento_conhecido", usuarioId,
          titulo: `${e.nome} já estava na memória — não foi relido`,
          detalhe: { hash: e.hash, lidoEm: conhecido.lido_em, paginasEconomizadas: e.paginas },
        });
        continue;
      }

      resumo.paginasLidas += e.paginas || 0;
      resumo.custoIA += e.custoPaginasIA ?? 0;

      // um arquivo pode exercer vários papéis (uma ART registra várias atividades):
      // cada papel é um documento lógico, e cada um ganha a sua versão
      for (const papel of e.papeis) {
        const documentoId = await acharOuCriarDocumento(processoCodigo, assuntoId, papel);
        if (!documentoId) continue; // já logado acima

        const { data: anteriores } = await supabase
          .from("mhd_versoes").select("id,versao,dados,nome_arquivo")
          .eq("documento_id", documentoId).order("versao", { ascending: false }).limit(1);
        const anterior = anteriores?.[0] ?? null;
        const versao = (anterior?.versao ?? 0) + 1;
        const ehCorrecao = !!anterior;

        // versão anterior deixa de ser a vigente, mas NUNCA é apagada
        if (anterior) await supabase.from("mhd_versoes").update({ vigente: false }).eq("documento_id", documentoId);

        const { data: nova } = await supabase.from("mhd_versoes").insert({
          documento_id: documentoId, versao, vigente: true,
          hash: e.hash, nome_arquivo: e.nome, rodada: e.rodada, bytes: e.bytes, paginas: e.paginas,
          data_arquivo: e.dataArquivo ?? null, data_documento: e.dataDocumento ?? null,
          revisao: e.revisao ?? null, papeis: e.papeis,
          texto: e.texto ?? null, linhas: e.linhas ?? null, dados: e.dados ?? null,
          origem: e.origem ?? "texto", custo_paginas_ia: e.custoPaginasIA ?? 0, usuario_id: usuarioId,
        }).select("id").single();

        await supabase.from("mhd_documentos")
          .update({ status: "ativo", atualizado_em: new Date().toISOString() }).eq("id", documentoId);

        resumo.versoesCriadas.push({ papel, rotulo: rotuloDe(papel), versao, nome: e.nome });
        papeisAlterados.add(papel);

        if (ehCorrecao) {
          resumo.corrigidos++;
          const difs = compararVersoes(anterior.dados, e.dados, papel);
          resumo.alteracoes.push(...difs);
          await registrarEvento({
            processoCodigo, assuntoId, documentoId, versaoId: nova?.id ?? null,
            tipo: "alteracao_detectada", usuarioId,
            titulo: `${rotuloDe(papel)} — versão ${versao} substitui a ${anterior.versao}`,
            detalhe: { de: anterior.nome_arquivo, para: e.nome, alteracoes: difs },
          });
        } else {
          resumo.novos++;
          await registrarEvento({
            processoCodigo, assuntoId, documentoId, versaoId: nova?.id ?? null,
            tipo: "documento_novo", usuarioId,
            titulo: `${rotuloDe(papel)} — versão 1 (${e.nome})`,
            detalhe: { hash: e.hash, rodada: e.rodada },
          });
        }
      }
    }

    // a matriz de dependências EXPLICA o impacto; não pula cálculo (ver mhdDependencias.ts)
    resumo.papeisAlterados = [...papeisAlterados];
    const afetada = conferenciasAfetadas(resumo.papeisAlterados);
    for (const c of args.conferencias) {
      (afetada(c.nome) ? resumo.conferenciasAfetadas : resumo.conferenciasNaoAfetadas).push(c.nome);
    }

    await registrarEvento({
      processoCodigo, assuntoId, tipo: "compatibilizacao", usuarioId,
      titulo: `Compatibilização — ${resumo.conferenciasAfetadas.length} análise(s) afetada(s) por esta correção`,
      detalhe: {
        papeisAlterados: resumo.papeisAlterados,
        camposAfetados: [...camposAfetados(resumo.papeisAlterados)],
        afetadas: resumo.conferenciasAfetadas,
        naoAfetadas: resumo.conferenciasNaoAfetadas,
      },
    });

    return resumo;
  } catch (err) {
    console.warn("[MHD] falha ao registrar leitura (a leitura em si não foi afetada):", err);
    return vazio;
  }
}
