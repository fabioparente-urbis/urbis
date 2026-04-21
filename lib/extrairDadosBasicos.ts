function normalizarTexto(texto: string) {
  return texto
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

function linhas(texto: string) {
  return normalizarTexto(texto)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function limparValor(valor: string) {
  return valor
    .replace(/^[:\-\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* =========================
   🔥 FILTROS INTELIGENTES
========================= */

function pareceNome(val: string) {
  if (!val) return false;

  const upper = val.toUpperCase();

  const lixo = [
    "LOGOMARCA",
    "LOGO",
    "ESCALA",
    "FOLHA",
    "PRANCHA",
    "DATA",
    "ASSINATURA",
    "AUTOR",
    "LEVANTAMENTO",
    "PROJETO",
    "RESIDENCIAL",
    "COMERCIAL",
    "PLANTA",
    "ARQUITETONICO",
    "ARQUITETÔNICO",
  ];

  if (lixo.some((l) => upper.includes(l))) return false;

  const partes = val.trim().split(" ");
  if (partes.length < 2) return false;

  if (/^[A-Z\s]+$/.test(val) && partes.length <= 2) return false;

  if (/\d/.test(val)) return false;

  return true;
}

function pareceTextoValido(val: string) {
  if (!val) return false;

  const upper = val.toUpperCase();

  const lixo = [
    "LOGOMARCA",
    "ESCALA",
    "FOLHA",
    "PRANCHA",
    "DATA",
    "ASSINATURA",
    "AUTOR",
    "LEVANTAMENTO",
  ];

  if (lixo.some((l) => upper.includes(l))) return false;

  return true;
}

/* =========================
   🔎 BUSCA GENÉRICA
========================= */

function valorNaMesmaLinha(texto: string, regexes: RegExp[]) {
  for (const regex of regexes) {
    const match = texto.match(regex);
    if (match) {
      const valor = limparValor(match[1] || "");
      if (pareceTextoValido(valor)) return valor;
    }
  }
  return "NP";
}

function valorNaLinhaSeguinte(lista: string[], labels: RegExp[]) {
  for (let i = 0; i < lista.length; i++) {
    const atual = lista[i];

    for (const label of labels) {
      if (label.test(atual)) {
        const prox = limparValor(lista[i + 1] || "");
        if (pareceTextoValido(prox)) return prox;
      }
    }
  }
  return "NP";
}

function buscarCampo(
  texto: string,
  lista: string[],
  mesmaLinha: RegExp[],
  linhaSeguinte: RegExp[]
) {
  const a = valorNaMesmaLinha(texto, mesmaLinha);
  if (a !== "NP") return a;

  const b = valorNaLinhaSeguinte(lista, linhaSeguinte);
  if (b !== "NP") return b;

  return "Não identificado";
}

/* =========================
   👤 PROPRIETÁRIO INTELIGENTE
========================= */

function extrairProprietario(texto: string, lista: string[]) {
  const match = texto.match(/PROPRIET[ÁA]RIO[:\s]+([^\n]+)/i);

  if (match) {
    const valor = limparValor(match[1]);
    if (pareceNome(valor)) return valor;
  }

  for (let i = 0; i < lista.length; i++) {
    if (/PROPRIET[ÁA]RIO/i.test(lista[i])) {
      const prox = limparValor(lista[i + 1] || "");
      if (pareceNome(prox)) return prox;
    }
  }

  return "Não identificado";
}

/* =========================
   🧠 BAIRRO INTELIGENTE
========================= */

function extrairBairroInteligente(lista: string[]) {
  const padroes = [
    /(RESIDENCIAL\s+[A-Z\s]+)/i,
    /(SETOR\s+[A-Z\s]+)/i,
    /(JARDIM\s+[A-Z\s]+)/i,
    /(PARQUE\s+[A-Z\s]+)/i,
  ];

  for (const linha of lista) {
    for (const regex of padroes) {
      const match = linha.match(regex);
      if (match) {
        return limparValor(match[1]);
      }
    }
  }

  return "Não identificado";
}

/* =========================
   🚀 EXTRAÇÃO PRINCIPAL
========================= */

export function extrairDadosBasicos(textoOriginal: string) {
  const texto = normalizarTexto(textoOriginal);
  const lista = linhas(texto);

  const proprietario = extrairProprietario(texto, lista);

  const logradouro = buscarCampo(
    texto,
    lista,
    [
      /(RUA\s+[^\n]+)/i,
      /(AVENIDA\s+[^\n]+)/i,
      /(AV\s+[^\n]+)/i,
      /(ALAMEDA\s+[^\n]+)/i,
      /(TRAVESSA\s+[^\n]+)/i,
    ],
    [
      /^LOGRADOURO$/i,
      /^ENDERE[CÇ]O$/i,
    ]
  );

  const quadra = buscarCampo(
    texto,
    lista,
    [
      /\bQUADRA\b[:\s]+([A-Z0-9\-]+)/i,
      /\bQD\.?\b[:\s]+([A-Z0-9\-]+)/i,
    ],
    [
      /^QUADRA$/i,
      /^QD\.?$/i,
    ]
  );

  const lote = buscarCampo(
    texto,
    lista,
    [
      /\bLOTE\b[:\s]+([A-Z0-9\-]+)/i,
      /\bLT\.?\b[:\s]+([A-Z0-9\-]+)/i,
    ],
    [
      /^LOTE$/i,
      /^LT\.?$/i,
    ]
  );

  let bairro = buscarCampo(
    texto,
    lista,
    [
      /\bBAIRRO\b[:\s]+([^\n]+)/i,
      /\bSETOR\b[:\s]+([^\n]+)/i,
    ],
    [
      /^BAIRRO$/i,
      /^SETOR$/i,
    ]
  );

  if (bairro === "Não identificado") {
    bairro = extrairBairroInteligente(lista);
  }

  const areaTerreno = buscarCampo(
    texto,
    lista,
    [
      /[ÁA]REA DO TERRENO[:\s]+([\d.,]+\s?m²?)/i,
      /[ÁA]REA TERRENO[:\s]+([\d.,]+\s?m²?)/i,
      /TERRENO[:\s]+([\d.,]+\s?m²?)/i,
    ],
    [
      /^[ÁA]REA DO TERRENO$/i,
      /^[ÁA]REA TERRENO$/i,
      /^TERRENO$/i,
    ]
  );

  const pavimentos = buscarCampo(
    texto,
    lista,
    [
      /N[º°O]?\s*DE\s*PAV(?:IMENTOS)?[:\s]+(\d+)/i,
      /PAVIMENTOS?[:\s]+(\d+)/i,
    ],
    [
      /^PAVIMENTOS?$/i,
      /^N[º°O]?\s*DE\s*PAV(?:IMENTOS)?$/i,
    ]
  );

  const unidades = buscarCampo(
    texto,
    lista,
    [
      /N[º°O]?\s*DE\s*UNID(?:ADES)?[:\s]+(\d+)/i,
      /UNIDADES?[:\s]+(\d+)/i,
    ],
    [
      /^UNIDADES?$/i,
      /^N[º°O]?\s*DE\s*UNID(?:ADES)?$/i,
    ]
  );

  return {
    proprietario,
    logradouro,
    quadra,
    lote,
    bairro,
    areaTerreno,
    pavimentos,
    unidades,
  };
}