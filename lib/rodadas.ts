/**
 * lib/rodadas.ts — qual subpasta é qual rodada de análise.
 *
 * A pasta é a rodada: raiz = 1ª análise, cada subpasta = a análise seguinte. O que não é trivial é
 * ORDENAR as subpastas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO SERVE A PROFUNDIDADE DO CAMINHO
 *
 * A versão anterior calculava a rodada como `profundidade - 1`. Isso separa raiz de subpasta, mas
 * NÃO ordena subpastas irmãs — e irmãs é exatamente como o analista organiza:
 *
 *     Processo/Correção 01/  → profundidade 2
 *     Processo/Correção 02/  → profundidade 2
 *     Processo/Correção 03/  → profundidade 2
 *
 * As três davam rodada 2. Com duas pastas passava por sorte (a ordem alfabética coincidia com a
 * intenção); com três, a 3ª correção era tratada como se fosse a 1ª.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A ordem é decidida nesta escada, e **na dúvida o sistema pergunta em vez de escolher calado**:
 *   1. número no nome da pasta   — "Correção 02", "REV04", "2ª análise", "rodada 3"
 *   2. data no nome da pasta     — "2026-04-30", "30-04-2026", "20260430"
 *   3. data de modificação dos arquivos de dentro (a mais recente da pasta)
 *   4. ambiguidade declarada     — devolve `ambigua: true` e a tela pede a ordem ao analista
 */

export type PastaRodada = {
  /** caminho relativo da subpasta ("" = raiz) */
  caminho: string;
  rodada: number;
  /** como a ordem foi decidida — vai para a tela e para a linha do tempo */
  criterio: "raiz" | "numero-no-nome" | "data-no-nome" | "data-do-arquivo" | "alfabetica";
  /** true = não foi possível ordenar com segurança; o analista precisa confirmar */
  ambigua: boolean;
};

/**
 * Número declarado no nome da pasta. "Correção 02" → 2 · "REV04" → 4 · "3ª análise" → 3
 *
 * A DATA é removida antes da busca. Sem isso, "2026-05-30" devolvia 5 — o mês virava número de
 * rodada, e a ordem saía certa por coincidência, pelo motivo errado.
 */
export function numeroNoNome(nome: string): number | null {
  const semData = nome
    .replace(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/g, " ")
    .replace(/(\d{2})[-_./](\d{2})[-_./](\d{4})/g, " ");
  const limpo = semData.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const candidatos = [...limpo.matchAll(/(?<!\d)(\d{1,3})(?!\d)/g)].map((m) => parseInt(m[1], 10));
  return candidatos.length ? candidatos[0] : null;
}

/** Data declarada no nome da pasta, em qualquer das grafias usuais. */
export function dataNoNome(nome: string): number | null {
  let m = nome.match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/);            // 2026-04-30 · 20260430
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = nome.match(/(\d{2})[-_./](\d{2})[-_./](\d{4})/);                 // 30-04-2026
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

export type ArquivoBruto = { caminhoRelativo: string; nome: string; modificadoEm?: number };

/**
 * Ordena as pastas e devolve a rodada de cada uma.
 * A raiz é sempre a rodada 1; as subpastas começam em 2.
 */
export function ordenarRodadas(arquivos: ArquivoBruto[]): PastaRodada[] {
  // agrupa por PASTA (o caminho sem o nome do arquivo, e sem a pasta-mãe escolhida no seletor)
  const porPasta = new Map<string, ArquivoBruto[]>();
  for (const a of arquivos) {
    const partes = (a.caminhoRelativo || a.nome).split("/").filter(Boolean);
    // partes[0] é a pasta que o analista selecionou; o último é o arquivo
    const sub = partes.slice(1, -1).join("/");
    (porPasta.get(sub) ?? porPasta.set(sub, []).get(sub)!).push(a);
  }

  const raiz: PastaRodada = { caminho: "", rodada: 1, criterio: "raiz", ambigua: false };
  const subs = [...porPasta.keys()].filter((k) => k !== "");
  if (!subs.length) return [raiz];

  // tenta na ordem: número no nome → data no nome → data do arquivo mais recente
  const info = subs.map((caminho) => {
    const ultimoNivel = caminho.split("/").pop() ?? caminho;
    const arqs = porPasta.get(caminho) ?? [];
    return {
      caminho,
      numero: numeroNoNome(ultimoNivel),
      data: dataNoNome(ultimoNivel),
      modificado: Math.max(0, ...arqs.map((a) => a.modificadoEm ?? 0)),
      profundidade: caminho.split("/").length,
    };
  });

  let criterio: PastaRodada["criterio"];
  let ordenadas: typeof info;
  const todosComNumero = info.every((i) => i.numero != null);
  const numerosDistintos = new Set(info.map((i) => i.numero)).size === info.length;
  const todosComData = info.every((i) => i.data != null);
  const datasDistintas = new Set(info.map((i) => i.data)).size === info.length;
  const todosComModificado = info.every((i) => i.modificado > 0);
  const modificadosDistintos = new Set(info.map((i) => i.modificado)).size === info.length;

  // DATA antes de NÚMERO: data no nome é inequívoca e monotônica; número solto pode ser qualquer
  // coisa (lote, quantidade, ano truncado). Quando os dois existem, a data é o sinal mais forte.
  if (todosComData && datasDistintas) {
    criterio = "data-no-nome";
    ordenadas = [...info].sort((a, b) => a.data! - b.data!);
  } else if (todosComNumero && numerosDistintos) {
    criterio = "numero-no-nome";
    ordenadas = [...info].sort((a, b) => a.numero! - b.numero!);
  } else if (todosComModificado && modificadosDistintos) {
    criterio = "data-do-arquivo";
    ordenadas = [...info].sort((a, b) => a.modificado - b.modificado);
  } else {
    // não há como decidir com segurança. Ordena por profundidade e nome só para ter algo
    // determinístico, mas MARCA como ambígua para a tela pedir confirmação.
    criterio = "alfabetica";
    ordenadas = [...info].sort(
      (a, b) => a.profundidade - b.profundidade || a.caminho.localeCompare(b.caminho, "pt-BR"),
    );
  }

  const ambigua = criterio === "alfabetica" && info.length > 1;
  return [
    raiz,
    ...ordenadas.map((i, idx) => ({ caminho: i.caminho, rodada: idx + 2, criterio, ambigua })),
  ];
}

/** Mapa caminho-da-subpasta → rodada, pronto para consultar arquivo por arquivo. */
export function mapaDeRodadas(arquivos: ArquivoBruto[]) {
  const pastas = ordenarRodadas(arquivos);
  const mapa = new Map(pastas.map((p) => [p.caminho, p]));
  const rodadaDoArquivo = (caminhoRelativo: string, nome: string) => {
    const partes = (caminhoRelativo || nome).split("/").filter(Boolean);
    const sub = partes.slice(1, -1).join("/");
    return mapa.get(sub) ?? mapa.get("")!;
  };
  return { pastas, rodadaDoArquivo, ambigua: pastas.some((p) => p.ambigua) };
}
