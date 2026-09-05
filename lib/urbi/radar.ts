/**
 * lib/urbi/radar.ts — Radar silencioso incremental da Pilha (Camada 1 da arquitetura mestra do
 * URBI, 05/09/2026).
 *
 * ── DESENHO (o menor que ficou confiável, depois da auditoria) ──────────────────────────────
 * Não existe NENHUM trigger/evento em LIP/MAC/MDP/documento neste banco (auditado antes de
 * escrever isto), e criar um exigiria tocar rota de escrita de todo slot — proibido. A detecção
 * de mudança é por DIFF DE TIMESTAMP: cada processo tem um "watermark" = o maior
 * atualizado_em/criado_em entre processos/analises_mac/mdp_registros/mac_historico/
 * mhd_documentos. Se o watermark atual é mais novo que o do último retrato, o processo mudou —
 * enfileira. ZERO alteração em rota de escrita de slot nenhum; isto só LÊ timestamp que já existia.
 *
 * Todas as consultas de detecção são EM LOTE (uma por tabela-fonte, para até 200 códigos de uma
 * vez), nunca uma consulta por processo — é a diferença entre ~5 consultas e ~1000 a cada tick.
 *
 * A tabela `urbi_radar_retratos` é ao mesmo tempo o HISTÓRICO (uma linha por versão) e a FILA
 * (linhas com estado='pendente'/'em_atualizacao') — um mecanismo só.
 *
 * REGRA DO FÁBIO: "reutilize a mesma função factual do dossiê, para não divergir contagens,
 * situações ou alertas". Por isso `processarProximoPendente` só PROJETA o que
 * `montarDossieFactual` (lib/urbi/montarDossie.ts) e `montarRelatorioMotor`
 * (lib/urbi/motorProducao.ts) já calculam — nenhum número novo é calculado aqui.
 *
 * NUNCA chama Gemini. NUNCA escreve em LIP/MAC/MDP/documento/despacho/numeração — só lê essas
 * fontes e grava só nesta tabela própria.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarDossieFactual } from "./montarDossie";
import { montarRelatorioMotor } from "./motorProducao";
import { montarBlocoAtributosConsultaveis } from "./catalogoConsultaPilha";
import { montarLinhaEvidenciaExigencias, alertasLinhaEvidencia, type BlocoLinhaEvidencia } from "./linhaEvidencia";
import { obterProcessosEmAtendimento } from "./atendimento";
import { preverCicloCompleto } from "./previsao";

/**
 * Versão do CONTRATO do retrato (Fase 3, 05/09/2026) — incrementar em código sempre que o
 * FORMATO do que é calculado mudar de verdade (campo novo, mudança de regra), nunca a cada
 * execução. Não confundir com `versao` (número sequencial de recálculo do MESMO processo).
 * Subiu pra 2 na Fase 4 (05/09/2026): retrato ganhou o campo `previsao_tempo`. Subiu pra 3 na
 * Fase 6 (05/09/2026): retrato ganhou o campo `pendencias_sem_bip`.
 */
const VERSAO_CONTRATO_RETRATO = 3;

export type VisibilidadeUsuario = {
  userId: string;
  irrestrito: boolean;
  gerencia: string | null;
  perfis?: string[];
};

type ProcessoVisivel = { codigo: string; tipo_processo: string | null };

/**
 * MESMA regra de visibilidade de `/api/processos/route.ts` (Admin/Diretora → tudo; gerente →
 * analistas da própria gerência; analista → só os próprios) — reproduzida aqui, não importada:
 * isolamento entre módulos é regra deste projeto, e a rota da Pilha é operação crítica demais
 * pra acoplar uma dependência nova nela só pro Radar reaproveitar uma função.
 */
async function processosVisiveis(usuario: VisibilidadeUsuario, limite: number): Promise<ProcessoVisivel[]> {
  let query = supabaseAdmin
    .from("processos")
    .select("codigo, tipo_processo")
    .is("excluido_em", null)
    .order("atualizado_em", { ascending: false })
    .limit(limite);

  if (usuario.irrestrito) {
    // Admin/Diretora veem tudo — sem filtro extra.
  } else if (usuario.gerencia) {
    const { data: idsUsuarios } = await supabaseAdmin.from("usuarios").select("id").eq("gerencia", usuario.gerencia);
    const idList = (idsUsuarios ?? []).map((u: any) => u.id);
    query = idList.length > 0 ? query.in("analista_id", idList) : query.eq("analista_id", usuario.userId);
  } else {
    query = query.eq("analista_id", usuario.userId);
  }

  const { data, error } = await query;
  if (error) { console.error("[radar] falha ao listar processos visíveis:", error.message); return []; }
  return (data ?? []) as ProcessoVisivel[];
}

/**
 * Watermark de TODOS os códigos de uma vez — 6 consultas em lote (uma por tabela-fonte), nunca
 * uma consulta por processo. `.in()` com até 200 códigos fica bem dentro do limite do PostgREST.
 *
 * Fase 3 (05/09/2026, mandato de 12 fases): `mac_checklist_itens_historico` (mudança de catálogo
 * — item criado/atualizado/desativado/reativado, já grava `tipo_processo` desde 03/09) entra como
 * 6ª fonte, escopada por `tipo_processo` — uma mudança de catálogo só invalida os retratos dos
 * processos DO MESMO SLOT, nunca a Pilha inteira. `tipoPorCodigo` precisa vir de quem já carregou
 * essa informação (nunca uma consulta nova só pra isto).
 */
async function calcularWatermarksEmLote(codigos: string[], tipoPorCodigo: Map<string, string | null>): Promise<Map<string, Date>> {
  const maiores = new Map<string, number>();
  const bump = (codigo: string | null | undefined, iso: string | null | undefined) => {
    if (!codigo || !iso) return;
    const t = new Date(iso).getTime();
    const atual = maiores.get(codigo);
    if (atual === undefined || t > atual) maiores.set(codigo, t);
  };

  const tiposEnvolvidos = [...new Set([...tipoPorCodigo.values()].filter((t): t is string => !!t))];
  const [procs, analises, mdps, historicos, mhds, catalogo] = await Promise.all([
    supabaseAdmin.from("processos").select("codigo, atualizado_em").in("codigo", codigos).is("excluido_em", null),
    supabaseAdmin.from("analises_mac").select("processo_codigo, atualizado_em").in("processo_codigo", codigos).is("excluido_em", null),
    supabaseAdmin.from("mdp_registros").select("processo_codigo, criado_em").in("processo_codigo", codigos),
    supabaseAdmin.from("mac_historico").select("processo_codigo, criado_em").in("processo_codigo", codigos),
    supabaseAdmin.from("mhd_documentos").select("processo_codigo, atualizado_em").in("processo_codigo", codigos),
    tiposEnvolvidos.length > 0
      ? supabaseAdmin.from("mac_checklist_itens_historico").select("tipo_processo, criado_em").in("tipo_processo", tiposEnvolvidos)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  for (const r of (procs.data ?? []) as any[]) bump(r.codigo, r.atualizado_em);
  for (const r of (analises.data ?? []) as any[]) bump(r.processo_codigo, r.atualizado_em);
  for (const r of (mdps.data ?? []) as any[]) bump(r.processo_codigo, r.criado_em);
  for (const r of (historicos.data ?? []) as any[]) bump(r.processo_codigo, r.criado_em);
  for (const r of (mhds.data ?? []) as any[]) bump(r.processo_codigo, r.atualizado_em);

  // Maior criado_em de mudança de catálogo POR tipo_processo — depois aplicado a cada código
  // daquele tipo (uma mudança no modelo de Regularização nunca invalida retrato de Slot 5).
  const maiorMudancaCatalogoPorTipo = new Map<string, number>();
  for (const r of (catalogo.data ?? []) as any[]) {
    if (!r.tipo_processo || !r.criado_em) continue;
    const t = new Date(r.criado_em).getTime();
    const atual = maiorMudancaCatalogoPorTipo.get(r.tipo_processo);
    if (atual === undefined || t > atual) maiorMudancaCatalogoPorTipo.set(r.tipo_processo, t);
  }
  for (const [codigo, tipo] of tipoPorCodigo) {
    if (!tipo) continue;
    const t = maiorMudancaCatalogoPorTipo.get(tipo);
    if (t === undefined) continue;
    const atual = maiores.get(codigo);
    if (atual === undefined || t > atual) maiores.set(codigo, t);
  }

  const saida = new Map<string, Date>();
  for (const [codigo, t] of maiores) saida.set(codigo, new Date(t));
  return saida;
}

/** Qual fonte mudou pra ESTE processo, em linguagem curta — só chamado pra quem de fato vai ser
 *  enfileirado (poucos, tipicamente), nunca pra todos os visíveis. */
async function motivoDaMudanca(codigo: string, desde: Date | null, tipoProcesso: string | null): Promise<string> {
  if (!desde) return "nunca analisado";
  const limiar = desde.toISOString();
  const [proc, analises, mdp, historico, mhd, catalogo] = await Promise.all([
    supabaseAdmin.from("processos").select("id").eq("codigo", codigo).is("excluido_em", null).gt("atualizado_em", limiar).limit(1),
    supabaseAdmin.from("analises_mac").select("id").eq("processo_codigo", codigo).is("excluido_em", null).gt("atualizado_em", limiar).limit(1),
    supabaseAdmin.from("mdp_registros").select("id").eq("processo_codigo", codigo).gt("criado_em", limiar).limit(1),
    supabaseAdmin.from("mac_historico").select("analise_id").eq("processo_codigo", codigo).gt("criado_em", limiar).limit(1),
    supabaseAdmin.from("mhd_documentos").select("id").eq("processo_codigo", codigo).gt("atualizado_em", limiar).limit(1),
    tipoProcesso
      ? supabaseAdmin.from("mac_checklist_itens_historico").select("id").eq("tipo_processo", tipoProcesso).gt("criado_em", limiar).limit(1)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const partes: string[] = [];
  if ((proc.data ?? []).length > 0) partes.push("LIP/tags");
  if ((analises.data ?? []).length > 0) partes.push("MAC");
  if ((mdp.data ?? []).length > 0) partes.push("MDP");
  if ((historico.data ?? []).length > 0) partes.push("histórico do MAC");
  if ((mhd.data ?? []).length > 0) partes.push("documento (MHD)");
  if ((catalogo.data ?? []).length > 0) partes.push("mudança de catálogo (MAC)");
  return partes.length > 0 ? `alterado: ${partes.join(", ")}` : "alterado (fonte não identificada individualmente)";
}

/**
 * Varre os processos visíveis a este usuário e enfileira (insere retrato 'pendente') qualquer um
 * cujo watermark seja mais novo que o último retrato — ou que nunca tenha sido analisado. Nunca
 * duplica: pula processo que já tem linha 'pendente'/'em_atualizacao' em aberto. Custo: ~7
 * consultas EM LOTE no total (não por processo), mais 1 consulta por processo recém-enfileirado
 * (tipicamente poucos), pra saber qual fonte mudou.
 */
export async function detectarMudancas(usuario: VisibilidadeUsuario, limite = 200): Promise<{ verificados: number; enfileirados: number }> {
  const processos = await processosVisiveis(usuario, limite);
  if (processos.length === 0) return { verificados: 0, enfileirados: 0 };
  const codigos = processos.map((p) => p.codigo);
  const tipoPorCodigo = new Map(processos.map((p) => [p.codigo, p.tipo_processo]));

  const [{ data: emAberto }, { data: ultimos }, watermarksAtuais] = await Promise.all([
    supabaseAdmin.from("urbi_radar_retratos").select("processo_codigo").in("processo_codigo", codigos).in("estado", ["pendente", "em_atualizacao"]),
    supabaseAdmin.from("urbi_radar_retratos").select("processo_codigo, versao, watermark_fontes").in("processo_codigo", codigos).order("versao", { ascending: false }),
    calcularWatermarksEmLote(codigos, tipoPorCodigo),
  ]);

  const codigosEmAberto = new Set((emAberto ?? []).map((r: any) => r.processo_codigo));
  const ultimoPorCodigo = new Map<string, { versao: number; watermark_fontes: string | null }>();
  for (const linha of (ultimos ?? []) as any[]) {
    if (!ultimoPorCodigo.has(linha.processo_codigo)) ultimoPorCodigo.set(linha.processo_codigo, linha);
  }

  let enfileirados = 0;
  for (const codigo of codigos) {
    if (codigosEmAberto.has(codigo)) continue;
    const ultimo = ultimoPorCodigo.get(codigo);
    const watermarkAtual = watermarksAtuais.get(codigo) ?? null;
    const watermarkRetrato = ultimo?.watermark_fontes ? new Date(ultimo.watermark_fontes) : null;
    const mudou = !ultimo || !watermarkRetrato || (watermarkAtual && watermarkAtual > watermarkRetrato);
    if (!mudou) continue;

    const motivo = await motivoDaMudanca(codigo, watermarkRetrato, tipoPorCodigo.get(codigo) ?? null);
    const { error } = await supabaseAdmin.from("urbi_radar_retratos").insert({
      processo_codigo: codigo, tipo_processo: tipoPorCodigo.get(codigo) ?? null,
      versao: (ultimo?.versao ?? 0) + 1, estado: "pendente", motivo_disparo: motivo,
    });
    if (!error) enfileirados++;
    else console.error(`[radar] falha ao enfileirar ${codigo}:`, error.message);
  }

  return { verificados: processos.length, enfileirados };
}

/**
 * Categorias humanas de fonte usadas neste retrato — coarse, nunca o detalhe por campo (isso já
 * existe em lib/urbi/manifestoFontes.ts, pra dentro da conversa; aqui é só rótulo de cobertura).
 */
function fontesDoRetrato(d: Record<string, any>): string[] {
  const fontes: string[] = [];
  if (Object.keys(d.lip?.campos_tecnicos ?? {}).length > 0) fontes.push("LIP");
  if ((d.mac?.numero_analises ?? 0) > 0) fontes.push("MAC");
  if ((d.fluxo?.documentos_emitidos ?? []).length > 0 || (d.fluxo?.documentos_mhd ?? []).length > 0) fontes.push("Documentos");
  if ((d.cruzamentos ?? []).length > 0) fontes.push("Cruzamento");
  const temBip = (d.mac?.pendencias_ultima_analise ?? []).some((p: any) => (p.vinculos_bip ?? []).length > 0);
  if (temBip) fontes.push("BIP");
  return fontes;
}

/** Watermark de UM processo — só usado depois de já saber que ele vai ser processado agora. */
async function calcularWatermarkUnico(codigo: string, tipoProcesso: string | null): Promise<Date | null> {
  const mapa = await calcularWatermarksEmLote([codigo], new Map([[codigo, tipoProcesso]]));
  return mapa.get(codigo) ?? null;
}

/**
 * Processa UM item pendente (o mais antigo, entre os visíveis a este usuário) — reivindica com
 * update condicional (nunca dois processos ao mesmo tempo pegam a mesma linha), roda o dossiê e
 * o motor JÁ EXISTENTES, grava o retrato. Nunca lança: falha vira estado='erro' na própria linha.
 */
export async function processarProximoPendente(
  usuario: VisibilidadeUsuario,
): Promise<{ processado: boolean; codigo?: string; estado?: string }> {
  const processos = await processosVisiveis(usuario, 200);
  const codigosVisiveis = processos.map((p) => p.codigo);
  if (codigosVisiveis.length === 0) return { processado: false };

  // "Atendimento ativo" (Fase 2, lib/urbi/atendimento.ts) — nunca pausa o Radar inteiro, só pula
  // o(s) processo(s) que um analista tem aberto agora, pra não recalcular dossiê/motor por baixo
  // da leitura ao vivo dele. Busca alguns candidatos a mais (não só 1) pra sempre ter uma opção
  // elegível mesmo se o mais antigo da fila estiver em atendimento.
  const emAtendimento = await obterProcessosEmAtendimento();
  const { data: candidatos } = await supabaseAdmin
    .from("urbi_radar_retratos")
    .select("id, processo_codigo, tipo_processo, versao")
    .eq("estado", "pendente")
    .in("processo_codigo", codigosVisiveis)
    .order("criado_em", { ascending: true })
    .limit(20);
  const alvo = (candidatos ?? []).find((c) => !emAtendimento.has(c.processo_codigo));
  if (!alvo) return { processado: false };

  // Reivindicação otimista: só avança se ESTA chamada foi quem mudou pendente→em_atualizacao.
  const { data: reivindicado } = await supabaseAdmin
    .from("urbi_radar_retratos")
    .update({ estado: "em_atualizacao", iniciado_em: new Date().toISOString() })
    .eq("id", alvo.id).eq("estado", "pendente")
    .select("id").maybeSingle();
  if (!reivindicado) return { processado: false }; // outra sessão já pegou este item

  const codigo = alvo.processo_codigo as string;
  try {
    const usuarioReq = { id: usuario.userId, perfis: usuario.perfis ?? [], gerencia: usuario.gerencia, irrestrito: usuario.irrestrito, gerenciaDoPerfil: null } as any;
    const resultado = await montarDossieFactual(codigo, usuarioReq);
    if (!resultado.ok) {
      await supabaseAdmin.from("urbi_radar_retratos").update({
        estado: "erro", erro: resultado.erro, concluido_em: new Date().toISOString(),
      }).eq("id", alvo.id);
      return { processado: true, codigo, estado: "erro" };
    }

    const d = resultado.data as any;
    const relatorio = montarRelatorioMotor(d);
    const watermarkFresco = await calcularWatermarkUnico(codigo, d.processo?.tipo_processo ?? alvo.tipo_processo ?? null);
    const coberturaCompleta = d.cobertura?.completo !== false;
    const marcacoes: any[] = Array.isArray(d.mac?.marcacoes_ultima_analise) ? d.mac.marcacoes_ultima_analise : [];

    // Tags cruas (o dossiê não expõe isso — só a situação já derivada) — só pra achar a data da
    // tag de indeferimento/arquivamento, dentro do bloco de atributos consultáveis abaixo.
    const { data: processoTags } = await supabaseAdmin.from("processos").select("tags").eq("codigo", codigo).maybeSingle();
    const tagsProcesso = Array.isArray((processoTags as any)?.tags) ? (processoTags as any).tags : [];
    const camposConsulta = montarBlocoAtributosConsultaveis(d, relatorio, tagsProcesso);
    const linhaEvidencia = await montarLinhaEvidenciaExigencias(codigo, d, tagsProcesso);
    const previsaoTempo = await preverCicloCompleto(d, relatorio);

    await supabaseAdmin.from("urbi_radar_retratos").update({
      estado: coberturaCompleta ? "atualizado" : "incompleto",
      // Achado real (testar_perguntas_pilha.mts): tipo_processo só era gravado no INSERT (fila) e
      // nunca reconferido aqui — se o enqueue tivesse chegado nulo por qualquer motivo, o retrato
      // ficava "slot não identificado" pra sempre, mesmo com o dossiê sabendo o slot certo. Agora
      // sempre reafirma a partir do MESMO dossiê fresco, nunca confia só no que foi enfileirado.
      tipo_processo: d.processo?.tipo_processo ?? alvo.tipo_processo ?? null,
      fontes_consultadas: fontesDoRetrato(d),
      situacao_geral: d.situacoes?.geral?.classe ?? null,
      situacao_lip: d.situacoes?.lip?.classe ?? null,
      situacao_mac: d.situacoes?.mac?.classe ?? null,
      campos_vazios: d.lip?.campos_vazios ?? null,
      campos_em_x: d.lip?.campos_em_x ?? null,
      campos_totais: d.lip?.campos_totais ?? null,
      pendencias_mac: (d.mac?.pendencias_ultima_analise ?? []).length,
      pendencias_sem_bip: (d.mac?.pendencias_ultima_analise ?? []).filter((p: any) => (p.vinculos_bip ?? []).length === 0).length,
      itens_em_branco_mac: marcacoes.filter((m) => m.status === "em_branco").length,
      alertas: relatorio,
      campos_consulta: camposConsulta,
      linha_evidencia: linhaEvidencia,
      previsao_tempo: previsaoTempo,
      versao_contrato: VERSAO_CONTRATO_RETRATO,
      cobertura_completa: coberturaCompleta,
      fontes_indisponiveis: d.cobertura?.fontes_indisponiveis ?? [],
      watermark_fontes: watermarkFresco ? watermarkFresco.toISOString() : new Date().toISOString(),
      concluido_em: new Date().toISOString(),
    }).eq("id", alvo.id);

    // Qualquer outro 'pendente' remanescente pro mesmo código (ex.: enfileirado de novo entre o
    // início e o fim deste processamento) fica obsoleto — este retrato fresco já reflete o
    // estado mais recente que dava pra capturar agora; a próxima detecção decide se mudou de novo.
    await supabaseAdmin.from("urbi_radar_retratos").delete()
      .eq("processo_codigo", codigo).eq("estado", "pendente").neq("id", alvo.id);

    return { processado: true, codigo, estado: coberturaCompleta ? "atualizado" : "incompleto" };
  } catch (e: any) {
    await supabaseAdmin.from("urbi_radar_retratos").update({
      estado: "erro", erro: e?.message ?? String(e), concluido_em: new Date().toISOString(),
    }).eq("id", alvo.id);
    return { processado: true, codigo, estado: "erro" };
  }
}

export type StatusRadar = {
  totalVisiveis: number;
  comRetratoAtualizado: number;
  pendentes: number;
  emAtualizacao: number;
  ultimaExecucaoEm: string | null;
  atualizadosUltimos15Min: number;
};

/** Só leitura — nunca decide nem analisa processo nenhum sozinho (Home/Pilha só CONSULTAM isto). */
export type RetratoConsultavel = {
  processo_codigo: string;
  tipo_processo: string | null;
  campos_consulta: import("./catalogoConsultaPilha").BlocoAtributosConsultaveis | null;
  alertas: any;
  linha_evidencia: BlocoLinhaEvidencia | null;
  previsao_tempo: import("./previsao").PrevisaoTempo | null;
  pendencias_sem_bip: number | null;
  motivo_disparo: string | null;
  concluido_em: string | null;
};

/**
 * Último retrato de CADA processo visível a este usuário, com o bloco de atributos consultáveis
 * — usado por lib/urbi/perguntasPilha.ts (Camada 2). Só leitura, nunca escolhe/analisa processo
 * nenhum por conta própria (quem decide o QUE filtrar é a pergunta do analista).
 */
export async function obterUltimosRetratosVisiveis(usuario: VisibilidadeUsuario, limite = 200): Promise<RetratoConsultavel[]> {
  const processos = await processosVisiveis(usuario, limite);
  const codigos = processos.map((p) => p.codigo);
  if (codigos.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("urbi_radar_retratos")
    .select("processo_codigo, tipo_processo, campos_consulta, alertas, linha_evidencia, previsao_tempo, pendencias_sem_bip, motivo_disparo, concluido_em, versao")
    .in("processo_codigo", codigos)
    .in("estado", ["atualizado", "incompleto"])
    .order("versao", { ascending: false });

  const vistos = new Set<string>();
  const saida: RetratoConsultavel[] = [];
  for (const linha of (data ?? []) as any[]) {
    if (vistos.has(linha.processo_codigo)) continue;
    vistos.add(linha.processo_codigo);
    saida.push({
      processo_codigo: linha.processo_codigo, tipo_processo: linha.tipo_processo, campos_consulta: linha.campos_consulta,
      alertas: linha.alertas, linha_evidencia: linha.linha_evidencia ?? null, previsao_tempo: linha.previsao_tempo ?? null,
      pendencias_sem_bip: linha.pendencias_sem_bip ?? null, motivo_disparo: linha.motivo_disparo ?? null, concluido_em: linha.concluido_em ?? null,
    });
  }
  return saida;
}

export async function obterStatusRadar(usuario: VisibilidadeUsuario): Promise<StatusRadar> {
  const processos = await processosVisiveis(usuario, 200);
  const codigos = processos.map((p) => p.codigo);
  if (codigos.length === 0) {
    return { totalVisiveis: 0, comRetratoAtualizado: 0, pendentes: 0, emAtualizacao: 0, ultimaExecucaoEm: null, atualizadosUltimos15Min: 0 };
  }

  // Último retrato de CADA processo (maior versão) — feito em memória: a lista de processos
  // visíveis já é pequena (≤200), então não vale a complexidade de uma query agregada por SQL.
  const { data: linhas } = await supabaseAdmin
    .from("urbi_radar_retratos")
    .select("processo_codigo, versao, estado, concluido_em")
    .in("processo_codigo", codigos)
    .order("versao", { ascending: false });

  const ultimoPorCodigo = new Map<string, { estado: string; concluido_em: string | null }>();
  for (const linha of (linhas ?? []) as any[]) {
    if (!ultimoPorCodigo.has(linha.processo_codigo)) {
      ultimoPorCodigo.set(linha.processo_codigo, { estado: linha.estado, concluido_em: linha.concluido_em });
    }
  }

  let comRetratoAtualizado = 0, pendentes = 0, emAtualizacao = 0;
  let ultimaExecucaoEm: string | null = null;
  const quinzeMinAtras = Date.now() - 15 * 60 * 1000;
  let atualizadosUltimos15Min = 0;
  for (const info of ultimoPorCodigo.values()) {
    if (info.estado === "atualizado" || info.estado === "incompleto") comRetratoAtualizado++;
    if (info.estado === "pendente") pendentes++;
    if (info.estado === "em_atualizacao") emAtualizacao++;
    if (info.concluido_em) {
      if (!ultimaExecucaoEm || info.concluido_em > ultimaExecucaoEm) ultimaExecucaoEm = info.concluido_em;
      if (new Date(info.concluido_em).getTime() >= quinzeMinAtras) atualizadosUltimos15Min++;
    }
  }
  // Processo sem NENHUM retrato ainda conta como pendente implícito (nunca analisado).
  pendentes += codigos.length - ultimoPorCodigo.size;

  return { totalVisiveis: codigos.length, comRetratoAtualizado, pendentes, emAtualizacao, ultimaExecucaoEm, atualizadosUltimos15Min };
}

// `formatarCartaoRadar` (cartão só com cobertura de retratos) foi substituído por
// `formatarCartaoRadarComJob` (lib/urbi/radarJob.ts), que combina a mesma cobertura com o
// estado do job de servidor — mantém a declaração honesta de "parcial"/"nunca rodou" e ainda
// avisa quando o agendamento parece atrasado.

/**
 * Fase 3 (05/09/2026) — "processo excluído deve sair da cobertura": um processo excluído
 * (`processos.excluido_em` preenchido) já não conta em `obterStatusRadar`/`processosVisiveis`
 * (ambos filtram por `excluido_em IS NULL`), mas uma linha 'pendente'/'em_atualizacao' gerada
 * ANTES da exclusão ficava órfã pra sempre — nunca reivindicada (não é mais um processo
 * visível), mas ainda aparecendo na "Fila pendente" do painel admin como se fosse trabalho real
 * a fazer. Chamado uma vez por tick do job (lib/urbi/radarJob.ts), nunca varre a Pilha inteira —
 * só olha o que já está pendente (fila é sempre pequena).
 */
export async function limparRetratosDeProcessosExcluidos(): Promise<number> {
  const { data: pendentes } = await supabaseAdmin
    .from("urbi_radar_retratos")
    .select("id, processo_codigo")
    .in("estado", ["pendente", "em_atualizacao"]);
  if (!pendentes || pendentes.length === 0) return 0;

  const codigos = [...new Set(pendentes.map((p: any) => p.processo_codigo))];
  const { data: ativos } = await supabaseAdmin.from("processos").select("codigo").in("codigo", codigos).is("excluido_em", null);
  const codigosAtivos = new Set((ativos ?? []).map((p: any) => p.codigo));
  const idsOrfaos = pendentes.filter((p: any) => !codigosAtivos.has(p.processo_codigo)).map((p: any) => p.id);
  if (idsOrfaos.length === 0) return 0;

  await supabaseAdmin.from("urbi_radar_retratos").delete().in("id", idsOrfaos);
  return idsOrfaos.length;
}

/** O retrato mais recente de um processo específico — usado quando o URBI abre DENTRO dele. */
export async function obterRetratoAtual(codigo: string) {
  const { data } = await supabaseAdmin
    .from("urbi_radar_retratos")
    .select("*")
    .eq("processo_codigo", codigo)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
