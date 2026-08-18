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

type Regra = {
  id: string;
  /** Rótulo curto, o mesmo vocabulário dos filtros manuais que o analista já conhece. */
  nome: string;
  grupos: string[];
  campos: string[];
  /** true = grupos não se aplicam · false = se aplicam · null = sem dado, decide o analista. */
  avaliar: (lip: DadosLip) => boolean | null;
  motivo: (lip: DadosLip) => string;
};

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
];

/**
 * Avalia todas as regras contra o LIP do processo.
 *
 * Devolve só o que ficou decidido como "não se aplica", com a justificativa auditável de cada
 * decisão. `indecisas` registra o que faltou dado para julgar — é o que a tela mostra ao
 * analista como "não deu pra decidir sozinho".
 */
export function gruposNaoAplicaveis(lip: DadosLip): {
  naoAplicaveis: VeredictoGrupo[];
  aplicaveis: VeredictoGrupo[];
  indecisas: { regraId: string; nome: string; camposFaltando: string[] }[];
} {
  const naoAplicaveis: VeredictoGrupo[] = [];
  const aplicaveis: VeredictoGrupo[] = [];
  const indecisas: { regraId: string; nome: string; camposFaltando: string[] }[] = [];

  for (const r of REGRAS) {
    const veredicto = r.avaliar(lip);
    if (veredicto === null) {
      indecisas.push({
        regraId: r.id,
        nome: r.nome,
        camposFaltando: r.campos.filter((c) => bruto(lip, c) === null),
      });
      continue;
    }
    const registro: VeredictoGrupo = {
      regraId: r.id,
      grupos: r.grupos,
      justificativa: r.motivo(lip),
      camposUsados: r.campos,
    };
    if (veredicto) naoAplicaveis.push(registro);
    else aplicaveis.push(registro);
  }

  return { naoAplicaveis, aplicaveis, indecisas };
}
