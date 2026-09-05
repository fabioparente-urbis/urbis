/**
 * lib/urbi/perguntasPilha.ts — Camada 2 da arquitetura mestra do URBI (05/09/2026): perguntas
 * factuais ricas sobre a Pilha ("quais têm onerosa?", "quais são do Setor Bueno?", "quais estão
 * na 3ª análise?", "qual está mais perto de emitir?"), respondidas 100% em código a partir dos
 * retratos já prontos (urbi_radar_retratos.campos_consulta) — NUNCA Gemini, nunca escolhe/decide
 * processo nenhum sozinho (só filtra/ordena o que o analista pediu).
 *
 * "Mais perto de emitir" é calculado AQUI, na hora da pergunta — nunca persistido, nunca uma
 * nota oculta — a partir do "esforco" do Motor de Produção (já existente em cada retrato) e do
 * número de pendências, com o critério declarado por extenso na própria resposta.
 *
 * Reconhecimento de linguagem natural: um pequeno conjunto de padrões (mesmo espírito de
 * lib/urbi/navegacao.ts, mas pra PERGUNTA factual, não pra comando de navegação). Pergunta que
 * não casa nenhum padrão devolve `null` — quem chama decide o que fazer (hoje: cai no fluxo
 * normal do chat).
 */
import { obterUltimosRetratosVisiveis, type VisibilidadeUsuario, type RetratoConsultavel } from "./radar";
import { nomeHumanoDoSlot } from "./contratoResposta";
import type { AtributoFactual } from "./catalogoConsultaPilha";

const LIMITE_LISTA = 15;

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function listarCodigos(retratos: RetratoConsultavel[]): string {
  return retratos.slice(0, LIMITE_LISTA).map((r) => `${r.processo_codigo} (${nomeHumanoDoSlot(r.tipo_processo)})`).join(", ")
    + (retratos.length > LIMITE_LISTA ? ` … e mais ${retratos.length - LIMITE_LISTA}` : "");
}

function contarIndisponiveis(retratos: RetratoConsultavel[], extrair: (c: NonNullable<RetratoConsultavel["campos_consulta"]>) => AtributoFactual<any> | undefined): number {
  return retratos.filter((r) => !r.campos_consulta || !extrair(r.campos_consulta)?.disponivel).length;
}

/** Frase padrão declarando quantos processos ficaram de fora por falta de dado — nunca escondida. */
function fraseIndisponiveis(n: number, atributo: string): string {
  return n > 0 ? ` (${n} processo(s) sem "${atributo}" disponível, não entraram na conta.)` : "";
}

const ORDEM_ORDINAL: Record<string, number> = {
  primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5, sexta: 6, setima: 7, oitava: 8,
};

export async function responderPerguntaPilha(mensagem: string, usuario: VisibilidadeUsuario): Promise<string | null> {
  const t = normalizar(mensagem);

  // ── retorno da gerência — sempre indisponível hoje, responde sem nem consultar retrato ──────
  if (/retorn\w*.{0,15}ger[êe]ncia/.test(t)) {
    return 'Base insuficiente: não existe, no sistema atual, nenhuma tabela ou tag que registre "retorno da gerência" — nunca vou inventar esse dado. Se essa informação passar a existir (ex.: um novo tipo de tag), aviso.';
  }

  // ── onerosa ──────────────────────────────────────────────────────────────────────────────
  if (/\bonerosa\b/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const comOnerosa = retratos.filter((r) => r.campos_consulta?.onerosa.disponivel && r.campos_consulta.onerosa.valor === true);
    const indisp = contarIndisponiveis(retratos, (c) => c.onerosa);
    return comOnerosa.length > 0
      ? `${comOnerosa.length} processo(s) com Onerosa = Sim: ${listarCodigos(comOnerosa)}.${fraseIndisponiveis(indisp, "Onerosa")}\nFonte: LIP — campo de Onerosa por slot (rótulo "Tem Onerosa?"/"Outorga Onerosa?", conforme o slot).`
      : `Nenhum processo visível com Onerosa = Sim agora.${fraseIndisponiveis(indisp, "Onerosa")}`;
  }

  // ── pavimentos ───────────────────────────────────────────────────────────────────────────
  const matchPav = t.match(/(\d+)\s*pavimentos?/);
  if (matchPav) {
    const n = Number(matchPav[1]);
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const comN = retratos.filter((r) => r.campos_consulta?.pavimentos.disponivel && r.campos_consulta.pavimentos.valor === n);
    const indisp = contarIndisponiveis(retratos, (c) => c.pavimentos);
    return comN.length > 0
      ? `${comN.length} processo(s) com ${n} pavimento(s): ${listarCodigos(comN)}.${fraseIndisponiveis(indisp, "Número de Pavimentos")}\nFonte: LIP — Número de Pavimentos.`
      : `Nenhum processo visível com ${n} pavimento(s) agora.${fraseIndisponiveis(indisp, "Número de Pavimentos")}`;
  }

  // ── bairro / setor ───────────────────────────────────────────────────────────────────────
  const matchBairro = mensagem.match(/\b(?:setor|bairro)\s+([a-zà-úA-ZÀ-Ú][a-zà-úA-ZÀ-Ú\s]{1,30})/i);
  if (matchBairro) {
    const nomeBuscado = normalizar(matchBairro[0].replace(/^(setor|bairro)\s+/i, ""));
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const doBairro = retratos.filter((r) => r.campos_consulta?.bairro.disponivel && normalizar(String(r.campos_consulta.bairro.valor)).includes(nomeBuscado));
    const indisp = contarIndisponiveis(retratos, (c) => c.bairro);
    return doBairro.length > 0
      ? `${doBairro.length} processo(s) no bairro/setor "${matchBairro[1].trim()}": ${listarCodigos(doBairro)}.${fraseIndisponiveis(indisp, "Bairro")}\nFonte: LIP — Bairro.`
      : `Nenhum processo visível no bairro/setor "${matchBairro[1].trim()}" agora.${fraseIndisponiveis(indisp, "Bairro")}`;
  }

  // ── Nª análise (terceira análise, 3ª análise, análise 3...) ─────────────────────────────
  const matchAnaliseOrdinal = t.match(/\b(primeira|segunda|terceira|quarta|quinta|sexta|setima|oitava)\s*an[áa]lise\b/);
  const matchAnaliseNumero = t.match(/\b(\d+)\s*(?:a|ª)?\s*an[áa]lise\b|an[áa]lise\s*(?:n[ºo°]?\s*)?(\d+)\b/);
  const numeroAnalisePedido = matchAnaliseOrdinal ? ORDEM_ORDINAL[matchAnaliseOrdinal[1]] : matchAnaliseNumero ? Number(matchAnaliseNumero[1] ?? matchAnaliseNumero[2]) : null;
  if (numeroAnalisePedido) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const naAnalise = retratos.filter((r) => r.campos_consulta?.analise_atual.disponivel && r.campos_consulta.analise_atual.valor === numeroAnalisePedido);
    const indisp = contarIndisponiveis(retratos, (c) => c.analise_atual);
    return naAnalise.length > 0
      ? `${naAnalise.length} processo(s) na ${numeroAnalisePedido}ª análise: ${listarCodigos(naAnalise)}.${fraseIndisponiveis(indisp, "análise atual")}\nFonte: MAC — analises_mac (última passada).`
      : `Nenhum processo visível na ${numeroAnalisePedido}ª análise agora.${fraseIndisponiveis(indisp, "análise atual")}`;
  }

  // ── indeferidos no ano ───────────────────────────────────────────────────────────────────
  if (/indeferid/.test(t) && /\bano\b|\b(19|20)\d{2}\b/.test(t)) {
    const anoMatch = t.match(/\b(19|20)\d{2}\b/);
    const ano = anoMatch ? Number(anoMatch[0]) : new Date().getFullYear();
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const indeferidos = retratos.filter((r) => r.campos_consulta?.situacao_geral.valor === "Arquivado/indeferido");
    const comData = indeferidos.filter((r) => r.campos_consulta?.data_indeferimento.disponivel);
    const noAno = comData.filter((r) => new Date(String(r.campos_consulta!.data_indeferimento.valor)).getFullYear() === ano);
    const semData = indeferidos.length - comData.length;
    const semDataTexto = semData > 0 ? ` ${semData} processo(s) estão indeferidos mas sem data de indeferimento confiável registrada (não entraram nesta contagem por ano).` : "";
    return noAno.length > 0
      ? `${noAno.length} processo(s) indeferido(s) em ${ano}: ${listarCodigos(noAno)}.${semDataTexto}\nFonte: Processo — tag de indeferimento/arquivamento (processos.tags).`
      : `Nenhum processo visível indeferido em ${ano} com data confiável.${semDataTexto}`;
  }

  // ── "mais perto de emitir" — calculado AGORA, critério visível, nunca persistido ─────────
  if (/mais perto de emitir|mais f[áa]cil de emitir|mais simples (?:para|pra) emitir/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const ORDEM_ESFORCO: Record<string, number> = { rapido: 0, exige_atencao: 1, depende_documento: 2, base_insuficiente: 3 };
    const comDado = retratos.filter((r) => r.alertas?.esforco && r.campos_consulta?.pendencias.disponivel);
    const ordenados = [...comDado].sort((a, b) => {
      const ea = ORDEM_ESFORCO[a.alertas.esforco] ?? 9, eb = ORDEM_ESFORCO[b.alertas.esforco] ?? 9;
      if (ea !== eb) return ea - eb;
      return (a.campos_consulta!.pendencias.valor ?? 99) - (b.campos_consulta!.pendencias.valor ?? 99);
    });
    const top = ordenados.slice(0, 5);
    if (top.length === 0) return "Base insuficiente: nenhum processo visível tem esforço provável e contagem de pendências calculados ainda (Radar ainda preparando os retratos).";
    const linhas = top.map((r, i) => {
      const rotuloEsforco: Record<string, string> = { rapido: "Rápido", exige_atencao: "Exige atenção", depende_documento: "Depende de documento", base_insuficiente: "Base insuficiente" };
      return `${i + 1}. ${r.processo_codigo} (${nomeHumanoDoSlot(r.tipo_processo)}) — esforço "${rotuloEsforco[r.alertas.esforco] ?? r.alertas.esforco}", ${r.campos_consulta!.pendencias.valor} pendência(s).`;
    });
    return `Mais perto de emitir (critério: esforço provável do Motor de Produção, do "Rápido" pro "Base insuficiente", depois menor número de pendências):\n${linhas.join("\n")}`;
  }

  // ── linha de evidência: retornaram sem resultado / reincidiram / aguardam conferência / ──────
  // pendência repetida — sempre a partir de `linha_evidencia` já pronto no retrato, nunca um
  // cálculo novo (mesma regra de reaproveitamento das perguntas acima).
  if (/retornaram? sem resultado|retorno sem resultado/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const achados = retratos.filter((r) => (r.linha_evidencia?.registros ?? []).some((reg) => reg.resultado === "sem_marcacao_posterior"));
    return achados.length > 0
      ? `${achados.length} processo(s) com retorno identificado mas sem resultado atribuível a uma exigência específica: ${listarCodigos(achados)}.\nFonte: linha de evidência (BDI — vw_bdi_aguardando_retorno + vw_bdi_retrabalho_por_passada).`
      : "Nenhum processo visível com retorno sem resultado atribuível agora.";
  }

  if (/reincidiram?|reincid[êe]ncia/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const achados = retratos.filter((r) => (r.linha_evidencia?.registros ?? []).some((reg) => reg.resultado === "reincidiu"));
    return achados.length > 0
      ? `${achados.length} processo(s) com item reincidente (voltou a não conforme após análise posterior): ${listarCodigos(achados)}.\nFonte: linha de evidência (BDI — vw_bdi_retrabalho_por_passada).`
      : "Nenhum processo visível com item reincidente agora.";
  }

  if (/aguardam? conferência|aguardam? confer[êe]ncia|aguardando confer[êe]ncia/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const achados = retratos.filter((r) => (r.linha_evidencia?.registros ?? []).some((reg) => reg.resultado === "sem_marcacao_posterior" || (reg.resultado === "permanece_pendente" && reg.retorno_identificado)));
    return achados.length > 0
      ? `${achados.length} processo(s) com retorno identificado que ainda aguardam nova conferência MAC: ${listarCodigos(achados)}.\nFonte: linha de evidência.`
      : "Nenhum processo visível aguardando conferência após retorno agora.";
  }

  if (/pend[êe]ncia repetida|pendencia repetida|exig[êe]ncia recorrente/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const achados = retratos.filter((r) => (r.linha_evidencia?.registros ?? []).filter((reg) => reg.resultado === "reincidiu").length > 1);
    return achados.length > 0
      ? `${achados.length} processo(s) com exigência recorrente entre passadas (mais de uma reincidência): ${listarCodigos(achados)}.\nFonte: linha de evidência (BDI — vw_bdi_retrabalho_por_passada).`
      : "Nenhum processo visível com exigência recorrente agora.";
  }

  // ── previsão de tempo (Fase 4, 05/09/2026) — nunca inventa certeza; "menor previsão" só
  // ordena quem JÁ tem estimativa numérica (nunca compara com quem está suspenso/insuficiente).
  if (/menor previs[ãa]o|previs[ãa]o de tempo|quanto tempo/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const comEstimativa = retratos.filter((r) => r.previsao_tempo?.status === "estimativa") as (RetratoConsultavel & { previsao_tempo: { status: "estimativa"; minDias: number; maxDias: number; confianca: string; amostra: number; fonte: string } })[];
    const semEstimativa = retratos.length - comEstimativa.length;
    if (comEstimativa.length === 0) {
      return `Base insuficiente: nenhum processo visível tem histórico suficiente pra estimar tempo hoje (amostra real ainda pequena — cresce conforme mais processos são concluídos).${semEstimativa > 0 ? ` ${semEstimativa} processo(s) sem estimativa (suspenso por documento ou amostra insuficiente).` : ""}`;
    }
    const ordenados = [...comEstimativa].sort((a, b) => a.previsao_tempo.minDias - b.previsao_tempo.minDias);
    const top = ordenados.slice(0, 5);
    const linhas = top.map((r, i) => `${i + 1}. ${r.processo_codigo} (${nomeHumanoDoSlot(r.tipo_processo)}) — ${r.previsao_tempo.minDias}–${r.previsao_tempo.maxDias} dia(s), confiança ${r.previsao_tempo.confianca}, ${r.previsao_tempo.amostra} caso(s) comparável(is).`);
    return `Menor previsão de tempo (só entre quem tem estimativa numérica — ${semEstimativa} processo(s) ficaram de fora por base insuficiente ou suspensão por documento):\n${linhas.join("\n")}\nFonte: BDI — vw_bdi_tempo_etapas.`;
  }

  if (/dependem? de documento|aguardam? documento do interessado/.test(t)) {
    const retratos = await obterUltimosRetratosVisiveis(usuario);
    const achados = retratos.filter((r) => r.previsao_tempo?.status === "suspensa");
    return achados.length > 0
      ? `${achados.length} processo(s) com previsão suspensa por depender de documento do interessado: ${listarCodigos(achados)}.\nFonte: Motor de Produção (esforço "depende_documento").`
      : "Nenhum processo visível com previsão suspensa por documento agora.";
  }

  return null;
}
