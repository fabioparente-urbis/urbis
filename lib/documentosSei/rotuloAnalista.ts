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
  // CHEADV que aprova é o que interessa, mas o despacho de pendência TAMBÉM é da CHEADV — os dois
  // levam o rótulo; quem separa "aprovou" de "cobrou documento" é o campo cheadvAprovado do LIP.
  { rotulo: "CHEADV", teste: (t) => t.includes("cheadv") },
  { rotulo: "NOTIFICACAO", teste: (t) => t.startsWith("notificacao") },
  { rotulo: "EMBARGO", teste: (t) => t.includes("embargo") },
  { rotulo: "VISTORIA", teste: (t) => t.includes("relatorio de fiscalizacao") || t.includes("relatorio de vistoria") || t.includes("termo de vistoria") || t.includes("relatorio circunstanciado") },
  { rotulo: "FOTOS", teste: (t) => t.includes("fotografic") || t.includes("fotografia") },
  { rotulo: "PROJETO", teste: (t) => t.startsWith("projeto") || t.includes("levantamento arquitetonico") },
  { rotulo: "LAUDO", teste: (t) => t.includes("laudo") },
  { rotulo: "ART", teste: (t) => /\b(art|rrt)\b/.test(t) },
  { rotulo: "CERTIDAO", teste: (t) => t.includes("certidao") || t.includes("matricula") },
  { rotulo: "PROCURACAO", teste: (t) => t.includes("procuracao") },
  { rotulo: "MEMORIAL", teste: (t) => t.includes("memorial") },
  { rotulo: "BUSCA", teste: (t) => t.includes("busca") && (t.includes("processo") || t.includes("arquivad")) },
  { rotulo: "DUAM", teste: (t) => t.startsWith("duam") },
  { rotulo: "TAXA", teste: (t) => t.includes("pagamento de taxa") || t.startsWith("comprovante") || t.includes("guia de recolhimento") },
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
 * Nome de arquivo no padrão que o Fábio já usa à mão: `TIPO SEI.pdf`. Sem rótulo conhecido, cai
 * no título do SEI (nunca inventa um tipo) — e a rastreabilidade continua garantida pelo Nº SEI,
 * que identifica o documento dentro do processo melhor que qualquer hash local.
 */
export function nomeArquivoAnalista(titulo: string, idSei: string, sufixo?: string): string {
  const rotulo = rotuloDoTitulo(titulo);
  const base = rotulo ?? titulo.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${base}${sufixo ? ` ${sufixo}` : ""} ${idSei}.pdf`;
}
