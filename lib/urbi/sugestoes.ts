import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { GrauDeCerteza } from "./dossieProcesso";

export type TipoSugestao =
  | "item_voltou_nao_conforme"
  | "documento_sem_registro"
  | "aguardando_retorno_base_insuficiente"
  | "incoerencia_lip_mac";

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
  };
  lip?: {
    incoerencias?: { campo: string; explicacao: string }[];
  };
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

  (dossie.lip?.incoerencias ?? []).forEach((inc, i) => {
    saida.push({
      tipo: "incoerencia_lip_mac",
      chave: inc.campo || `incoerencia_${i}`,
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
 */
export async function registrarSugestoesAutomaticas(
  processoCodigo: string,
  sugestoes: SugestaoAutomatica[],
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
  }));
  const { error } = await supabaseAdmin
    .from("urbi_sugestoes")
    .upsert(linhas, { onConflict: "processo_codigo,tipo,chave", ignoreDuplicates: true });
  if (error) console.error("[urbi/sugestoes] falha ao registrar:", error.message);
}
