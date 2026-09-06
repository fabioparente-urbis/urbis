/**
 * lib/documentosSei/compararLip.ts — Fase 6 (adiantada) do plano Documentos Vivos: comparação
 * DETERMINÍSTICA (zero IA) entre o índice do Organizador de PDF SEI e os 11 campos do LIP que
 * hoje são adivinhados pelo Gemini numa passada só (ver `app/api/lip/analisar/route.ts:77` e
 * docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md §3/§6).
 *
 * NUNCA escreve em lugar nenhum — só sugere. Quem decide o que aceitar é o analista, na tela,
 * campo por campo (mesmo padrão de `ler-pasta`/`aceitar-pasta`: proposta, nunca gravação
 * automática — pedido explícito do Fábio de manter esse padrão mesmo aqui, 06/09/2026).
 *
 * O valor sugerido é o Nº SEI do documento (idSei) — é literalmente isso que os 11 campos já
 * guardam hoje (o número de 7 dígitos do rodapé), então o formato do valor não muda, só a fonte.
 *
 * Desde a Fase 3 (abrir contêineres, `lib/documentosSei/pecas.ts`), eventos genéricos
 * ("Documentação") podem trazer `.pecas` — peças separadas de dentro do contêiner. Quando isso
 * existe, `certidao`, `levantamento`, `artLev`, `artCx`, `laudo` e `seiEmbargo` passam a poder ser
 * sugeridos a partir da peça (antes ficavam sem sugestão, escondidos dentro do contêiner inteiro).
 * Peça `classificacao_pendente` ou papel `art` ambíguo (não deu para saber se é de Levantamento ou
 * da Caixa) nunca vira sugestão — "se não souber, tudo bem vazio" (Fábio, 06/09/2026) continua
 * valendo também no nível de peça.
 */
import type { EventoSei } from "./fatiar";
import type { PecaSei } from "./pecas";

export type SugestaoCampo = { idSei: string; titulo: string; pagina: number };
export type EventoComPecas = EventoSei & { pecas?: PecaSei[] };

type Regra = { chave: string; teste: (tituloNormalizado: string) => boolean };

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Ordem importa: a primeira regra que casar um evento "ganha" aquele campo (o evento mais
 * RECENTE por página, entre os que casarem — histórico de correções vale o último).
 */
const REGRAS: Regra[] = [
  { chave: "usoSolo", teste: (t) => t.includes("uso do solo") },
  { chave: "certidao", teste: (t) => t.includes("certidao") },
  { chave: "foto", teste: (t) => t.includes("fotografic") || t.includes("fotografia") },
  {
    chave: "vistoria",
    teste: (t) => t.includes("vistoria") || t.includes("relatorio de fiscalizacao") || t.includes("relatorio circunstanciado"),
  },
  { chave: "seiProcuracao", teste: (t) => t.includes("procuracao") },
  // CHEADV que aprova ("conforme") é o que vale para o campo — não qualquer despacho de
  // pendência no meio do caminho, que é só cobrança de documento, não decisão.
  { chave: "seiCheadv", teste: (t) => t.includes("cheadv") && t.includes("conforme") },
];

/** Papel de peça (Fase 3) → chave do campo LIP. Papel ausente daqui nunca vira sugestão de propósito. */
const CAMPO_POR_PAPEL_PECA: Record<string, string | undefined> = {
  matricula: "certidao",
  certidao: "certidao",
  levantamento: "levantamento",
  art_levantamento: "artLev",
  art_caixa: "artCx",
  laudo: "laudo",
  vistoria: "vistoria",
  foto: "foto",
  procuracao: "seiProcuracao",
  embargo: "seiEmbargo",
};

/**
 * Devolve, para cada chave reconhecida, o evento (ou peça, quando existir) mais recente (maior
 * página) que casou a regra. Chaves sem evidência confiável nunca aparecem no resultado — o
 * chamador trata ausência como "sem sugestão", não como "vazio por erro".
 */
export function sugerirCamposLip(eventos: EventoComPecas[]): Record<string, SugestaoCampo> {
  const sugestoes: Record<string, SugestaoCampo> = {};

  function considerar(chave: string, idSei: string, titulo: string, pagina: number) {
    const atual = sugestoes[chave];
    if (!atual || pagina > atual.pagina) sugestoes[chave] = { idSei, titulo, pagina };
  }

  for (const ev of eventos) {
    const tituloNorm = normalizar(ev.titulo);
    for (const regra of REGRAS) {
      if (regra.teste(tituloNorm)) considerar(regra.chave, ev.idSei, ev.titulo, ev.paginaIni);
    }
    for (const peca of ev.pecas ?? []) {
      const chave = CAMPO_POR_PAPEL_PECA[peca.papel];
      if (!chave) continue; // pendente, ou papel ambíguo (art genérico) — sem sugestão de propósito
      considerar(chave, ev.idSei, `${ev.titulo} (peça: ${peca.papel})`, peca.paginaIni);
    }
  }
  return sugestoes;
}

/** Rótulo humano de cada campo, para a tela — mesmos 11 campos de app/api/lip/analisar/route.ts. */
export const ROTULO_CAMPO_LIP: Record<string, string> = {
  certidao: "Certidão",
  levantamento: "Levantamento",
  artLev: "ART de Levantamento",
  artCx: "ART da Caixa",
  laudo: "Laudo",
  vistoria: "Vistoria",
  foto: "Foto",
  usoSolo: "Uso do Solo",
  seiCheadv: "SEI — CHEADV",
  seiProcuracao: "SEI — Procuração",
  seiEmbargo: "SEI — Embargo",
};
