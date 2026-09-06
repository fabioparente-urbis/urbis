/**
 * lib/documentosSei/fatiar.ts — Fase 1 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md). Fatiador determinístico do PDF único do SEI em
 * eventos. Zero IA, zero rede.
 *
 * Módulo NOVO e ISOLADO: não importa nada de `lib/lerPastaSlot5.ts` (Slot 5) — regra de
 * isolamento entre slots do CLAUDE.md. Usa a mesma biblioteca (`pdfjs-dist`), só isso.
 *
 * ── O QUE O RODAPÉ DO SEI TRAZ (medido em 4 processos reais, Fase 0, 05/09/2026) ──────────────
 * O carimbo do SEI é sempre DOIS itens de texto distintos do PDF (não uma string colada),
 * lado a lado na mesma linha:
 *   item A: "{Título do documento} ({ID SEI})"       ex.: "Despacho 1459 (10476161)"
 *   item B: "SEI {número do processo} / pg. {N}"     ex.: "SEI 25.5.000061039-8 / pg. 139"
 * `pg. {N}` é o número da página DENTRO DO PDF INTEIRO (mesclado pelo SEI), não da peça — por
 * isso serve de conferência cruzada: se o rodapé diz "pg. 139" numa página que não é a 139ª do
 * arquivo, algo está fora de ordem e a página vai para revisão, nunca é aceita no escuro.
 *
 * Setor (letreiro do órgão) e data de assinatura aparecem perto do rodapé/corpo em formato livre
 * — extraídos por MELHOR ESFORÇO nesta fase (podem faltar); a única coisa que este fatiador
 * GARANTE é a contagem fechada de páginas por ID SEI. Refinar setor/data fica para quando algum
 * consumidor (Fase 3 em diante) precisar de verdade.
 */

export type Carimbo = {
  idSei: string;
  titulo: string;
  numeroProcesso: string;
  /** página lida no rodapé — deve bater com o índice real da página no PDF */
  paginaRodape: number;
};

export type EventoSei = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  /** melhor esforço — ver cabeçalho do arquivo */
  setor?: string;
  /** melhor esforço — ver cabeçalho do arquivo */
  data?: string;
};

export type MotivoRevisao =
  /** página sem rodapé legível, e os vizinhos não têm o mesmo ID SEI dos dois lados para anexar por continuidade */
  | "sem_rodape_sem_continuidade"
  /** rodapé lido, mas o número do processo não bate com o do resto do PDF */
  | "processo_divergente"
  /** rodapé lido, mas "pg. N" não bate com a posição real da página no arquivo */
  | "pagina_rodape_diverge";

export type PaginaRevisao = {
  pagina: number;
  motivo: MotivoRevisao;
};

/**
 * Andamento da leitura, para a barra de progresso ser honesta — mesma ideia de
 * `lib/lerPastaSlot5.ts` (`Andamento`/`AoAndar`), reproduzida aqui em vez de importada: regra de
 * isolamento entre slots do CLAUDE.md.
 */
export type AndamentoFatiamento = { atual: number; total: number };
export type AoAndarFatiamento = (a: AndamentoFatiamento) => void;

export type ResultadoFatiamento = {
  numeroProcesso: string;
  totalPaginas: number;
  eventos: EventoSei[];
  paginasRevisao: PaginaRevisao[];
};

type ItemPosicionado = { t: string; x: number; y: number; h: number };

const RE_TITULO_ID = /^(.+?)\s*\((\d+)\)\s*$/;
const RE_SEI_PG = /^SEI\s+([\d.\-]+)\s*\/\s*pg\.\s*(\d+)\s*$/i;
const RE_DATA_LONGA = /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+((?:19|20)\d{2})\b/i;

function agruparEmLinhas(itens: ItemPosicionado[]): ItemPosicionado[][] {
  const ordenados = [...itens].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: { y: number; itens: ItemPosicionado[] }[] = [];
  for (const i of ordenados) {
    const tol = Math.max(3, i.h * 0.6);
    const linha = linhas.find((l) => Math.abs(l.y - i.y) < tol);
    if (linha) linha.itens.push(i);
    else linhas.push({ y: i.y, itens: [i] });
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x));
}

/**
 * Acha o carimbo do SEI numa página já extraída. Varre TODAS as linhas (não só o rodapé
 * geométrico) porque letreiro de órgão pode empurrar a "linha de baixo" pra cima do que se
 * esperaria — o achado real é o par de itens "Título (ID)" seguido de "SEI ... / pg. N", esteja
 * onde estiver. Quando há mais de um candidato na página (nunca visto, mas não impossível), fica
 * o mais próximo do rodapé real (maior y).
 */
function acharCarimbo(itens: ItemPosicionado[]): Carimbo | null {
  const linhas = agruparEmLinhas(itens);
  let melhor: { carimbo: Carimbo; y: number } | null = null;

  for (const linha of linhas) {
    const naoBrancos = linha.filter((i) => i.t.trim());
    for (let i = 0; i < naoBrancos.length; i++) {
      const mTitulo = RE_TITULO_ID.exec(naoBrancos[i].t.trim());
      if (!mTitulo) continue;
      for (let j = i + 1; j < naoBrancos.length; j++) {
        const mSei = RE_SEI_PG.exec(naoBrancos[j].t.trim());
        if (!mSei) continue;
        const carimbo: Carimbo = {
          titulo: mTitulo[1].trim(),
          idSei: mTitulo[2],
          numeroProcesso: mSei[1],
          paginaRodape: parseInt(mSei[2], 10),
        };
        const y = naoBrancos[j].y;
        if (!melhor || y > melhor.y) melhor = { carimbo, y };
        break;
      }
    }
  }
  return melhor?.carimbo ?? null;
}

/** Melhor esforço: primeiro item, na mesma linha do carimbo, à esquerda do título, que pareça letreiro de órgão. */
function acharSetor(itens: ItemPosicionado[], carimbo: Carimbo): string | undefined {
  const linhas = agruparEmLinhas(itens);
  for (const linha of linhas) {
    const temCarimbo = linha.some((i) => {
      const m = RE_TITULO_ID.exec(i.t.trim());
      return m && m[2] === carimbo.idSei;
    });
    if (!temCarimbo) continue;
    const candidato = linha.find((i) => {
      const t = i.t.trim();
      if (!t || RE_TITULO_ID.test(t) || RE_SEI_PG.test(t) || /^assinado\s+digitalmente/i.test(t)) return false;
      return /prefeitura|secretaria|chefia|diretoria|gerência|gerencia|superintend/i.test(t);
    });
    if (candidato) return candidato.t.trim();
  }
  return undefined;
}

/** Melhor esforço: última data por extenso encontrada no texto da página (assinatura costuma vir perto do fim). */
function acharData(textoPagina: string): string | undefined {
  let ultima: RegExpExecArray | null = null;
  const re = new RegExp(RE_DATA_LONGA, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(textoPagina))) ultima = m;
  return ultima ? ultima[0] : undefined;
}

type PaginaLida = {
  pagina: number;
  carimbo: Carimbo | null;
  setor?: string;
  data?: string;
};

async function lerPaginas(buffer: Uint8Array, aoAndar?: AoAndarFatiamento): Promise<PaginaLida[]> {
  // legacy build: é o que funciona em Node sem DOM (mesma escolha de lib/lerPastaSlot5.ts, sem importar de lá)
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: buffer, useSystemFonts: true, isEvalSupported: false }).promise;

  const paginas: PaginaLida[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    aoAndar?.({ atual: p - 1, total: doc.numPages });
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const itens: ItemPosicionado[] = (tc.items as any[])
      .map((i) => ({ t: i.str ?? "", x: i.transform[4], y: vp.height - i.transform[5], h: i.height || 8 }))
      .filter((i) => i.t.trim());

    const carimbo = acharCarimbo(itens);
    const textoPagina = itens.map((i) => i.t).join(" ");
    paginas.push({
      pagina: p,
      carimbo,
      setor: carimbo ? acharSetor(itens, carimbo) : undefined,
      data: acharData(textoPagina),
    });
  }
  aoAndar?.({ atual: doc.numPages, total: doc.numPages });
  return paginas;
}

/**
 * Fatia o PDF completo do SEI em eventos. Nunca devolve resultado parcial silencioso: se a
 * contagem de páginas não fechar (Σ eventos + Σ revisão ≠ total), lança erro — a chamadora
 * decide o que fazer, mas não finge sucesso.
 */
export async function fatiarPdfSei(buffer: Uint8Array, aoAndar?: AoAndarFatiamento): Promise<ResultadoFatiamento> {
  const paginas = await lerPaginas(buffer, aoAndar);
  const totalPaginas = paginas.length;

  const contagemProcesso = new Map<string, number>();
  for (const p of paginas) {
    if (!p.carimbo) continue;
    contagemProcesso.set(p.carimbo.numeroProcesso, (contagemProcesso.get(p.carimbo.numeroProcesso) ?? 0) + 1);
  }
  const numeroProcesso = [...contagemProcesso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  // carimbo válido = tem rodapé, processo bate com o do PDF, e "pg. N" bate com a posição real
  type Validada = { pagina: number; carimbo: Carimbo; setor?: string; data?: string };
  const validas: (Validada | null)[] = paginas.map((p) => {
    if (!p.carimbo) return null;
    if (p.carimbo.numeroProcesso !== numeroProcesso) return null;
    if (p.carimbo.paginaRodape !== p.pagina) return null;
    return { pagina: p.pagina, carimbo: p.carimbo, setor: p.setor, data: p.data };
  });

  const paginasRevisao: PaginaRevisao[] = [];
  // idSei "efetivo" por página: o da própria página se válida, senão herdado por continuidade
  const idEfetivo: (string | null)[] = new Array(totalPaginas).fill(null);

  for (let idx = 0; idx < totalPaginas; idx++) {
    const v = validas[idx];
    if (v) {
      idEfetivo[idx] = v.carimbo.idSei;
      continue;
    }
    const original = paginas[idx];
    let motivo: MotivoRevisao = "sem_rodape_sem_continuidade";
    if (original.carimbo && original.carimbo.numeroProcesso !== numeroProcesso) motivo = "processo_divergente";
    else if (original.carimbo && original.carimbo.paginaRodape !== original.pagina) motivo = "pagina_rodape_diverge";

    // continuidade: só anexa quando o vizinho válido de cada lado existe E os dois lados concordam
    let antes: string | null = null;
    for (let k = idx - 1; k >= 0; k--) {
      if (validas[k]) { antes = validas[k]!.carimbo.idSei; break; }
      if (idEfetivo[k]) { antes = idEfetivo[k]; break; }
    }
    let depois: string | null = null;
    for (let k = idx + 1; k < totalPaginas; k++) {
      if (validas[k]) { depois = validas[k]!.carimbo.idSei; break; }
    }
    if (antes && depois && antes === depois) {
      idEfetivo[idx] = antes;
    } else {
      paginasRevisao.push({ pagina: original.pagina, motivo });
    }
  }

  const eventos: EventoSei[] = [];
  for (let idx = 0; idx < totalPaginas; idx++) {
    const id = idEfetivo[idx];
    if (!id) continue;
    const atual = eventos[eventos.length - 1];
    if (atual && atual.idSei === id) {
      atual.paginaFim = paginas[idx].pagina;
      if (!atual.setor && validas[idx]?.setor) atual.setor = validas[idx]!.setor;
      if (!atual.data && validas[idx]?.data) atual.data = validas[idx]!.data;
      continue;
    }
    const v = validas[idx];
    eventos.push({
      idSei: id,
      titulo: v?.carimbo.titulo ?? "(herdado por continuidade)",
      paginaIni: paginas[idx].pagina,
      paginaFim: paginas[idx].pagina,
      setor: v?.setor,
      data: v?.data,
    });
  }

  const paginasEmEventos = eventos.reduce((soma, e) => soma + (e.paginaFim - e.paginaIni + 1), 0);
  if (paginasEmEventos + paginasRevisao.length !== totalPaginas) {
    throw new Error(
      `fatiarPdfSei: contagem de páginas não fechou (${paginasEmEventos} em eventos + ${paginasRevisao.length} em revisão ≠ ${totalPaginas} total). Recorte cancelado — nada de resultado parcial.`,
    );
  }

  return { numeroProcesso, totalPaginas, eventos, paginasRevisao };
}
