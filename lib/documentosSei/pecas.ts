/**
 * lib/documentosSei/pecas.ts — Fase 3 do plano Documentos Vivos
 * (docs/URBIS_PLANO_DOCUMENTOS_VIVOS.md). "Abrir os contêineres": eventos genéricos do SEI
 * ("Documentação", "Processo", "Solicitação") escondem várias peças dentro — projeto, ART,
 * matrícula, laudo, foto etc. Este módulo separa essas peças DENTRO de um evento já fatiado
 * (Fase 1), sem reler o PDF inteiro.
 *
 * Módulo NOVO e ISOLADO: não importa `lib/lerPastaSlot5.ts` (Slot 5) — regra de isolamento entre
 * slots do CLAUDE.md. A tabela `ASSINATURAS_PECA` abaixo é reproduzida no ESPÍRITO da tabela
 * `ASSINATURAS` de `lerPastaSlot5.ts` (array ordenado, primeira regra que casar decide), mas
 * escrita do zero para o vocabulário dos Slots 1/2 e testada por PÁGINA (não pelo documento
 * inteiro, que aqui é só um pedaço do PDF do SEI).
 *
 * Zero IA, zero rede. Página que não casa nenhuma assinatura vira `classificacao_pendente` —
 * NUNCA é descartada (princípio §5.2 do plano: "nenhuma página some em silêncio").
 */
import type { PaginaTexto } from "./fatiar";

export type PapelPeca =
  | "projeto"
  | "levantamento"
  | "art"
  | "art_levantamento"
  | "art_caixa"
  | "matricula"
  | "certidao"
  | "laudo"
  | "vistoria"
  | "foto"
  | "memorial"
  | "procuracao"
  | "embargo"
  | "despacho"
  | "parecer"
  | "oficio"
  | "requerimento"
  | "email"
  | "classificacao_pendente";

export type PecaSei = {
  papel: PapelPeca;
  paginaIni: number;
  paginaFim: number;
  /** "media" quando casou uma assinatura de conteúdo; "baixa" quando ficou pendente. */
  confianca: "media" | "baixa";
};

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Ordem importa: a primeira assinatura que casar decide o papel da página (mesmo princípio de
 * `ASSINATURAS`/`SLOTS_SEI` em `lerPastaSlot5.ts` e de `REGRAS` em `compararLip.ts`). Vocabulário
 * limitado ao que o plano cita (§6 Fase 3) — ampliar exige processo real que justifique.
 */
const ASSINATURAS_PECA: { papel: PapelPeca; re: RegExp }[] = [
  { papel: "matricula", re: /\b(certidao\s+de\s+matricula|registro\s+de\s+imoveis)\b/ },
  // ART de Levantamento e ART da Caixa (recarga) são campos DISTINTOS no LIP — só sugerir um ou
  // outro quando a peça deixa isso explícito; ambíguo fica em "art" genérico, sem sugestão
  // (compararLip.ts segue o princípio "melhor vazio que chutado").
  { papel: "art_levantamento", re: /\b(art|rrt)\b[^.]{0,40}\blevantamento\b|\blevantamento\b[^.]{0,40}\b(art|rrt)\b/ },
  { papel: "art_caixa", re: /\b(art|rrt)\b[^.]{0,40}\bcaixa\b|\bcaixa\b[^.]{0,40}\b(art|rrt)\b/ },
  { papel: "art", re: /\b(art\s+obra\s+ou\s+servico|anotacao\s+de\s+responsabilidade\s+tecnica|detalhes?\s+do\s+rrt|n[ºo°]?\s*(do\s+)?rrt)\b/ },
  { papel: "levantamento", re: /\blevantamento\s+(planialtimetrico|topografico)\b/ },
  { papel: "projeto", re: /\b(area\s+total\s+da\s+construcao|projeto\s+legal\s+de\s+arquitetura|quadro\s+de\s+areas)\b/ },
  { papel: "laudo", re: /\blaudo\s+(tecnico|de\s+vistoria|geologico|estrutural)?\b/ },
  { papel: "vistoria", re: /\b(relatorio\s+de\s+vistoria|relatorio\s+de\s+fiscalizacao|relatorio\s+circunstanciado)\b/ },
  { papel: "foto", re: /\b(registro\s+fotografico|fotografia|fotos?\s+do\s+local)\b/ },
  { papel: "memorial", re: /\bmemorial\s+(descritivo|de\s+calculo)\b/ },
  { papel: "procuracao", re: /\bprocuracao\b/ },
  { papel: "embargo", re: /\bembargo\b/ },
  // atos numerados: mesma distinção já registrada no plano ("despachos sucessivos são atos, não versões")
  { papel: "despacho", re: /^\s*despacho\b/ },
  { papel: "parecer", re: /^\s*parecer\b/ },
  { papel: "oficio", re: /^\s*of[ií]cio\b/ },
  { papel: "requerimento", re: /\brequerimento\b/ },
  // e-mail: heurística fraca de propósito (cabeçalho De/Para/Assunto), nunca decide sozinha coisa mais forte acima
  { papel: "email", re: /\bde\s*:.*\bpara\s*:|assunto\s*:/ },
  { papel: "certidao", re: /\bcertidao\b/ },
];

function classificarPagina(texto: string): PapelPeca | null {
  const norm = normalizar(texto);
  for (const a of ASSINATURAS_PECA) if (a.re.test(norm)) return a.papel;
  return null;
}

/** Testa se o título do evento é um contêiner genérico (esconde várias peças dentro). */
export function ehContainerGenerico(titulo: string): boolean {
  const norm = normalizar(titulo);
  return /^(documenta[çc][ãa]o|processo|solicita[çc][ãa]o|anexo|documentos?)\b/.test(norm);
}

/**
 * Separa as peças de um evento-contêiner. `paginasDoEvento` já vem restrito ao intervalo do
 * evento (ver `lerPaginasIntervalo` em `fatiar.ts`) — a contagem fecha por construção, já que toda
 * página do array entra em exatamente uma peça (classificada ou `classificacao_pendente`).
 *
 * Muda de peça quando: (a) a classificação por conteúdo muda, OU (b) a orientação da página vira
 * (retrato↔paisagem) — sinal citado no plano (§6 Fase 3) para separar peças do mesmo tipo aparente
 * coladas (ex.: duas ARTs seguidas). O pior caso desta heurística é separar demais uma peça só
 * (nunca junta duas peças diferentes por engano) — direção seguindo o princípio de nunca perder
 * dado, só eventualmente sobrar peça de mais.
 */
export function abrirContainer(paginasDoEvento: PaginaTexto[]): PecaSei[] {
  const pecas: PecaSei[] = [];
  let orientacaoAnterior: "retrato" | "paisagem" | null = null;

  for (const p of paginasDoEvento) {
    const papel = classificarPagina(p.texto) ?? "classificacao_pendente";
    const orientacao: "retrato" | "paisagem" = p.largura > p.altura ? "paisagem" : "retrato";
    const mudaOrientacao = orientacaoAnterior !== null && orientacao !== orientacaoAnterior;

    const atual = pecas[pecas.length - 1];
    if (atual && atual.papel === papel && !mudaOrientacao) {
      atual.paginaFim = p.pagina;
    } else {
      pecas.push({
        papel,
        paginaIni: p.pagina,
        paginaFim: p.pagina,
        confianca: papel === "classificacao_pendente" ? "baixa" : "media",
      });
    }
    orientacaoAnterior = orientacao;
  }

  return pecas;
}

/** Rótulo humano de cada papel, para a tela. */
export const ROTULO_PAPEL_PECA: Record<PapelPeca, string> = {
  projeto: "Projeto",
  levantamento: "Levantamento",
  art: "ART/RRT (não identificado qual)",
  art_levantamento: "ART de Levantamento",
  art_caixa: "ART da Caixa",
  matricula: "Matrícula",
  certidao: "Certidão",
  laudo: "Laudo",
  vistoria: "Vistoria",
  foto: "Fotografia",
  memorial: "Memorial",
  procuracao: "Procuração",
  embargo: "Embargo",
  despacho: "Despacho",
  parecer: "Parecer",
  oficio: "Ofício",
  requerimento: "Requerimento",
  email: "E-mail",
  classificacao_pendente: "Classificação pendente",
};
