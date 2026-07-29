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

/**
 * DECLARAÇÃO — o que o campo PODE ser. Vale para qualquer processo.
 *
 * Não confundir com o que aconteceu num processo específico: `via2` é AUTOMATICO e vira NP quando
 * o Uso do Solo lista uma via só. Declarar `via2` como NAO_APLICAVEL seria descrever a pasta de
 * amostra, não a regra — e num lote de esquina a declaração estaria errada.
 */
export type Declaracao =
  | "AUTOMATICO"        // lido de documento ou consultado no banco
  | "CALCULADO"         // aritmética ou derivação sobre outros campos
  | "MANUAL"            // só o analista decide; nunca deve consumir token
  | "PENDENTE_VISAO"    // vai precisar de leitura de imagem; ainda não implementado
  | "BLOQUEADO"         // depende de campo que ainda não é resolvível
  | "DOCUMENTO_AUSENTE"; // a fonte não integra a pasta deste assunto, estruturalmente

/**
 * RESULTADO — o que aconteceu NAQUELE processo. Vive no MHD, nunca na matriz.
 *
 * Todo campo termina com um destes. Nenhum desaparece: a soma dos resultados fecha em 136.
 */
export type Resultado =
  | "ENCONTRADO"        // o valor estava lá e foi lido
  | "CALCULADO"         // veio de conta ou derivação
  | "NAO_APLICAVEL"     // leu, aplicou regra, e a regra concluiu que não se aplica
  | "NAO_ENCONTRADO"    // procurou onde devia, o texto existe, o dado não estava lá
  | "FONTE_ILEGIVEL"    // o documento não oferece conteúdo utilizável com confiança
  | "DOCUMENTO_AUSENTE" // a fonte não veio na pasta
  | "AGUARDANDO_FATO"   // o mecanismo rodou; o fato ainda não ocorreu
  | "MANUAL"            // preenchido pelo analista
  | "BLOQUEADO"         // uma dependência impediu efetivamente o resultado
  | "NAO_IMPLEMENTADO"; // o leitor ainda não tem mecanismo para este campo

/**
 * Por que NAO_ENCONTRADO e FONTE_ILEGIVEL não podem ser o mesmo estado:
 *   NAO_ENCONTRADO  → o texto está lá e o padrão não achou. Conserta-se o EXTRATOR.
 *   FONTE_ILEGIVEL  → não há conteúdo utilizável. Precisa de OCR, de visão, ou de outro arquivo.
 * Juntar os dois faria o relatório de evolução apontar para o componente errado.
 */
export type MotivoIlegivel =
  | "SEM_CAMADA_TEXTO"      // PDF digitalizado, zero caractere
  | "RESOLUCAO_INSUFICIENTE"
  | "TEXTO_CORROMPIDO"
  | "PARCIALMENTE_ILEGIVEL"
  | "CONTEUDO_NAO_INTERPRETAVEL";

/**
 * O que o leitor tentou. Só é registrado quando o resultado é NAO_ENCONTRADO ou FONTE_ILEGIVEL —
 * é o insumo para evoluir o leitor, e por isso precisa bastar para reproduzir a tentativa.
 */
export type Tentativa = {
  documento?: string;
  versaoDocumento?: number;
  hash?: string;
  pagina?: number | string;
  regiao?: string;
  /** rótulos, padrões ou estratégias tentadas, na ordem */
  procurou: string[];
  temCamadaTexto?: boolean;
  charsTexto?: number;
  motivoIlegivel?: MotivoIlegivel;
  motivo: string;
};

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
  /** o que o campo PODE ser. Nunca o que ele foi num processo. */
  declaracao: Declaracao;
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
  /**
   * O que faz o campo virar NP. Exige PROVA POSITIVA: NP só pode ser produzido quando alguma
   * informação relevante foi lida, uma regra declarada foi aplicada, e a regra concluiu que o campo
   * não se aplica. Ausência de valor NUNCA gera NP — isso é NAO_ENCONTRADO.
   */
  regraNP?: string;
  /**
   * Onde o leitor procura: rótulos, padrões e estratégias, na ordem em que tenta.
   *
   * Completa o "como reproduzir o resultado" do contrato, e é o que permite ao relatório de
   * NAO_ENCONTRADO dizer onde se procurou em vez de só dizer que não achou.
   */
  ondeProcura?: string[];
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
  /** o fato que falta, quando o campo depende de documento que o URBIS ainda vai emitir */
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
    declaracao: c.declaracao,
    implementado: c.implementado,
    metodos: c.metodos,
    fontePrincipal: c.fontePrincipal,
    fontesComparadas: c.fontesComparadas ?? [],
    depende: [...(c.depende ?? [])].sort(),
    regras: c.regras.map((r) => ({ regra: r.regra, parametros: r.parametros ?? {} })),
    formula: c.formula ?? "",
    regraNP: c.regraNP ?? "",
    ondeProcura: c.ondeProcura ?? [],
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
