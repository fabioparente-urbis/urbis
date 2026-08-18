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
  chave, declaracao: "AUTOMATICO", implementado: true, metodos, fontePrincipal,
  regras: [], responsavel: LEITOR, preenchidoPor: "leitor", usaIA: false, versao: 1, alteradoEm: HOJE,
  testes: [...T_LEITURA, ...T_RASTREIO], ...extra,
});

/** Campo que decorre de outro campo ou de cálculo. */
const derivado = (
  chave: string, formula: string, regras: AplicacaoRegra[], extra: Partial<CampoRastreado> = {},
): CampoRastreado => ({
  chave, declaracao: "CALCULADO", implementado: true, metodos: ["CALCULO"],
  fontePrincipal: "OUTROS_CAMPOS", regras, formula, responsavel: LEITOR, preenchidoPor: "leitor", usaIA: false,
  versao: 1, alteradoEm: HOJE, testes: [...T_LEITURA, ...T_RASTREIO], ...extra,
});

/**
 * Campo AUTOMÁTICO que PODE resultar em NP.
 *
 * A declaração é AUTOMATICO — o campo se preenche do documento quando o dado existe. `regraNP` diz
 * o que o faz virar NP naquele processo. A versão anterior declarava estes campos como
 * NAO_APLICAVEL, o que descrevia a pasta de amostra e não a regra: num lote de esquina, `via2` se
 * aplica e é preenchida normalmente.
 *
 * NP exige PROVA POSITIVA — leu, aplicou a regra, concluiu. Ausência de valor é NAO_ENCONTRADO.
 */
const podeSerNP = (
  chave: string, fontePrincipal: Fonte, regraNP: string, extra: Partial<CampoRastreado> = {},
): CampoRastreado => ({
  chave, declaracao: "AUTOMATICO", implementado: true,
  metodos: ["REGRA_DERIVADA"], fontePrincipal,
  regras: [{ regra: "MARCAR_NP", descricao: regraNP }],
  regraNP, responsavel: LEITOR, preenchidoPor: "leitor", usaIA: false,
  versao: 2, alteradoEm: HOJE, testes: [...T_LEITURA, ...T_RASTREIO],
  observacao: "v2 em 28/07/2026: era declarado NAO_APLICAVEL, o que sobreajustava a matriz à amostra",
  ...extra,
});

/**
 * Mecanismo pronto; o fato ainda não ocorreu.
 *
 * Não confundir com "não implementado": a consulta existe e roda. O que falta é o documento
 * existir. Preenche-se sozinho — inclusive retroativamente — quando o fato acontecer.
 */
const aguardandoFato = (chave: string, fatoNecessario: string, fonteDoc: string): CampoRastreado => ({
  chave, declaracao: "AUTOMATICO", implementado: true,
  metodos: ["BANCO_URBIS"],
  fontePrincipal: "REGISTRO_DOCUMENTOS_EMITIDOS",
  regras: [
    { regra: "ORDEM_DE_EMISSAO", descricao: "a ordem de emissão dos despachos é a ordem das análises" },
    { regra: "MARCAR_AGUARDANDO_FATO", descricao: `sem ${fonteDoc} emitido, o campo fica aguardando o fato` },
  ],
  fatoNecessario, responsavel: "lib/lipDocumentosEmitidos.ts:camposDeDocumentosEmitidos",
  preenchidoPor: "rota", usaIA: false, versao: 2, alteradoEm: HOJE, testes: T_RASTREIO,
  observacao: "v2 em 28/07/2026: a declaração passou de AGUARDANDO_FATO para AUTOMATICO — aguardar o fato é RESULTADO da execução, não característica do campo",
});

/** Depende de leitura de imagem — grupo C, ainda não implementado. */
const pendenteVisao = (
  chave: string, fontePrincipal: Fonte, onde: string, depende?: string[],
): CampoRastreado => ({
  chave, declaracao: "PENDENTE_VISAO", implementado: false,
  metodos: ["VISAO_LOCALIZADA"], fontePrincipal, depende,
  regras: [{ regra: "MARCAR_SEM_DADO", descricao: "sem a leitura da imagem, fica sem dado — nunca estimado" }],
  regraSemDado: onde, aplicabilidade: onde,
  responsavel: "(a implementar — grupo C)", preenchidoPor: "nao_preenchido", usaIA: true, versao: 1, alteradoEm: HOJE,
  testes: T_RASTREIO,
});

/**
 * Campo que a VISÃO LOCALIZADA já lê — o Grupo C implementado, campo a campo.
 *
 * Não é mais PENDENTE_VISAO: existe leitor, ele roda, e a matriz tem que dizer isso. A declaração
 * é AUTOMATICO porque o mecanismo se resolve sozinho; o resultado é que sai `INFERIDO`, e essa
 * distinção é do RESULTADO, não da declaração — mesma razão pela qual `AGUARDANDO_FATO` deixou de
 * ser declaração em 28/07.
 *
 * `preenchidoPor: "rota"` porque a visão roda em `/api/lip/ler-pasta`, não em `preencherLip` —
 * `lerPastaSlot5` é puro e sem banco, e é isso que mantém a trava 13 rápida e determinística.
 * Com visão desligada ou indisponível, o campo cai em NAO_ENCONTRADO pelo `fecharResultados`.
 */
const porVisao = (chave: string, receita: string, onde: string): CampoRastreado => ({
  chave, declaracao: "AUTOMATICO", implementado: true,
  metodos: ["VISAO_LOCALIZADA"], fontePrincipal: "PRANCHA",
  regras: [
    { regra: "MARCAR_SEM_DADO", descricao: "modelo sem certeza se abstém — FONTE_ILEGIVEL, nunca número plausível" },
  ],
  ondeProcura: [`recorte "${receita}" na prancha`, onde],
  regraSemDado: "visão desligada, sem orçamento ou indisponível resulta NAO_ENCONTRADO; ilegível resulta FONTE_ILEGIVEL",
  aplicabilidade: onde,
  responsavel: `lib/visao/receitas.ts:${receita}`,
  preenchidoPor: "rota", usaIA: true, versao: 2, alteradoEm: "2026-07-29",
  testes: [...T_RASTREIO, "scripts/testar_visao.mts"],
  observacao: "v2 em 29/07/2026: era PENDENTE_VISAO/não implementado; passou a ser lido pela receita de visão. "
    + "Valor INFERIDO exige confirmação do analista antes de valer no laudo — alimenta a LC 364/2023, que decide deferimento.",
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
    chave: "processoFisico", declaracao: "MANUAL", implementado: false,
    metodos: ["BANCO_URBIS", "ANALISTA"], fontePrincipal: "CADASTRO_PROCESSO",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "processos.numero_os está null; sem fonte automática hoje" }],
    regraSemDado: "processos.numero_os está null em todos os processos",
    responsavel: "(digitação no cadastro do processo)", usaIA: false, versao: 1, alteradoEm: HOJE, preenchidoPor: "analista",
    testes: T_RASTREIO,
  },
  {
    chave: "licencaPrevia", declaracao: "DOCUMENTO_AUSENTE", implementado: false,
    metodos: ["DOCUMENTO_AUSENTE"], fontePrincipal: "SEM_FONTE",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "não há documento de licença prévia na pasta do processo" }],
    regraSemDado: "documento não integra os 10 obrigatórios do SEI",
    responsavel: "—", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "nao_preenchido",
  },
  {
    chave: "cheadvN", declaracao: "DOCUMENTO_AUSENTE", implementado: false,
    metodos: ["DOCUMENTO_AUSENTE"], fontePrincipal: "SEM_FONTE",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "o despacho da CHEADV não vem na pasta: ela aprova antes de chegar ao analista" }],
    regraSemDado: "fora do escopo documental do analista",
    responsavel: "—", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "nao_preenchido",
  },
  {
    chave: "dataPagtoTaxaInicial", declaracao: "DOCUMENTO_AUSENTE", implementado: false,
    metodos: ["DOCUMENTO_AUSENTE"], fontePrincipal: "SEM_FONTE",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "comprovante de taxa ausente na pasta" }],
    regraSemDado: "comprovante não integra os 10 obrigatórios",
    responsavel: "—", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "nao_preenchido",
  },

  // 2ª a 4ª via — o Uso do Solo traz uma via só
  ...[2, 3, 4].flatMap((n) => [
    podeSerNP(`via${n}`, "USO_DO_SOLO", "o Uso do Solo lista uma via apenas", { depende: ["quantasFrentes"] }),
    podeSerNP(`tipoDeVia${n}`, "USO_DO_SOLO", "o Uso do Solo lista uma via apenas", { depende: ["quantasFrentes"] }),
    podeSerNP(`larguraDaVia${n}`, "CADASTRO_LOGRADOUROS", "o Uso do Solo lista uma via apenas", { depende: ["quantasFrentes"] }),
    podeSerNP(`larguraDoPasseio${n}`, "CADASTRO_LOGRADOUROS", "o Uso do Solo lista uma via apenas", { depende: ["quantasFrentes"] }),
  ]),

  {
    chave: "houveMudancaDeAnalista", declaracao: "AUTOMATICO", implementado: true,
    // derivação DENTRO de uma fonte só (quantos usuários distintos emitiram), não confronto
    // entre fontes — por isso REGRA_DERIVADA e não COMPARACAO
    metodos: ["BANCO_URBIS", "REGRA_DERIVADA"],
    fontePrincipal: "REGISTRO_DOCUMENTOS_EMITIDOS",
    regras: [{ regra: "DERIVAR_DE_CAMPO", descricao: "conta usuários distintos que emitiram documento neste processo" }],
    formula: "distinct(usuario_id) > 1",
    fatoNecessario: "nenhum documento emitido ainda — sem emissão não há como saber quem analisou",
    valoresPossiveis: SIM_NAO,
    responsavel: "lib/lipDocumentosEmitidos.ts:houveMudancaDeAnalista", preenchidoPor: "rota",
    usaIA: false, versao: 2, alteradoEm: HOJE, testes: T_RASTREIO,
    observacao: "v2 em 28/07/2026: declaração AGUARDANDO_FATO → AUTOMATICO",
  },

  // ═══════════════ TIPO DE PROCESSO E USO ═══════════════
  {
    chave: "tipoProcessoLip", declaracao: "AUTOMATICO", implementado: true,
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
    podeSerNP(k, "REQUERIMENTO", "uso comercial: a tipologia habitacional/institucional não se aplica", { depende: ["comercio", "atividadeEconomica"] })),

  // ═══════════════ LOTE ═══════════════
  {
    chave: "dimensoesDoLoteConferemComA", declaracao: "PENDENTE_VISAO", implementado: false,
    metodos: ["VISAO_LOCALIZADA"], fontePrincipal: "OUTROS_CAMPOS",
    fontesComparadas: ["CERTIDAO", "PRANCHA"],
    regras: [
      { regra: "COMPARAR_FONTES", descricao: "imagem da certidão de matrícula × imagem/cotas da planta de situação, direto" },
      { regra: "MARCAR_SEM_DADO", descricao: "sem a leitura da imagem, fica sem dado — nunca estimado" },
    ],
    formula: "dimensões (frente/fundo/laterais) e área lidas na certidão == lidas na planta de situação (com tolerância)",
    regraSemDado: "depende de leitura de imagem (grupo C) — certidão é imagem em todas as páginas, planta é desenho cotado",
    valoresPossiveis: SIM_NAO, responsavel: "(a implementar — grupo C)", preenchidoPor: "analista",
    usaIA: false, versao: 2, alteradoEm: "2026-08-18", testes: T_RASTREIO,
    observacao: "v2 em 18/08/2026: dimensoesDoLoteNaCertidao/dimensoesDoLoteNoProjeto removidos do LIP — eram "
      + "campos-fonte literais redundantes com este veredito (se o veredito é SIM/NÃO, escrever a dimensão de "
      + "novo não agrega). Hoje o analista compara a olho e digita o veredito; quando o grupo C existir, ele lê "
      + "as duas imagens direto e preenche este campo sozinho, sem precisar dos campos removidos.",
  },
  podeSerNP("dimensoesDoLoteConferemComRememb", "OUTROS_CAMPOS", "não há remembramento, remanejamento ou desmembramento na pasta"),

  // ═══════════════ USO DO SOLO ═══════════════
  doDoc("usoDoSoloN", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "REGEX"]),
  doDoc("unidadeTerritorialDoUsoDoSolo", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("tipoDeVia1", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"], {
    observacao: "a hierarquia do Cadastro de Logradouros é confrontada com esta e a divergência vira ALERTA",
  }),
  doDoc("cnae", "USO_DO_SOLO", ["TEXTO_DOCUMENTO", "DADO_ESTRUTURADO"]),
  doDoc("alertasDoUsoDoSolo", "USO_DO_SOLO", ["DADO_ESTRUTURADO", "REGRA_DERIVADA"], {
    declaracao: "CALCULADO",
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
  podeSerNP("aArtDeExecucaoAtendeA", "ART", "a ART de execução do CREA não traz declaração de acessibilidade"),

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
  podeSerNP("trafegoElevadores", "PRANCHA", "edificação térrea: não há tráfego de elevador a analisar", { depende: ["pav"] }),
  podeSerNP("tDC", "OUTROS_CAMPOS", "nenhum documento de Transferência do Direito de Construir na pasta"),
  podeSerNP("demolicao", "OUTROS_CAMPOS", "nenhum documento de demolição na pasta"),
  podeSerNP("smmPCorredoresDoArtigo116", "USO_DO_SOLO", "o Uso do Solo não indica corredor viário", { depende: ["alertasDoUsoDoSolo"] }),
  podeSerNP("docEmitidoPeloComandoDaAeronautica", "USO_DO_SOLO", "o Uso do Solo alerta quando é área aeroportuária, e não alertou", { depende: ["alertasDoUsoDoSolo"] }),
  podeSerNP("certidaoDeAcessib", "ASSUNTO", "certidão de acessibilidade não regulamentada"),
  {
    chave: "obsDocumentos", declaracao: "AUTOMATICO", implementado: true,
    metodos: ["VALOR_PADRAO"], fontePrincipal: "ASSUNTO", regras: [],
    responsavel: "lip_campos.valor_padrao", usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO, preenchidoPor: "valor_padrao",
  },
  {
    chave: "outorgaOnerosa", declaracao: "BLOQUEADO", implementado: false,
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
  /* Nº DE UNIDADES é campo do CARIMBO pela IN 007/2024, não desenho.
   *
   * Estavam declarados PENDENTE_VISAO, o que dizia "falta implementar visão" quando o problema é
   * outro: o carimbo desta prancha simplesmente não traz o rótulo. Verificado em 29/07/2026 contra
   * a camada de texto da amostra — `Nº DE UNIDADES` não aparece, enquanto os demais rótulos do
   * carimbo aparecem. Visão nenhuma resolve rótulo que não foi escrito.
   *
   * Mesma correção já aplicada a `volumeExigidoDaCaixa`: quando o projetista omite um campo que a
   * norma exige, o resultado é NAO_ENCONTRADO e a pendência é do carimbo, não do leitor. Declarar
   * PENDENTE_VISAO escondia uma exigência descumprida atrás de uma limitação nossa. */
  ...["unidComerciais", "unidHabitacionais"].map((k) =>
    doDoc(k, "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"], {
      versao: 2,
      ondeProcura: ["rótulo 'Nº DE UNIDADES' no carimbo", "variantes 'N. DE UNIDADES', 'NUMERO DE UNIDADES'"],
      aplicabilidade: "carimbo, 'Nº DE UNIDADES' (IN 007/2024)",
      regraSemDado: "quando o carimbo omite o rótulo, resulta NAO_ENCONTRADO — pendência contra a IN 007/2024, não limitação do leitor",
      responsavel: "lib/lerPastaSlot5.ts:lerPrancha",
      observacao: "v2 em 29/07/2026: era PENDENTE_VISAO. Verificado na camada de texto da amostra que o rótulo não existe no carimbo — é omissão do projetista, não conteúdo rasterizado.",
    })),
  pendenteVisao("areaTotalPrivativa", "PRANCHA", "quadro de áreas detalhado, colado como imagem"),
  pendenteVisao("alturaDaEdificacao", "PRANCHA", "cotada nos cortes — desenho, não tabela"),
  podeSerNP("acessoVertical", "PRANCHA", "edificação térrea: não há acesso vertical previsto", { depende: ["pav"] }),
  podeSerNP("art163BaiaDeDesaceleracaoAa", "USO_DO_SOLO", "o Art. 163 só alcança via expressa e acesso direto proibido; a via é coletora", { depende: ["tipoDeVia1"] }),

  // ═══════════════ FRAÇÃO IDEAL ═══════════════
  derivado("aabEApac190", "unidade territorial é AAB/APAC e a fração declarada é 1/90",
    [{ regra: "COMPARAR_FONTES", descricao: "fração ideal declarada no UDS × unidade territorial" }],
    { depende: ["unidadeTerritorialDoUsoDoSolo"], fontePrincipal: "USO_DO_SOLO", valoresPossiveis: SIM_NAO }),
  podeSerNP("aosEApaIntegranteDaArau", "USO_DO_SOLO", "unidade territorial é AAB, não AOS/APA", { depende: ["unidadeTerritorialDoUsoDoSolo"] }),
  podeSerNP("chacarasVerificarNomeDoBairroNa", "USO_DO_SOLO", "unidade territorial é AAB, não chácara", { depende: ["unidadeTerritorialDoUsoDoSolo"] }),
  podeSerNP("chacarasVerificarNomeDoBairroNa2", "USO_DO_SOLO", "unidade territorial é AAB, não chácara", { depende: ["unidadeTerritorialDoUsoDoSolo"] }),
  podeSerNP("quitineteEmAab130", "USO_DO_SOLO", "não há quitinete no projeto", { depende: ["quitinete"] }),

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
  /* v2 em 18/08/2026: era PENDENTE_VISAO (achava que só dava pra ler numa imagem colada). Achado
   * real (memorial das caixas de retenção, processo 50724): área impermeável = área do lote
   * MENOS área de grama — os dois já saem do carimbo como texto, sem precisar de visão nenhuma.
   * Fallback pro cálculo reverso (ICCAP EXIGIDO × divisor do UDS) quando falta a grama. A trava
   * 13b pegou: a matriz dizia que ninguém preenchia, e o leitor já preenchia. */
  derivado("areaImpermeabilizada", "areaTerreno − permeavel (grama), com fallback iccapExigido × divisor do UDS",
    [
      { regra: "DERIVAR_DE_CAMPO", descricao: "área do lote menos área de grama/permeável" },
      { regra: "FONTE_PRIORITARIA", descricao: "cálculo reverso do ICCAP só entra quando falta a grama" },
    ],
    { versao: 2, depende: ["areaTerreno", "areaPermeavelProjetada"], fontesComparadas: ["PRANCHA"] }),
  doDoc("volumeExigidoDaCaixa", "PRANCHA", ["TEXTO_DOCUMENTO", "REGEX"], {
    versao: 2,
    ondeProcura: ["rótulo ICCAP + 'EXIGIDO'", "linha 'EXIGIDO ... m³' no carimbo"],
    aplicabilidade: "carimbo, linha ICCAP — o modelo oficial pede EXIGIDO e ATENDIDO",
    regraSemDado: "quando o carimbo omite o EXIGIDO, resulta NAO_ENCONTRADO — pendência contra a IN 007/2024",
    responsavel: "lib/lerPastaSlot5.ts:lerPrancha",
    observacao: "v2 em 28/07/2026: era PENDENTE_VISAO, mas o leitor já tenta ler do carimbo",
  }),

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
  podeSerNP("aproveitamentoExigidoAreaDeFruicao", "OUTROS_CAMPOS", "área de fruição só é exigida com aproveitamento acima do básico", { depende: ["indiceDeAproveitamentoDoProjetoTotal"] }),

  // ═══════════════ VAGAS ═══════════════
  // os três que a receita `prancha.calculo_de_vagas` já lê, num recorte só
  ...["vagasPcdExigido", "vagasIdosoExigido", "totalDeVagasExigidasParaEssas"].map((k) =>
    porVisao(k, "prancha.calculo_de_vagas", "quadro CÁLCULO DE VAGAS, colado como imagem na prancha")),
  // o resto do mesmo quadro ainda não tem receita — a regra de negócio de cada um precisa do analista
  ...["totalASerDescontadoNoCalculo", "areaOcupadaPelaAtividade", "totalDeVagasAtendidasParaAtividade",
      "vagasPcdAtendidas", "vagasIdosoAtendidas", "atendeAcessoCirculacaoVagasManobrasLc",
  ].map((k) => pendenteVisao(k, "PRANCHA", "tabela de vagas colada como imagem na prancha", ["areaOcupadaPelaAtividade"])),
  podeSerNP("vagaAmbulanciaPCnaeAtivEspec", "USO_DO_SOLO", "nenhum CNAE de atividade específica de saúde", { depende: ["cnae"] }),

  // ═══════════════ PENDÊNCIAS NO LAUDO E OBS ═══════════════
  podeSerNP("atendeDecreto9451PUsoHab", "OUTROS_CAMPOS", "o Decreto 9.451 só alcança uso habitacional", { depende: ["habitacional"] }),
  {
    chave: "atendeAcessibilidade", declaracao: "MANUAL", implementado: true,
    metodos: ["ANALISTA"], fontePrincipal: "ANALISTA",
    regras: [{ regra: "MARCAR_SEM_DADO", descricao: "julgamento do analista; o item 48 do MAC é escopo congelado e não pode ser expandido" }],
    aplicabilidade: "sempre — e nunca deve consumir token",
    valoresPossiveis: SIM_NAO, responsavel: "(decisão do analista)", preenchidoPor: "analista",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
  },
  {
    chave: "observacoes", declaracao: "AUTOMATICO", implementado: true,
    metodos: ["REGRA_DERIVADA"], fontePrincipal: "OUTROS_CAMPOS",
    regras: [{ regra: "DERIVAR_DE_CAMPO", descricao: "recebe o log da leitura no momento do aceite em bloco" }],
    responsavel: "app/processo/ProcessoClient.tsx:aceitarPropostaPasta", preenchidoPor: "tela",
    usaIA: false, versao: 1, alteradoEm: HOJE, testes: T_RASTREIO,
    observacao: "declaração ≠ resultado, de propósito: a DECLARAÇÃO é AUTOMATICO (o mecanismo roda sozinho, sem "
      + "intervenção do analista); o RESULTADO sai sempre CALCULADO, nunca ENCONTRADO — o valor é um log MONTADO "
      + "no aceite (app/api/lip/aceitar-pasta/route.ts), não um trecho extraído verbatim de documento. É a mesma "
      + "distinção método×regra que separa TEXTO_DOCUMENTO de REGRA_DERIVADA. Protegido pelo teste 14g "
      + "(scripts/testar_rastreabilidade.mts) — se isso mudar sem essa observação acompanhar, é regressão, não evolução.",
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
