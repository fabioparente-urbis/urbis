/**
 * lib/urbi/validarComparacoes.ts — Fase AH (04/09/2026): guarda ESTRUTURAL pós-resposta contra
 * afirmação comparativa sem lastro determinístico.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────────
 * Cinco rodadas de correção de PROMPT (Fases AC→AG) tentaram impedir o Gemini de comparar dois
 * valores por conta própria. Ele voltou a fazer, de formas novas a cada rodada:
 *   - "Área Regularizada TOTAL difere da ART/Laudo" (divergência inventada entre 2 campos);
 *   - "vale a pena conferir a razão da diferença" (a frase seguinte, ancorada na anterior);
 *   - "conforme Quadro e Certidão/Vistoria" (confirmação implícita entre 2 documentos).
 * Instrução de prompt não é garantia. Esta camada roda DEPOIS da resposta, em código, e não
 * depende de o modelo ter obedecido.
 *
 * ── O QUE ELA FAZ ────────────────────────────────────────────────────────────────
 * Varre a resposta frase a frase. Uma frase que RELACIONA dois valores/campos numéricos por um
 * marcador comparativo ("difere", "maior", "conforme", "bate com"...) só sobrevive se existir um
 * cruzamento determinístico COMPATÍVEL no dossiê (`cruzamentos`, calculado por código e validado
 * pelo catálogo semântico). Sem lastro, a relação comparativa é removida — o fato isolado
 * sobrevive quando dá pra separar (caso da cláusula "conforme <documentos>"), senão a frase vira
 * "Não há regra semântica para comparar estes campos."
 *
 * ── O QUE ELA NÃO FAZ ────────────────────────────────────────────────────────────
 * Não cria regra de equivalência entre campos (essa decisão é humana — ver
 * lib/urbi/catalogoSemantico.ts, que hoje NÃO declara nenhuma regra pra estes pares). Não julga
 * se a comparação seria verdadeira; só se ela tem lastro. Não mexe no vocabulário legítimo de
 * conformidade do MAC ("item conforme"/"não conforme"), que é outro conceito.
 *
 * Biblioteca pura: sem rede, sem banco, sem IA.
 */

export type ContextoComparacao = {
  /** Rótulos humanos dos campos do LIP presentes no recorte enviado ao modelo. */
  rotulos: string[];
  /** Cruzamentos determinísticos do dossiê — o ÚNICO lastro que autoriza uma comparação. */
  cruzamentos: { rotulo: string; resultado: string }[];
};

export type BloqueioComparacao = {
  /** Trecho exato que foi removido/substituído — pra auditoria, nunca volta pro analista. */
  trecho: string;
  motivo: "dois_campos_sem_cruzamento" | "valores_sem_cruzamento" | "confirmacao_entre_documentos";
};

export const FRASE_SEM_REGRA = "Não há regra semântica para comparar estes campos.";

// ─────────────────────────────────────────────────────────────────── normalização

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "e", "ou", "a", "o", "as", "os",
  "um", "uma", "para", "por", "com", "se", "ser", "que", "ao", "aos", "m2", "m", "n", "nº", "no",
]);

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Tokens que identificam um rótulo — sem stopword, sem acento, mínimo 2 caracteres. */
function tokensDoRotulo(rotulo: string): string[] {
  return [...new Set(
    normalizar(rotulo).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  )];
}

function contemPalavra(fraseNormalizada: string, palavra: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`).test(fraseNormalizada);
}

// ─────────────────────────────────────────────────────────────────── marcadores

/** Relação de DIVERGÊNCIA entre dois valores — sempre exige lastro. */
const MARCADORES_DIVERGENCIA = [
  "difere", "diferem", "diferenca", "diferencas", "diferente", "diferentes",
  "divergencia", "divergencias", "diverge", "divergem", "divergente", "divergentes",
  "discrepancia", "discrepancias", "inconsistencia", "incoerencia", "incoerentes",
  "maior que", "maior do que", "menor que", "menor do que", "superior a", "inferior a",
  "acima de", "abaixo de", "nao bate", "nao confere", "nao coincide", "nao corresponde",
];

/** Relação de CONFIRMAÇÃO entre dois valores/fontes — também exige lastro (confirmar é comparar). */
const MARCADORES_CONFIRMACAO = [
  "conforme", "confirmado", "confirmada", "confirma", "confirmam", "confirmando",
  "bate com", "batem com", "confere com", "conferem com", "coincide", "coincidem",
  "corresponde", "correspondem", "de acordo com", "igual a", "iguais", "mesmo valor",
];

/**
 * Documentos citáveis, por NOME COMPOSTO primeiro. Cada padrão mapeia pra um documento
 * canônico: "Certidão de Matrícula" é UM documento, não dois ("certidão" + "matrícula") — se
 * contasse como dois, "conforme a Certidão de Matrícula" (fonte única, citação legítima) seria
 * bloqueado por engano. Ordem importa: a forma composta consome o texto antes das soltas.
 */
const PADROES_DOCUMENTO: [RegExp, string][] = [
  [/certid(?:ao|ão) de matr(?:i|í)cula/g, "certidao_matricula"],
  [/certid(?:ao|ão) de corredor vi(?:a|á)rio/g, "certidao_corredor"],
  [/quadro de (?:a|á)reas?/g, "quadro_areas"],
  [/laudo t(?:e|é)cnico/g, "laudo"],
  [/levantamento arquitet(?:o|ô)nico/g, "prancha"],
  [/art\s*\/\s*rrt/g, "art"],
  [/\bart\b/g, "art"],
  [/\brrt\b/g, "art"],
  [/\bprancha\b/g, "prancha"],
  [/vistoria|fiscaliza(?:c|ç)(?:ao|ão)/g, "vistoria"],
  [/certid(?:ao|ão)/g, "certidao_matricula"],
  [/matr(?:i|í)cula/g, "certidao_matricula"],
  [/\blaudo\b/g, "laudo"],
  [/mem(?:o|ó)rial/g, "memorial"],
  [/\bplanta\b/g, "planta"],
  [/\biptu\b/g, "iptu"],
];

/** Quantos DOCUMENTOS distintos (canônicos) a cláusula cita. */
function documentosDistintos(trechoNormalizado: string): string[] {
  let restante = trechoNormalizado;
  const achados = new Set<string>();
  for (const [padrao, canonico] of PADROES_DOCUMENTO) {
    const re = new RegExp(padrao.source, "g");
    if (re.test(restante)) {
      achados.add(canonico);
      // Consome o trecho casado pra uma forma composta não ser recontada pelas soltas.
      restante = restante.replace(new RegExp(padrao.source, "g"), " ");
    }
  }
  return [...achados];
}

/** Vocabulário PRÓPRIO do checklist — "item conforme"/"não conforme" nunca é comparação de valor. */
function ehVocabularioDeChecklist(fraseNormalizada: string): boolean {
  return /\b(iten?s?|marcac(ao|oes)|marcad[oa]s?|status|checklist)\b[^.]{0,40}\bconformes?\b/.test(fraseNormalizada)
    || /\bnao conformes?\b/.test(fraseNormalizada);
}

function marcadoresPresentes(fraseNormalizada: string, lista: string[]): string[] {
  return lista.filter((m) => (m.includes(" ") ? fraseNormalizada.includes(m) : contemPalavra(fraseNormalizada, m)));
}

// ─────────────────────────────────────────────────────────────────── detecção

/** Números com decimal no formato BR ou US — é assim que medida aparece neste domínio
 *  ("2.768,01", "2768,01", "810.00"). Evita casar data, nº de processo e contagem inteira. */
const PADRAO_MEDIDA = /\b\d{1,3}(?:\.\d{3})*,\d+\b|\b\d+,\d+\b|\b\d+\.\d{2}\b/g;

function medidasDistintas(frase: string): string[] {
  return [...new Set(frase.match(PADRAO_MEDIDA) ?? [])];
}

/**
 * Palavras que APARECEM dentro de rótulos reais mas são conectivo de português, não identidade
 * do campo — ACHADO: "Área conforme ART de Levantamento" contém "conforme"; sem esta lista, a
 * frase legítima "A Área do Terreno é 810,00 m², conforme a Certidão" casava com esse rótulo
 * (por "área" + "conforme") e virava uma comparação inexistente entre dois campos.
 */
const TOKENS_SEM_IDENTIDADE = new Set([
  "conforme", "segundo", "pela", "pelo", "pelas", "pelos", "sobre", "entre", "apos", "ate",
  "sem", "mais", "menos", "qual", "quais", "existe", "existir", "tem", "ter", "foi", "sao",
  "esta", "estao", "doc", "sei", "total", "nro", "num", "numero",
]);

/**
 * Rótulos do LIP mencionados na frase. Exige ≥2 tokens do rótulo presentes E que pelo menos um
 * deles seja DISCRIMINANTE — token raro no conjunto de rótulos daquele slot (calculado na hora,
 * nunca hardcoded) e que não seja conectivo. Sem isso, "área" (que aparece em quase todo rótulo
 * de área) sozinha casaria com meio catálogo e produziria comparação onde não há nenhuma.
 */
function rotulosMencionados(frase: string, rotulos: string[]): string[] {
  const fraseNorm = normalizar(frase);
  const frequencia = new Map<string, number>();
  for (const rotulo of rotulos) {
    for (const token of tokensDoRotulo(rotulo)) frequencia.set(token, (frequencia.get(token) ?? 0) + 1);
  }
  const tetoDeFrequencia = Math.max(1, Math.floor(rotulos.length * 0.3));
  const ehDiscriminante = (token: string) =>
    !TOKENS_SEM_IDENTIDADE.has(token) && (frequencia.get(token) ?? 0) <= tetoDeFrequencia;

  const palavras = fraseNorm.split(/[^a-z0-9]+/).filter(Boolean);
  const achados: string[] = [];
  for (const rotulo of rotulos) {
    const tokens = tokensDoRotulo(rotulo);
    if (tokens.length === 0) continue;
    const presentes = tokens.filter((t) => contemPalavra(fraseNorm, t));
    if (!presentes.some(ehDiscriminante)) continue;
    const exigido = tokens.length === 1 ? 1 : 2;
    if (presentes.length < exigido) continue;
    // Os tokens têm que estar PERTO uns dos outros pra contar como menção ao campo. Sem isso,
    // um verbo solto + uma palavra distante fingem uma menção: em "Área a ser Regularizada TOTAL
    // CONFERE com a Área apontada pela Fiscalização (VISTORIA)", "confere"+"vistoria" casariam
    // com o campo "Levante confere com Vistoria?" — que a frase nem cita — e a comparação real
    // escaparia por ter o verbo "adotado" por um rótulo.
    if (!tokensProximos(palavras, presentes, presentes.length + 3)) continue;
    achados.push(rotulo);
  }
  return achados;
}

/** Existe uma janela de até `janela` palavras que contenha TODOS os tokens informados? */
function tokensProximos(palavras: string[], tokens: string[], janela: number): boolean {
  const posicoes: number[][] = [];
  for (const token of tokens) {
    const indices = palavras.reduce<number[]>((acc, palavra, i) => (palavra === token ? [...acc, i] : acc), []);
    if (indices.length === 0) return false;
    posicoes.push(indices);
  }
  if (posicoes.length === 1) return true;
  for (const ancora of posicoes[0]) {
    let min = ancora;
    let max = ancora;
    let cabe = true;
    for (const indices of posicoes.slice(1)) {
      const maisProxima = indices.reduce((a, b) => (Math.abs(b - ancora) < Math.abs(a - ancora) ? b : a));
      min = Math.min(min, maisProxima);
      max = Math.max(max, maisProxima);
      if (max - min > janela) { cabe = false; break; }
    }
    if (cabe) return true;
  }
  return false;
}

/**
 * Existe cruzamento determinístico que autorize comparar exatamente estes rótulos?
 * - 1 rótulo: precisa de um cruzamento com ESSE rótulo (é o caso legítimo LIP × documento, em
 *   que os dois lados são o MESMO campo).
 * - 2+ rótulos: precisa de um cruzamento cujo rótulo cite TODOS eles (formato "A × B", que só
 *   `compararPorSemantica` produz — hoje sem nenhum call site no pipeline, então na prática
 *   nenhuma comparação entre dois campos diferentes tem lastro).
 */
function temCruzamentoCompativel(rotulosNaFrase: string[], ctx: ContextoComparacao): boolean {
  if (rotulosNaFrase.length === 0) return false;
  return ctx.cruzamentos.some((c) => {
    const alvo = normalizar(c.rotulo);
    if (rotulosNaFrase.length === 1) return alvo === normalizar(rotulosNaFrase[0]);
    return rotulosNaFrase.every((r) => alvo.includes(normalizar(r)));
  });
}

// ────────────────────────────────────────────── cláusula "conforme <2+ documentos>"

/** "..., conforme Quadro de Áreas e Certidão de Matrícula" → remove só a cláusula, o fato fica. */
const PADRAO_CLAUSULA_FONTE = /(?:,|;|\s+)\s*(?:conforme|de acordo com|confirmad[oa]s? (?:por|pel[oa]s?)|segundo)\s+[^.;:!?]+/gi;

/**
 * Mascara os rótulos reais antes de procurar cláusula — ACHADO: o próprio rótulo pode CONTER a
 * palavra "conforme" ("Área conforme ART de Levantamento", "Área conforme Laudo Técnico"). Sem
 * mascarar, o detector de cláusula engolia a frase inteira a partir do meio do nome do campo
 * (virava "A Área." — a resposta era destruída em vez de corrigida).
 */
function mascararRotulos(texto: string, rotulos: string[]): { mascarado: string; mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  let mascarado = texto;
  let n = 0;
  for (const rotulo of [...rotulos].sort((a, b) => b.length - a.length)) {
    const alvo = rotulo.trim();
    if (alvo.length < 4) continue;
    const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(escapado, "i").test(mascarado)) continue;
    const marca = `«R${n++}»`;
    mapa.set(marca, alvo);
    mascarado = mascarado.replace(new RegExp(escapado, "gi"), marca);
  }
  return { mascarado, mapa };
}

function desmascarar(texto: string, mapa: Map<string, string>): string {
  let saida = texto;
  for (const [marca, original] of mapa) saida = saida.split(marca).join(original);
  return saida;
}

function removerClausulaDeConfirmacao(frase: string, rotulos: string[], bloqueios: BloqueioComparacao[]): string {
  const { mascarado, mapa } = mascararRotulos(frase, rotulos);
  const semClausula = mascarado.replace(PADRAO_CLAUSULA_FONTE, (trecho) => {
    const documentos = documentosDistintos(normalizar(trecho));
    // Só remove quando a cláusula relaciona 2+ DOCUMENTOS distintos — "conforme o dossiê" ou
    // "conforme a Certidão de Matrícula" (fonte única declarada) continua citação legítima.
    if (documentos.length < 2) return trecho;
    bloqueios.push({ trecho: desmascarar(trecho, mapa).trim(), motivo: "confirmacao_entre_documentos" });
    return "";
  });
  return desmascarar(semClausula, mapa);
}

// ─────────────────────────────────────────────────────────────────── frase a frase

function ehAfirmacaoComparativaSemLastro(
  frase: string,
  ctx: ContextoComparacao,
): BloqueioComparacao["motivo"] | null {
  const fraseNorm = normalizar(frase);
  const rotulos = rotulosMencionados(frase, ctx.rotulos);

  // ACHADO (validação contra a resposta real): a palavra comparativa pode ser parte do NOME do
  // campo — "Área CONFORME ART de Levantamento", "Levante CONFERE com Vistoria?". Citar esses
  // campos (inclusive listando vários, que é exatamente o que se quer) não é comparar nada. Só
  // conta como marcador a palavra que NÃO pertence ao nome de um rótulo citado na frase.
  const tokensDosRotulosCitados = new Set(rotulos.flatMap(tokensDoRotulo));
  const marcadorProprioDoRotulo = (m: string) => tokensDosRotulosCitados.has(m.split(" ")[0]);

  const divergencia = marcadoresPresentes(fraseNorm, MARCADORES_DIVERGENCIA).filter((m) => !marcadorProprioDoRotulo(m));
  const confirmacao = ehVocabularioDeChecklist(fraseNorm)
    ? []
    : marcadoresPresentes(fraseNorm, MARCADORES_CONFIRMACAO).filter((m) => !marcadorProprioDoRotulo(m));
  if (divergencia.length === 0 && confirmacao.length === 0) return null;

  if (rotulos.length >= 2) {
    return temCruzamentoCompativel(rotulos, ctx) ? null : "dois_campos_sem_cruzamento";
  }
  // Um campo só, mas dois valores medidos na mesma frase — é comparação do mesmo jeito.
  if (medidasDistintas(frase).length >= 2) {
    return temCruzamentoCompativel(rotulos, ctx) ? null : "valores_sem_cruzamento";
  }
  return null;
}

const PADRAO_BULLET = /^(\s*(?:[-*•]|\d+[.)])\s+)/;
/** Frase que só faz sentido ancorada na anterior ("vale conferir ESSA diferença"). */
const PADRAO_ANCORADA = /\b(essa|esta|dessa|desta|nessa|nesta|isso|disso|essas|estas|tal)\b/i;

function dividirEmFrases(texto: string): string[] {
  const partes = texto.split(/(?<=[.!?])\s+/);
  return partes.filter((p) => p.length > 0);
}

/**
 * Valida a resposta inteira. Devolve o texto já corrigido e a lista do que foi bloqueado
 * (pra log/auditoria — o trecho bloqueado nunca volta pro analista).
 */
export function validarComparacoes(
  texto: string,
  ctx: ContextoComparacao,
): { texto: string; bloqueios: BloqueioComparacao[] } {
  const bloqueios: BloqueioComparacao[] = [];
  if (!texto.trim() || ctx.rotulos.length === 0) return { texto, bloqueios };

  const linhas = texto.split("\n").map((linha) => {
    if (!linha.trim() || /^#{1,6}\s/.test(linha)) return linha;

    const prefixo = linha.match(PADRAO_BULLET)?.[1] ?? "";
    const conteudo = prefixo ? linha.slice(prefixo.length) : linha;

    // 1) Cláusula "conforme <2+ documentos>" — remove só ela, preservando o fato.
    const semClausula = removerClausulaDeConfirmacao(conteudo, ctx.rotulos, bloqueios);

    // 2) Frase a frase: relação comparativa sem lastro determinístico.
    const frases = dividirEmFrases(semClausula);
    let algumaBloqueada = false;
    const mantidas: string[] = [];
    for (const frase of frases) {
      const motivo = ehAfirmacaoComparativaSemLastro(frase, ctx);
      if (motivo) {
        bloqueios.push({ trecho: frase.trim(), motivo });
        algumaBloqueada = true;
        continue;
      }
      // Frase ancorada na anterior ("...conferir ESSA diferença") perde o sentido quando a
      // anterior cai — e continuaria afirmando a comparação por tabela. Cai junto.
      if (algumaBloqueada && PADRAO_ANCORADA.test(frase)
          && (marcadoresPresentes(normalizar(frase), MARCADORES_DIVERGENCIA).length > 0
            || marcadoresPresentes(normalizar(frase), MARCADORES_CONFIRMACAO).length > 0)) {
        bloqueios.push({ trecho: frase.trim(), motivo: "dois_campos_sem_cruzamento" });
        continue;
      }
      mantidas.push(frase);
    }

    if (!algumaBloqueada) return prefixo + semClausula;
    // Bullet inteiro cai (o resto costuma ser só o complemento da comparação); num parágrafo,
    // só as frases bloqueadas somem e o que sobrou de fato continua.
    if (prefixo || mantidas.length === 0) return prefixo + FRASE_SEM_REGRA;
    return prefixo + [...mantidas, FRASE_SEM_REGRA].join(" ");
  });

  const limpo = linhas.join("\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  return { texto: limpo, bloqueios };
}

/** Extrai o contexto do MESMO recorte que foi enviado ao modelo — nunca do dossiê bruto. */
export function contextoDoRecorte(recorte: Record<string, any>): ContextoComparacao {
  const campos = (recorte?.lip?.campos_tecnicos ?? {}) as Record<string, { rotulo?: string }>;
  const rotulos = [
    ...Object.values(campos).map((c) => c?.rotulo).filter((r): r is string => typeof r === "string" && r.length > 0),
    ...((recorte?.lip?.campos_vazios_rotulos ?? []) as string[]),
    ...((recorte?.lip?.campos_em_x_rotulos ?? []) as string[]),
  ];
  const cruzamentos = ((recorte?.cruzamentos ?? []) as any[])
    // No recorte, `chave` já carrega o RÓTULO humano (ver app/api/urbi/chat/route.ts).
    .map((c) => ({ rotulo: String(c?.chave ?? ""), resultado: String(c?.resultado ?? "") }))
    .filter((c) => c.rotulo.length > 0);
  return { rotulos: [...new Set(rotulos)].filter((r) => r !== "Campo sem rótulo cadastrado"), cruzamentos };
}
