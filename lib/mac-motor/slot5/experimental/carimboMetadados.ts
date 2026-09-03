/**
 * lib/mac-motor/slot5/experimental/carimboMetadados.ts — arquétipo 4, EXPERIMENTAL, biblioteca
 * isolada da leitura visual profunda (Fase 5 de "TAREFA DA NOITE", 03/09/2026).
 *
 * ESCOPO DESTA PRIMEIRA FATIA: só metadado NÃO pessoal do carimbo — número do projeto/protocolo,
 * número da prancha (ex.: "02/07"), escala, data de emissão, título do projeto (nome do
 * empreendimento, nunca de pessoa). Nunca lê nome, CPF, CREA/CAU ou endereço do proprietário/
 * responsável técnico — o prompt instrui isso explicitamente, e nenhum fato com esse conteúdo tem
 * onde ser gravado por este módulo (mesma regra de dado nominal do resto do URBIS,
 * ver lib/urbi/dossieProcesso.ts).
 *
 * POR QUE SÓ ISSO NESTA RODADA: alturaDaEdificacao (a cota que decide `outorgaOnerosa`, ver
 * ../outorgaOnerosa.ts) foi cogitada e descartada como alvo desta primeira fatia — cortes reais têm
 * várias cotas de altura (total, entrepiso, platibanda), e escolher QUAL delas é "do térreo até a
 * cobertura/forro/telhado" pela definição do Fábio é uma decisão de conteúdo, não só leitura; o
 * próprio código já registrou isso como PENDENTE_VISAO de propósito (lib/mac-motor/slot5/
 * outorgaOnerosa.ts:11-14). Ler o carimbo primeiro é o degrau mais seguro: campo de metadado puro,
 * sem ambiguidade de qual cota é a certa, sem chance de decidir outorga onerosa errado.
 *
 * ISOLAMENTO: nenhum arquivo existente foi alterado. Este módulo não é importado por
 * lib/mac-motor/slot5/index.ts, nem por nenhuma rota, nem por nenhuma tela — só existe se alguém
 * importar diretamente daqui. Mesmo padrão de comparadorQuadroCarimbo.ts (arquétipo 3): sem
 * mac_item_id, sem gravação em mac_resultados_item, resultado não gravado em lugar nenhum.
 *
 * NÃO TESTADO CONTRA GEMINI DE VERDADE ainda — as regras existentes (dimensoesTerreno,
 * caixaDeRecarga) só chegaram a esta robustez depois de "teste histórico" com documento real (ver
 * caixaDeRecarga.ts v4, achado no processo 44353). Este módulo tem testes puros (sem rede) para a
 * lógica determinística — comparação de consistência entre carimbos —, mas a extração em si
 * (prompt → Gemini → fato) ainda não foi validada com uma prancha real. Rodar essa validação é o
 * próximo passo, antes de qualquer wiring.
 */

import { GEMINI_MODEL } from "@/lib/constants";
import type { FatoExtraido } from "../tipos";
import { hashPrompt, type PromptSlot5 } from "../prompts";
import { parseNumeroBR } from "../util";

// ------------------------------------------------------------------ prompt

/** Nomes de fato usados por este prompt — um POR OCORRÊNCIA de carimbo encontrada (a prancha pode
 *  ter mais de uma página com carimbo); o nome se repete entre ocorrências, `pagina` desambigua. */
export const FATO_CARIMBO_NUMERO_PROJETO = "carimbo:numeroProjeto";
export const FATO_CARIMBO_NUMERO_PRANCHA = "carimbo:numeroPrancha";
export const FATO_CARIMBO_ESCALA = "carimbo:escala";
export const FATO_CARIMBO_DATA_EMISSAO = "carimbo:dataEmissao";
export const FATO_CARIMBO_TITULO = "carimbo:titulo";

export const PROMPT_CARIMBO_METADADOS: PromptSlot5 = {
  id: "slot5.experimental.carimboMetadados",
  versao: 1,
  modelo: GEMINI_MODEL,
  papeisEsperados: ["projeto"],
  texto: [
    "Você está lendo uma prancha de PROJETO ARQUITETÔNICO de um processo de aprovação municipal",
    "brasileiro (Aprovação de Projeto). A prancha pode ter várias páginas, e o carimbo (bloco de",
    "identificação, normalmente num canto) pode aparecer em mais de uma.",
    "",
    "PROIBIDO: nunca leia nem transcreva nome de pessoa, CPF, RG, número de CREA/CAU, telefone,",
    "e-mail ou endereço do proprietário/responsável técnico, mesmo que apareçam no carimbo. Esses",
    "campos NÃO fazem parte desta extração — ignore-os completamente, mesmo que estejam bem legíveis.",
    "",
    "Para CADA página onde houver um carimbo, extraia até 5 fatos (repita o mesmo 'nome' em cada",
    "ocorrência — a página em cada fato é o que diferencia uma ocorrência da outra):",
    "",
    '  "carimbo:numeroProjeto" — número do projeto/protocolo/processo indicado no carimbo (não é',
    "     CPF nem CREA — é o número administrativo do processo/projeto).",
    '  "carimbo:numeroPrancha" — identificação da prancha, como escrita (ex.: "02/07", "PR-03").',
    '  "carimbo:escala"        — a escala indicada (ex.: "1:100", "1/50").',
    '  "carimbo:dataEmissao"   — a data de emissão/elaboração do projeto, como escrita no carimbo.',
    '  "carimbo:titulo"        — o título/nome do projeto ou empreendimento (NUNCA nome de pessoa;',
    "     se o único texto disponível for o nome do proprietário, absenha-se este fato).",
    "",
    "Abstenha-se FATO A FATO, nunca da página inteira: um carimbo ilegível ou sem um desses campos",
    "vira abstencao=true SÓ para aquele fato — os demais continuam normais. Responder um valor que",
    "você não leu com clareza é PIOR do que se abster.",
    "",
    "Você NUNCA decide se o projeto está conforme, nem compara nada entre páginas — só transcreve",
    "literalmente o que está escrito em cada carimbo encontrado. A comparação é de um código",
    "determinístico, fora desta chamada.",
    "",
    "Responda SOMENTE com JSON, sem cercas de código, no formato:",
    '{"fatos": [',
    '  {"nome": "carimbo:numeroProjeto", "valor": "<string, como aparece>", "unidade": null,',
    '   "documento": "<papel do documento>", "pagina": <número ou null>, "trecho": "<citação curta>",',
    '   "confianca": <0.0 a 1.0>, "observacao": null},',
    '  {"nome": "carimbo:escala", "abstencao": true, "motivo": "<por que não deu para ler>", "documento": "<papel ou null>"}',
    "]}",
  ].join("\n"),
};

export const HASH_PROMPT_CARIMBO_METADADOS = hashPrompt(PROMPT_CARIMBO_METADADOS);

// ------------------------------------------------------------- comparador

export type OcorrenciaCarimbo = {
  pagina: number | null;
  numeroProjeto: string | null;
  numeroPrancha: string | null;
  escala: string | null;
  dataEmissao: string | null;
  titulo: string | null;
};

export type DivergenciaCarimbo = { campo: string; valores: { pagina: number | null; valor: string }[] };

export type ResultadoConsistenciaCarimbo = {
  status: "OK" | "DIVERGENTE" | "DADOS_INSUFICIENTES";
  ocorrencias: OcorrenciaCarimbo[];
  divergencias: DivergenciaCarimbo[];
  observacao: string;
};

/** Normaliza só para comparar (espaço/caixa) — nunca é o que se grava ou se mostra ao analista. */
function normalizarParaComparar(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, " ");
}

function agruparPorPagina(fatos: FatoExtraido[]): Map<number | null, Partial<Record<string, FatoExtraido>>> {
  const nomes = [
    FATO_CARIMBO_NUMERO_PROJETO, FATO_CARIMBO_NUMERO_PRANCHA, FATO_CARIMBO_ESCALA,
    FATO_CARIMBO_DATA_EMISSAO, FATO_CARIMBO_TITULO,
  ];
  const porPagina = new Map<number | null, Partial<Record<string, FatoExtraido>>>();
  let indiceSemPagina = 0;
  for (const f of fatos) {
    if (!nomes.includes(f.nome)) continue;
    // Vários carimbos de páginas diferentes podem não trazer `pagina` (abstenção não tem página
    // confiável) — cada fato sem página vira sua própria "ocorrência" sintética, nunca se mistura
    // com outra por acaso (chave negativa não colide com número de página real, que é >= 0).
    const chave = "pagina" in f && typeof (f as any).pagina === "number" ? (f as any).pagina : --indiceSemPagina;
    const atual = porPagina.get(chave) ?? {};
    atual[f.nome] = f;
    porPagina.set(chave, atual);
  }
  return porPagina;
}

/**
 * Pura — sem rede, sem banco. Agrupa os fatos "carimbo:*" por página e compara os campos que
 * deveriam ser IDÊNTICOS entre carimbos do mesmo processo (numeroProjeto, no mínimo — escala e
 * numeroPrancha variam legitimamente entre pranchas, então não entram na checagem de divergência,
 * só no relatório da ocorrência). Divergência aqui é sinal prático de arquivo errado/pranchas
 * misturadas — nunca uma decisão de conformidade.
 */
export function compararConsistenciaCarimbo(fatos: FatoExtraido[]): ResultadoConsistenciaCarimbo {
  const porPagina = agruparPorPagina(fatos);
  const ocorrencias: OcorrenciaCarimbo[] = [];
  const valorDe = (f: FatoExtraido | undefined): string | null => (f && !("abstencao" in f) ? f.valor : null);

  for (const [pagina, campos] of porPagina) {
    ocorrencias.push({
      pagina: typeof pagina === "number" && pagina >= 0 ? pagina : null,
      numeroProjeto: valorDe(campos[FATO_CARIMBO_NUMERO_PROJETO]),
      numeroPrancha: valorDe(campos[FATO_CARIMBO_NUMERO_PRANCHA]),
      escala: valorDe(campos[FATO_CARIMBO_ESCALA]),
      dataEmissao: valorDe(campos[FATO_CARIMBO_DATA_EMISSAO]),
      titulo: valorDe(campos[FATO_CARIMBO_TITULO]),
    });
  }
  ocorrencias.sort((a, b) => (a.pagina ?? -1) - (b.pagina ?? -1));

  if (ocorrencias.length === 0) {
    return { status: "DADOS_INSUFICIENTES", ocorrencias, divergencias: [], observacao: "nenhum carimbo foi lido (nem mesmo abstenção) — provável ausência de documento, não de dado." };
  }

  const numerosLegiveis = ocorrencias.filter((o) => o.numeroProjeto !== null);
  const divergencias: DivergenciaCarimbo[] = [];
  if (numerosLegiveis.length >= 2) {
    const distintos = new Set(numerosLegiveis.map((o) => normalizarParaComparar(o.numeroProjeto!)));
    if (distintos.size > 1) {
      divergencias.push({
        campo: "numeroProjeto",
        valores: numerosLegiveis.map((o) => ({ pagina: o.pagina, valor: o.numeroProjeto! })),
      });
    }
  }

  return {
    status: divergencias.length > 0 ? "DIVERGENTE" : numerosLegiveis.length > 0 ? "OK" : "DADOS_INSUFICIENTES",
    ocorrencias,
    divergencias,
    observacao: "componente experimental, sem item MAC vinculado — resultado não é gravado em mac_resultados_item; extração ainda não validada contra documento real.",
  };
}

/** Só para inspeção/depuração manual — não é usado por nenhuma regra de decisão. */
export function numeroDoProjetoComoNumero(o: OcorrenciaCarimbo): number | null {
  return o.numeroProjeto ? parseNumeroBR(o.numeroProjeto) : null;
}
