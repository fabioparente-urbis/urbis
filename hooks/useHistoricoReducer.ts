"use client";

/**
 * hooks/useHistoricoReducer.ts — pilha de desfazer/refazer genérica em cima de um reducer puro.
 *
 * Criado pra Fase 6 do fatiador (docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md §6) — não existia
 * nenhum sistema de undo/redo em nenhum canto do projeto antes disso. Guarda snapshot do estado
 * inteiro antes de cada ação (simples e correto; o volume de dados aqui — algumas dezenas de itens
 * por fatiamento — não justifica diff granular). Histórico é DE SESSÃO, some ao recarregar a
 * página, mesmo espírito do resto do módulo (o PDF também nunca sai da memória do navegador).
 */

import { useCallback, useReducer } from "react";

type EstadoComHistorico<E> = {
  passado: E[];
  atual: E;
  futuro: E[];
};

type AcaoComHistorico<E, A> =
  | { tipo: "aplicar"; acao: A }
  | { tipo: "desfazer" }
  | { tipo: "refazer" }
  | { tipo: "resetar"; estado: E };

function criarReducerComHistorico<E, A>(reducer: (estado: E, acao: A) => E) {
  return function reducerComHistorico(
    estado: EstadoComHistorico<E>,
    acao: AcaoComHistorico<E, A>,
  ): EstadoComHistorico<E> {
    switch (acao.tipo) {
      case "aplicar": {
        const proximo = reducer(estado.atual, acao.acao);
        if (proximo === estado.atual) return estado; // ação sem efeito não entra no histórico
        return { passado: [...estado.passado, estado.atual], atual: proximo, futuro: [] };
      }
      case "desfazer": {
        if (!estado.passado.length) return estado;
        const anterior = estado.passado[estado.passado.length - 1];
        return {
          passado: estado.passado.slice(0, -1),
          atual: anterior,
          futuro: [estado.atual, ...estado.futuro],
        };
      }
      case "refazer": {
        if (!estado.futuro.length) return estado;
        const [proximo, ...resto] = estado.futuro;
        return { passado: [...estado.passado, estado.atual], atual: proximo, futuro: resto };
      }
      case "resetar":
        return { passado: [], atual: acao.estado, futuro: [] };
      default:
        return estado;
    }
  };
}

export function useHistoricoReducer<E, A>(reducer: (estado: E, acao: A) => E, estadoInicial: E) {
  const [estado, despachar] = useReducer(criarReducerComHistorico(reducer), {
    passado: [], atual: estadoInicial, futuro: [],
  });

  const aplicar = useCallback((acao: A) => despachar({ tipo: "aplicar", acao }), []);
  const desfazer = useCallback(() => despachar({ tipo: "desfazer" }), []);
  const refazer = useCallback(() => despachar({ tipo: "refazer" }), []);
  const resetar = useCallback((novoEstado: E) => despachar({ tipo: "resetar", estado: novoEstado }), []);

  return {
    estado: estado.atual,
    aplicar,
    desfazer,
    refazer,
    resetar,
    podeDesfazer: estado.passado.length > 0,
    podeRefazer: estado.futuro.length > 0,
  };
}
