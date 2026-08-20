/**
 * Confronto entre o endereço do LIP e o do Cadastro Imobiliário (Mapa Fácil).
 *
 * Regra do analista: achado o imóvel no Mapa Fácil pelo IPTU, o logradouro, a
 * quadra, o lote e o bairro TÊM de bater com os do Uso do Solo. Não batendo, ou
 * o IPTU está errado, ou o processo está descrevendo outro imóvel — os dois
 * casos precisam parar na frente do analista, não seguir calados.
 *
 * O confronto não pode ser literal. Os dois lados escrevem a mesma coisa de
 * jeitos diferentes, e isso é do formato, não do imóvel:
 *
 *   LIP "PERIMETRAL NORTE"  ×  Mapa Fácil "AV PERIMETRAL NORTE"   (tipo da via)
 *   LIP "QUADRA AREA"       ×  Mapa Fácil "AREA"                  (rótulo junto)
 *   LIP "LOTE 01/03"        ×  Mapa Fácil "01"                    (rótulo + vários lotes)
 *
 * Tudo puro, sem I/O: dá para conferir a regra sem rede nem banco.
 */

export type Situacao = "bate" | "diverge" | "sem_dado";

export type Confronto = {
  campo: string;
  rotulo: string;
  lip: string | null;
  mapa: string | null;
  situacao: Situacao;
};

/** Sem acento, maiúsculo, espaços colapsados, pontuação de abreviatura fora. */
function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tipos de logradouro. Some dos dois lados antes de comparar: o cadastro
 * escreve "AV PERIMETRAL NORTE", a prancha costuma escrever só "PERIMETRAL
 * NORTE", e o nome da via é o mesmo.
 */
const TIPOS_VIA = [
  "AVENIDA", "AV", "RUA", "R", "PRACA", "PC", "ALAMEDA", "AL", "TRAVESSA", "TV",
  "RODOVIA", "ROD", "ESTRADA", "EST", "MARGINAL", "VIELA", "LARGO", "VIA",
];

function semTipoVia(v: string): string {
  const t = normalizar(v);
  for (const tipo of TIPOS_VIA) {
    if (t.startsWith(tipo + " ")) return t.slice(tipo.length + 1).trim();
  }
  return t;
}

/** Tira o rótulo que o LIP grava junto do valor ("QUADRA AREA" → "AREA"). */
function semRotulo(v: string, rotulos: string[]): string {
  let t = normalizar(v);
  for (const r of rotulos) {
    if (t.startsWith(r + " ")) { t = t.slice(r.length + 1).trim(); break; }
    if (t.startsWith(r + "-")) { t = t.slice(r.length + 1).trim(); break; }
  }
  return t;
}

/** "01" e "1" são o mesmo lote; "AREA" e "ÁREA" a mesma quadra. */
function semZeroAEsquerda(v: string): string {
  return /^\d+$/.test(v) ? String(Number(v)) : v;
}

/**
 * Um processo pode abranger vários lotes ("01/03", "1 A 3", "01-02"). Devolve
 * todos os designativos citados, para que bastar o cadastro casar com UM deles.
 * Intervalo com "A"/"-" entre números é expandido; o resto é lista.
 */
function designativos(v: string, rotulos: string[]): string[] {
  const base = semRotulo(v, rotulos);
  if (!base) return [];
  const partes = base.split(/[\/,;]| E |\+/).map((p) => p.trim()).filter(Boolean);
  const saida = new Set<string>();
  for (const p of partes) {
    const faixa = p.match(/^(\d+)\s*(?:A|-|ATE)\s*(\d+)$/);
    if (faixa) {
      const ini = Number(faixa[1]), fim = Number(faixa[2]);
      if (Number.isFinite(ini) && Number.isFinite(fim) && fim >= ini && fim - ini <= 200) {
        for (let n = ini; n <= fim; n++) saida.add(String(n));
        continue;
      }
    }
    saida.add(semZeroAEsquerda(p));
  }
  return [...saida];
}

function situacaoDe(lipBruto: string | null, mapaBruto: string | null, casa: () => boolean): Situacao {
  if (!normalizar(lipBruto) || !normalizar(mapaBruto)) return "sem_dado";
  return casa() ? "bate" : "diverge";
}

export type EnderecoLip = {
  logradouro?: string | null;
  quadra?: string | null;
  lote?: string | null;
  bairro?: string | null;
};

export type EnderecoMapa = {
  logradouro?: string | null;
  quadra?: string | null;
  lote?: string | null;
  bairro?: string | null;
};

/**
 * Confronta campo a campo. `sem_dado` quando um dos lados está vazio — ausência
 * não é divergência, e marcar como tal só ensinaria o analista a ignorar avisos.
 */
export function confrontarEndereco(lip: EnderecoLip, mapa: EnderecoMapa): Confronto[] {
  const ROT_QUADRA = ["QUADRA", "QD", "Q"];
  const ROT_LOTE = ["LOTE", "LT", "L"];

  const viaLip = semTipoVia(semRotulo(lip.logradouro ?? "", ["LOGRADOURO"]));
  const viaMapa = semTipoVia(mapa.logradouro ?? "");

  const quadraLip = designativos(lip.quadra ?? "", ROT_QUADRA);
  const quadraMapa = designativos(mapa.quadra ?? "", ROT_QUADRA);

  const loteLip = designativos(lip.lote ?? "", ROT_LOTE);
  const loteMapa = designativos(mapa.lote ?? "", ROT_LOTE);

  const bairroLip = semRotulo(lip.bairro ?? "", ["BAIRRO", "SETOR", "ST"]);
  const bairroMapa = semRotulo(mapa.bairro ?? "", ["BAIRRO", "SETOR", "ST"]);

  /* Basta o cadastro casar com UM dos designativos do processo: o Mapa Fácil
   * responde por um lote, o processo pode abranger vários. */
  const cruza = (a: string[], b: string[]) => a.some((x) => b.includes(x));

  return [
    {
      campo: "logradouro", rotulo: "Logradouro",
      lip: lip.logradouro ?? null, mapa: mapa.logradouro ?? null,
      situacao: situacaoDe(lip.logradouro ?? null, mapa.logradouro ?? null, () => viaLip === viaMapa),
    },
    {
      campo: "quadra", rotulo: "Quadra",
      lip: lip.quadra ?? null, mapa: mapa.quadra ?? null,
      situacao: situacaoDe(lip.quadra ?? null, mapa.quadra ?? null, () => cruza(quadraLip, quadraMapa)),
    },
    {
      campo: "lote", rotulo: "Lote",
      lip: lip.lote ?? null, mapa: mapa.lote ?? null,
      situacao: situacaoDe(lip.lote ?? null, mapa.lote ?? null, () => cruza(loteLip, loteMapa)),
    },
    {
      campo: "bairro", rotulo: "Bairro",
      lip: lip.bairro ?? null, mapa: mapa.bairro ?? null,
      situacao: situacaoDe(lip.bairro ?? null, mapa.bairro ?? null, () => bairroLip === bairroMapa),
    },
  ];
}

/** Resumo para a tela decidir se preenche direto ou para e avisa. */
export function resumoConfronto(itens: Confronto[]): {
  divergentes: Confronto[];
  semDado: Confronto[];
  conferem: Confronto[];
  tudoBate: boolean;
} {
  const divergentes = itens.filter((i) => i.situacao === "diverge");
  const semDado = itens.filter((i) => i.situacao === "sem_dado");
  const conferem = itens.filter((i) => i.situacao === "bate");
  return { divergentes, semDado, conferem, tudoBate: divergentes.length === 0 };
}
