/**
 * lib/rastreabilidade/tipos.ts — a MATRIZ DE RASTREABILIDADE do URBIS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ ISTO NÃO É DOCUMENTAÇÃO. É A ESPECIFICAÇÃO OFICIAL DE COMO O URBIS DECIDE.   │
 * │                                                                              │
 * │ Qualquer pessoa deve conseguir responder, para qualquer campo:               │
 * │   por que foi preenchido · de onde veio · que regra se aplicou ·             │
 * │   que código executou · que versão da regra · e como reproduzir o resultado. │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ── DOIS NÍVEIS, DOIS LUGARES ───────────────────────────────────────────────────
 *   REGRA GERAL  → aqui, no código. Como o campo DEVE ser preenchido. Igual em todo
 *                  processo, versionada no git, revisável em code review.
 *   EXECUÇÃO     → no MHD. Como o campo FOI preenchido naquele processo: documento,
 *                  versão, página, hash, trecho, valor adotado, aceite do analista.
 *
 * A matriz nunca guarda valor. O MHD nunca guarda regra. A tela administrativa lê
 * DAQUI, nunca de cópia — por isso não tem como divergir.
 *
 * ── MÉTODO × REGRA ──────────────────────────────────────────────────────────────
 *   MÉTODO  = COMO a informação é OBTIDA      (ler texto, consultar banco, calcular)
 *   REGRA   = COMO ela é VALIDADA ou TRANSFORMADA (comparar, normalizar, tolerar,
 *             escolher fonte prioritária, marcar NP)
 *
 * Um campo pode ter vários métodos, em ordem explícita: `coordenadas` é
 * TEXTO_DOCUMENTO seguido de REGEX; `larguraDaVia1` é BANCO_URBIS precedido da
 * normalização do nome da via.
 *
 * ── VERSÃO × HASH ───────────────────────────────────────────────────────────────
 *   VERSÃO  identifica a evolução FUNCIONAL da regra. Sobe quando muda fonte,
 *           método, regra, prioridade, cálculo ou decisão. NÃO sobe por comentário
 *           reescrito nem por código reorganizado sem mudar comportamento.
 *   HASH    valida a coerência da implementação. É calculado só sobre os campos
 *           funcionais — prosa fica de fora de propósito.
 *
 * O par (versão, hash) fica em `versoes.lock.json`. Mudou o comportamento e não
 * subiu a versão? O teste quebra. É a regra de governança, executável.
 *
 * ── CRESCE PARA OUTROS SLOTS SEM REESCRITA ──────────────────────────────────────
 * Tudo aqui é genérico por (módulo, slot). O LIP do slot 5 é a primeira matriz;
 * Regularização, Habite-se e o MAC entram como novas matrizes no mesmo registro,
 * com os mesmos testes de integridade e a mesma tela.
 */

// ─────────────────────────── vocabulário ───────────────────────────

/** COMO a informação é obtida. */
export type Metodo =
  | "TEXTO_DOCUMENTO"    // texto extraído da camada de texto do PDF
  | "REGEX"              // padrão aplicado sobre esse texto
  | "DADO_ESTRUTURADO"   // tabela do documento (linha/coluna com coordenada)
  | "BANCO_URBIS"        // consulta a tabela do próprio sistema
  | "CALCULO"            // aritmética sobre outros campos
  | "COMPARACAO"         // confronto entre duas ou mais fontes
  | "REGRA_DERIVADA"     // decorre logicamente de outro campo
  | "VISAO_LOCALIZADA"   // recorte de imagem enviado a modelo de visão
  | "ANALISE_IA"         // interpretação por modelo de linguagem
  | "ANALISTA"           // decisão humana
  | "NAO_APLICAVEL"      // o campo não se aplica a este processo
  | "AGUARDANDO_FATO"    // mecanismo pronto; o fato ainda não ocorreu
  | "DOCUMENTO_AUSENTE"  // a fonte não veio na pasta
  | "VALOR_PADRAO";      // valor padrão do assunto

/** COMO a informação é validada ou transformada. */
export type Regra =
  | "COMPARAR_FONTES"
  | "TOLERANCIA_ARREDONDAMENTO"
  | "NORMALIZAR_QUADRA_LOTE"
  | "NORMALIZAR_NOME_VIA"
  | "NORMALIZAR_NUMERO"
  | "FONTE_PRIORITARIA"
  | "SOMATORIO_INTERNO"
  | "PROPORCAO_CONTRA_PARAMETRO"
  | "DERIVAR_DE_CAMPO"
  | "FORMULA"
  | "MARCAR_NP"
  | "MARCAR_AGUARDANDO_FATO"
  | "MARCAR_SEM_DADO"
  | "ORDEM_DE_EMISSAO";

/** De onde a informação vem. */
export type Fonte =
  | "PRANCHA" | "ART" | "USO_DO_SOLO" | "CERTIDAO" | "REQUERIMENTO" | "DECLARACAO"
  | "CADASTRO_LOGRADOUROS" | "REGISTRO_DOCUMENTOS_EMITIDOS" | "CADASTRO_PROCESSO"
  | "OUTROS_CAMPOS" | "ASSUNTO" | "ANALISTA" | "SEM_FONTE";

/** Em que estado o campo termina o processamento. Nunca "vazio". */
export type Status =
  | "AUTOMATICO"        // preenchido a partir de documento ou banco
  | "CALCULADO"         // resultado de cálculo ou comparação
  | "NAO_APLICAVEL"     // respondido: não se aplica a este processo
  | "AGUARDANDO_FATO"   // mecanismo pronto, fato inexistente
  | "DOCUMENTO_AUSENTE" // a fonte não veio na pasta
  | "MANUAL"            // do analista, por decisão
  | "PENDENTE_VISAO"    // depende de leitura de imagem, ainda não implementada
  | "BLOQUEADO";        // depende de outro campo ainda não resolvido

export type AplicacaoRegra = {
  regra: Regra;
  /** o que ela faz NESTE campo, em português. Prosa: não entra no hash. */
  descricao: string;
  /** o que a regra usa para decidir. Entra no hash: mudar tolerância é mudar comportamento. */
  parametros?: Record<string, string | number>;
};

/**
 * Um campo do LIP na matriz.
 *
 * NOME EXIBIDO E SEÇÃO NÃO MORAM AQUI, de propósito: vêm de `lip_campos` e `lip_abas`. Copiá-los
 * criaria uma segunda verdade que envelhece sozinha — o rótulo muda no admin e a matriz continua
 * dizendo o antigo. A tela junta os dois pela chave.
 */
export type CampoRastreado = {
  /** identificador técnico — a mesma chave de `lip_campos.chave` */
  chave: string;
  status: Status;
  implementado: boolean;
  /** valores que o campo pode assumir, quando é fechado */
  valoresPossiveis?: string[];
  /** COMO se obtém, em ordem de execução */
  metodos: Metodo[];
  fontePrincipal: Fonte;
  /** as demais fontes, quando o campo nasce de confronto */
  fontesComparadas?: Fonte[];
  depende?: string[];
  /** COMO se valida ou transforma */
  regras: AplicacaoRegra[];
  /** quando o campo se aplica. Prosa. */
  aplicabilidade?: string;
  /** o que faz o campo virar NP. Obrigatório quando status = NAO_APLICAVEL. */
  regraNP?: string;
  /** o que faz o campo ficar sem dado */
  regraSemDado?: string;
  /** a conta ou o confronto, escrito. Obrigatório para CALCULO e COMPARACAO. */
  formula?: string;
  /** arquivo:função que executa — é por aqui que se reproduz o resultado */
  responsavel: string;
  /**
   * QUEM preenche o campo. Não é detalhe: a trava que compara declaração com comportamento real
   * só pode cobrar do leitor o que é do leitor. `processo` e as larguras de via vêm da ROTA
   * (consultam banco depois da leitura); `observacoes` vem da TELA, no aceite; `obsDocumentos` é
   * valor padrão do assunto. Sem isto, a trava acusava cinco falsos positivos.
   */
  preenchidoPor: "leitor" | "rota" | "tela" | "valor_padrao" | "analista" | "nao_preenchido";
  usaIA: boolean;
  /** evolução FUNCIONAL da regra. Sobe quando o comportamento muda. */
  versao: number;
  alteradoEm: string;
  testes: string[];
  /** o fato que falta. Obrigatório quando status = AGUARDANDO_FATO. */
  fatoNecessario?: string;
  /** anotação livre — nunca entra no hash */
  observacao?: string;
};

/**
 * Um item do MAC na matriz. ESTRUTURA PRONTA, SEM CONTEÚDO.
 *
 * Os 561 itens não são cadastrados agora — quando o MAC entrar, é alimentar isto, não projetar do
 * zero. Herda tudo do campo (método, regra, versão, responsável) e acrescenta o que é próprio do
 * checklist: a que grupo pertence, que campo do LIP o responde e se gera indeferimento.
 */
export type ItemRastreado = Omit<CampoRastreado, "chave"> & {
  /** identificador estável do item — não a posição no array */
  codigo: string;
  grupo: string;
  /** campo do LIP que responde este item sozinho, quando existe */
  chaveLip?: string;
  geraIndeferimento?: boolean;
  /** base legal, quando houver */
  fundamento?: string;
};

/** Uma matriz é (módulo, slot) + os registros. */
export type Matriz = {
  modulo: "LIP" | "MAC";
  /** slug do assunto: slot_05, regularizacao, aceite_sei… */
  slot: string;
  nome: string;
  /** id do assunto no banco, para casar com lip_campos/lip_abas */
  assuntoId: string;
  campos?: CampoRastreado[];
  itens?: ItemRastreado[];
};

// ─────────────────────────── hash funcional ───────────────────────────

/**
 * O que entra no hash: só o que muda COMPORTAMENTO.
 *
 * Fora ficam, de propósito: `descricao`, `aplicabilidade`, `observacao`, `responsavel`, `testes` e
 * `alteradoEm`. Reescrever um comentário, renomear a função ou acrescentar um teste não é mudança
 * funcional e não pode obrigar a subir versão — se obrigasse, a versão viraria ruído e ninguém
 * olharia mais para ela.
 */
export function assinaturaFuncional(c: CampoRastreado | ItemRastreado): string {
  const funcional = {
    status: c.status,
    implementado: c.implementado,
    metodos: c.metodos,
    fontePrincipal: c.fontePrincipal,
    fontesComparadas: c.fontesComparadas ?? [],
    depende: [...(c.depende ?? [])].sort(),
    regras: c.regras.map((r) => ({ regra: r.regra, parametros: r.parametros ?? {} })),
    formula: c.formula ?? "",
    regraNP: c.regraNP ?? "",
    regraSemDado: c.regraSemDado ?? "",
    fatoNecessario: c.fatoNecessario ?? "",
    valoresPossiveis: [...(c.valoresPossiveis ?? [])].sort(),
    usaIA: c.usaIA,
    preenchidoPor: c.preenchidoPor,
  };
  return JSON.stringify(funcional);
}

/** Hash curto e estável da assinatura funcional. Sem dependência de crypto (roda no browser). */
export function hashFuncional(c: CampoRastreado | ItemRastreado): string {
  const s = assinaturaFuncional(c);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}
