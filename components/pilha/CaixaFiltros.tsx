"use client";

/**
 * Caixa única de filtros da Pilha — substitui as 16 caixinhas que existiam
 * (4 no topo + 12 na Triagem) por um campo só com etiquetas removíveis.
 *
 * Pedido do Fábio em 10/09/2026: "em menos caixinhas, talvez uma única, posso
 * filtrar várias coisas".
 *
 * O que NÃO mudou de propósito: a semântica dos filtros. Cada opção daqui
 * escreve exatamente a mesma chave que o `<select>` correspondente escrevia,
 * e quem filtra continua sendo `aplicarFiltrosLocais` (lib/urbi/navegacao.ts)
 * sobre a lista que a API já autorizou. Isto é troca de interface, não de
 * regra — nenhum processo passa a aparecer pra quem não podia ver.
 *
 * Descoberta (o risco de trocar 16 caixas por uma): ao focar sem digitar
 * nada, o painel abre com TODAS as opções agrupadas por categoria. Dá pra
 * usar só no clique, sem nunca digitar — a digitação é atalho, não requisito.
 */

import { useEffect, useMemo, useRef, useState } from "react";

/** Uma opção selecionável do painel. `alvo` diz em qual estado da Pilha ela escreve. */
export type OpcaoFiltro = {
  /** Único no catálogo — também é a identidade da etiqueta na barra. */
  id: string;
  grupo: string;
  rotulo: string;
  alvo: "triagem" | "tipo" | "situacao" | "analista";
  /** Só quando `alvo === "triagem"`: a chave de FiltrosPilha que esta opção escreve. */
  chave?: string;
  valor: unknown;
};

/** Etiqueta do que está ativo agora, montada pelo pai a partir do estado real. */
export type ChipAtivo = {
  id: string;
  rotulo: string;
  /** Veio da URL (o URBI filtrou por conversa), não de clique na tela. */
  doUrbi?: boolean;
};

/** minúsculas, sem acento — pra digitar "area" e achar "Área". */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

type Props = {
  catalogo: OpcaoFiltro[];
  ativos: ChipAtivo[];
  buscaAtual: string;
  onAplicar: (opcao: OpcaoFiltro) => void;
  onRemover: (chip: ChipAtivo) => void;
  onBuscar: (texto: string) => void;
  onLimpar: () => void;
};

export default function CaixaFiltros({
  catalogo, ativos, buscaAtual, onAplicar, onRemover, onBuscar, onLimpar,
}: Props) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [destacado, setDestacado] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora — mousedown (não click) pra fechar antes de um clique
  // em outro controle da página disparar duas coisas ao mesmo tempo.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const idsAtivos = useMemo(() => new Set(ativos.map((a) => a.id)), [ativos]);

  /** Opções que casam com o que foi digitado, na ordem em que serão renderizadas. */
  const visiveis = useMemo(() => {
    const t = normalizar(texto);
    const casa = (o: OpcaoFiltro) =>
      !t || normalizar(o.rotulo).includes(t) || normalizar(o.grupo).includes(t);
    return catalogo.filter((o) => casa(o) && !idsAtivos.has(o.id));
  }, [catalogo, texto, idsAtivos]);

  /** Mesmas opções, agrupadas para exibição — preserva a ordem do catálogo. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, OpcaoFiltro[]>();
    for (const o of visiveis) {
      const lista = mapa.get(o.grupo) ?? [];
      lista.push(o);
      mapa.set(o.grupo, lista);
    }
    return [...mapa.entries()];
  }, [visiveis]);

  // Texto que não casa com opção nenhuma vira busca livre (SEI, interessado,
  // nº de despacho) — o mesmo campo serve pras duas coisas.
  const ofereceBusca = texto.trim().length >= 2;
  const totalNavegavel = visiveis.length + (ofereceBusca ? 1 : 0);

  useEffect(() => { setDestacado(0); }, [texto]);

  function aplicar(indice: number) {
    if (ofereceBusca && indice === visiveis.length) {
      onBuscar(texto.trim());
    } else {
      const opcao = visiveis[indice];
      if (!opcao) return;
      onAplicar(opcao);
    }
    setTexto("");
    // Volta o destaque pro primeiro item explicitamente: sem isto, o índice
    // antigo sobrevive à troca da lista e um Enter por reflexo aplicaria um
    // filtro que a pessoa nem viu.
    setDestacado(0);
    inputRef.current?.focus();
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setDestacado((i) => (totalNavegavel === 0 ? 0 : (i + 1) % totalNavegavel));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestacado((i) => (totalNavegavel === 0 ? 0 : (i - 1 + totalNavegavel) % totalNavegavel));
    } else if (e.key === "Enter") {
      e.preventDefault();
      aplicar(destacado);
    } else if (e.key === "Escape") {
      setAberto(false);
    } else if (e.key === "Backspace" && !texto && ativos.length > 0) {
      // Backspace no campo vazio tira a última etiqueta — atalho esperado em
      // campo de etiquetas; nunca apaga mais de uma por tecla.
      onRemover(ativos[ativos.length - 1]);
    }
  }

  return (
    <div ref={containerRef} className="relative mb-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[var(--accent)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--text-muted)] text-sm select-none">🔍</span>

          {ativos.map((chip) => (
            <span key={chip.id}
              title={chip.doUrbi ? "Filtro que veio do URBI (pela conversa)." : undefined}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${
                chip.doUrbi
                  ? "border-[var(--accent)] bg-[var(--bg-secondary)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
              }`}>
              {chip.doUrbi && <span aria-hidden>🧭</span>}
              {chip.rotulo}
              <button type="button" onClick={() => onRemover(chip)}
                aria-label={`Remover filtro ${chip.rotulo}`}
                className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--error)]">
                ×
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
            onKeyDown={aoTeclar}
            placeholder={ativos.length === 0
              ? "Filtrar ou buscar por SEI, interessado, nº de despacho..."
              : "Adicionar filtro..."}
            className="flex-1 min-w-[180px] bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none py-1" />

          {(ativos.length > 0 || buscaAtual) && (
            <button type="button" onClick={() => { onLimpar(); setTexto(""); }}
              className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
              Limpar
            </button>
          )}
        </div>
      </div>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg p-2">
          {ofereceBusca && (
            <button type="button"
              onMouseEnter={() => setDestacado(visiveis.length)}
              onClick={() => aplicar(visiveis.length)}
              className={`w-full text-left text-sm px-2 py-1.5 rounded-lg ${
                destacado === visiveis.length ? "bg-[var(--bg-secondary)]" : ""
              }`}>
              Buscar <span className="font-bold text-[var(--text-primary)]">“{texto.trim()}”</span>
              <span className="text-[var(--text-muted)] text-xs"> — em SEI, interessado ou nº de despacho</span>
            </button>
          )}

          {grupos.length === 0 && !ofereceBusca && (
            <p className="text-xs text-[var(--text-muted)] px-2 py-3">Nenhum filtro corresponde ao que você digitou.</p>
          )}

          {grupos.map(([grupo, opcoes]) => (
            <div key={grupo} className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] px-2 pt-2 pb-1">{grupo}</p>
              <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                {opcoes.map((o) => {
                  const indice = visiveis.indexOf(o);
                  return (
                    <button key={o.id} type="button"
                      onMouseEnter={() => setDestacado(indice)}
                      onClick={() => aplicar(indice)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                        destacado === indice
                          ? "border-[var(--accent)] bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                          : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                      }`}>
                      {o.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
