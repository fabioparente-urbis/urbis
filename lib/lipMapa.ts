/**
 * lib/lipMapa.ts — MAPA DO LIP do slot 5 (Aprovação de Projeto).
 *
 * Inventário dos 136 campos: de onde cada um vem, por que método, e — quando ainda não é
 * preenchido — POR QUE não é. Levantado em 28/07/2026 antes de escrever qualquer código novo.
 *
 * Isto é código, e não uma tabela morta num documento, por três motivos:
 *   · alimenta a tela "Mapa do LIP" sem duplicar informação;
 *   · o teste compara este mapa com o que a leitura realmente preenche, então mapa desatualizado
 *     quebra o teste em vez de mentir em silêncio;
 *   · a classificação vira ordem de trabalho: A e B primeiro, C depois, D e E por último.
 *
 * ── OS CINCO GRUPOS ─────────────────────────────────────────────────────────────
 *   A · dá para preencher SEM IA — dado já lido, já no banco, ou regra simples
 *   B · precisa só de CÁLCULO novo sobre o que já se tem
 *   C · precisa de VISÃO LOCALIZADA (as tabelas coladas como imagem, a certidão escaneada)
 *   D · precisa de INTERPRETAÇÃO de IA de verdade — devem ser poucos
 *   E · é do ANALISTA, e nunca deve consumir token
 *
 * ── REGRA DE ESTADO ─────────────────────────────────────────────────────────────
 * Nenhum campo termina o processamento "vazio". Termina em um destes:
 *   lido · calculado · visao · manual · nao_aplicavel · sem_fonte
 * "nao_aplicavel" é resposta legítima e frequente: metade do LIP do slot 5 é de uso habitacional,
 * e a amostra é comercial térrea.
 */

export type Grupo = "A" | "B" | "C" | "D" | "E";
export type Origem =
  | "projeto" | "art" | "uso_solo" | "certidao" | "requerimento"
  | "cadastro_imobiliario" | "urbis" | "calculo" | "analista" | "sem_documento";
export type Metodo = "texto" | "calculo" | "comparacao" | "visao" | "decisao" | "banco" | "regra";
export type Estado =
  | "lido" | "calculado" | "visao" | "manual" | "nao_aplicavel" | "sem_fonte" | "pendente";

export type CampoMapa = {
  chave: string;
  grupo: Grupo;
  origem: Origem;
  metodo: Metodo;
  /** por que ainda NÃO é preenchido. Vazio = já é preenchido hoje. */
  motivo?: string;
  /** chaves de que este campo depende para poder ser resolvido */
  depende?: string[];
  /**
   * O mecanismo está pronto, mas o FATO ainda não existe no processo.
   *
   * Não é legado, não é manual, e não está pendente de implementação: o campo se preenche sozinho
   * no instante em que o documento correspondente for emitido. Até lá fecha em "aguardando fato",
   * que é estado correto — e por isso NÃO conta como ganho no percentual do LIP.
   */
  bloqueadoPorFato?: string;
};

/** Preenchidos hoje pela leitura da pasta (45). */
const JA: Record<string, [Origem, Metodo]> = {
  logradouro: ["uso_solo", "texto"], quadra: ["uso_solo", "texto"], lote: ["uso_solo", "texto"],
  bairro: ["uso_solo", "texto"], iptu: ["uso_solo", "texto"],
  proprietario: ["requerimento", "texto"],
  nome_responsavel_arq: ["projeto", "texto"], cau: ["projeto", "texto"],
  nome_responsavel_eng: ["projeto", "texto"], crea: ["projeto", "texto"],
  quantasFrentes: ["calculo", "calculo"], esquina: ["calculo", "calculo"],
  usoDoSoloN: ["uso_solo", "texto"], unidadeTerritorialDoUsoDoSolo: ["uso_solo", "texto"],
  usoDoSoloEParaAprovacao: ["calculo", "regra"], tipoDeVia1: ["uso_solo", "texto"],
  anexouCertidaoDeCorredorViario: ["calculo", "regra"], atendeOPorteAdmitido: ["calculo", "regra"],
  cnae: ["uso_solo", "texto"], alertasDoUsoDoSolo: ["uso_solo", "regra"],
  numeroDeArtProjeto: ["art", "texto"], numeroDeArtExecucao: ["art", "texto"],
  numeroDeArtCaixa: ["art", "texto"],
  anexouArtRrtProjeto: ["urbis", "regra"], anexouArtRrtExecucao: ["urbis", "regra"],
  anexouArtRrtCaixa: ["urbis", "regra"],
  artDeProjetoAtendeAAcessibilidade: ["art", "texto"],
  areaNaArtDeProjeto: ["art", "texto"], areaNaArtDeExecucao: ["art", "texto"],
  volumeNaArtDeCaixa: ["art", "texto"],
  areaTerreno: ["projeto", "texto"], areaTotal: ["projeto", "texto"], pav: ["projeto", "texto"],
  nDeCaixasDeCaptacao: ["projeto", "texto"], volumeDaCaixaDeRecarga: ["projeto", "texto"],
  areaPermeavelProjetada: ["projeto", "texto"],
  aabEApac190: ["calculo", "regra"],
  opcao1TotalExigidoAreaTerreno: ["calculo", "calculo"],
  opcao2TotalExigidoAreaTerreno: ["calculo", "calculo"],
  opcao2TotalExigidoAreaTerreno2: ["calculo", "calculo"],
  opcao3TotalExigidoAreaTerreno: ["calculo", "calculo"],
  tipoProcessoLip: ["urbis", "regra"], comercio: ["requerimento", "texto"],
  atividadeEconomica: ["calculo", "regra"],
};

export const MAPA_LIP: CampoMapa[] = [
  ...Object.entries(JA).map(([chave, [origem, metodo]]) => ({ chave, grupo: "A" as Grupo, origem, metodo })),

  // ── GRUPO A — sem IA, dá para fazer já ────────────────────────────────────────

  /**
   * Números e datas de despacho, laudo e parecer.
   *
   * AUDITORIA DE 28/07/2026 — o registro de documentos emitidos (`mdp_registros`) está VIVO e em
   * produção: 20 registros, os dois últimos de 27/07/2026. Não é legado, não foi absorvido pelo
   * MHD, e nada nele precisa ser migrado ou renomeado agora.
   *
   * A cadeia real é: `urbis_numeracao_faixas` reserva o número → a tela emite → o registro grava.
   * O registro é o REGISTRO, não a origem do número.
   *
   * Estes 16 campos são **automatizáveis por consulta** — o mecanismo está implementado. O que
   * falta é o FATO: nenhum dos 20 registros é do slot 5, porque a Aprovação de Projeto nunca
   * emitiu despacho. Preenchem-se sozinhos no dia em que o primeiro for emitido.
   *
   * EVOLUÇÃO POSTERIOR, fora do escopo de hoje:
   *   · tornar obrigatória e visível a gravação hoje feita em best-effort (falha em silêncio);
   *   · espelhar documento emitido como evento do MHD (`despacho_emitido`), para a linha do tempo
   *     ter entrada E saída no mesmo lugar;
   *   · só depois avaliar unificação ou renomeação.
   */
  ...["numeroDeDespachoDa1Analise", "dataDa1Analise", "numeroDeDespachoDa2Analise", "dataDa2Analise",
      "numeroDeDespachoDa3Analise", "dataDa3Analise", "numeroDeDespachoDa4Analise", "dataDa4Analise",
      "numeroDeDespachoDa5Analise", "dataDa5Analise", "numeroDoLaudo5", "dataDoLaudo5",
      "numeroDoParecerDeIndeferimento", "dataDoParecerDeIndeferimento",
      "numeroDoParecerDeArquivamento", "dataDoParecerDeArquivamento",
  ].map((chave) => ({
    chave, grupo: "A" as Grupo, origem: "urbis" as Origem, metodo: "banco" as Metodo,
    motivo: "automatizável por consulta ao registro de documentos emitidos",
    bloqueadoPorFato: "o slot 5 ainda não emitiu nenhum despacho — os 20 registros existentes são todos da Regularização",
  })),

  { chave: "houveMudancaDeAnalista", grupo: "A", origem: "urbis", metodo: "banco",
    motivo: "comparar o analista_id ao longo do histórico do processo" },
  { chave: "processo", grupo: "A", origem: "urbis", metodo: "banco",
    motivo: "é o código do processo; processos.numero_projeto está null hoje" },
  { chave: "processoFisico", grupo: "A", origem: "urbis", metodo: "banco",
    motivo: "processos.numero_os está null; ou vem do cadastro, ou é digitado" },

  // ACHADO: a ART do CREA imprime "Coordenadas Geográficas: -16.6773299,-49.2573366".
  // Era tratado como campo manual desde a Regularização.
  { chave: "coordenadas", grupo: "A", origem: "art", metodo: "texto",
    motivo: "está no corpo da ART do CREA, campo 'Coordenadas Geográficas' — nunca foi lido" },

  { chave: "oEnderecoEstaCorretoNoUso", grupo: "A", origem: "calculo", metodo: "comparacao",
    motivo: "comparar endereço do UDS × carimbo × requerimento; os três já são lidos",
    depende: ["logradouro", "quadra", "lote"] },

  // as conferências JÁ EXISTEM e já dão veredito — falta escrever o resultado no campo
  { chave: "aAreaNaArtDeProjeto", grupo: "A", origem: "calculo", metodo: "comparacao",
    motivo: "a conferência já roda e dá CONFERE; falta gravar o resultado no campo",
    depende: ["areaNaArtDeProjeto", "areaTotal"] },
  { chave: "aAreaNaArtDeExecucao", grupo: "A", origem: "calculo", metodo: "comparacao",
    motivo: "idem — a conferência existe, o campo não recebe",
    depende: ["areaNaArtDeExecucao", "areaTotal"] },
  { chave: "volumeConfereComOProjeto", grupo: "A", origem: "calculo", metodo: "comparacao",
    motivo: "idem — a conferência existe, o campo não recebe",
    depende: ["volumeNaArtDeCaixa", "volumeDaCaixaDeRecarga"] },
  { chave: "aArtDeExecucaoAtendeA", grupo: "A", origem: "art", metodo: "texto",
    motivo: "a ART do CREA não traz declaração de acessibilidade; na amostra é NP" },

  // presença/ausência no catálogo, ou regra sobre dado já lido
  { chave: "tDC", grupo: "A", origem: "urbis", metodo: "regra", motivo: "ausente no catálogo → NP" },
  { chave: "demolicao", grupo: "A", origem: "urbis", metodo: "regra", motivo: "ausente no catálogo → NP" },
  { chave: "smmPCorredoresDoArtigo116", grupo: "A", origem: "uso_solo", metodo: "regra",
    motivo: "depende de corredor viário no UDS; a amostra não tem → NP" },
  { chave: "docEmitidoPeloComandoDaAeronautica", grupo: "A", origem: "uso_solo", metodo: "regra",
    motivo: "o próprio UDS alerta quando é área aeroportuária; sem alerta → NP" },
  { chave: "certidaoDeAcessib", grupo: "A", origem: "urbis", metodo: "regra",
    motivo: "não regulamentada (o valor padrão já diz isso) → NP" },
  { chave: "obsDocumentos", grupo: "A", origem: "urbis", metodo: "regra", motivo: "tem valor padrão" },
  { chave: "trafegoElevadores", grupo: "A", origem: "calculo", metodo: "regra",
    motivo: "depende de pav; térreo → NP", depende: ["pav"] },
  { chave: "acessoVertical", grupo: "A", origem: "calculo", metodo: "regra",
    motivo: "térreo não tem acesso vertical → NP", depende: ["pav"] },
  { chave: "art163BaiaDeDesaceleracaoAa", grupo: "A", origem: "uso_solo", metodo: "regra",
    motivo: "só se aplica a via expressa/AA/ADD; coletora → NP", depende: ["tipoDeVia1"] },
  { chave: "atendeDecreto9451PUsoHab", grupo: "A", origem: "calculo", metodo: "regra",
    motivo: "só para uso habitacional; comercial → NP", depende: ["habitacional"] },
  { chave: "dimensoesDoLoteConferemComRememb", grupo: "A", origem: "urbis", metodo: "regra",
    motivo: "sem remembramento no catálogo → NP" },
  { chave: "tipoUso", grupo: "A", origem: "requerimento", metodo: "texto",
    motivo: "o requerimento marca Comercial; o UDS traz as atividades" },
  { chave: "observacoes", grupo: "A", origem: "urbis", metodo: "regra",
    motivo: "recebe o log no aceite; o leitor não o preenche por não ser dado do processo" },

  // 2ª a 4ª via: a amostra tem uma via só. NP explícito, não vazio.
  ...["via2", "via3", "via4", "tipoDeVia2", "tipoDeVia3", "tipoDeVia4",
      "larguraDaVia2", "larguraDaVia3", "larguraDaVia4",
      "larguraDoPasseio2", "larguraDoPasseio3", "larguraDoPasseio4",
  ].map((chave) => ({
    chave, grupo: "A" as Grupo, origem: "calculo" as Origem, metodo: "regra" as Metodo,
    motivo: "só há uma via no Uso do Solo → NP", depende: ["quantasFrentes"],
  })),

  ...["habSeriada", "habColetiva", "quitinete", "institucional"].map((chave) => ({
    chave, grupo: "A" as Grupo, origem: "calculo" as Origem, metodo: "regra" as Metodo,
    motivo: "derivado do uso; comercial → NP", depende: ["comercio", "atividadeEconomica"],
  })),

  // ── GRUPO B — só falta cálculo ────────────────────────────────────────────────

  ...["habitacional", "misto", "grandePorte"].map((chave) => ({
    chave, grupo: "B" as Grupo, origem: "calculo" as Origem, metodo: "calculo" as Metodo,
    motivo: "derivar de CNAE + área + porte admitido no UDS", depende: ["cnae", "areaTotal"],
  })),

  ...["aproveitamentoExigidoAreaDeFruicao", "areaAteXxPav", "indiceDeAproveitamentoDoProjetoAte",
      "areaTotalMax75x", "indiceDeAproveitamentoDoProjetoTotal",
  ].map((chave) => ({
    chave, grupo: "B" as Grupo, origem: "calculo" as Origem, metodo: "calculo" as Metodo,
    motivo: "fórmula pura sobre áreas e pavimentos, que já são lidos",
    depende: ["areaTotal", "areaTerreno", "pav"],
  })),

  ...["aosEApaIntegranteDaArau", "chacarasVerificarNomeDoBairroNa",
      "chacarasVerificarNomeDoBairroNa2", "quitineteEmAab130",
  ].map((chave) => ({
    chave, grupo: "B" as Grupo, origem: "calculo" as Origem, metodo: "regra" as Metodo,
    motivo: "fração ideal por unidade territorial; AAB comercial → NP",
    depende: ["unidadeTerritorialDoUsoDoSolo"],
  })),

  { chave: "outorgaOnerosa", grupo: "B", origem: "calculo", metodo: "calculo",
    motivo: "regra: altura ≥ 7,5m E construído > área do lote — travado pela altura",
    depende: ["alturaDaEdificacao", "areaTotal", "areaTerreno"] },
  { chave: "dimensoesDoLoteConferemComA", grupo: "B", origem: "calculo", metodo: "comparacao",
    motivo: "comparação simples, travada pelos dois primitivos que exigem visão",
    depende: ["dimensoesDoLoteNaCertidao", "dimensoesDoLoteNoProjeto"] },

  // FEITO em 28/07/2026: a tabela `logradouros` tem 20.524 vias com hierarquia, largura de via e
  // de calçada. O casamento de nome é que era o problema ("R 2" no Uso do Solo × "R  2", com dois
  // espaços, no cadastro) — ver lib/cadastroImobiliario.ts.
  { chave: "larguraDaVia1", grupo: "B", origem: "cadastro_imobiliario", metodo: "banco" },
  { chave: "larguraDoPasseio1", grupo: "B", origem: "cadastro_imobiliario", metodo: "banco" },

  // ── GRUPO C — visão localizada (recorte de imagem, não a página inteira) ───────

  { chave: "areaImpermeabilizada", grupo: "C", origem: "projeto", metodo: "visao",
    motivo: "está no memorial do ICCAP, colado como imagem na prancha" },
  { chave: "volumeExigidoDaCaixa", grupo: "C", origem: "projeto", metodo: "visao",
    motivo: "o carimbo da amostra omite o ICCAP EXIGIDO que a IN 007/2024 obriga" },
  { chave: "dimensoesDoLoteNoProjeto", grupo: "C", origem: "projeto", metodo: "visao",
    motivo: "cotas da planta de situação — desenho cotado, não tabela" },
  { chave: "dimensoesDoLoteNaCertidao", grupo: "C", origem: "certidao", metodo: "visao",
    motivo: "o corpo da matrícula é imagem em todas as páginas" },
  { chave: "alturaDaEdificacao", grupo: "C", origem: "projeto", metodo: "visao",
    motivo: "está nos cortes, cotado no desenho" },
  { chave: "areaTotalPrivativa", grupo: "C", origem: "projeto", metodo: "visao",
    motivo: "quadro de áreas detalhado, colado como imagem" },
  ...["unidComerciais", "unidHabitacionais"].map((chave) => ({
    chave, grupo: "C" as Grupo, origem: "projeto" as Origem, metodo: "visao" as Metodo,
    motivo: "o modelo da IN 007/2024 pede 'Nº DE UNIDADES' no carimbo, mas a prancha da amostra não traz — pendência de carimbo",
  })),
  ...["totalASerDescontadoNoCalculo", "areaOcupadaPelaAtividade", "vagasPcdExigido",
      "vagasIdosoExigido", "totalDeVagasExigidasParaEssas", "totalDeVagasAtendidasParaAtividade",
      "vagasPcdAtendidas", "vagasIdosoAtendidas",
  ].map((chave) => ({
    chave, grupo: "C" as Grupo, origem: "projeto" as Origem, metodo: "visao" as Metodo,
    motivo: "tabela de vagas colada como imagem na prancha",
    depende: ["areaOcupadaPelaAtividade"],
  })),
  { chave: "vagaAmbulanciaPCnaeAtivEspec", grupo: "B", origem: "calculo", metodo: "regra",
    motivo: "depende do CNAE ser atividade específica; na amostra → NP", depende: ["cnae"] },
  { chave: "atendeAcessoCirculacaoVagasManobrasLc", grupo: "C", origem: "projeto", metodo: "visao",
    motivo: "exige a tabela de vagas e as cotas de manobra", depende: ["areaOcupadaPelaAtividade"] },

  // ── GRUPO D — precisa de documento que a pasta não tem ────────────────────────

  { chave: "licencaPrevia", grupo: "D", origem: "sem_documento", metodo: "texto",
    motivo: "não existe documento de licença prévia na pasta" },
  { chave: "cheadvN", grupo: "D", origem: "sem_documento", metodo: "texto",
    motivo: "o despacho da CHEADV não vem na pasta — a CHEADV aprova antes de chegar ao analista" },
  { chave: "dataPagtoTaxaInicial", grupo: "D", origem: "sem_documento", metodo: "texto",
    motivo: "comprovante de taxa ausente na pasta de amostra" },

  // ── GRUPO E — do analista, nunca gastar token ─────────────────────────────────

  { chave: "atendeAcessibilidade", grupo: "E", origem: "analista", metodo: "decisao",
    motivo: "julgamento do analista; o item 48 do MAC é escopo congelado e não pode ser expandido" },
];

/**
 * CHAVE FANTASMA encontrada no inventário: `certidao`.
 *
 * `preencherLip` grava o número da matrícula em `certidao`, mas esse campo NÃO existe no LIP do
 * slot 5 — é herança da Regularização. O valor vai para um campo que a tela não mostra.
 * Duas saídas: criar o campo (o número da matrícula é útil e identifica a certidão) ou parar de
 * gravá-lo. Decisão do Fábio; até lá, fica registrado aqui em vez de sumir em silêncio.
 */
export const CHAVES_FANTASMA = ["certidao"];

export const porGrupo = (g: Grupo) => MAPA_LIP.filter((c) => c.grupo === g);
export const mapaDe = (chave: string) => MAPA_LIP.find((c) => c.chave === chave);
