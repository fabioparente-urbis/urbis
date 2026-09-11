/**
 * lib/documentosSei/estadoEdicao.ts — Fase 6 do plano
 * docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md ("módulo próprio e tela gráfica").
 *
 * Conceito NOVO, que não existia antes: correção MANUAL do analista sobre um corte do fatiador —
 * criar, corrigir, confirmar, excluir, marcar como lixo. Isto é DIFERENTE de `EstadoVersao`
 * (`motorVersoes.ts`), que resolve qual VERSÃO de um documento vale dentro do SEI (vigente vs
 * substituído) — aqui é sobre o corte em si estar certo ou não, decisão do analista, não do SEI.
 *
 * Puro (zero React, zero rede) — testável isolado, e reaproveitável tanto pela tela nova quanto,
 * no futuro, por qualquer outro lugar que precise do mesmo conceito.
 */

export type StatusEdicao = "proposto" | "confirmado" | "editado" | "lixo";

export type ItemFatiado = {
  /** único dentro do fatiamento inteiro — idSei sozinho, ou "idSei::peca::N" para peça de contêiner */
  id: string;
  idSei: string;
  titulo: string;
  /** papel da peça (lib/documentosSei/pecas.ts), quando o item veio de dentro de um contêiner */
  papel?: string;
  paginaIni: number;
  paginaFim: number;
  setor?: string;
  assinante?: string;
  data?: string;
  status: StatusEdicao;
  /** true = nasceu de um "novo corte" do analista, não existia no fatiamento automático */
  criadoManualmente?: boolean;
};

export type EstadoFatiamento = {
  itens: ItemFatiado[];
  /** id do item com foco de teclado — null quando a lista está vazia */
  selecionadoId: string | null;
};

export type AcaoFatiamento =
  | { tipo: "carregar"; itens: ItemFatiado[] }
  | { tipo: "selecionar"; id: string }
  | { tipo: "moverSelecao"; direcao: 1 | -1 }
  | { tipo: "confirmar"; id: string }
  | { tipo: "marcarLixo"; id: string }
  | { tipo: "restaurarDoLixo"; id: string }
  /** divide o item em dois, a partir de `naPagina` (inclusive) até o fim */
  | { tipo: "novoCorte"; id: string; naPagina: number }
  /** desfaz um corte: junta o item ao vizinho anterior na ordem de página */
  | { tipo: "excluirCorte"; id: string }
  | { tipo: "editarPapel"; id: string; papel: string }
  | { tipo: "editarTitulo"; id: string; titulo: string };

function ordenarPorPagina(itens: ItemFatiado[]): ItemFatiado[] {
  return [...itens].sort((a, b) => a.paginaIni - b.paginaIni);
}

/**
 * Reducer puro. Toda ação que muda o conteúdo (confirmar, lixo, corte) passa por aqui — quem
 * envolve isso numa pilha de desfazer/refazer é `hooks/useHistoricoReducer.ts`, de propósito
 * separado (esta função não sabe nada de histórico).
 */
export function reduzirFatiamento(estado: EstadoFatiamento, acao: AcaoFatiamento): EstadoFatiamento {
  switch (acao.tipo) {
    case "carregar": {
      const itens = ordenarPorPagina(acao.itens);
      return { itens, selecionadoId: itens[0]?.id ?? null };
    }

    case "selecionar":
      return estado.itens.some((i) => i.id === acao.id) ? { ...estado, selecionadoId: acao.id } : estado;

    case "moverSelecao": {
      if (!estado.itens.length) return estado;
      const indiceAtual = estado.itens.findIndex((i) => i.id === estado.selecionadoId);
      const proximo = indiceAtual === -1
        ? 0
        : Math.min(estado.itens.length - 1, Math.max(0, indiceAtual + acao.direcao));
      return { ...estado, selecionadoId: estado.itens[proximo].id };
    }

    case "confirmar":
      return {
        ...estado,
        itens: estado.itens.map((i) => (i.id === acao.id ? { ...i, status: "confirmado" } : i)),
      };

    case "marcarLixo":
      return {
        ...estado,
        itens: estado.itens.map((i) => (i.id === acao.id ? { ...i, status: "lixo" } : i)),
      };

    case "restaurarDoLixo":
      return {
        ...estado,
        itens: estado.itens.map((i) => (i.id === acao.id ? { ...i, status: "proposto" } : i)),
      };

    case "editarPapel":
      return {
        ...estado,
        itens: estado.itens.map((i) =>
          i.id === acao.id ? { ...i, papel: acao.papel, status: "editado" } : i,
        ),
      };

    case "editarTitulo":
      return {
        ...estado,
        itens: estado.itens.map((i) =>
          i.id === acao.id ? { ...i, titulo: acao.titulo, status: "editado" } : i,
        ),
      };

    case "novoCorte": {
      const alvo = estado.itens.find((i) => i.id === acao.id);
      if (!alvo) return estado;
      // só corta se a página cair estritamente dentro do intervalo — corte na borda não faz nada
      if (acao.naPagina <= alvo.paginaIni || acao.naPagina > alvo.paginaFim) return estado;
      const primeiraParte: ItemFatiado = {
        ...alvo, id: `${alvo.id}::corte::${Date.now()}a`,
        paginaFim: acao.naPagina - 1, status: "editado", criadoManualmente: true,
      };
      const segundaParte: ItemFatiado = {
        ...alvo, id: `${alvo.id}::corte::${Date.now()}b`,
        paginaIni: acao.naPagina, status: "proposto", criadoManualmente: true,
      };
      const itens = ordenarPorPagina(
        estado.itens.flatMap((i) => (i.id === acao.id ? [primeiraParte, segundaParte] : [i])),
      );
      return { itens, selecionadoId: primeiraParte.id };
    }

    case "excluirCorte": {
      const ordenados = ordenarPorPagina(estado.itens);
      const indice = ordenados.findIndex((i) => i.id === acao.id);
      if (indice <= 0) return estado; // primeiro item não tem vizinho anterior pra juntar
      const anterior = ordenados[indice - 1];
      const atual = ordenados[indice];
      const fundido: ItemFatiado = {
        ...anterior, paginaFim: atual.paginaFim, status: "editado",
      };
      const itens = [
        ...ordenados.slice(0, indice - 1),
        fundido,
        ...ordenados.slice(indice + 1),
      ];
      return { itens, selecionadoId: fundido.id };
    }

    default:
      return estado;
  }
}

export const ESTADO_VAZIO: EstadoFatiamento = { itens: [], selecionadoId: null };
