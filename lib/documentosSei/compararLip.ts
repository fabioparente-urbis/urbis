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
 * LIMITE HONESTO: `artLev`/`artCx` (duas ARTs de papéis diferentes) e `seiEmbargo` não têm
 * palavra própria confiável na lista de eventos desta fase — ART normalmente vem DENTRO de um
 * contêiner genérico ("Documentação"), que só a Fase 3 (abrir contêineres) vai separar. Melhor
 * ficar sem sugestão do que chutar qual ART é qual — "se não souber, tudo bem vazio" (Fábio,
 * 06/09/2026).
 */
import type { EventoSei } from "./fatiar";

export type SugestaoCampo = { idSei: string; titulo: string; pagina: number };

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

/**
 * Devolve, para cada chave reconhecida, o evento mais recente (maior página) que casou a regra.
 * Chaves sem evidência confiável (artLev, artCx, levantamento, seiEmbargo) nunca aparecem no
 * resultado — o chamador trata ausência como "sem sugestão", não como "vazio por erro".
 */
export function sugerirCamposLip(eventos: EventoSei[]): Record<string, SugestaoCampo> {
  const sugestoes: Record<string, SugestaoCampo> = {};
  for (const ev of eventos) {
    const tituloNorm = normalizar(ev.titulo);
    for (const regra of REGRAS) {
      if (!regra.teste(tituloNorm)) continue;
      const atual = sugestoes[regra.chave];
      if (!atual || ev.paginaFim > atual.pagina) {
        sugestoes[regra.chave] = { idSei: ev.idSei, titulo: ev.titulo, pagina: ev.paginaIni };
      }
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
