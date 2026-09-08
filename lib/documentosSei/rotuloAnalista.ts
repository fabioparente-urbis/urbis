/**
 * lib/documentosSei/rotuloAnalista.ts — traduz o título cru do SEI para o VOCABULÁRIO DO
 * ANALISTA (pedido do Fábio, 08/09/2026: "consegue otimizar a sua lista pra ficar igual à minha").
 *
 * A lista que ele monta à mão nomeia cada arquivo como `TIPO SEI.pdf` — FISICO 3941406,
 * USO 4167740, CHEADV 6635217, VISTORIA 9770137. O Organizador mostrava o título cru do SEI
 * ("Parecer 153 - Uso do Solo - COMTEC", "Relatório", "Documentação"), que é o que o carimbo diz,
 * não o que o documento É para a análise.
 *
 * ZERO IA, zero rede — só o título do evento (e, quando existir, o papel da peça já classificada
 * pela Fase 3). Ordem importa: a primeira regra que casar decide.
 *
 * PRINCÍPIO: título ambíguo NÃO recebe rótulo. Medido contra o processo real 24.5.000024350-0
 * (08/09/2026): dois eventos vizinhos se chamam só "Relatório" (9769578 e 9770137) e um é o
 * registro fotográfico do fiscal, o outro é a vistoria — o título não distingue os dois, e chutar
 * um rótulo aqui seria pior que deixar em branco (mesmo princípio de `compararLip.ts`: "se não
 * souber, tudo bem vazio").
 */

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type RegraRotulo = { rotulo: string; teste: (tituloNormalizado: string) => boolean };

/**
 * Vocabulário curto, em caixa alta, igual ao que o Fábio usa nos nomes de arquivo. Ordem
 * deliberada: o mais específico primeiro (CHEADV antes de DESPACHO genérico, USO antes de
 * PARECER, VISTORIA antes de RELATORIO).
 */
const REGRAS: RegraRotulo[] = [
  { rotulo: "USO", teste: (t) => t.includes("uso do solo") },
  // O que o analista precisa da CHEADV é o OK na análise documental ("Documentação conforme") —
  // despacho de pendência é cobrança de documento, não decisão. Os dois aparecem, com rótulos
  // diferentes, pra não se passarem um pelo outro na lista.
  { rotulo: "CHEADV OK", teste: (t) => t.includes("cheadv") && t.includes("conforme") },
  { rotulo: "CHEADV PENDÊNCIA", teste: (t) => t.includes("cheadv") },
  { rotulo: "NOTIFICACAO", teste: (t) => t.startsWith("notificacao") },
  { rotulo: "EMBARGO", teste: (t) => t.includes("embargo") },
  // "Vistoria Simples", "Vistoria Por Nível de Complexidade" e "Relatório de Visita Técnica
  // fiscal" saíram da medição em 12 outros processos (08/09/2026, 199 documentos) — são os nomes
  // que a fiscalização usa de verdade, além do "Relatório de Fiscalização" que já era coberto.
  {
    rotulo: "VISTORIA",
    teste: (t) =>
      t.startsWith("vistoria") ||
      t.includes("relatorio de fiscalizacao") ||
      t.includes("relatorio de vistoria") ||
      t.includes("visita tecnica") ||
      t.includes("termo de vistoria") ||
      t.includes("relatorio circunstanciado"),
  },
  { rotulo: "FOTOS", teste: (t) => t.includes("fotografic") || t.includes("fotografia") },
  { rotulo: "PROJETO", teste: (t) => t.startsWith("projeto") || t.includes("levantamento arquitetonico") },
  { rotulo: "LAUDO", teste: (t) => t.includes("laudo") },
  { rotulo: "ART", teste: (t) => /\b(art|rrt)\b/.test(t) },
  { rotulo: "CERTIDAO", teste: (t) => t.includes("certidao") || t.includes("matricula") },
  { rotulo: "PROCURACAO", teste: (t) => t.includes("procuracao") },
  { rotulo: "MEMORIAL", teste: (t) => t.includes("memorial") },
  // A busca de processos no mesmo endereço — que o LIP guarda em `outro`/`qualOutro` e que é uma
  // das condições que impedem a análise — quase nunca se chama "Busca" no SEI. No processo real
  // 24.5.000024350-0 ela veio como "Encaminhamento 9981052", e o corpo do texto é que diz "após
  // buscas no endereço do imóvel foi localizado o projeto anteriormente aprovado". Por isso os
  // dois rótulos: BUSCA quando o título é explícito, ENCAMINHAMENTO quando é o nome burocrático
  // (o analista abre e confere — o título sozinho não permite afirmar que é a busca).
  { rotulo: "BUSCA", teste: (t) => t.includes("busca") && (t.includes("processo") || t.includes("endereco") || t.includes("arquivad")) },
  { rotulo: "ENCAMINHAMENTO", teste: (t) => t.startsWith("encaminhamento") },
  { rotulo: "DUAM", teste: (t) => t.startsWith("duam") },
  // "Pagamento", "Pagamento PAGAMENTO TAXA" e "Boleto" apareceram na medição dos 12 processos.
  {
    rotulo: "TAXA",
    teste: (t) =>
      t.includes("pagamento") ||
      t.startsWith("comprovante") ||
      t.startsWith("boleto") ||
      t.includes("guia de recolhimento"),
  },
  // Documento final do processo — o que o analista emite no fim. Vale ter rótulo próprio.
  { rotulo: "ALVARA", teste: (t) => t.startsWith("alvara") },
  { rotulo: "DESPACHO", teste: (t) => t.startsWith("despacho") },
  { rotulo: "PARECER", teste: (t) => t.startsWith("parecer") },
  { rotulo: "OFICIO", teste: (t) => t.startsWith("oficio") },
  { rotulo: "REQUERIMENTO", teste: (t) => t.startsWith("requerimento") },
  { rotulo: "EMAIL", teste: (t) => t.startsWith("e-mail") || t.startsWith("email") },
];

/** Papel de peça (Fase 3) → mesmo vocabulário, pra peça de dentro de contêiner também ter rótulo. */
const ROTULO_POR_PAPEL: Record<string, string | undefined> = {
  projeto: "PROJETO",
  levantamento: "PROJETO",
  art_levantamento: "ART",
  art_caixa: "ART CAIXA",
  matricula: "CERTIDAO",
  certidao: "CERTIDAO",
  laudo: "LAUDO",
  vistoria: "VISTORIA",
  foto: "FOTOS",
  memorial: "MEMORIAL",
  procuracao: "PROCURACAO",
  embargo: "EMBARGO",
  // `art` genérico fica de fora de propósito (não se sabe se é de levantamento ou da caixa),
  // igual `compararLip.ts` faz — e despacho/parecer/ofício/e-mail já vêm do título do evento.
};

/**
 * Rótulo do analista para um evento, ou `null` quando o título não permite afirmar nada.
 * `null` é resposta legítima: melhor sem rótulo do que com rótulo errado.
 */
export function rotuloDoTitulo(titulo: string): string | null {
  const t = normalizar(titulo).trim();
  for (const r of REGRAS) if (r.teste(t)) return r.rotulo;
  return null;
}

/** Rótulo de uma peça já classificada pela Fase 3 (`lib/documentosSei/pecas.ts`). */
export function rotuloDoPapelPeca(papel: string): string | null {
  return ROTULO_POR_PAPEL[papel] ?? null;
}

/**
 * A LISTA DA ANÁLISE — os documentos que o analista precisa ter em mãos pra analisar um processo,
 * na ordem em que ele os procura. Definida pelo Fábio em 08/09/2026, olhando a pasta que ele monta
 * à mão a cada processo ("é só olhar a minha lista"):
 *
 *   "CONTEC: o uso do solo · CHEADV: o OK na análise documental · fiscalização: vistoria fiscal, a
 *    última · físico: geralmente no começo, a primeira página, com a abertura do processo físico ·
 *    as ART ou RRT · a certidão de matrícula · o último laudo de regularização ou aceite · as
 *    procurações · os embargos"
 *
 * Ficaram DE FORA por decisão dele: fotos, notificação de calçada, DUAM/taxa/comprovante, e-mails,
 * solicitações e despachos de pendência — existem no processo, aparecem na lista completa, mas não
 * são o que ele abre pra analisar.
 */
export const TIPOS_DA_ANALISE = [
  "FISICO",
  "USO",
  "CHEADV OK",
  "VISTORIA",
  "PROJETO",
  "LAUDO",
  "ART",
  "CERTIDAO",
  "PROCURACAO",
  "EMBARGO",
  "BUSCA",
] as const;

export type TipoDaAnalise = (typeof TIPOS_DA_ANALISE)[number];

/**
 * A lista NÃO é a mesma nos dois slots — quem decide é o componente de cada um, porque é regra de
 * negócio de slot (CLAUDE.md), não do mecanismo:
 *
 * - Regularização SEI (Slot 1): a lista inteira.
 * - Aceite SEI (Slot 2): SEM "USO" — "no slot 2 não tem uso do solo" (Fábio, 08/09/2026). Pedir
 *   um documento que não existe naquele rito faria a tela mostrar "não encontrado" pra sempre,
 *   treinando o analista a ignorar o aviso de faltante — que é justamente o que ele precisa ver.
 */
export const TIPOS_DA_ANALISE_REGULARIZACAO: readonly TipoDaAnalise[] = TIPOS_DA_ANALISE;
export const TIPOS_DA_ANALISE_ACEITE: readonly TipoDaAnalise[] =
  TIPOS_DA_ANALISE.filter((t) => t !== "USO");

/** O que o CORPO do documento afirma (`EventoSei.papelPorConteudo`) → rótulo. */
const ROTULO_POR_CONTEUDO: Record<string, string | undefined> = {
  busca: "BUSCA",
  vistoria: "VISTORIA",
  foto: "FOTOS",
};

/**
 * Ato numerado: o TÍTULO é a identidade do documento, e o corpo dele cita outros documentos o
 * tempo todo ("em atenção ao Termo de Vistoria..."). Deixar o conteúdo mandar aqui faria um
 * despacho virar vistoria por citação. Mesma lista de `RE_ATO` em `motorVersoes.ts`.
 */
const RE_ATO_TITULO = /^\s*(despacho|parecer|of[ií]cio|notifica[çc][ãa]o)\b/i;

/**
 * Rótulo de um evento inteiro. O CONTEÚDO vence o título — achados reais (08/09/2026):
 * a busca de processos no mesmo endereço chega intitulada "Encaminhamento", e a vistoria e o
 * registro fotográfico chegam AMBOS intitulados "Relatório"; em todos, só o corpo diz o que é.
 * Exceção: ato numerado (despacho/parecer/ofício/notificação), onde o título é a identidade e o
 * corpo só faz citação. Onde o corpo não afirma nada, vale o título.
 */
export function rotuloDoEvento(ev: { titulo: string; papelPorConteudo?: string }): string | null {
  const porTitulo = rotuloDoTitulo(ev.titulo);
  if (RE_ATO_TITULO.test(ev.titulo)) return porTitulo;
  if (ev.papelPorConteudo) {
    const porConteudo = ROTULO_POR_CONTEUDO[ev.papelPorConteudo];
    if (porConteudo) return porConteudo;
  }
  return porTitulo;
}

export type ItemDaAnalise = {
  tipo: TipoDaAnalise;
  /** ausente = não encontrado no processo (a linha aparece assim mesmo — ver comentário abaixo) */
  idSei?: string;
  titulo?: string;
  paginaIni?: number;
  paginaFim?: number;
  setor?: string;
  data?: string;
  /** true quando o documento foi achado DENTRO de um contêiner ("Documentação"), não como evento */
  dePeca?: boolean;
};

type EventoParaLista = {
  idSei: string;
  titulo: string;
  paginaIni: number;
  paginaFim: number;
  setor?: string;
  data?: string;
  papelPorConteudo?: string;
  pecas?: { papel: string; paginaIni: number; paginaFim: number }[];
};

/**
 * Monta A LISTA DA ANÁLISE: um documento de cada tipo de `TIPOS_DA_ANALISE`, o mais recente de
 * cada (maior página = mais tarde no processo), procurando tanto nos eventos quanto nas peças de
 * dentro dos contêineres — é lá que moram ART, certidão, laudo, embargo e procuração.
 *
 * Tipo não encontrado ENTRA NA LISTA mesmo assim, sem documento: "não achei a ART" é informação
 * que o analista precisa ver, e uma linha que simplesmente não existe não informa nada. Mesmo
 * princípio de "nenhuma página some em silêncio" (§5.2 do plano), aplicado à lista de trabalho.
 */
export function montarListaDaAnalise(
  eventos: EventoParaLista[],
  tiposDoSlot: readonly TipoDaAnalise[] = TIPOS_DA_ANALISE,
): ItemDaAnalise[] {
  const melhor = new Map<TipoDaAnalise, ItemDaAnalise>();
  const tipos = new Set<string>(tiposDoSlot);

  function considerar(tipo: TipoDaAnalise, item: ItemDaAnalise) {
    const atual = melhor.get(tipo);
    // mais recente vence: no SEI, página maior = anexado depois
    if (!atual || (item.paginaIni ?? 0) > (atual.paginaIni ?? 0)) melhor.set(tipo, item);
  }

  eventos.forEach((ev, indice) => {
    /**
     * FISICO — "geralmente no começo, a primeira página, com a abertura do processo físico"
     * (Fábio). O SEI intitula isso só de "Processo", que é contêiner genérico e não diz nada
     * sozinho; o que identifica é a POSIÇÃO: primeiro evento do PDF, começando na página 1.
     */
    if (tipos.has("FISICO") && indice === 0 && ev.paginaIni === 1 && /^processo\b/i.test(ev.titulo.trim())) {
      considerar("FISICO", {
        tipo: "FISICO", idSei: ev.idSei, titulo: ev.titulo,
        paginaIni: ev.paginaIni, paginaFim: ev.paginaFim, setor: ev.setor, data: ev.data,
      });
    }

    const rotulo = rotuloDoEvento(ev);
    if (rotulo && tipos.has(rotulo)) {
      considerar(rotulo as TipoDaAnalise, {
        tipo: rotulo as TipoDaAnalise, idSei: ev.idSei, titulo: ev.titulo,
        paginaIni: ev.paginaIni, paginaFim: ev.paginaFim, setor: ev.setor, data: ev.data,
      });
    }

    for (const peca of ev.pecas ?? []) {
      const rotuloPeca = rotuloDoPapelPeca(peca.papel);
      if (!rotuloPeca || !tipos.has(rotuloPeca)) continue;
      considerar(rotuloPeca as TipoDaAnalise, {
        tipo: rotuloPeca as TipoDaAnalise, idSei: ev.idSei, titulo: ev.titulo,
        paginaIni: peca.paginaIni, paginaFim: peca.paginaFim, setor: ev.setor, data: ev.data,
        dePeca: true,
      });
    }
  });

  return tiposDoSlot.map((tipo) => melhor.get(tipo) ?? { tipo });
}

/**
 * Nome de arquivo no padrão que o Fábio já usa à mão: `TIPO SEI.pdf`. Sem rótulo conhecido, cai
 * no título do SEI (nunca inventa um tipo) — e a rastreabilidade continua garantida pelo Nº SEI,
 * que identifica o documento dentro do processo melhor que qualquer hash local.
 */
export function nomeArquivoAnalista(titulo: string, idSei: string, sufixo?: string): string {
  const rotulo = rotuloDoTitulo(titulo);
  const base = rotulo ?? titulo.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${base}${sufixo ? ` ${sufixo}` : ""} ${idSei}.pdf`;
}
