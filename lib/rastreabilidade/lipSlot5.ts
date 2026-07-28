/**
 * lib/rastreabilidade/lipSlot5.ts — matriz de rastreabilidade do LIP do slot 5.
 *
 * Contrato técnico: para cada um dos 136 campos, como o URBIS decide o valor.
 * Ver `tipos.ts` para o significado de método, regra, versão e hash.
 *
 * NOME EXIBIDO E SEÇÃO não estão aqui — vêm de `lip_campos` e `lip_abas`. A tela junta pela chave.
 *
 * Os construtores abaixo existem para que o PADRÃO fique visível: 33 campos fecham em NP pelo mesmo
 * motivo estrutural, 16 aguardam o mesmo fato. Repetir 136 blocos escondia isso.
 */

import type { CampoRastreado, Fonte, Metodo, AplicacaoRegra } from "./tipos";

const HOJE = "2026-07-28";
const LEITOR = "lib/lerPastaSlot5.ts:preencherLip";
const T_LEITURA = ["scripts/testar_leitura_pasta.mts"];
const T_RASTREIO = ["scripts/testar_rastreabilidade.mts"];

/** Campo lido direto de um documento, sem transformação. */
const doDoc = (
  chave: string, fontePrincipal: Fonte, metodos: Metodo[], extra: Partial<CampoRastreado> = {},
): CampoRastreado => ({
  chave, status: "AUTOMATICO", implementado: true, metodos, fontePrincipal,
  regras: [], responsavel: LEITOR, preenchidoPor: "leitor", usaIA: false, versao: 1, alteradoEm: HOJE,
  testes: [...T_LEITURA, ...T_RASTREIO], ...extra,
});

/** Campo que decorre de outro campo ou de cálculo. */
const derivado = (
  chave: string, formula: string, regras: AplicacaoRegra[], extra: Partial<CampoRastreado> = {},
): CampoRastreado => ({
  chave, status: "CALCULADO", implementado: true, metodos: ["CALCULO"],
  fontePrincipal: "OUTROS_CAMPOS", regras, formula, responsavel: LEITOR, preenchidoPor: "leitor", usaIA: false,
  versao: 1, alteradoEm: HOJE, testes: [...T_LEITURA, ...T_RASTREIO], ...extra,
});

/** Campo que fecha em NÃO APLICÁVEL — resposta, não omissão. */
const np = (chave: string, regraNP: string, depende?: string[]): CampoRastreado => ({
  chave, status: "NAO_APLICAVEL", implementado: true, metodos: ["REGRA_DERIVADA", "NAO_APLICAVEL"],
  fontePrincipal: "OUTROS_CAMPOS", depende,
  regras: [{ regra: "MARCAR_NP", descricao: regraNP }],
  regraNP, valoresPossiveis: ["NP"], responsavel: LEITOR, preenchidoPor: "leitor", usaIA: false,
  versao: 1, alteradoEm: HOJE, testes: [...T_LEITURA, ...T_RASTREIO],
});

/**
 * Mecanismo pronto; o fato ainda não ocorreu.
 *
 * Não confundir com "não implementado": a consulta existe e roda. O que falta é o documento
 * existir. Preenche-se sozinho — inclusive retroativamente — quando o fato acontecer.
 */
const aguardandoFato = (chave: string, fatoNecessario: string, fonteDoc: string): CampoRastreado => ({
  chave, status: "AGUARDANDO_FATO", implementado: true,
  metodos: ["BANCO_URBIS", "AGUARDANDO_FATO"],
  fontePrincipal: "REGISTRO_DOCUMENTOS_EMITIDOS",
  regras: [
    { regra: "ORDEM_DE_EMISSAO", descricao: "a ordem de emissão dos despachos é a ordem das análises" },
    { regra: "MARCAR_AGUARDANDO_FATO", descricao: `sem ${fonteDoc} emitido, o campo fica aguardando o fato` },
  ],
  fatoNecessario, responsavel: "lib/lipDocumentosEmitidos.ts:camposDeDocumentosEmitidos",
  preenchidoPor: "rota", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
});

/** Depende de leitura de imagem — grupo C, ainda não implementado. */
const pendenteVisao = (
  chave: string, fontePrincipal: Fonte, onde: string, depende?: string[],
): CampoRastreado => ({
  chave, status: "PENDENTE_VISAO", implementado: false,
  metodos: ["VISAO_LOCALIZADA"], fontePrincipal, depende,
  regras: [{ regra: "MARCAR_SEM_DADO", descricao: "sem a leitura da imagem, fica sem dado — nunca estimado" }],
  regraSemDado: onde, aplicabilidade: onde,
  responsavel: "(a implementar — grupo C)", preenchidoPor: "nao_preenchido", usaIA: true, versao: 1, alteradoEm: HOJE,
  testes: T_RASTREIO,
});

const SIM_NAO = ["SIM", "NÃO"];

export const CAMPOS_LIP_SLOT5: CampoRastreado[] = [
  // ═══════════════ IDENTIFICAÇÃO ═══════════════
  doDoc("logradouro", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    regras: [{ regra: "FONTE_PRIORITARIA", descricao: "o Uso do Solo manda; o carimbo é alternativa quando ele falta" }],
    fontesComparadas: ["PRANCHA"],
  }),
  doDoc("quadra", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("lote", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("bairro", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("iptu", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "REGEX"], {
    fontesComparadas: ["PRANCHA", "REQUERIMENTO"],
    regras: [{ regra: "NORMALIZAR_NUMERO", descricao: "só dígitos: aparece como 20309003540003, 203.090.0354.0003 e ITU 203.090.0354.0003" }],
  }),
  doDoc("proprietario", "REQUERIMENTO", ["TEXTO_DOCUMENTO", "REGEX"]),
  doDoc("nome_responsavel_arq", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"], {
    aplicabilidade: "carimbo, bloco 'Autor do projeto'",
  }),
  doDoc("cau", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"]),
  doDoc("nome_responsavel_eng", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"]),
  doDoc("crea", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"]),

  // a ART do CREA imprime "Coordenadas Geográficas: -16.6773299,-49.2573366".
  // O campo era digitado à mão desde a Regularização — ninguém tinha olhado ali.
  doDoc("coordenadas", "ART", ["TEXTO_DOCUMENTO", "REGEX"], {
    versao: 2, aplicabilidade: "campo 'Coordenadas Geográficas' do corpo da ART",
    regras: [{ regra: "FONTE_PRIORITARIA", descricao: "tenta a ART de execução, depois a de projeto, depois a de caixa" }],
    observacao: "v2 em 28/07/2026: antes era ANALISTA (digitação manual)",
    responsavel: "lib/lerPastaSlot5.ts:lerArt",
  }),

  derivado("quantasFrentes", "quantidade de vias preenchidas no Uso do Solo",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "conta quantas vias o Uso do Solo lista" }],
    { depende: ["logradouro"], fontePrincipal: "USO_DO_SOLO" }),
  derivado("esquina", "quantasFrentes >= 2",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "duas ou mais frentes = esquina" }],
    { depende: ["quantasFrentes"], valoresPossiveis: SIM_NAO }),

  doDoc("processo", "CADASTRO_PROCESSO", ["BANCO_URBIS"], {
    responsavel: "app/api/lip/ler-pasta/route.ts",
    preenchidoPor: "rota",
    observacao: "processos.numero_projeto está null no banco; usa-se o código do processo",
  }),
  {
    chave: "processoFisico", status: "MANUAL", implementado: false,
    metodos: ["BANCO_URBIS", "ANALISTA"], fontePrincipal: "CADASTRO_PROCESSO",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "processos.numero_os está null; sem fonte automática hoje" }],
    regraSemDado: "processos.numero_os está null em todos os processos",
    responsavel: "(digitação no cadastro do processo)", usaIA: false, versao: 1, alteradoEm: HOJE, preenchidoPor: "analista",
    testes: T_RASTREIO,
  },
  {
    chave: "licencaPrevia", status: "DOCUMENTO_AUSENTE", implementado: false,
    metodos: ["DOCUMENTO_AUSENTE"], fontePrincipal: "SEM_FONTE",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "não há documento de licença prévia na pasta do processo" }],
    regraSemDado: "documento não integra os 10 obrigatórios do SEI",
    responsavel: "—", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "nao_preenchido",
  },
  {
    chave: "cheadvN", status: "DOCUMENTO_AUSENTE", implementado: false,
    metodos: ["DOCUMENTO_AUSENTE"], fontePrincipal: "SEM_FONTE",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "o despacho da CHEADV não vem na pasta: ela aprova antes de chegar ao analista" }],
    regraSemDado: "fora do escopo documental do analista",
    responsavel: "—", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "nao_preenchido",
  },
  {
    chave: "dataPagtoTaxaInicial", status: "DOCUMENTO_AUSENTE", implementado: false,
    metodos: ["DOCUMENTO_AUSENTE"], fontePrincipal: "SEM_FONTE",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "comprovante de taxa ausente na pasta" }],
    regraSemDado: "comprovante não integra os 10 obrigatórios",
    responsavel: "—", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "nao_preenchido",
  },

  // 2ª a 4ª via — o Uso do Solo traz uma via só
  ...[2, 3, 4].flatMap((n) => [
    np(`via${n}`, "o Uso do Solo lista uma via apenas", ["quantasFrentes"]),
    np(`tipoDeVia${n}`, "o Uso do Solo lista uma via apenas", ["quantasFrentes"]),
    np(`larguraDaVia${n}`, "o Uso do Solo lista uma via apenas", ["quantasFrentes"]),
    np(`larguraDoPasseio${n}`, "o Uso do Solo lista uma via apenas", ["quantasFrentes"]),
  ]),

  // ═══════════════ DOCUMENTOS EMITIDOS PELO URBIS ═══════════════
  // Auditoria de 28/07/2026: o registro está VIVO (20 registros, os últimos de 27/07). Não é
  // legado nem foi absorvido pelo MHD. O que falta é o FATO: o slot 5 nunca emitiu despacho.
  ...([1, 2, 3, 4, 5] as const).flatMap((n) => [
    aguardandoFato(`numeroDeDespachoDa${n}Analise`, `despacho da ${n}ª análise ainda não emitido`, "despacho"),
    aguardandoFato(`dataDa${n}Analise`, `despacho da ${n}ª análise ainda não emitido`, "despacho"),
  ]),
  aguardandoFato("numeroDoLaudo5", "laudo ainda não emitido", "laudo"),
  aguardandoFato("dataDoLaudo5", "laudo ainda não emitido", "laudo"),
  aguardandoFato("numeroDoParecerDeIndeferimento", "parecer de indeferimento ainda não emitido", "parecer de indeferimento"),
  aguardandoFato("dataDoParecerDeIndeferimento", "parecer de indeferimento ainda não emitido", "parecer de indeferimento"),
  aguardandoFato("numeroDoParecerDeArquivamento", "parecer de arquivamento ainda não emitido", "parecer de arquivamento"),
  aguardandoFato("dataDoParecerDeArquivamento", "parecer de arquivamento ainda não emitido", "parecer de arquivamento"),
  {
    chave: "houveMudancaDeAnalista", status: "AGUARDANDO_FATO", implementado: true,
    // derivação DENTRO de uma fonte só (quantos usuários distintos emitiram), não confronto
    // entre fontes — por isso REGRA_DERIVADA e não COMPARACAO
    metodos: ["BANCO_URBIS", "REGRA_DERIVADA", "AGUARDANDO_FATO"],
    fontePrincipal: "REGISTRO_DOCUMENTOS_EMITIDOS",
    regras: [{ regra: "DERIVAR_DE_CAMPO", descricao: "conta usuários distintos que emitiram documento neste processo" }],
    formula: "distinct(usuario_id) > 1",
    fatoNecessario: "nenhum documento emitido ainda — sem emissão não há como saber quem analisou",
    valoresPossiveis: SIM_NAO,
    responsavel: "lib/lipDocumentosEmitidos.ts:houveMudancaDeAnalista", preenchidoPor: "rota",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
  },

  // ═══════════════ TIPO DE PROCESSO E USO ═══════════════
  {
    chave: "tipoProcessoLip", status: "AUTOMATICO", implementado: true,
    metodos: ["VALOR_PADRAO"], fontePrincipal: "ASSUNTO",
    regras: [], valoresPossiveis: ["APROVAÇÃO DE PROJETO"],
    responsavel: LEITOR, usaIA: false, versao: 1, alteradoEm: HOJE, testes: [...T_LEITURA, ...T_RASTREIO], preenchidoPor: "leitor",
  },
  doDoc("comercio", "REQUERIMENTO", ["TEXTO_DOCUMENTO", "REGEX"], { valoresPossiveis: SIM_NAO }),
  doDoc("tipoUso", "REQUERIMENTO", ["TEXTO_DOCUMENTO", "REGEX"]),
  derivado("atividadeEconomica", "há CNAE no Uso do Solo",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "CNAE listado = há atividade econômica" }],
    { depende: ["cnae"], fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO }),
  derivado("habitacional", "uso do requerimento é residencial/habitacional",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "derivado do tipo de uso e dos CNAEs" }],
    { depende: ["tipoUso", "cnae"], valoresPossiveis: SIM_NAO }),
  derivado("misto", "há uso habitacional E econômico ao mesmo tempo",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "interseção entre habitacional e atividade econômica" }],
    { depende: ["habitacional", "atividadeEconomica"], valoresPossiveis: SIM_NAO }),
  derivado("grandePorte", "porte admitido no Uso do Solo",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "'sem limite de área' no UDS = não é grande porte por limitação" }],
    { depende: ["atendeOPorteAdmitido"], fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO }),

  ...["habSeriada", "habColetiva", "quitinete", "institucional"].map((k) =>
    np(k, "uso comercial: a tipologia habitacional/institucional não se aplica", ["comercio", "atividadeEconomica"])),

  // ═══════════════ LOTE ═══════════════
  pendenteVisao("dimensoesDoLoteNaCertidao", "CERTIDAO", "o corpo da matrícula é imagem em todas as páginas"),
  pendenteVisao("dimensoesDoLoteNoProjeto", "PRANCHA", "cotas da planta de situação — desenho cotado, não tabela"),
  {
    chave: "dimensoesDoLoteConferemComA", status: "BLOQUEADO", implementado: false,
    metodos: ["COMPARACAO"], fontePrincipal: "OUTROS_CAMPOS",
    fontesComparadas: ["CERTIDAO", "PRANCHA"],
    depende: ["dimensoesDoLoteNaCertidao", "dimensoesDoLoteNoProjeto"],
    regras: [
      { regra: "COMPARAR_FONTES", descricao: "dimensões da certidão × dimensões da planta de situação" },
      { regra: "MARCAR_SEM_DADO", descricao: "conferência herda o estado da entrada não verificada" },
    ],
    formula: "dimensoesDoLoteNaCertidao == dimensoesDoLoteNoProjeto (com tolerância)",
    regraSemDado: "as duas primitivas dependem de leitura de imagem (grupo C)",
    valoresPossiveis: SIM_NAO, responsavel: "(a implementar — depende do grupo C)", preenchidoPor: "nao_preenchido",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
  },
  np("dimensoesDoLoteConferemComRememb", "não há remembramento, remanejamento ou desmembramento na pasta"),

  // ═══════════════ USO DO SOLO ═══════════════
  doDoc("usoDoSoloN", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "REGEX"]),
  doDoc("unidadeTerritorialDoUsoDoSolo", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("tipoDeVia1", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    observacao: "a hierarquia do Cadastro de Logradouros é confrontada com esta e a divergência vira ALERTA",
  }),
  doDoc("cnae", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("alertasDoUsoDoSolo", "USO_DO_SOLO", ["DADO_ESTRUTURADO", "REGRA_DERIVADA"], {
    status: "CALCULADO",
    regras: [{ regra: "DERIVAR_DE_CAMPO", descricao: "junta corredor viário, embargo e embarque/desembarque num alerta só" }],
  }),
  derivado("usoDoSoloEParaAprovacao", "Tipo de Uso do Solo == 'APROVAÇÃO DE PROJETO'",
    [{ regra: "COMPARAR_FONTES", descricao: "o próprio documento declara para que serve" }],
    { fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO }),
  derivado("anexouCertidaoDeCorredorViario", "o campo Corredor Viário do UDS está preenchido?",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "sem corredor no UDS, a certidão não é exigível" }],
    { fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO }),
  derivado("atendeOPorteAdmitido", "área máxima admitida no UDS para o grau de incomodidade",
    [{ regra: "PROPORCAO_CONTRA_PARAMETRO", descricao: "'sem limite de área' atende sempre" }],
    { fontePrincipal: "USO_DO_SOLO", depende: ["areaTotal"], valoresPossiveis: SIM_NAO }),

  // comparação de endereço — o falso negativo que a v1 produzia
  derivado("oEnderecoEstaCorretoNoUso",
    "quadra e lote do UDS × quadra e lote do carimbo e do requerimento",
    [
      { regra: "NORMALIZAR_QUADRA_LOTE", descricao: "letra e número separados, zero à esquerda descartado, inversão aceita" },
      { regra: "COMPARAR_FONTES", descricao: "compara quadra e lote SEPARADAMENTE, nunca a string inteira" },
    ],
    {
      versao: 2, depende: ["quadra", "lote"], fontesComparadas: ["PRANCHA", "REQUERIMENTO"],
      fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO,
      observacao: "v2 em 28/07/2026: a v1 comparava a string inteira e dava NÃO para 'QUADRA 18 A LOTE 06' × 'Quadra A-18 Lote 06'",
    }),

  // Cadastro de Logradouros — 20.524 vias
  doDoc("larguraDaVia1", "CADASTRO_LOGRADOUROS", ["BANCO_URBIS"], {
    regras: [{ regra: "NORMALIZAR_NOME_VIA", descricao: "'R 2' do UDS × 'R  2' do cadastro: colapsa espaço, expande abreviatura, ignora zero à esquerda" }],
    depende: ["bairro", "logradouro"],
    responsavel: "lib/cadastroImobiliario.ts:buscarVia", preenchidoPor: "rota",
    testes: [...T_RASTREIO, "scripts/testar_cadastro_logradouros.mts"],
  }),
  doDoc("larguraDoPasseio1", "CADASTRO_LOGRADOUROS", ["BANCO_URBIS"], {
    regras: [{ regra: "NORMALIZAR_NOME_VIA", descricao: "mesmo casamento de nome da largura da via" }],
    depende: ["bairro", "logradouro"],
    responsavel: "lib/cadastroImobiliario.ts:buscarVia", preenchidoPor: "rota",
    testes: [...T_RASTREIO, "scripts/testar_cadastro_logradouros.mts"],
  }),

  // ═══════════════ ART ═══════════════
  ...(["Projeto", "Execucao", "Caixa"] as const).map((t) =>
    doDoc(`numeroDeArt${t}`, "ART", ["TEXTO_DOCUMENTO", "REGEX"], {
      aplicabilidade: `nº da ART cuja atividade técnica é de ${t.toLowerCase()}`,
      responsavel: "lib/lerPastaSlot5.ts:lerArt",
    })),
  ...(["Projeto", "Execucao", "Caixa"] as const).map((t) =>
    derivado(`anexouArtRrt${t}`, `existe documento com papel art_${t.toLowerCase()} no catálogo`,
      [{ regra: "DERIVAR_DE_CAMPO", descricao: "presença no catálogo da leitura da pasta" }],
      { fontePrincipal: "ART", valoresPossiveis: SIM_NAO })),
  doDoc("areaNaArtDeProjeto", "ART", ["DADO_ESTRUTURADO"], {
    aplicabilidade: "quadro de atividade técnica, linha em metros quadrados",
    responsavel: "lib/lerPastaSlot5.ts:lerArt",
  }),
  doDoc("areaNaArtDeExecucao", "ART", ["DADO_ESTRUTURADO"], {
    aplicabilidade: "quadro de atividade técnica, linha em metros quadrados",
    responsavel: "lib/lerPastaSlot5.ts:lerArt",
  }),
  doDoc("volumeNaArtDeCaixa", "ART", ["DADO_ESTRUTURADO"], {
    aplicabilidade: "quadro de atividade técnica, linha em metros cúbicos",
    responsavel: "lib/lerPastaSlot5.ts:lerArt",
  }),
  doDoc("artDeProjetoAtendeAAcessibilidade", "ART", ["TEXTO_DOCUMENTO", "REGEX"], {
    aplicabilidade: "seção 'Declaração de Acessibilidade' do formulário do CAU",
    valoresPossiveis: SIM_NAO,
  }),
  np("aArtDeExecucaoAtendeA", "a ART de execução do CREA não traz declaração de acessibilidade"),

  // as três conferências: a aritmética já existia, o campo é que não recebia
  ...([
    ["aAreaNaArtDeProjeto", "areaNaArtDeProjeto", "areaTotal", "m²"],
    ["aAreaNaArtDeExecucao", "areaNaArtDeExecucao", "areaTotal", "m²"],
    ["volumeConfereComOProjeto", "volumeNaArtDeCaixa", "volumeDaCaixaDeRecarga", "m³"],
  ] as const).map(([chave, a, b, un]) =>
    derivado(chave, `|${a} − ${b}| <= 0,02 ${un}`,
      [
        { regra: "COMPARAR_FONTES", descricao: "valor declarado na ART × valor declarado no carimbo" },
        { regra: "TOLERANCIA_ARREDONDAMENTO", descricao: "diferença de arredondamento não é divergência", parametros: { tolerancia: 0.02 } },
      ],
      {
        versao: 2, depende: [a, b], fontePrincipal: "ART", fontesComparadas: ["PRANCHA"],
        metodos: ["COMPARACAO"], valoresPossiveis: SIM_NAO,
        observacao: "v2 em 28/07/2026: a conferência já rodava e o campo do LIP ficava vazio ao lado",
      })),

  // ═══════════════ DOCUMENTOS ═══════════════
  np("trafegoElevadores", "edificação térrea: não há tráfego de elevador a analisar", ["pav"]),
  np("tDC", "nenhum documento de Transferência do Direito de Construir na pasta"),
  np("demolicao", "nenhum documento de demolição na pasta"),
  np("smmPCorredoresDoArtigo116", "o Uso do Solo não indica corredor viário", ["alertasDoUsoDoSolo"]),
  np("docEmitidoPeloComandoDaAeronautica", "o Uso do Solo alerta quando é área aeroportuária, e não alertou", ["alertasDoUsoDoSolo"]),
  np("certidaoDeAcessib", "certidão de acessibilidade não regulamentada"),
  {
    chave: "obsDocumentos", status: "AUTOMATICO", implementado: true,
    metodos: ["VALOR_PADRAO"], fontePrincipal: "ASSUNTO", regras: [],
    responsavel: "lip_campos.valor_padrao", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "valor_padrao",
  },
  {
    chave: "outorgaOnerosa", status: "BLOQUEADO", implementado: false,
    metodos: ["CALCULO"], fontePrincipal: "OUTROS_CAMPOS",
    depende: ["alturaDaEdificacao", "areaTotal", "areaTerreno"],
    regras: [
      { regra: "FORMULA", descricao: "incide quando a altura do térreo à laje atinge 7,5 m E o construído supera a área do lote", parametros: { alturaMinima: 7.5 } },
      { regra: "MARCAR_SEM_DADO", descricao: "sem a altura, a regra não é calculável" },
    ],
    formula: "alturaDaEdificacao >= 7,5 E areaTotal > areaTerreno",
    regraSemDado: "a altura da edificação depende de leitura das cotas (grupo C)",
    valoresPossiveis: SIM_NAO, responsavel: "(a implementar — depende do grupo C)", preenchidoPor: "nao_preenchido",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
  },

  // ═══════════════ DADOS DO PROJETO ═══════════════
  doDoc("pav", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"], { aplicabilidade: "carimbo, 'Descrição dos pavimentos'" }),
  doDoc("areaTerreno", "PRANCHA", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    aplicabilidade: "carimbo, rótulo oficial 'ÁREA DO TERRENO' (IN 007/2024, pg. 522)",
    regras: [{ regra: "FONTE_PRIORITARIA", descricao: "rótulo oficial primeiro, variantes de mercado depois ('ÁREA DO TERRENO ORIGINAL')" }],
    responsavel: "lib/lerPastaSlot5.ts:lerPrancha",
  }),
  doDoc("areaTotal", "PRANCHA", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    aplicabilidade: "carimbo, 'ÁREA TOTAL DA CONSTRUÇÃO'",
    responsavel: "lib/lerPastaSlot5.ts:lerPrancha",
  }),
  pendenteVisao("unidComerciais", "PRANCHA", "o modelo da IN 007/2024 pede 'Nº DE UNIDADES' no carimbo; a prancha da amostra não traz"),
  pendenteVisao("unidHabitacionais", "PRANCHA", "o modelo da IN 007/2024 pede 'Nº DE UNIDADES' no carimbo; a prancha da amostra não traz"),
  pendenteVisao("areaTotalPrivativa", "PRANCHA", "quadro de áreas detalhado, colado como imagem"),
  pendenteVisao("alturaDaEdificacao", "PRANCHA", "cotada nos cortes — desenho, não tabela"),
  np("acessoVertical", "edificação térrea: não há acesso vertical previsto", ["pav"]),
  np("art163BaiaDeDesaceleracaoAa", "o Art. 163 só alcança via expressa e acesso direto proibido; a via é coletora", ["tipoDeVia1"]),

  // ═══════════════ FRAÇÃO IDEAL ═══════════════
  derivado("aabEApac190", "unidade territorial é AAB/APAC e a fração declarada é 1/90",
    [{ regra: "COMPARAR_FONTES", descricao: "fração ideal declarada no UDS × unidade territorial" }],
    { depende: ["unidadeTerritorialDoUsoDoSolo"], fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO }),
  np("aosEApaIntegranteDaArau", "unidade territorial é AAB, não AOS/APA", ["unidadeTerritorialDoUsoDoSolo"]),
  np("chacarasVerificarNomeDoBairroNa", "unidade territorial é AAB, não chácara", ["unidadeTerritorialDoUsoDoSolo"]),
  np("chacarasVerificarNomeDoBairroNa2", "unidade territorial é AAB, não chácara", ["unidadeTerritorialDoUsoDoSolo"]),
  np("quitineteEmAab130", "não há quitinete no projeto", ["quitinete"]),

  // ═══════════════ ÁREA PERMEÁVEL ═══════════════
  ...([
    ["opcao1TotalExigidoAreaTerreno", "areaTerreno × 15%", 15],
    ["opcao2TotalExigidoAreaTerreno", "areaTerreno × 10%", 10],
    ["opcao2TotalExigidoAreaTerreno2", "areaTerreno × 5%", 5],
    ["opcao3TotalExigidoAreaTerreno", "areaTerreno × 25%", 25],
  ] as const).map(([chave, formula, pct]) =>
    derivado(chave, formula,
      [{ regra: "PROPORCAO_CONTRA_PARAMETRO", descricao: "percentual do índice paisagístico sobre a área do lote", parametros: { percentual: pct } }],
      { depende: ["areaTerreno"], fontePrincipal: "USO_DO_SOLO" })),
  doDoc("areaPermeavelProjetada", "PRANCHA", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    aplicabilidade: "carimbo, 'FORRAÇÃO VEGETAL PERMEÁVEL' (IN 007/2024) ou variante do projetista",
    responsavel: "lib/lerPastaSlot5.ts:lerPrancha",
  }),

  // ═══════════════ CAIXA DE RECARGA ═══════════════
  doDoc("volumeDaCaixaDeRecarga", "PRANCHA", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    aplicabilidade: "carimbo, linha ICCAP — o modelo pede EXIGIDO e ATENDIDO",
    observacao: "o carimbo da amostra declara só o atendido, o que é pendência contra a IN 007/2024",
  }),
  doDoc("nDeCaixasDeCaptacao", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"]),
  pendenteVisao("areaImpermeabilizada", "PRANCHA", "memorial do ICCAP, colado como imagem"),
  pendenteVisao("volumeExigidoDaCaixa", "PRANCHA", "o carimbo omite o ICCAP EXIGIDO que a IN 007/2024 obriga"),

  // ═══════════════ APROVEITAMENTO ═══════════════
  derivado("areaTotalMax75x", "areaTerreno × 7,5",
    [{ regra: "FORMULA", descricao: "coeficiente máximo de aproveitamento", parametros: { coeficiente: 7.5 } }],
    { depende: ["areaTerreno"] }),
  derivado("indiceDeAproveitamentoDoProjetoTotal", "areaTotal ÷ areaTerreno",
    [{ regra: "FORMULA", descricao: "índice de aproveitamento do projeto" }],
    { depende: ["areaTotal", "areaTerreno"] }),
  derivado("areaAteXxPav", "em edificação térrea, iguala a área total",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "sem pavimento acima do limite, a área até o último pavimento é a total" }],
    { depende: ["areaTotal", "pav"] }),
  derivado("indiceDeAproveitamentoDoProjetoAte", "em edificação térrea, iguala o índice total",
    [{ regra: "DERIVAR_DE_CAMPO", descricao: "sem pavimento acima do limite, o índice até o último é o total" }],
    { depende: ["indiceDeAproveitamentoDoProjetoTotal", "pav"] }),
  np("aproveitamentoExigidoAreaDeFruicao", "área de fruição só é exigida com aproveitamento acima do básico", ["indiceDeAproveitamentoDoProjetoTotal"]),

  // ═══════════════ VAGAS ═══════════════
  ...["totalASerDescontadoNoCalculo", "areaOcupadaPelaAtividade", "vagasPcdExigido",
      "vagasIdosoExigido", "totalDeVagasExigidasParaEssas", "totalDeVagasAtendidasParaAtividade",
      "vagasPcdAtendidas", "vagasIdosoAtendidas", "atendeAcessoCirculacaoVagasManobrasLc",
  ].map((k) => pendenteVisao(k, "PRANCHA", "tabela de vagas colada como imagem na prancha", ["areaOcupadaPelaAtividade"])),
  np("vagaAmbulanciaPCnaeAtivEspec", "nenhum CNAE de atividade específica de saúde", ["cnae"]),

  // ═══════════════ PENDÊNCIAS NO LAUDO E OBS ═══════════════
  np("atendeDecreto9451PUsoHab", "o Decreto 9.451 só alcança uso habitacional", ["habitacional"]),
  {
    chave: "atendeAcessibilidade", status: "MANUAL", implementado: true,
    metodos: ["ANALISTA"], fontePrincipal: "ANALISTA",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "julgamento do analista; o item 48 do MAC é escopo congelado e não pode ser expandido" }],
    aplicabilidade: "sempre — e nunca deve consumir token",
    valoresPossiveis: SIM_NAO, responsavel: "(decisão do analista)", preenchidoPor: "analista",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
  },
  {
    chave: "observacoes", status: "AUTOMATICO", implementado: true,
    metodos: ["REGRA_DERIVADA"], fontePrincipal: "OUTROS_CAMPOS",
    regras: [{ regra: "DERIVAR_DE_CAMPO", descricao: "recebe o log da leitura no momento do aceite em bloco" }],
    responsavel: "app/processo/ProcessoClient.tsx:aceitarPropostaPasta", preenchidoPor: "tela",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
  },
];

/**
 * Chaves que o leitor grava e que NÃO existem em `lip_campos` deste assunto.
 *
 * `certidao` recebe o número da matrícula, mas é herança da Regularização — o slot 5 não tem esse
 * campo, e o valor vai para uma chave que a tela não mostra. Fica declarado aqui para que o teste
 * de integridade não acuse falso positivo, e para que a decisão (criar o campo ou parar de gravar)
 * não se perca.
 */
export const CHAVES_FANTASMA_LIP_SLOT5 = ["certidao"];
