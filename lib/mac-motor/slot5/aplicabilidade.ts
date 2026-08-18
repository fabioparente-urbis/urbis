/**
 * lib/mac-motor/slot5/aplicabilidade.ts — decide, a partir do LIP já lido, quais GRUPOS do
 * checklist do Slot 5 não se aplicam ao processo.
 *
 * Isolado do Slot 1: não importa nada de app/analise-regularizacao nem de lib/macFiltros
 * (os grupos são declarados aqui de novo, de propósito — se o Slot 1 renomear um filtro,
 * este arquivo não muda de comportamento junto).
 *
 * REGRA DE OURO: só decide quando a evidência do LIP é inequívoca. Campo vazio, ausente ou
 * ambíguo devolve `null` — o item fica para o analista, nunca é chutado como N/A.
 */

export type DadosLip = Record<string, { valor?: string | null } | undefined>;

/**
 * Texto já extraído dos PDFs da pasta, por papel de documento (`projeto`, `uso_solo`, …).
 * Vem de `mhd_conteudos.texto`, gravado pela leitura da pasta — nenhum PDF é reprocessado aqui.
 */
export type TextosPorPapel = Record<string, string>;

export type VeredictoGrupo = {
  regraId: string;
  grupos: string[];
  justificativa: string;
  camposUsados: string[];
};

/** "NP" = não possui. É a forma como o LIP do Slot 5 registra ausência declarada. */
const NAO_POSSUI = new Set(["NP", "N/P", "NÃO POSSUI", "NAO POSSUI"]);
const NEGATIVO = new Set(["NÃO", "NAO", "N"]);
const POSITIVO = new Set(["SIM", "S"]);

function bruto(lip: DadosLip, chave: string): string | null {
  const v = lip?.[chave]?.valor;
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function norm(lip: DadosLip, chave: string): string | null {
  const t = bruto(lip, chave);
  return t === null ? null : t.toUpperCase();
}

/** true = declarado ausente ("NP") ou negativo ("NÃO"). null = sem dado, não decide. */
function ausente(lip: DadosLip, chave: string): boolean | null {
  const v = norm(lip, chave);
  if (v === null) return null;
  if (NAO_POSSUI.has(v)) return true;
  if (NEGATIVO.has(v)) return true;
  if (POSITIVO.has(v)) return false;
  return false; // tem conteúdo real preenchido → o tema existe no processo
}

/** Todas as chaves precisam estar declaradas ausentes. Uma sem dado derruba a regra inteira. */
function todosAusentes(lip: DadosLip, chaves: string[]): boolean | null {
  let algumDado = false;
  for (const c of chaves) {
    const a = ausente(lip, c);
    if (a === null) continue;
    algumDado = true;
    if (a === false) return false;
  }
  return algumDado ? true : null;
}

// ── busca textual nos documentos da pasta ────────────────────────────────────
// Substring é armadilha: "POSTO" casa dentro de "COMPOSTO"/"DISPOSTO" e faria o filtro de posto
// de combustível deixar de disparar num processo onde a palavra nunca apareceu de verdade.
// Confirmado no processo 50724: substring dizia ENCONTRADO, palavra inteira diz ausente.

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Procura a palavra INTEIRA, ignorando acento e caixa, só nos papéis informados. */
function acharPalavra(
  textos: TextosPorPapel, papeis: string[], termos: string[],
): { achou: boolean; papel: string | null; termo: string | null; trecho: string | null } {
  for (const papel of papeis) {
    const bruto = textos[papel];
    if (!bruto) continue;
    const alvo = semAcento(bruto).toUpperCase();
    for (const termo of termos) {
      const re = new RegExp(`(^|[^A-Z0-9])${escaparRegex(semAcento(termo).toUpperCase())}([^A-Z0-9]|$)`);
      const m = re.exec(alvo);
      if (m) {
        const i = Math.max(0, m.index - 60);
        return {
          achou: true, papel, termo,
          trecho: bruto.slice(i, Math.min(bruto.length, m.index + 90)).replace(/\s+/g, " ").trim(),
        };
      }
    }
  }
  return { achou: false, papel: null, termo: null, trecho: null };
}

/** Os papéis existem na leitura? Sem eles não dá para afirmar ausência — devolve null. */
function temAlgumPapel(textos: TextosPorPapel, papeis: string[]): boolean {
  return papeis.some((p) => (textos[p]?.length ?? 0) > 0);
}

type Regra = {
  id: string;
  /** Rótulo curto, o mesmo vocabulário dos filtros manuais que o analista já conhece. */
  nome: string;
  grupos: string[];
  campos: string[];
  /** true = grupos não se aplicam · false = se aplicam · null = sem dado, decide o analista. */
  avaliar: (lip: DadosLip, textos: TextosPorPapel) => boolean | null;
  motivo: (lip: DadosLip, textos: TextosPorPapel) => string;
};

/**
 * Fábrica das regras "não achei a palavra no documento → o tema não existe no projeto".
 * Só conclui ausência quando o documento foi mesmo lido; documento faltando devolve `null`.
 */
function regraPorAusencia(cfg: {
  id: string; nome: string; grupos: string[]; papeis: string[]; termos: string[];
}): Regra {
  return {
    id: cfg.id,
    nome: cfg.nome,
    grupos: cfg.grupos,
    campos: [],
    avaliar: (_lip, textos) => {
      if (!temAlgumPapel(textos, cfg.papeis)) return null;
      return !acharPalavra(textos, cfg.papeis, cfg.termos).achou;
    },
    motivo: (_lip, textos) => {
      const r = acharPalavra(textos, cfg.papeis, cfg.termos);
      if (r.achou) return `"${r.termo}" encontrado em ${r.papel}: …${r.trecho}…`;
      return `nenhuma ocorrência de ${cfg.termos.map((t) => `"${t}"`).join(" / ")} em ${cfg.papeis.join(", ")}`;
    },
  };
}

const REGRAS: Regra[] = [
  {
    id: "APROVACAO_NAO_E_MODIFICACAO",
    nome: "Aprovação de projeto (não é modificação)",
    grupos: [
      "PROCESSOS MODIFICAÇÃO SEM ACRÉSCIMO",
      "PROCESSOS MODIFICAÇÃO COM ACRÉSCIMO",
    ],
    campos: ["tipoProcessoLip"],
    avaliar: (lip) => {
      const t = norm(lip, "tipoProcessoLip");
      if (t === null) return null;
      if (t.includes("MODIFICA")) return false;
      return t.includes("APROVA") ? true : null;
    },
    motivo: (lip) => `tipoProcessoLip = "${bruto(lip, "tipoProcessoLip")}" — não é processo de modificação`,
  },
  {
    id: "SEM_USO_HABITACIONAL",
    nome: "Sem uso habitacional",
    grupos: [
      "VAGAS PARA USO HABITACIONAL",
      "HABITAÇÃO SERIADA",
      "HABITAÇÃO SERIADA E COLETIVA NÃO INTEGRANTES DE LOTEAMENTO",
      "QUANTO À APLICAÇÃO DO DF Nº 9.451, DE 26/07/2018",
      "47.QUANTO À APLICAÇÃO DO DF Nº 9.451, DE 26/07/2018 - APRESENTAR NO PROJETO",
    ],
    campos: ["habitacional", "habSeriada", "habColetiva", "misto"],
    avaliar: (lip) => todosAusentes(lip, ["habitacional", "habSeriada", "habColetiva", "misto"]),
    motivo: (lip) =>
      `habitacional = "${bruto(lip, "habitacional")}" · habSeriada = "${bruto(lip, "habSeriada")}" · ` +
      `habColetiva = "${bruto(lip, "habColetiva")}" · misto = "${bruto(lip, "misto")}" — nenhum uso habitacional no projeto`,
  },
  {
    id: "SEM_OUTORGA_ONEROSA",
    nome: "Sem outorga onerosa / TDC",
    grupos: [
      "COEFICIENTE DE APROVEITAMENTO BÁSICO NÃO ONEROSO E ONEROSO Art. 242 LC N°349 /2022) E TDC",
    ],
    campos: ["outorgaOnerosa", "tDC"],
    avaliar: (lip) => todosAusentes(lip, ["outorgaOnerosa", "tDC"]),
    motivo: (lip) => `outorgaOnerosa = "${bruto(lip, "outorgaOnerosa")}" · tDC = "${bruto(lip, "tDC")}"`,
  },
  {
    id: "SEM_BAIA_DESACELERACAO",
    nome: "Sem baia de desaceleração",
    grupos: ["BAIA DE DESACELERAÇÃO DE VELOCIDADE"],
    campos: ["art163BaiaDeDesaceleracaoAa"],
    avaliar: (lip) => ausente(lip, "art163BaiaDeDesaceleracaoAa"),
    motivo: (lip) => `art163BaiaDeDesaceleracaoAa = "${bruto(lip, "art163BaiaDeDesaceleracaoAa")}"`,
  },
  {
    id: "SEM_QUITINETE_PENSAO",
    nome: "Sem quitinete / pensão",
    grupos: ["PENSAO, PENSIONATO E CASA DE ESTUDANTES – LC nº364/2023 – Art. 121"],
    campos: ["quitinete", "quitineteEmAab130"],
    avaliar: (lip) => todosAusentes(lip, ["quitinete", "quitineteEmAab130"]),
    motivo: (lip) => `quitinete = "${bruto(lip, "quitinete")}" · quitineteEmAab130 = "${bruto(lip, "quitineteEmAab130")}"`,
  },
  {
    id: "SEM_AOS_ARAU",
    nome: "Fora de AOS / ARAU",
    grupos: [],
    campos: ["aosEApaIntegranteDaArau", "unidadeTerritorialDoUsoDoSolo"],
    avaliar: (lip) => ausente(lip, "aosEApaIntegranteDaArau"),
    motivo: (lip) =>
      `aosEApaIntegranteDaArau = "${bruto(lip, "aosEApaIntegranteDaArau")}" · ` +
      `unidade territorial = "${bruto(lip, "unidadeTerritorialDoUsoDoSolo")}"`,
  },
  {
    id: "SEM_ZONA_AEROPORTUARIA",
    nome: "Fora de zona aeroportuária",
    grupos: [],
    campos: ["docEmitidoPeloComandoDaAeronautica"],
    avaliar: (lip) => ausente(lip, "docEmitidoPeloComandoDaAeronautica"),
    motivo: (lip) => `docEmitidoPeloComandoDaAeronautica = "${bruto(lip, "docEmitidoPeloComandoDaAeronautica")}"`,
  },
  {
    id: "COM_CORREDOR_VIARIO",
    nome: "Corredor viário se aplica",
    grupos: ["CORREDOR VIÁRIO"],
    campos: ["anexouCertidaoDeCorredorViario", "alertasDoUsoDoSolo"],
    avaliar: (lip) => {
      const cert = norm(lip, "anexouCertidaoDeCorredorViario");
      const alerta = norm(lip, "alertasDoUsoDoSolo") ?? "";
      // O uso do solo declarando corredor viário é prova de que o grupo SE APLICA.
      if (alerta.includes("CORREDOR VIÁRIO: SIM") || alerta.includes("CORREDOR VIARIO: SIM")) return false;
      if (cert !== null && POSITIVO.has(cert)) return false;
      if (cert !== null && NAO_POSSUI.has(cert)) return true;
      return null;
    },
    motivo: (lip) =>
      `alertasDoUsoDoSolo = "${bruto(lip, "alertasDoUsoDoSolo")}" · ` +
      `anexouCertidaoDeCorredorViario = "${bruto(lip, "anexouCertidaoDeCorredorViario")}"`,
  },

  // ── Acionamento por ausência da palavra no documento ───────────────────────
  // O projeto é a fonte: se o desenho não menciona o tema, ele não existe no projeto.
  // Cada uma só conclui quando o documento foi lido de fato (senão vira pendência).
  regraPorAusencia({
    id: "SEM_POSTO_COMBUSTIVEL",
    nome: "Não é posto de combustível",
    grupos: [
      "POSTO DE COMBUSTIVEL – LC nº364/2023 – Art. 120",
      "Rebaixo para atividade: Posto de COMERCIO E COMBUSTÍVEL E SERVIÇOS AUTOMOTIVOS: §10º",
    ],
    papeis: ["projeto", "uso_solo"],
    termos: ["POSTO", "COMBUSTIVEL", "ABASTECIMENTO"],
  }),
  regraPorAusencia({
    id: "SEM_MARQUISE",
    nome: "Sem marquise",
    grupos: ["MARQUISES E COBERTURAS"],
    papeis: ["projeto"],
    termos: ["MARQUISE", "MARQUISES"],
  }),
  regraPorAusencia({
    id: "SEM_SUBSOLO",
    nome: "Sem subsolo",
    grupos: ["SUBSOLO AFLORADO (RECUO E ALTURA)"],
    papeis: ["projeto"],
    termos: ["SUBSOLO"],
  }),
  regraPorAusencia({
    id: "SEM_CARGA_DESCARGA",
    nome: "Sem carga e descarga",
    grupos: [
      "EXIGENCIA DE CARGA E DESCARGA – LEI DE ATIVI N°10.8450 DE 04/11/22 e INSTRUÇÃO NORMATIVA Nº8 01/10/2023",
      "SOLUÇÃO ALTERNATIVA PARA CARGA E DESCARGA EM EDIFICAÇÃO REGULAR EXISTENTE – Art. 17 LC n°10.845/2022)",
    ],
    papeis: ["projeto"],
    termos: ["CARGA E DESCARGA", "C/D"],
  }),
  regraPorAusencia({
    id: "SEM_EMBARQUE_DESEMBARQUE",
    nome: "Sem embarque e desembarque",
    grupos: ["EMBARQUE E DESEMBARQUE"],
    papeis: ["projeto"],
    termos: ["EMBARQUE", "DESEMBARQUE"],
  }),
  regraPorAusencia({
    id: "SEM_EIT_EIV",
    nome: "Sem EIT / EIV",
    grupos: ["EIT / EIV"],
    papeis: ["projeto", "uso_solo"],
    termos: ["EIT", "EIV", "ESTUDO DE IMPACTO"],
  }),

  {
    // Equivale ao filtro manual "MEDIO PORTE". A condição já funciona (`grandePorte` é campo do
    // LIP); o que falta é a LISTA DE GRUPOS exclusivos de grande porte — nenhum item do checklist
    // menciona "grande porte" no texto, então não dá para derivar do banco. Enquanto a lista
    // estiver vazia a regra não marca nada e aparece como pendência explícita na tela, em vez de
    // sumir silenciosamente.
    id: "PORTE_NAO_E_GRANDE",
    nome: "Médio porte (não é grande porte)",
    grupos: [],
    campos: ["grandePorte"],
    avaliar: (lip) => ausente(lip, "grandePorte"),
    motivo: (lip) => `grandePorte = "${bruto(lip, "grandePorte")}" — itens exclusivos de grande porte não se aplicam`,
  },
];

/**
 * Avalia todas as regras contra o LIP do processo.
 *
 * Devolve só o que ficou decidido como "não se aplica", com a justificativa auditável de cada
 * decisão. `indecisas` registra o que faltou dado para julgar — é o que a tela mostra ao
 * analista como "não deu pra decidir sozinho".
 */
export function gruposNaoAplicaveis(lip: DadosLip, textos: TextosPorPapel = {}): {
  naoAplicaveis: VeredictoGrupo[];
  aplicaveis: VeredictoGrupo[];
  indecisas: { regraId: string; nome: string; camposFaltando: string[] }[];
} {
  const naoAplicaveis: VeredictoGrupo[] = [];
  const aplicaveis: VeredictoGrupo[] = [];
  const indecisas: { regraId: string; nome: string; camposFaltando: string[] }[] = [];

  for (const r of REGRAS) {
    const veredicto = r.avaliar(lip, textos);
    if (veredicto === null) {
      indecisas.push({
        regraId: r.id,
        nome: r.nome,
        camposFaltando: r.campos.length
          ? r.campos.filter((c) => bruto(lip, c) === null)
          : ["documento não lido na pasta"],
      });
      continue;
    }
    const registro: VeredictoGrupo = {
      regraId: r.id,
      grupos: r.grupos,
      justificativa: r.motivo(lip, textos),
      camposUsados: r.campos,
    };
    if (veredicto) naoAplicaveis.push(registro);
    else aplicaveis.push(registro);
  }

  return { naoAplicaveis, aplicaveis, indecisas };
}
