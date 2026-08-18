/**
 * lib/mac-motor/slot5/filtrosDoBanco.ts — avalia os filtros de aplicabilidade do Slot 5 que
 * estão cadastrados em `mac_slot5_filtros` (migration 2026_08_17_mac_slot5_filtros.sql).
 *
 * Substitui a lista fixa de `aplicabilidade.ts` por filtros editáveis na tela, sem deploy.
 * As primitivas de leitura (NP/NÃO, busca de palavra inteira sem acento) continuam vindo de
 * `aplicabilidade.ts` — a mudança é de ONDE vem a regra, não de COMO ela decide.
 *
 * Isolado do Slot 1: a tabela é exclusiva do Slot 5 e nenhuma outra parte do sistema a lê.
 */

import type { DadosLip, TextosPorPapel } from "./aplicabilidade";
import { avaliarCondicao } from "./aplicabilidade";

export type FiltroSlot5 = {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  tipo_condicao: "CAMPO_LIP_AUSENTE" | "CAMPO_LIP_IGUAL" | "PALAVRA_AUSENTE" | "MANUAL";
  campos_lip: string[];
  valor_esperado: string | null;
  termos: string[];
  papeis_documento: string[];
  grupos: string[];
  itens_ids: string[];
  /** Itens cujo TEXTO cita um destes termos entram no alvo, em qualquer grupo. */
  termos_item?: string[] | null;
  status_alvo: "conforme" | "nao_conforme" | "nao_aplica";
};

export type ResultadoFiltro = {
  id: string;
  nome: string;
  grupos: string[];
  itensIds: string[];
  statusAlvo: FiltroSlot5["status_alvo"];
  justificativa: string;
};

export type AvaliacaoFiltros = {
  acionados: ResultadoFiltro[];
  naoAcionados: { id: string; nome: string; justificativa: string }[];
  indecisos: { id: string; nome: string; motivo: string }[];
  manuais: { id: string; nome: string; grupos: string[]; itensIds: string[] }[];
};

/**
 * Roda todos os filtros ativos contra o LIP e o texto dos documentos.
 *
 * `acionados` = a condição se confirmou, os itens saem da análise.
 * `naoAcionados` = a condição foi avaliada e NEGADA (o tema existe no processo).
 * `indecisos` = faltou dado para decidir — vira pendência visível, nunca chute.
 * `manuais` = sem automação; a tela oferece como botão.
 */
export function avaliarFiltros(
  filtros: FiltroSlot5[], lip: DadosLip, textos: TextosPorPapel,
): AvaliacaoFiltros {
  const acionados: ResultadoFiltro[] = [];
  const naoAcionados: AvaliacaoFiltros["naoAcionados"] = [];
  const indecisos: AvaliacaoFiltros["indecisos"] = [];
  const manuais: AvaliacaoFiltros["manuais"] = [];

  for (const f of filtros) {
    if (!f.ativo) continue;

    if (f.tipo_condicao === "MANUAL") {
      manuais.push({ id: f.id, nome: f.nome, grupos: f.grupos ?? [], itensIds: f.itens_ids ?? [] });
      continue;
    }

    // Filtro sem alvo não marca nada — avisa como pendência de configuração em vez de
    // desaparecer em silêncio (é o caso do MEDIO PORTE, que espera a lista de grupos).
    if (!(f.grupos?.length || f.itens_ids?.length || f.termos_item?.length)) {
      indecisos.push({ id: f.id, nome: f.nome, motivo: "filtro sem grupos nem itens definidos" });
      continue;
    }

    const { veredicto, justificativa } = avaliarCondicao(
      {
        tipo: f.tipo_condicao,
        camposLip: f.campos_lip ?? [],
        valorEsperado: f.valor_esperado,
        termos: f.termos ?? [],
        papeis: f.papeis_documento ?? [],
      },
      lip, textos,
    );

    if (veredicto === null) {
      indecisos.push({ id: f.id, nome: f.nome, motivo: justificativa });
    } else if (veredicto) {
      acionados.push({
        id: f.id, nome: f.nome,
        grupos: f.grupos ?? [], itensIds: f.itens_ids ?? [],
        statusAlvo: f.status_alvo ?? "nao_aplica",
        justificativa,
      });
    } else {
      naoAcionados.push({ id: f.id, nome: f.nome, justificativa });
    }
  }

  return { acionados, naoAcionados, indecisos, manuais };
}
