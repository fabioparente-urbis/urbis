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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SÓ O PRIMEIRO NÍVEL É RODADA (regra do Fábio, 17/08/2026)
 *
 * Pasta dentro de pasta de rodada é ORGANIZAÇÃO do requerente, não rodada nova:
 *
 *     Processo/Anexados pelo interessado/COMAER/x.pdf
 *     Processo/Anexados pelo interessado/CERTIDAO DE CORREDOR/y.pdf
 *
 * Antes, cada caminho distinto virava uma rodada — o processo 50724 abriu SEIS rodadas para três
 * pastas reais, e as duas pastas temáticas de dentro passaram a "vencer" por serem as mais
 * recentes. A rodada agora é o primeiro nível abaixo da pasta selecionada; tudo abaixo dele herda.
 * ─────────────────────────────────────────────────────────────────────────────
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
 * Qual pasta de rodada contém este arquivo. "" = raiz.
 *
 * `partes[0]` é a pasta que o analista escolheu no seletor e o último item é o arquivo; o que
 * sobra no meio é a hierarquia interna, e dela só o PRIMEIRO nível define rodada.
 */
export function pastaDeRodada(caminhoRelativo: string): string {
  const partes = caminhoRelativo.split("/").filter(Boolean);
  return partes.length > 2 ? partes[1] : "";
}

/**
 * Nome que declara ser a entrega ORIGINAL. Sem isto, "Arquivos Iniciais" caía na ordenação
 * alfabética e ficava DEPOIS de "Anexados pelo interessado" — a entrega inicial virava a rodada
 * mais recente e seus documentos venciam a vigência contra as próprias correções que os
 * substituíram. É desempate de último recurso: só vale quando número, data e mtime não decidem.
 */
const RE_INICIAL = /\b(INICIA|ORIGINA|PROTOCOL|ENTRADA|1[ªa°o]?\s*(ANALISE|VIA))/i;

/**
 * Ordena as pastas e devolve a rodada de cada uma.
 * A raiz é sempre a rodada 1; as subpastas começam em 2.
 */
export function ordenarRodadas(arquivos: ArquivoBruto[]): PastaRodada[] {
  // agrupa pela PASTA DE RODADA: o primeiro nível abaixo da pasta que o analista selecionou.
  // Subpasta de subpasta é organização do requerente e HERDA a rodada da pasta que a contém.
  const porPasta = new Map<string, ArquivoBruto[]>();
  for (const a of arquivos) {
    const sub = pastaDeRodada(a.caminhoRelativo || a.nome);
    (porPasta.get(sub) ?? porPasta.set(sub, []).get(sub)!).push(a);
  }

  const raiz: PastaRodada = { caminho: "", rodada: 1, criterio: "raiz", ambigua: false };
  const subs = [...porPasta.keys()].filter((k) => k !== "");
  if (!subs.length) return [raiz];

  // tenta na ordem: número no nome → data no nome → data do arquivo mais recente
  const info = subs.map((caminho) => {
    const arqs = porPasta.get(caminho) ?? [];
    return {
      caminho,
      numero: numeroNoNome(caminho),
      data: dataNoNome(caminho),
      // o mtime é o do arquivo mais recente EM QUALQUER PROFUNDIDADE abaixo da pasta de rodada
      modificado: Math.max(0, ...arqs.map((a) => a.modificadoEm ?? 0)),
      inicial: RE_INICIAL.test(caminho),
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
    /* Não há como decidir com segurança. Ordena alfabeticamente só para ter algo determinístico,
     * mas MARCA como ambígua para a tela pedir confirmação. A pasta que se declara INICIAL vai
     * para a frente: continua sendo chute, só que um chute que não inverte o óbvio. */
    criterio = "alfabetica";
    ordenadas = [...info].sort(
      (a, b) => Number(b.inicial) - Number(a.inicial) || a.caminho.localeCompare(b.caminho, "pt-BR"),
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
  const rodadaDoArquivo = (caminhoRelativo: string, nome: string) =>
    mapa.get(pastaDeRodada(caminhoRelativo || nome)) ?? mapa.get("")!;
  return { pastas, rodadaDoArquivo, ambigua: pastas.some((p) => p.ambigua) };
}
