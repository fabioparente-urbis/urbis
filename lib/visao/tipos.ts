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

/** Região concreta a recortar, já resolvida pelo localizador. */
export type RegiaoAbsoluta = Regiao;

export type Estrategia =
  /**
   * VARREDURA VISUAL: procura o quadro em TODAS as páginas do documento, em baixa resolução, e
   * depois recorta só onde achou, em alta.
   *
   * Substituiu a fração fixa de página, que descrevia a pasta de amostra e não a regra — um
   * processo pode ter 1, 2, 5 ou 10 pranchas, e cada projetista diagrama onde quer. Mesmo
   * sobreajuste que já foi corrigido em `via2` e em `unidComerciais`.
   *
   * Âncora de texto não serve aqui: o alvo é justamente o conteúdo que NÃO está na camada de texto.
   */
  | "VARREDURA_VISUAL";

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
  /**
   * COMO achar o quadro — nunca ONDE ele está.
   *
   * A receita descreve o alvo em linguagem natural e deixa a posição para o localizador. Fixar
   * página ou fração seria descrever um processo específico, não a regra.
   */
  localizacao: {
    /** o que procurar, como um humano descreveria a um estagiário */
    alvo: string;
    /** resolução da varredura: o quadro precisa ser VISÍVEL como bloco, não legível */
    varreduraPx: number;
    /** resolução do recorte final: aqui o texto precisa ser legível */
    alvoPx: number;
    /** folga somada à caixa devolvida pelo modelo — ele acerta a região e erra a borda */
    margem: number;
  };
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
