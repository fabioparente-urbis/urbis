/**
 * Interpretador determinístico dos comandos de navegação do URBI.
 *
 * Regra desta camada: NENHUMA IA, NENHUMA API PAGA. É tabela de sinônimos e
 * expressão regular, mais nada — o que entra é texto normalizado, o que sai é
 * um comando fechado de uma lista finita. Comando que não casa não vira
 * suposição: vira `null`, e quem chamou decide o que fazer.
 *
 * Também é só LEITURA. Não existe comando aqui que crie, edite, atribua,
 * assine ou apague nada — por construção, não pela boa vontade de quem usa.
 *
 * Os valores de filtro saíram da auditoria do banco em 02/09/2026, não de
 * suposição:
 *   tipo_processo  → regularizacao (74), slot_05 (3), aceite_sei (2)
 *   tags[].tipo    → despacho (70), despacho_interno (18), indeferimento (13), laudo (6)
 *   numero_analise → 1, 2, 3, 4 (numérico; o 5 é aceito no comando mas hoje
 *                    não existe processo nenhum com ele)
 *   area_construida→ preenchida em 75 de 79
 * `status` ficou de fora de propósito: tem um único valor no banco inteiro
 * (CADASTRADO), então filtrar por ele não separa nada. No lugar dele, desde
 * 02/09/2026, existe `situacaoGeral` — as 5 classes de lib/bdi/situacao.ts
 * (Em cadastro, LIP pendente, MAC em análise, Aguardando retorno do
 * interessado, Arquivado/indeferido), já calculadas por processo pela API
 * (`/api/processos` devolve `situacao_geral` em cada linha) — aqui só
 * reconhece a frase e filtra pelo valor que já veio pronto, não recalcula
 * nada.
 */

export type OrdemPilha = "area_desc" | "area_asc" | "data_desc" | "data_asc" | "analises_desc" | "analises_asc";
export type FaixaAreaPilha = "ate_250" | "de_251_a_1000" | "acima_1000";
export type FiltroUsoSolo = "com" | "sem";
export type TriagemPilha = "mais_simples";
/** As mesmas 3 classes que `triar()` (lib/bdi/vigia.ts) devolve — repetidas
 *  aqui como literal (em vez de importar o tipo) para este arquivo continuar
 *  sem nenhuma dependência de módulo com regra própria; qualquer mudança nos
 *  literais do vigia precisa ser espelhada aqui à mão. */
export type ClassificacaoVigiaPilha = "mais simples para análise" | "exige atenção" | "maior risco de retrabalho";
export type PortePilha = "PP" | "MP" | "GP";
/** As mesmas 5 classes de `situacaoGeral()` (lib/bdi/situacao.ts) — repetidas
 *  aqui como literal, mesmo motivo do comentário de ClassificacaoVigiaPilha
 *  acima: este arquivo não importa módulo com regra própria. Mudar os
 *  literais de lib/bdi/situacao.ts precisa ser espelhado aqui à mão. */
export type SituacaoGeralPilha =
  | "Em cadastro"
  | "LIP pendente"
  | "MAC em análise"
  | "Aguardando retorno do interessado"
  | "Arquivado/indeferido";

export type FiltrosPilha = {
  busca?: string;
  tipo?: string;
  tag?: string;
  analise?: number;
  ordenar?: OrdemPilha;
  /** Número mínimo de análises já registradas nas tags do processo. */
  analisesMinimas?: number;
  /** Faixa da área informada no LIP; não presume área quando o campo falta. */
  faixaArea?: FaixaAreaPilha;
  /** Presença do documento de Uso do Solo no campo real `dados.usoSolo`. */
  usoSolo?: FiltroUsoSolo;
  /** Atalho transparente, composto por área menor, histórico e ausência de indeferimento. */
  triagem?: TriagemPilha;
  /** Classe calculada pelo vigia (`/api/processos` já roda `triar()` por item da lista). */
  classificacaoVigia?: ClassificacaoVigiaPilha;
  /** Porte real da coluna `processos.porte` (PP/MP/GP). */
  porte?: PortePilha;
  /** Situação real do processo (`/api/processos` já roda `situacaoGeral()` por item — lib/bdi/situacao.ts). */
  situacaoGeral?: SituacaoGeralPilha;
};

export type ComandoNavegacao =
  | { tipo: "navegar"; rota: string; resposta: string }
  | { tipo: "voltar"; resposta: string }
  | { tipo: "buscar"; termo: string; resposta: string }
  | { tipo: "filtrar"; filtros: FiltrosPilha; resposta: string }
  | { tipo: "limpar_filtros"; resposta: string }
  | { tipo: "abrir_resultado"; indice: number; resposta: string };

/** minúsculas, sem acento, sem pontuação de sobra, espaços colapsados. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s.\-\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- navegação

// Rotas que já existem no app. Nada aqui aponta para tela inventada.
const ROTAS: { chaves: string[]; rota: string; resposta: string }[] = [
  { chaves: ["pilha", "processos", "lista de processos"], rota: "/processos", resposta: "Abrindo a pilha de processos." },
  { chaves: ["bdi", "banco de dados e inteligencia"], rota: "/admin/bdi", resposta: "Abrindo o BDI." },
  { chaves: ["bip", "biblioteca de leis", "legislacao", "leis"], rota: "/admin/bdi/leis", resposta: "Abrindo o BIP — Biblioteca de Leis." },
  { chaves: ["mrp da equipe", "produtividade da equipe"], rota: "/admin/mrp", resposta: "Abrindo o MRP da equipe." },
  { chaves: ["mrp", "minha produtividade"], rota: "/mrp", resposta: "Abrindo o MRP — Minha Produtividade." },
  { chaves: ["mdp", "despachos e pareceres"], rota: "/mdp", resposta: "Abrindo o MDP — Despachos e Pareceres." },
  { chaves: ["rastreabilidade"], rota: "/admin/rastreabilidade", resposta: "Abrindo a Rastreabilidade." },
  { chaves: ["usuarios", "gestao de usuarios"], rota: "/admin/usuarios", resposta: "Abrindo a gestão de usuários." },
  { chaves: ["home", "inicio", "pagina inicial", "tela inicial", "principal"], rota: "/", resposta: "Voltando para a página inicial." },
];

// ------------------------------------------------------------------ filtros

const TIPOS: { chaves: string[]; valor: string; rotulo: string }[] = [
  { chaves: ["regularizacao"], valor: "regularizacao", rotulo: "Regularização" },
  { chaves: ["aceite sei", "aceite"], valor: "aceite_sei", rotulo: "Aceite SEI" },
  { chaves: ["aprovacao de projeto", "aprovacao", "slot 5", "slot cinco", "slot 05"], valor: "slot_05", rotulo: "Aprovação de Projeto" },
];

const TAGS: { chaves: string[]; valor: string; rotulo: string }[] = [
  // "despacho interno" antes de "despacho": o mais específico tem que ganhar.
  { chaves: ["despacho interno"], valor: "despacho_interno", rotulo: "despacho interno" },
  { chaves: ["indeferido", "indeferimento", "indeferidos"], valor: "indeferimento", rotulo: "indeferimento" },
  { chaves: ["laudo", "laudos"], valor: "laudo", rotulo: "laudo" },
  { chaves: ["despacho", "despachos"], valor: "despacho", rotulo: "despacho" },
];

// As duas formas: "segunda análise" é feminino, "abrir o segundo" é masculino.
const ORDINAIS: Record<string, number> = {
  primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5,
  primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, quinto: 5,
  um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5,
};

function acharTipo(t: string) {
  for (const x of TIPOS) for (const c of x.chaves) if (t.includes(c)) return x;
  return null;
}
function acharTag(t: string) {
  for (const x of TAGS) for (const c of x.chaves) if (t.includes(c)) return x;
  return null;
}

/** "analise 2", "analise numero 2", "segunda analise" → 2 */
function acharAnalise(t: string): number | null {
  const numerico = t.match(/analise\s*(?:numero\s*)?([1-5])\b/);
  if (numerico) return Number(numerico[1]);
  const porExtenso = t.match(/\b(primeira|segunda|terceira|quarta|quinta)\s+analise\b/);
  if (porExtenso) return ORDINAIS[porExtenso[1]] ?? null;
  const analiseExtenso = t.match(/analise\s+(um|dois|tres|quatro|cinco)\b/);
  if (analiseExtenso) return ORDINAIS[analiseExtenso[1]] ?? null;
  return null;
}

/** "Duas ou mais análises" e "a partir da segunda análise" contêm, por acidente, o mesmo texto
 *  que aciona a ordenação "mais análises primeiro" ("... ou MAIS análiseS") — extraído numa
 *  função só, usada tanto aqui (pra excluir o falso positivo) quanto no cálculo de
 *  `analisesMinimas` abaixo, pra nunca divergir das duas regras. */
function pedeAnalisesMinimas(t: string): boolean {
  return /\b(duas|2|dois)\s+ou\s+mais\s+analises\b/.test(t) || /\ba\s+partir\s+da\s+segunda\s+analise\b/.test(t);
}

function acharOrdem(t: string): OrdemPilha | null {
  if (!pedeAnalisesMinimas(t) && (/\b(mais|maior)\s+(analise|analises)\b/.test(t) || /\b(mais|maior)\s+numero\s+de\s+analises\b/.test(t))) return "analises_desc";
  if (/\b(menos|menor)\s+(analise|analises)\b/.test(t) || /\b(menos|menor)\s+numero\s+de\s+analises\b/.test(t)) return "analises_asc";
  if (/\b(maior|maiores)\s+(area|areas)\b/.test(t) || /\barea\s+(maior|decrescente)\b/.test(t)) return "area_desc";
  if (/\b(menor|menores)\s+(area|areas)\b/.test(t) || /\barea\s+(menor|crescente)\b/.test(t)) return "area_asc";
  if (/\bmais\s+(novo|novos|recente|recentes)\b/.test(t)) return "data_desc";
  if (/\bmais\s+(antigo|antigos|velho|velhos)\b/.test(t)) return "data_asc";
  return null;
}

/**
 * As 5 situações reais (lib/bdi/situacao.ts), não confundir com `acharTag`
 * (que reconhece TAG do processo — despacho/indeferimento/etc. — um fato
 * isolado, não a situação atual). Frases mais específicas primeiro: "em
 * analise" bare é comum demais pra vir antes de "aguardando retorno", que
 * tem prioridade lógica (passada já fechou, não é mais "em análise").
 * "Arquivado/indeferido" exige frase de situação (não só "indeferido" solto)
 * de propósito — isso já significa outra coisa aqui (`acharTag`), e trocar
 * o sentido de um comando que já funciona não é o objetivo deste recorte.
 * "Arquivado" sozinho é diferente: não existe TAG "arquivado" (só
 * "indeferimento"), então não há sentido concorrente pra proteger — casa
 * direto, sem precisar de frase de situação.
 */
function acharSituacaoGeral(t: string): SituacaoGeralPilha | null {
  if (/\baguardando\s+(o\s+)?retorno(\s+do\s+interessado)?\b/.test(t)) return "Aguardando retorno do interessado";
  if (/\b(situacao\s+)?arquivad[oa]s?\s+(ou|e)\s+indeferid[oa]s?\b/.test(t)
    || /\bindeferid[oa]s?\s+(ou|e)\s+arquivad[oa]s?\b/.test(t)
    || /\bsituacao\s+(de\s+)?(arquivad|indeferid)/.test(t)
    || /\barquivad[oa]s?\b/.test(t)) return "Arquivado/indeferido";
  if (/\blip\s+pendente\b/.test(t) || /\blip\s+incompleto\b/.test(t)) return "LIP pendente";
  if (/\bmac\s+em\s+analise\b/.test(t) || /\bem\s+analise\b/.test(t)) return "MAC em análise";
  if (/\bem\s+cadastro\b/.test(t) || /\brecem[\s-]?cadastrad[oa]s?\b/.test(t)) return "Em cadastro";
  return null;
}

/** Número de processo: SEI (24.5.000016462-6) ou sequência longa de dígitos. */
function acharNumeroProcesso(t: string): string | null {
  const sei = t.match(/\b\d{2}\.\d\.\d{6,}-?\d?\b/);
  if (sei) return sei[0];
  const soltos = t.match(/\b\d{6,}\b/);
  if (soltos) return soltos[0];
  return null;
}

const VERBOS_BUSCA = [
  "localizar", "localiza", "localize",
  "procurar", "procura", "procure",
  "buscar", "busca", "busque",
  "achar", "acha", "ache",
  "encontrar", "encontra", "encontre",
  "cade", "onde esta", "onde ta",
];

const RUIDO_BUSCA = [
  "o processo", "a processo", "processo", "processos",
  "do", "da", "de", "o", "a", "os", "as", "para", "pra", "pro", "me", "no", "na",
  "chamado", "chamada", "com o nome", "nome",
];

/** Tira o verbo e as palavras de ligação, sobra o termo procurado. */
function extrairTermoBusca(t: string): string | null {
  let resto: string | null = null;
  for (const v of VERBOS_BUSCA) {
    const i = t.indexOf(v);
    if (i >= 0) { resto = t.slice(i + v.length); break; }
  }
  if (resto === null) return null;
  let termo = resto.trim();
  // Remove palavras de ligação só do começo — no meio elas podem ser do nome
  // ("Maria de Souza"), e cortar ali destruiria a busca.
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const r of RUIDO_BUSCA) {
      if (termo === r) { termo = ""; mudou = true; break; }
      if (termo.startsWith(r + " ")) { termo = termo.slice(r.length + 1); mudou = true; break; }
    }
  }
  termo = termo.trim();
  return termo.length >= 2 ? termo : null;
}

/**
 * "Quais estão na 3ª análise?" e "quais foram indeferidos em 2026?" são PERGUNTAS respondidas
 * por lib/urbi/perguntasPilha.ts no backend (sem Gemini, com fonte declarada) — não comandos de
 * filtro. Sem este desvio, "análise" e "indeferi" batiam nos matchers abaixo (virando um filtro
 * silencioso da tela) ou no `pareceComando` (virando "não entendi" antes de chegar no servidor).
 * Só dispara quando o texto tem cara de pergunta (começa com quais/qual/quantos/quantas, ou
 * termina em "?") — comando puro como "análise 3" ou "indeferido" continua filtrando a tela.
 */
function ehPerguntaDaPilha(t: string): boolean {
  const perguntou = /^(quais|qual|quantos|quantas)\b/.test(t) || t.endsWith("?");
  if (!perguntou) return false;
  const analiseOrdinal = /\banalise\b/.test(t) && (/\b(primeira|segunda|terceira|quarta|quinta|sexta|setima|oitava)\b/.test(t) || /\d/.test(t));
  const indeferidoComAno = /indeferid/.test(t) && (/\bano\b/.test(t) || /\b(19|20)\d{2}\b/.test(t));
  return analiseOrdinal || indeferidoComAno;
}

/**
 * Interpreta o texto. Devolve `null` quando não reconhece — nunca chuta.
 * A ordem importa: o mais específico é testado antes do mais genérico.
 */
export function interpretar(textoOriginal: string): ComandoNavegacao | null {
  const t = normalizar(textoOriginal);
  if (!t) return null;
  if (ehPerguntaDaPilha(t)) return null;

  // 1. Voltar
  if (/^(volta|voltar|volte|pagina anterior|tela anterior)\b/.test(t)) {
    return { tipo: "voltar", resposta: "Voltando." };
  }

  // 2. Limpar filtros
  if (/\b(limpar|limpa|tirar|tira|remover|remove)\s+(os\s+)?(filtros|filtro)\b/.test(t) || t === "limpar filtros") {
    return { tipo: "limpar_filtros", resposta: "Filtros limpos." };
  }

  // 3. Abrir um resultado da última busca
  const abrirRes = t.match(/\babrir?\s+(?:o\s+)?(primeiro|segundo|terceiro|quarto|quinto)\b/);
  if (abrirRes) {
    const idx = ORDINAIS[abrirRes[1]];
    return { tipo: "abrir_resultado", indice: idx - 1, resposta: `Abrindo o ${abrirRes[1]} resultado.` };
  }
  const abrirNum = t.match(/\babrir?\s+(?:o\s+)?resultado\s+([1-9])\b/);
  if (abrirNum) {
    const idx = Number(abrirNum[1]);
    return { tipo: "abrir_resultado", indice: idx - 1, resposta: `Abrindo o resultado ${idx}.` };
  }

  // 4. Número de processo — o mais determinístico de todos, vem antes da busca
  //    por nome para "abrir processo 24.5.000016462-6" não virar busca textual.
  const numero = acharNumeroProcesso(t);
  if (numero && /\b(processo|sei|numero|localizar|abrir|procurar|buscar|achar)\b/.test(t)) {
    return { tipo: "buscar", termo: numero, resposta: `Procurando o processo ${numero}.` };
  }

  // 5. Filtros e ordenação da pilha
  const tipo = acharTipo(t);
  const tag = acharTag(t);
  const analise = acharAnalise(t);
  const ordem = acharOrdem(t);
  // "mais simples"/variantes aponta para a classificação real do Vigia (mesma fonte do
  // dropdown "Mais simples para análise" da tela) — não mais para o atalho fixo de área+
  // histórico, que segue existindo só via o outro dropdown ("Mais simples para começar").
  const classificacaoVigia = /\b(mais\s+faceis|mais\s+fáceis|mais\s+simples|simples\s+para\s+analise|simples\s+para\s+análise)\b/.test(t)
    ? "mais simples para análise" as const
    : undefined;
  const usoSolo = /\bsem\s+uso\s+do\s+solo\b/.test(t)
    ? "sem" as const
    : /\bcom\s+uso\s+do\s+solo\b/.test(t) ? "com" as const : undefined;
  const faixaArea = /\b(ate|até)\s+250\b/.test(t)
    ? "ate_250" as const
    : /\bacima\s+(de\s+)?1000\b/.test(t) || /\bmais\s+de\s+1000\b/.test(t)
      ? "acima_1000" as const
      : /\b(entre\s+)?251\s+(e|a)\s+1000\b/.test(t) ? "de_251_a_1000" as const : undefined;
  const analisesMinimas = pedeAnalisesMinimas(t) ? 2 : undefined;
  const situacaoGeral = acharSituacaoGeral(t);
  const mencionaPilha = /\b(pilha|processos|lista)\b/.test(t);

  if (tag || analise !== null || ordem || classificacaoVigia || usoSolo || faixaArea || analisesMinimas || situacaoGeral || (tipo && mencionaPilha)) {
    const filtros: FiltrosPilha = {};
    if (tipo) filtros.tipo = tipo.valor;
    if (tag) filtros.tag = tag.valor;
    if (analise !== null) filtros.analise = analise;
    if (ordem) filtros.ordenar = ordem;
    if (classificacaoVigia) filtros.classificacaoVigia = classificacaoVigia;
    if (usoSolo) filtros.usoSolo = usoSolo;
    if (faixaArea) filtros.faixaArea = faixaArea;
    if (analisesMinimas) filtros.analisesMinimas = analisesMinimas;
    if (situacaoGeral) filtros.situacaoGeral = situacaoGeral;

    const partes: string[] = [];
    if (tipo) partes.push(tipo.rotulo);
    if (tag) partes.push(`com ${tag.rotulo}`);
    if (analise !== null) partes.push(`na análise ${analise}`);
    if (classificacaoVigia) partes.push("mais simples para análise (classificação do Vigia)");
    if (usoSolo) partes.push(usoSolo === "com" ? "com Uso do Solo" : "sem Uso do Solo");
    if (faixaArea) partes.push(faixaArea === "ate_250" ? "até 250 m²" : faixaArea === "de_251_a_1000" ? "de 251 a 1.000 m²" : "acima de 1.000 m²");
    if (analisesMinimas) partes.push("com 2 ou mais análises");
    if (situacaoGeral) partes.push(`com situação "${situacaoGeral}"`);
    if (ordem) {
      partes.push(
        ordem === "area_desc" ? "da maior para a menor área"
        : ordem === "area_asc" ? "da menor para a maior área"
        : ordem === "data_desc" ? "do mais novo para o mais antigo"
        : ordem === "data_asc" ? "do mais antigo para o mais novo"
        : ordem === "analises_desc" ? "com mais análises primeiro"
        : "com menos análises primeiro",
      );
    }
    return {
      tipo: "filtrar",
      filtros,
      resposta: partes.length ? `Filtrando a pilha: ${partes.join(", ")}.` : "Filtrando a pilha.",
    };
  }

  // 6. Busca por nome/termo livre
  const termo = extrairTermoBusca(t);
  if (termo) {
    return { tipo: "buscar", termo, resposta: `Procurando por "${termo}".` };
  }

  // 7. Navegação simples — por último, porque "processos" aparece dentro de
  //    comandos bem mais específicos tratados acima.
  for (const r of ROTAS) {
    for (const chave of r.chaves) {
      if (t === chave || t.includes(chave)) {
        return { tipo: "navegar", rota: r.rota, resposta: r.resposta };
      }
    }
  }

  return null;
}

/**
 * O texto parece uma tentativa de comando de navegação que o interpretador
 * não conseguiu fechar?
 *
 * Serve para uma coisa só: não deixar tentativa de comando virar chamada paga.
 * Quando `interpretar` devolve null, o URBI cairia no chat com IA (Gemini, que
 * custa). Se o texto tem cara de comando — fala em pilha, filtro, área,
 * análise, laudo —, é melhor responder de graça dizendo o que ele entende do
 * que gastar crédito para descobrir que era um comando escrito torto.
 */
export function pareceComando(textoOriginal: string): boolean {
  const t = normalizar(textoOriginal);
  if (!t) return false;
  if (ehPerguntaDaPilha(t)) return false;
  // "processo"/"processos" SAÍRAM daqui em 05/09/2026 (piloto humano controlado, Etapa 2):
  // achado real — qualquer pergunta livre sobre "este processo" (o uso mais básico do modo
  // Co-Analista, ex.: "resuma este processo com base no dossiê") continha a palavra e batia
  // aqui, nunca chegando no chat de IA. O comando de navegação de verdade ("abrir processo
  // 12345") já é resolvido ANTES desta função, por `interpretar()` acima — que exige número +
  // verbo de comando (linha ~260) — então tirar a palavra daqui não tira nada da navegação real,
  // só para de confundir pergunta com comando mal digitado.
  const pistas = [
    "pilha", "filtrar", "filtro", "ordenar", "ordem",
    "analise", "laudo", "indeferi", "despacho", "area", "abrir", "localizar",
    "procurar", "buscar", "achar", "encontrar", "limpar", "voltar", "navegar",
    "mais novo", "mais antigo", "maior", "menor",
  ];
  return pistas.some((p) => t.includes(p));
}

/** O que o URBI sabe fazer, em uma frase — resposta gratuita para comando não entendido. */
export const AJUDA_COMANDOS =
  "Não entendi esse comando. Eu sei: abrir Home, Pilha, BDI, BIP, MRP e MDP; voltar; " +
  "localizar processo por número ou por nome; filtrar a pilha por tipo, laudo, indeferimento, " +
  "despacho, Uso do Solo e análise 1 a 5; filtrar por situação (em cadastro, LIP pendente, " +
  "MAC em análise, aguardando retorno do interessado, arquivado ou indeferido); " +
  "mostrar os mais simples por critérios; ordenar por área, análises ou data; " +
  "abrir um resultado; e limpar filtros.";

// ------------------------------------------------- aplicação dos filtros

type ProcessoParaFiltro = {
  tipo_processo?: string | null;
  area_construida?: number | string | null;
  criado_em?: string | null;
  atualizado_em?: string | null;
  tags?: unknown;
  dados?: Record<string, any> | null;
  /** Classe calculada pelo vigia (`triar()`), quando a API já devolveu. */
  triagem?: string | null;
  /** Coluna direta `processos.porte`. */
  porte?: string | null;
  /** Situação real calculada por `situacaoGeral()`, quando a API já devolveu. */
  situacao_geral?: string | null;
};

function numeroArea(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const texto = v.trim();
  if (!texto) return null;
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** A área pode chegar da coluna histórica ou do campo real do LIP. */
function areaDoProcesso(p: ProcessoParaFiltro): number | null {
  return numeroArea(p.area_construida ?? p.dados?.areaTotal?.valor ?? p.dados?.areaConstruida?.valor ?? null);
}

function numeroAnalises(tags: unknown): number {
  if (!Array.isArray(tags)) return 0;
  return tags.reduce((maior, tag: any) => {
    const n = Number(tag?.numero_analise);
    return Number.isFinite(n) && n > maior ? n : maior;
  }, 0);
}

function temTag(tags: unknown, tipo: string): boolean {
  return Array.isArray(tags) && tags.some((tag: any) => tag && typeof tag === "object" && tag.tipo === tipo);
}

function temUsoSolo(p: ProcessoParaFiltro): boolean {
  const valor = p.dados?.usoSolo?.valor;
  if (typeof valor !== "string") return false;
  const limpo = valor.trim().toUpperCase();
  return Boolean(limpo && limpo !== "X" && limpo !== "NP");
}

/**
 * Aplica tag/análise/ordenação sobre a lista que a API já devolveu.
 *
 * Por que no cliente: /api/processos não tem esses filtros, e é ELA que aplica
 * a regra de permissão (analista só vê o que é dele). Filtrar aqui, sobre o
 * que a rota já autorizou, não amplia o que a pessoa enxerga — só recorta.
 * Mudar a rota para filtrar por tag exigiria mexer no ponto onde a permissão
 * mora, e não vale o risco para um ganho de apresentação.
 */
export function aplicarFiltrosLocais<T extends ProcessoParaFiltro>(
  lista: T[],
  filtros: FiltrosPilha,
): T[] {
  let saida = [...lista];

  if (filtros.triagem === "mais_simples") {
    // Atalho deliberadamente conservador: não dá nota nem previsão. Só traz
    // processos menores, já revisados ao menos uma vez e sem indeferimento.
    saida = saida.filter((p) => {
      const area = areaDoProcesso(p);
      return area !== null && area <= 250 && numeroAnalises(p.tags) >= 2 && !temTag(p.tags, "indeferimento");
    });
  }

  if (filtros.analisesMinimas !== undefined) {
    saida = saida.filter((p) => numeroAnalises(p.tags) >= filtros.analisesMinimas!);
  }

  if (filtros.faixaArea) {
    saida = saida.filter((p) => {
      const area = areaDoProcesso(p);
      if (area === null) return false;
      if (filtros.faixaArea === "ate_250") return area <= 250;
      if (filtros.faixaArea === "de_251_a_1000") return area > 250 && area <= 1000;
      return area > 1000;
    });
  }

  if (filtros.usoSolo) {
    saida = saida.filter((p) => filtros.usoSolo === "com" ? temUsoSolo(p) : !temUsoSolo(p));
  }

  if (filtros.classificacaoVigia) {
    saida = saida.filter((p) => p.triagem === filtros.classificacaoVigia);
  }

  if (filtros.situacaoGeral) {
    saida = saida.filter((p) => p.situacao_geral === filtros.situacaoGeral);
  }

  if (filtros.porte) {
    saida = saida.filter((p) => p.porte === filtros.porte);
  }

  if (filtros.tag || filtros.analise !== undefined) {
    saida = saida.filter((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.some((t: any) => {
        // Há tags gravadas como texto puro (processo de teste antigo) — elas
        // não têm tipo nem análise, então nunca casam num filtro estruturado.
        if (!t || typeof t !== "object") return false;
        if (filtros.tag && t.tipo !== filtros.tag) return false;
        if (filtros.analise !== undefined && Number(t.numero_analise) !== filtros.analise) return false;
        return true;
      });
    });
  }

  if (filtros.ordenar) {
    const data = (p: ProcessoParaFiltro) =>
      new Date(p.criado_em ?? p.atualizado_em ?? 0).getTime() || 0;

    saida.sort((a, b) => {
      switch (filtros.ordenar) {
        case "area_desc":
        case "area_asc": {
          const va = areaDoProcesso(a);
          const vb = areaDoProcesso(b);
          // Processo sem área vai para o fim nos dois sentidos: some do topo
          // em vez de fingir que tem área zero.
          if (va === null && vb === null) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          return filtros.ordenar === "area_desc" ? vb - va : va - vb;
        }
        case "data_desc": return data(b) - data(a);
        case "data_asc": return data(a) - data(b);
        case "analises_desc": return numeroAnalises(b.tags) - numeroAnalises(a.tags);
        case "analises_asc": return numeroAnalises(a.tags) - numeroAnalises(b.tags);
        default: return 0;
      }
    });
  }

  return saida;
}

/** Monta a query string da Pilha a partir dos filtros. */
export function filtrosParaQuery(filtros: FiltrosPilha): string {
  const p = new URLSearchParams();
  if (filtros.busca) p.set("busca", filtros.busca);
  if (filtros.tipo) p.set("tipo", filtros.tipo);
  if (filtros.tag) p.set("tag", filtros.tag);
  if (filtros.analise !== undefined) p.set("analise", String(filtros.analise));
  if (filtros.ordenar) p.set("ordenar", filtros.ordenar);
  if (filtros.analisesMinimas !== undefined) p.set("analisesMinimas", String(filtros.analisesMinimas));
  if (filtros.faixaArea) p.set("faixaArea", filtros.faixaArea);
  if (filtros.usoSolo) p.set("usoSolo", filtros.usoSolo);
  if (filtros.triagem) p.set("triagem", filtros.triagem);
  if (filtros.classificacaoVigia) p.set("classificacaoVigia", filtros.classificacaoVigia);
  if (filtros.porte) p.set("porte", filtros.porte);
  if (filtros.situacaoGeral) p.set("situacaoGeral", filtros.situacaoGeral);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Lê os filtros de volta de uma query string (o caminho inverso). */
export function queryParaFiltros(params: URLSearchParams): FiltrosPilha {
  const f: FiltrosPilha = {};
  const busca = params.get("busca");
  const tipo = params.get("tipo");
  const tag = params.get("tag");
  const analise = params.get("analise");
  const ordenar = params.get("ordenar");
  const analisesMinimas = params.get("analisesMinimas");
  const faixaArea = params.get("faixaArea");
  const usoSolo = params.get("usoSolo");
  const triagem = params.get("triagem");
  const classificacaoVigia = params.get("classificacaoVigia");
  const porte = params.get("porte");
  const situacaoGeral = params.get("situacaoGeral");

  if (busca) f.busca = busca;
  if (tipo && TIPOS.some(x => x.valor === tipo)) f.tipo = tipo;
  if (tag && TAGS.some(x => x.valor === tag)) f.tag = tag;
  if (analise && /^[1-5]$/.test(analise)) f.analise = Number(analise);
  if (ordenar && ["area_desc", "area_asc", "data_desc", "data_asc", "analises_desc", "analises_asc"].includes(ordenar)) {
    f.ordenar = ordenar as OrdemPilha;
  }
  if (analisesMinimas === "2") f.analisesMinimas = 2;
  if (faixaArea && ["ate_250", "de_251_a_1000", "acima_1000"].includes(faixaArea)) f.faixaArea = faixaArea as FaixaAreaPilha;
  if (usoSolo === "com" || usoSolo === "sem") f.usoSolo = usoSolo;
  if (triagem === "mais_simples") f.triagem = triagem;
  if (
    classificacaoVigia === "mais simples para análise" ||
    classificacaoVigia === "exige atenção" ||
    classificacaoVigia === "maior risco de retrabalho"
  ) {
    f.classificacaoVigia = classificacaoVigia;
  }
  if (porte === "PP" || porte === "MP" || porte === "GP") f.porte = porte;
  if (
    situacaoGeral === "Em cadastro" ||
    situacaoGeral === "LIP pendente" ||
    situacaoGeral === "MAC em análise" ||
    situacaoGeral === "Aguardando retorno do interessado" ||
    situacaoGeral === "Arquivado/indeferido"
  ) {
    f.situacaoGeral = situacaoGeral;
  }
  return f;
}
