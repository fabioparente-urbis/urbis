/**
 * lib/visao/tipos.ts — vocabulário da VISÃO LOCALIZADA.
 *
 * A matriz (lib/rastreabilidade) declara O QUE um campo é. Isto executa a leitura dos campos que
 * só existem como imagem. Fica FORA de `lib/rastreabilidade` de propósito: a matriz declara, a
 * visão executa, e a matriz não pode passar a depender de quem executa.
 *
 * ── A RECEITA É A REGRA, E ELA INTEIRA ENTRA NO HASH ────────────────────────────
 * Em extrator determinístico, a regra é o código: mesmo padrão, mesmo texto, mesmo valor. Em visão
 * não é — o resultado depende de prompt, geometria do recorte, resolução, modelo e parser, todos
 * juntos. Hashear só o prompt daria governança de fachada: dois resultados diferentes com o mesmo
 * hash. Por isso a unidade versionada é a RECEITA INTEIRA.
 *
 * O modelo entra no hash porque é ativo de terceiro: `gemini-2.5-flash` é nome estável apontando
 * para pesos que mudam sem aviso. Trocar de modelo é mudança funcional, e tem que aparecer.
 */

/** Onde recortar, em FRAÇÃO da página — não em pontos, que variam com o formato do papel. */
export type Regiao = {
  pagina: number;
  /** cantos em fração da página (0..1), origem no topo-esquerda */
  x0: number; y0: number; x1: number; y1: number;
  /**
   * Maior dimensão desejada do recorte, em pixels.
   *
   * NÃO é DPI fixo, e a diferença é prática: a prancha do slot 5 é A0 (3370x2384pt) e a certidão é
   * A4. O mesmo DPI produziria 12 megapixels numa e 1 na outra — a primeira desperdiça dinheiro e
   * é reduzida pelo modelo de qualquer jeito.
   */
  alvoPx: number;
};

export type Estrategia =
  /**
   * Recorte por fração fixa da página. Depende do LAYOUT da prancha e quebra se o projetista
   * diagramar diferente — por isso a receita exige que o modelo se abstenha quando não encontrar a
   * tabela no recorte, em vez de tentar adivinhar a partir do que estiver ali.
   *
   * A alternativa (âncora de texto) não serve aqui: o conteúdo alvo é justamente o que NÃO está na
   * camada de texto. Localizador visual é assunto de outro sprint.
   */
  | "FRACAO_DA_PAGINA";

export type Receita = {
  id: string;
  /** sobe quando QUALQUER coisa que mude o comportamento muda — inclusive os validadores */
  versao: number;
  /**
   * Chaves do LIP que esta receita responde, TODAS numa chamada só.
   *
   * O recorte é a unidade de custo, não o campo: a tabela "CÁLCULO DE VAGAS" responde três campos
   * de uma vez, e pedir cada um numa chamada separada pagaria três vezes pela mesma imagem, com o
   * risco extra de os três virem de leituras inconsistentes entre si.
   */
  chaves: string[];
  estrategia: Estrategia;
  /** papel do documento no catálogo da leitura: "projeto", "certidao_matricula"… */
  papel: string;
  regiao: Regiao;
  prompt: string;
  modelo: string;
  /** o que torna o valor de CADA campo aceitável. Valor fora disto é tratado como ilegível. */
  validadores: Record<string, (valor: string) => { ok: boolean; motivo?: string }>;
  /**
   * Coerência ENTRE os campos do mesmo recorte, quando existe relação conhecida.
   *
   * É a defesa mais forte contra alucinação que um recorte agrupado oferece: o modelo pode errar um
   * número plausível, mas dificilmente erra três de forma internamente consistente. Leitura
   * incoerente derruba o recorte inteiro — não dá para saber QUAL dos três está errado.
   */
  coerencia?: (valores: Record<string, string>) => { ok: boolean; motivo?: string };
};

/** O que o modelo respondeu sobre UM campo. Abstenção é por campo, não pelo recorte todo. */
export type LeituraCampo =
  | { ok: true; valor: string; confianca: number | null }
  | { ok: false; motivo: string };

export type Interpretacao = {
  /** uma entrada por chave da receita. Parte pode ter sido lida e parte não. */
  porCampo: Record<string, LeituraCampo>;
  bruto: string;
  custoIA: number;
  msRecorte: number;
  msModelo: number;
  /** veio do cache por conteúdo: não houve chamada, não houve custo */
  reaproveitada: boolean;
  interpretacaoId?: string;
};

/** true quando NENHUM campo do recorte foi lido — é o que a coluna `abstencao` guarda. */
export const abstevesseTudo = (i: Interpretacao) =>
  Object.values(i.porCampo).every((c) => !c.ok);

/** Por que a visão não rodou. Nenhum destes pode derrubar a leitura da pasta. */
export type MotivoPulo =
  | "DESLIGADA"          // interruptor operacional
  | "SEM_CHAVE"          // GEMINI_API_KEY ausente
  | "ORCAMENTO"          // teto por usuário ou por processo
  | "DOCUMENTO_AUSENTE"  // o papel exigido não veio na pasta
  | "FALHA";             // modelo indisponível, rede, resposta inutilizável
