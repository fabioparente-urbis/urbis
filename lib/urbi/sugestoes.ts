import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { GrauDeCerteza } from "./dossieProcesso";

export type TipoSugestao =
  | "item_voltou_nao_conforme"
  | "documento_sem_registro"
  | "aguardando_retorno_base_insuficiente"
  | "incoerencia_lip_mac"
  | "divergencia_lip_documento"
  | "item_sem_base_juridica"
  | "catalogo_alterado_apos_analise";

export type SugestaoAutomatica = {
  tipo: TipoSugestao;
  /** Identifica a instância (item_id, número do documento, etc.) — chave de dedupe. */
  chave: string;
  sugestao: string;
  motivo_factual: string;
  campos_comparados: string[];
  fontes: string[];
  grau_certeza: GrauDeCerteza;
};

type DossieParaSugestoes = {
  mac?: {
    evolucao?: {
      itens_voltaram_nao_conforme?: { item_id: string; texto: string; quando: string; analise_id: string }[];
    };
    marcacoes_ultima_analise?: { item_id: string; texto: string; status: string }[];
  };
  fluxo?: {
    documentos_emitidos?: {
      numero: string;
      tipo: string;
      numero_analise: number;
      mdp_registrado: boolean;
      mrp_registrado: boolean;
    }[];
    aguardando_retorno?: { analise: number; situacao: string }[];
    analises?: {
      numero_analise: number;
      atualizado_em: string;
      numero_despacho: string | null;
      numero_parecer: string | null;
      numero_despacho_interno: string | null;
    }[];
  };
  lip?: {
    incoerencias?: { campo: string; explicacao: string }[];
  };
  cruzamentos?: {
    tipo: string;
    chave: string;
    resultado: string;
    motivo: string;
    campos_comparados: string[];
    fontes: string[];
  }[];
  tecnico?: {
    eventos_catalogo_recentes?: { item_id: string; acao: string; criado_em: string }[];
  } | null;
};

/**
 * Deriva sugestões/alertas SÓ de fatos que o próprio dossiê já calculou —
 * nenhuma IA decide o conteúdo aqui, é formatação de fato em estrutura
 * auditável (mesmo espírito de `lib/bdi/situacao.ts`: classificação com
 * motivo, nunca opinião solta). Pura — sem rede, sem banco — fácil de
 * testar com um dossiê de exemplo.
 */
export function derivarSugestoesAutomaticas(dossie: DossieParaSugestoes): SugestaoAutomatica[] {
  const saida: SugestaoAutomatica[] = [];

  // Análise mais recente do processo — usada como componente de dedupe por vários tipos abaixo
  // (Fase M, achado real: sem isso, um cruzamento como "divergência LIP×documento" ou "item sem
  // base jurídica" só grava UMA VEZ por processo pra sempre, porque a chave de dedupe
  // [processo_codigo,tipo,chave] não distinguia passada nenhuma — uma divergência corrigida e
  // reaberta numa análise posterior, ou um item que perde e reganha base jurídica entre
  // passadas, nunca geraria sugestão nova depois da primeira. `item_voltou_nao_conforme` e
  // `aguardando_retorno_base_insuficiente` já incluíam a análise na chave; os outros 3 tipos
  // não incluíam — corrigido aqui igualando o padrão, sem mudar NENHUM critério de quando uma
  // sugestão nasce, só de como ela é identificada entre passadas).
  const ultimaAnalise = dossie.fluxo?.analises?.length
    ? dossie.fluxo.analises[dossie.fluxo.analises.length - 1]
    : null;
  const sufixoPassada = ultimaAnalise ? `:analise-${ultimaAnalise.numero_analise}` : "";

  for (const item of dossie.mac?.evolucao?.itens_voltaram_nao_conforme ?? []) {
    saida.push({
      tipo: "item_voltou_nao_conforme",
      // Inclui a análise, não só o item: o mesmo item pode voltar a não
      // conforme em mais de uma passada (corrigido, voltou, corrigido de
      // novo, voltou de novo) — chave só por item_id colapsaria tudo na
      // primeira ocorrência e perderia a linha do tempo real.
      chave: `${item.item_id}:${item.analise_id}`,
      sugestao: `O item "${item.texto}" voltou a não conforme — estava resolvido numa passada anterior.`,
      motivo_factual: `mac_historico registra mudança para "nao_conforme" em ${item.quando}.`,
      campos_comparados: [item.item_id],
      fontes: ["mac_historico"],
      grau_certeza: "confirmado",
    });
  }

  for (const doc of dossie.fluxo?.documentos_emitidos ?? []) {
    if (doc.mdp_registrado && doc.mrp_registrado) continue;
    const faltando = [!doc.mdp_registrado ? "MDP" : null, !doc.mrp_registrado ? "MRP" : null]
      .filter(Boolean)
      .join(" e ");
    saida.push({
      tipo: "documento_sem_registro",
      chave: `${doc.tipo}:${doc.numero}`,
      sugestao: `O documento ${doc.tipo} nº ${doc.numero} (análise ${doc.numero_analise}) não tem registro em ${faltando}.`,
      motivo_factual: `mdp_registrado=${doc.mdp_registrado}, mrp_registrado=${doc.mrp_registrado}.`,
      campos_comparados: [doc.numero],
      fontes: ["mdp_registros", "mrp_registros"],
      grau_certeza: "confirmado",
    });
  }

  for (const r of dossie.fluxo?.aguardando_retorno ?? []) {
    if (r.situacao !== "base insuficiente") continue;
    saida.push({
      tipo: "aguardando_retorno_base_insuficiente",
      chave: `analise:${r.analise}`,
      sugestao: `Não há base suficiente para confirmar se o processo está aguardando o interessado desde a análise ${r.analise}.`,
      motivo_factual: `vw_bdi_aguardando_retorno classificou esta análise como "base insuficiente".`,
      campos_comparados: [`analise ${r.analise}`],
      fontes: ["vw_bdi_aguardando_retorno"],
      grau_certeza: "base_insuficiente",
    });
  }

  // Fase B — cruzamento determinístico (lib/urbi/cruzamento.ts). Só os 2 resultados que
  // merecem virar sugestão: divergência real (vale conferir) e item sem base jurídica
  // aprovada (fato confirmado — a ausência de vínculo é dado direto, não interpretação).
  for (const c of dossie.cruzamentos ?? []) {
    if (c.tipo === "lip_x_documento" && c.resultado === "possivel_divergencia") {
      saida.push({
        tipo: "divergencia_lip_documento",
        // Sem sufixo de passada, isto nunca gravaria uma 2ª vez pro mesmo campo — mesmo que a
        // divergência tivesse sido corrigida e reaberta numa análise posterior (achado de Fase M).
        chave: `${c.chave}${sufixoPassada}`,
        sugestao: `O campo "${c.chave}" do LIP diverge do que a leitura do documento encontrou. ${c.motivo}`,
        motivo_factual: c.motivo,
        campos_comparados: c.campos_comparados,
        fontes: c.fontes,
        grau_certeza: "vale_conferir",
      });
    } else if (c.tipo === "mac_item_x_bip" && c.resultado === "base_juridica_ausente") {
      saida.push({
        tipo: "item_sem_base_juridica",
        // Mesmo motivo do campo acima: um item pode ganhar vínculo BIP, perdê-lo de novo (vínculo
        // desaprovado) e voltar a ficar sem base jurídica numa passada posterior.
        chave: `${c.chave}${sufixoPassada}`,
        sugestao: c.motivo,
        motivo_factual: c.motivo,
        campos_comparados: c.campos_comparados,
        fontes: c.fontes,
        grau_certeza: "confirmado",
      });
    }
  }

  // Fase E — liga a trilha REAL de mudança de catálogo (mac_checklist_itens_historico, Fase D)
  // a uma sugestão: item que foi marcado na análise mais recente e ESTA JÁ TEM documento
  // emitido (despacho/parecer/despacho interno, mesmo sinal de "análise fechada" usado por
  // lib/bdi/situacao.ts — status não é confiável pra isso) teve o catálogo alterado DEPOIS
  // dessa análise ter sido tocada pela última vez. O evento em si é fato confirmado (trigger de
  // banco); se ele invalida a análise já fechada é interpretação — por isso "vale_conferir",
  // nunca "confirmado".
  const analiseFechada = !!(
    ultimaAnalise && (ultimaAnalise.numero_despacho || ultimaAnalise.numero_parecer || ultimaAnalise.numero_despacho_interno)
  );
  if (ultimaAnalise && analiseFechada) {
    const itensRealmenteMarcados = new Set(
      (dossie.mac?.marcacoes_ultima_analise ?? [])
        .filter((m) => m.status !== "em_branco")
        .map((m) => m.item_id),
    );
    const referencia = Date.parse(ultimaAnalise.atualizado_em);
    for (const evento of dossie.tecnico?.eventos_catalogo_recentes ?? []) {
      if (!itensRealmenteMarcados.has(evento.item_id)) continue;
      if (!Number.isFinite(referencia) || Date.parse(evento.criado_em) <= referencia) continue;
      saida.push({
        tipo: "catalogo_alterado_apos_analise",
        // Inclui o instante do evento: o mesmo item pode ter mais de um evento de catálogo
        // depois da mesma análise fechada — chave só por item colapsaria os dois.
        chave: `${evento.item_id}:${evento.criado_em}`,
        sugestao: `O item do checklist marcado na análise nº ${ultimaAnalise.numero_analise} (já com documento emitido) foi "${evento.acao}" no catálogo em ${evento.criado_em}, depois desta análise ter sido tocada pela última vez.`,
        motivo_factual: `mac_checklist_itens_historico registra ação "${evento.acao}" no item em ${evento.criado_em}; analises_mac mostra a análise nº ${ultimaAnalise.numero_analise} atualizada pela última vez em ${ultimaAnalise.atualizado_em}, já com despacho/parecer/despacho interno commitado.`,
        campos_comparados: [evento.item_id],
        fontes: ["mac_checklist_itens_historico", "analises_mac"],
        grau_certeza: "vale_conferir",
      });
    }
  }

  (dossie.lip?.incoerencias ?? []).forEach((inc, i) => {
    saida.push({
      tipo: "incoerencia_lip_mac",
      // Mesmo sufixo de passada dos outros 2 cruzamentos acima — uma incoerência corrigida e
      // reaberta numa análise posterior precisa poder gerar linha nova (achado de Fase M).
      chave: `${inc.campo || `incoerencia_${i}`}${sufixoPassada}`,
      sugestao: inc.explicacao,
      motivo_factual: inc.explicacao,
      campos_comparados: inc.campo ? [inc.campo] : [],
      fontes: ["vigia"],
      // Cruzamento/inferência, nunca fato isolado — nunca "confirmado".
      grau_certeza: "vale_conferir",
    });
  });

  return saida;
}

/**
 * Persiste as sugestões automáticas — nunca sobrescreve uma já registrada
 * (`ON CONFLICT DO NOTHING` pela chave natural processo+tipo+chave), pra não
 * apagar um `estado` que um humano já tenha mudado nem duplicar a cada
 * mensagem de chat. Nunca grava em LIP/MAC — tabela própria do URBI.
 * Falha aqui nunca derruba a resposta do chat (só loga).
 *
 * `slot` (Fase M): grava o tipo_processo JUNTO da linha — sem isso, toda sugestão só sabia seu
 * slot por JOIN com `processos` em tempo de leitura (app/api/admin/urbi/sugestoes/route.ts,
 * Fase F), e um processo excluído/renomeado depois apagaria essa informação de auditoria
 * mesmo sendo um fato já conhecido no momento em que a sugestão nasceu. `null` quando quem
 * chama não sabe o slot (não deve acontecer no caminho real, mas não é motivo pra falhar).
 */
export async function registrarSugestoesAutomaticas(
  processoCodigo: string,
  sugestoes: SugestaoAutomatica[],
  slot: string | null = null,
): Promise<void> {
  if (sugestoes.length === 0) return;
  const linhas = sugestoes.map((s) => ({
    processo_codigo: processoCodigo,
    tipo: s.tipo,
    chave: s.chave,
    sugestao: s.sugestao,
    motivo_factual: s.motivo_factual,
    campos_comparados: s.campos_comparados,
    fontes: s.fontes,
    grau_certeza: s.grau_certeza,
    slot,
  }));
  const { error } = await supabaseAdmin
    .from("urbi_sugestoes")
    .upsert(linhas, { onConflict: "processo_codigo,tipo,chave", ignoreDuplicates: true });
  if (error) console.error("[urbi/sugestoes] falha ao registrar:", error.message);
}
