/**
 * lib/mac-motor/slot5/evidencias.ts — converte fatos do motor Slot 5 para o formato que
 * `lib/mac-execucao` já grava (EvidenciaLip[]), sem exigir nenhuma coluna nova.
 *
 * `mac_resultados_item` (migration 2026_07_30, já em produção) não tem coluna própria para
 * "modelo Gemini" ou "versão/hash do prompt" — e esta entrega NÃO pode alterar essa tabela
 * (é MAC "já consolidado"). A saída é gravar esses metadados como mais uma entrada dentro de
 * `evidencias_json`, que já é JSONB livre — reprodutível e auditável sem migration nova.
 */

import type { EvidenciaLip } from "@/lib/mac-execucao";
import type { FatoExtraido, ResultadoExtracao } from "./tipos";

/** Um fato do Gemini → uma EvidenciaLip. `papel` carrega documento/página/trecho/observação. */
export function fatoParaEvidencia(f: FatoExtraido): EvidenciaLip {
  if ("abstencao" in f) {
    return {
      lipChave: f.nome,
      valor: { abstencao: true, motivo: f.motivo },
      papel: `documento=${f.documento ?? "desconhecido"}; motor absteve-se`,
    };
  }
  return {
    lipChave: f.nome,
    valor: { valor: f.valor, unidade: f.unidade, confianca: f.confianca },
    papel: `documento=${f.documento}; pagina=${f.pagina ?? "?"}; trecho="${f.trecho ?? ""}"${f.observacao ? `; obs=${f.observacao}` : ""}`,
  };
}

/** Metadados da chamada Gemini (modelo, prompt e sua versão/hash) como UMA evidência sintética. */
export function metadadosExtracaoParaEvidencia(r: Pick<ResultadoExtracao, "modelo" | "promptId" | "promptVersao" | "promptHash">): EvidenciaLip {
  return {
    lipChave: "_motor_metadata",
    valor: { modelo: r.modelo, promptId: r.promptId, promptVersao: r.promptVersao, promptHash: r.promptHash },
    papel: "metadados do motor Gemini do Slot 5 — não é fato do LIP, é governança da execução",
  };
}
