/**
 * lib/visao/quadroAreas.ts — Receita PREPARATÓRIA "quadro de áreas completo" (Fase K da
 * Inteligência URBIS, 03/09/2026).
 *
 * ── ISTO NÃO ESTÁ LIGADO À EXECUÇÃO REAL ────────────────────────────────────────
 * De propósito NÃO exportado em `RECEITAS` (lib/visao/receitas.ts): aquele array é lido por
 * `executarVisao` (lib/visao/index.ts) e QUALQUER receita ali chama o Gemini de verdade contra
 * documento real, com custo real, na próxima leitura de pasta do Slot 5. Esta receita fica
 * neste arquivo separado até um humano decidir ativá-la — decisão que inclui registrar as 6
 * chaves novas na matriz (`lib/rastreabilidade/lipSlot5.ts`, ver `matriz("LIP","slot_05")` e o
 * teste "8 · a matriz continua coerente com a receita" em scripts/testar_visao.mts) e mover a
 * constante `QUADRO_AREAS_COMPLETO` pra dentro de `RECEITAS`. Nenhuma das duas coisas foi feita
 * aqui.
 *
 * ── POR QUE UM CONTRATO PRÓPRIO, E NÃO SÓ chaves+porCampo ──────────────────────
 * As duas receitas existentes (CALCULO_DE_VAGAS, ICCAP) têm um número FIXO e conhecido de
 * campos. "Áreas por pavimento" não: um sobrado tem 2 linhas, um edifício pode ter 15 — o
 * pedido explícito foi "áreas por pavimento, QUANDO DECLARADAS". Por isso o resultado desta
 * receita não é só `Record<chave, LeituraCampo>` (`Interpretacao` genérica) — é
 * `InterpretacaoQuadroAreas`, que soma uma LISTA de linhas de pavimento ao lado dos campos
 * fixos. O tipo `Receita` (chaves/prompt/validadores/hash) continua sendo reaproveitado sem
 * mudança nenhuma pros 6 campos fixos — só a lista de pavimentos sai de dentro dele.
 */

import type { LeituraCampo, Receita, RegiaoAbsoluta } from "./tipos";
import { GEMINI_MODEL } from "@/lib/constants";

// ---------------------------------------------------------------- vocabulário fechado

/**
 * O que o modelo classificou ter encontrado no recorte — vocabulário fechado, mesmo espírito
 * de `GrauDeCerteza` (lib/urbi/dossieProcesso.ts) e `GrauCruzamento` (lib/urbi/cruzamento.ts):
 * nunca texto livre solto onde quem lê depois precisa decidir algo.
 *
 * "não localizado" DE PROPÓSITO não é um valor deste vocabulário: não é o MODELO que decide
 * isso, é o localizador (lib/visao/localizar.ts) não achar o quadro em nenhuma página —
 * `fecharQuadroAreas(null, ...)` representa esse caso com `tipoQuadroIdentificado.ok = false`
 * e motivo explicando o porquê, nunca com um valor "encontrado" chamado "não localizado" (seria
 * um valor válido descrevendo uma ausência — contradição de tipo). Isso cobre o item 4 do
 * pedido ("não localizado", "ambíguo", "necessita conferência") sem misturar as duas colunas:
 * "ambiguo" segue aqui porque É uma classificação real que o modelo pode fazer; "necessita
 * conferência" é sempre calculado à parte (`precisaConferenciaHumana`), nunca decidido pelo
 * modelo.
 */
export const TIPOS_DE_QUADRO = [
  "quadro_de_areas",     // quadro dedicado, título reconhecível (ex.: "QUADRO DE ÁREAS")
  "memorial_de_calculo", // tabela dentro de um memorial de cálculo, não um quadro isolado
  "tabela_mista",        // quadro que mistura área com outro assunto (ex.: vagas + áreas)
  "ambiguo",             // achou algo parecido, mas não dá pra classificar com segurança
] as const;
export type TipoDeQuadro = (typeof TIPOS_DE_QUADRO)[number];

/** Chaves ESCALARES desta receita — mesmo papel de `Receita.chaves` nas duas já existentes. */
export const CHAVES_QUADRO_AREAS = [
  "tipoQuadroIdentificado",
  "areaTerreno",
  "areaConstruidaTotal",
  "areaPermeavel",
  "areaImpermeavel",
  "areaARegularizar",
] as const;
export type ChaveQuadroAreas = (typeof CHAVES_QUADRO_AREAS)[number];

// ---------------------------------------------------------------- validadores

/**
 * Área em m², formato brasileiro (vírgula decimal, ponto de milhar opcional). Faixa ampla e
 * provisória (1 a 500.000 m²) só pra recusar leitura obviamente errada (célula vizinha, coluna
 * trocada) — NÃO é limite jurídico de porte de projeto, e não deve virar um sem antes um
 * humano calibrar contra dado real (mesmo espírito do comentário em ICCAP.validadores).
 */
function areaEmM2(oQueE: string) {
  return (bruto: string): { ok: boolean; motivo?: string } => {
    const v = (bruto ?? "").trim();
    if (!v) return { ok: false, motivo: "campo ausente na resposta" };
    if (!/^(\d{1,3}(\.\d{3})*|\d{1,6})(,\d{1,2})?$/.test(v)) return { ok: false, motivo: `"${v}" não é uma área em m² com vírgula decimal` };
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (n < 1 || n > 500_000) return { ok: false, motivo: `${n} m² está fora da faixa plausível de ${oQueE}` };
    return { ok: true };
  };
}

function tipoDeQuadroValido(bruto: string): { ok: boolean; motivo?: string } {
  const v = (bruto ?? "").trim();
  if (!TIPOS_DE_QUADRO.includes(v as TipoDeQuadro)) {
    return { ok: false, motivo: `"${v}" não é um dos tipos de quadro previstos (${TIPOS_DE_QUADRO.join(", ")})` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- a receita (metadado + prompt)

/**
 * Metadado de governança nos mesmos moldes de CALCULO_DE_VAGAS/ICCAP — reutiliza o tipo
 * `Receita` inteiro (inclusive `hashReceita`, se algum dia for chamado com isto). Só os 6
 * campos escalares entram em `chaves`; a lista de pavimentos é tratada à parte pelo parser
 * próprio desta receita (`interpretarRespostaQuadroAreas`), não pelo `interpretarResposta`
 * genérico de `lib/visao/interpretar.ts`.
 */
export const QUADRO_AREAS_COMPLETO: Receita = {
  id: "prancha.quadro_areas_completo",
  versao: 1,
  chaves: [...CHAVES_QUADRO_AREAS],
  estrategia: "VARREDURA_VISUAL",
  papel: "projeto",
  localizacao: {
    alvo: "um quadro ou tabela de áreas do projeto — títulos comuns são \"QUADRO DE ÁREAS\", "
      + "\"QUADRO DE ÁREA\" ou uma tabela dentro do memorial descritivo com linhas de área do "
      + "terreno, área construída, área por pavimento (térreo, 1º pavimento, cobertura...), "
      + "área permeável/impermeável e área a regularizar",
    varreduraPx: 1600, alvoPx: 1600, margem: 0.02,
  },
  modelo: GEMINI_MODEL,
  prompt: [
    "Você está lendo um RECORTE de uma prancha ou memorial de projeto arquitetônico brasileiro.",
    "",
    "Procure um quadro/tabela de áreas do projeto e extraia:",
    "",
    "1. tipoQuadroIdentificado — classifique o que encontrou em UM destes valores exatos:",
    `   ${TIPOS_DE_QUADRO.join(" | ")}`,
    "",
    "2. areaTerreno — área do terreno, em m², como aparece no documento (vírgula decimal).",
    "3. areaConstruidaTotal — área construída TOTAL do projeto, em m².",
    "4. areaPermeavel — área permeável do terreno, em m², quando declarada.",
    "5. areaImpermeavel — área impermeável do terreno, em m², quando declarada.",
    "6. areaARegularizar — área a regularizar, em m², quando declarada (só existe em projeto de",
    "   regularização — se o quadro não menciona regularização, ABSTENHA-SE deste campo, não",
    "   escreva \"0\").",
    "",
    "7. areasPorPavimento — LISTA de linhas do quadro que discriminam área POR PAVIMENTO",
    "   (ex.: \"Térreo\", \"1º Pavimento\", \"Cobertura\", \"Subsolo\"). Uma entrada por linha, na",
    "   ORDEM em que aparecem no quadro. Se o quadro não discrimina por pavimento (só mostra o",
    "   total), devolva uma lista VAZIA — não invente pavimento nenhum.",
    "",
    "8. textoBrutoEvidencia — transcreva o texto do quadro tal como está escrito, sem reformatar,",
    "   pra qualquer conferência humana futura poder comparar a leitura estruturada com a fonte.",
    "",
    "REGRAS QUE VALEM PRA TODOS OS CAMPOS NUMÉRICOS:",
    "- Abstenha-se CAMPO A CAMPO. Um valor ilegível ou ausente NÃO invalida os outros do mesmo",
    "  quadro.",
    "- NUNCA calcule, complete ou infira um valor que não está escrito (ex.: nunca some pavimentos",
    "  pra preencher um total ausente, nunca subtraia pra achar a área impermeável).",
    "- Responder um número plausível que você não leu com clareza é PIOR do que se abster: este",
    "  valor pode entrar em conferência de conformidade legal.",
    "- Se o quadro inteiro não estiver neste recorte, marque tipoQuadroIdentificado como",
    "  \"ambiguo\" e abstenha-se de todos os demais campos.",
    "",
    "Responda SOMENTE com JSON, sem cercas de código, no formato:",
    '{"campos": {',
    '  "tipoQuadroIdentificado": {"valor": "quadro_de_areas", "confianca": 0.9},',
    '  "areaTerreno": {"valor": "450,00", "confianca": 0.95},',
    '  "areaConstruidaTotal": {"valor": "320,50", "confianca": 0.9},',
    '  "areaPermeavel": {"abstencao": true, "motivo": "não declarada neste quadro"},',
    '  "areaImpermeavel": {"valor": "280,00", "confianca": 0.85},',
    '  "areaARegularizar": {"abstencao": true, "motivo": "projeto não é de regularização"}',
    "},",
    '"areasPorPavimento": [',
    '  {"pavimento": "Térreo", "valor": "160,25", "confianca": 0.9},',
    '  {"pavimento": "1º Pavimento", "valor": "160,25", "confianca": 0.9}',
    "],",
    '"textoBrutoEvidencia": "QUADRO DE ÁREAS ... (texto como está no documento)"}',
  ].join("\n"),
  validadores: {
    tipoQuadroIdentificado: tipoDeQuadroValido,
    areaTerreno: areaEmM2("área de terreno"),
    areaConstruidaTotal: areaEmM2("área construída"),
    areaPermeavel: areaEmM2("área permeável"),
    areaImpermeavel: areaEmM2("área impermeável"),
    areaARegularizar: areaEmM2("área a regularizar"),
  },
  // Sem `coerencia`: comparar área do terreno × impermeável × construída como regra de rejeição
  // exigiria assumir uma relação jurídica entre elas (ex.: "impermeável nunca > terreno") que
  // este arquivo não tem autoridade pra fixar — fica pra quem calibrar a receita contra dado
  // real antes de ativar (mesma reserva já registrada no achado de Fase K sobre a memória).
};

// ---------------------------------------------------------------- resultado (contrato completo)

export type LinhaAreaPavimento = {
  /** rótulo como veio no documento — "Térreo", "1º Pavimento"... nunca normalizado/traduzido */
  pavimento: string;
  area: LeituraCampo;
};

/**
 * Espelha `Interpretacao` (lib/visao/tipos.ts), somando os 2 campos que a receita de área
 * precisa e as outras não: a lista de pavimentos e a unidade declarada. Não inclui `regiao` —
 * mesmo padrão de `Interpretacao`, que recebe a região de fora (do localizador), não de si
 * mesma.
 */
export type InterpretacaoQuadroAreas = {
  porCampo: Record<ChaveQuadroAreas, LeituraCampo>;
  areasPorPavimento: LinhaAreaPavimento[];
  unidade: string;
  textoBrutoEvidencia: string;
  bruto: string;
  custoIA: number;
  msRecorte: number;
  msModelo: number;
  reaproveitada: boolean;
  interpretacaoId?: string;
};

/**
 * Contrato de saída FINAL — o que um consumidor futuro (dossiê, comparador, tela) leria. Junta
 * a interpretação com a região de origem (página/coordenadas) e as 2 conclusões que nenhuma
 * IA deve tirar sozinha: `necessitaConferenciaHumana` (regra determinística, ver
 * `precisaConferenciaHumana`) e `camposAusentesOuIlegiveis` (lista pronta pra exibir, sem
 * ninguém ter que reprocessar `porCampo`).
 */
export type QuadroAreasExtraido = {
  /** null quando o quadro não foi localizado em nenhuma página do documento */
  regiao: RegiaoAbsoluta | null;
  porCampo: Record<ChaveQuadroAreas, LeituraCampo>;
  areasPorPavimento: LinhaAreaPavimento[];
  unidade: string;
  textoBrutoEvidencia: string;
  necessitaConferenciaHumana: boolean;
  /** nomes das chaves fixas OU "pavimento:<rótulo>" — tudo que não veio com leitura ok */
  camposAusentesOuIlegiveis: string[];
};

/**
 * Abaixo desta confiança, mesmo uma leitura "ok" pede olho humano antes de qualquer uso —
 * número de partida (mesma ordem de grandeza do que já se usa informalmente no dossiê pra
 * "vale_conferir"), não uma regra jurídica. Ajustável por quem for calibrar a receita.
 */
const CONFIANCA_MINIMA_SEM_CONFERENCIA = 0.85;

/**
 * Pura e determinística — nunca a IA decide se precisa de conferência, aqui é sempre a mesma
 * regra: qualquer abstenção (campo fixo ou linha de pavimento) OU qualquer confiança abaixo do
 * piso OU nenhum campo lido de jeito nenhum.
 */
export function precisaConferenciaHumana(
  porCampo: Record<ChaveQuadroAreas, LeituraCampo>,
  areasPorPavimento: LinhaAreaPavimento[],
): boolean {
  const leituras = [...Object.values(porCampo), ...areasPorPavimento.map((l) => l.area)];
  if (leituras.length === 0) return true;
  if (leituras.some((l) => !l.ok)) return true;
  const confiancas = leituras
    .filter((l): l is Extract<LeituraCampo, { ok: true }> => l.ok)
    .map((l) => l.confianca)
    .filter((c): c is number => c != null);
  if (confiancas.length === 0) return true; // leu mas nenhuma confiança veio — não presume que é boa
  return confiancas.some((c) => c < CONFIANCA_MINIMA_SEM_CONFERENCIA);
}

/** Nomes prontos pra exibir — nunca reprocessa `porCampo`/`areasPorPavimento` de novo pra isso. */
export function camposAusentesOuIlegiveis(
  porCampo: Record<ChaveQuadroAreas, LeituraCampo>,
  areasPorPavimento: LinhaAreaPavimento[],
): string[] {
  const saida: string[] = [];
  for (const chave of CHAVES_QUADRO_AREAS) {
    if (!porCampo[chave]?.ok) saida.push(chave);
  }
  for (const linha of areasPorPavimento) {
    if (!linha.area.ok) saida.push(`pavimento:${linha.pavimento}`);
  }
  return saida;
}

// ---------------------------------------------------------------- parser (puro, sem rede/banco)

const TODOS_ABSTEM = (motivo: string): Record<ChaveQuadroAreas, LeituraCampo> =>
  Object.fromEntries(CHAVES_QUADRO_AREAS.map((c) => [c, { ok: false as const, motivo }])) as Record<ChaveQuadroAreas, LeituraCampo>;

/**
 * Mesmo espírito de `interpretarResposta` (lib/visao/interpretar.ts), mas parser PRÓPRIO: a
 * resposta desta receita tem `areasPorPavimento` (lista) e `textoBrutoEvidencia` (string) além
 * do bag `campos`, formato que o parser genérico não conhece. Puro — sem banco, sem rede — e
 * NUNCA lança: resposta corrompida vira abstenção total, igual ao padrão já estabelecido.
 */
export function interpretarRespostaQuadroAreas(texto: string): {
  porCampo: Record<ChaveQuadroAreas, LeituraCampo>;
  areasPorPavimento: LinhaAreaPavimento[];
  textoBrutoEvidencia: string;
} {
  let json: any;
  try {
    json = JSON.parse(texto.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  } catch {
    return { porCampo: TODOS_ABSTEM("resposta não é JSON utilizável"), areasPorPavimento: [], textoBrutoEvidencia: "" };
  }

  if (json?.abstencao === true) {
    return { porCampo: TODOS_ABSTEM(String(json.motivo ?? "o modelo se absteve")), areasPorPavimento: [], textoBrutoEvidencia: "" };
  }

  const bruto = json?.campos ?? {};
  const porCampo = {} as Record<ChaveQuadroAreas, LeituraCampo>;
  for (const chave of CHAVES_QUADRO_AREAS) {
    const c = bruto?.[chave];
    if (c == null) { porCampo[chave] = { ok: false, motivo: "campo ausente na resposta" }; continue; }
    if (c?.abstencao === true) {
      porCampo[chave] = { ok: false, motivo: String(c.motivo ?? "o modelo se absteve neste campo") };
      continue;
    }
    const valor = String(typeof c === "object" ? (c.valor ?? "") : c).trim();
    const v = QUADRO_AREAS_COMPLETO.validadores[chave]?.(valor) ?? { ok: true };
    if (!v.ok) { porCampo[chave] = { ok: false, motivo: `resposta inválida: ${v.motivo}` }; continue; }
    const conf = Number(typeof c === "object" ? c.confianca : NaN);
    porCampo[chave] = { ok: true, valor, confianca: Number.isFinite(conf) ? conf : null };
  }

  const areasPorPavimentoBruto = Array.isArray(json?.areasPorPavimento) ? json.areasPorPavimento : [];
  const validarArea = areaEmM2("área de pavimento");
  const areasPorPavimento: LinhaAreaPavimento[] = areasPorPavimentoBruto.map((linha: any) => {
    const pavimento = String(linha?.pavimento ?? "(sem rótulo)").trim();
    if (linha?.abstencao === true) {
      return { pavimento, area: { ok: false, motivo: String(linha.motivo ?? "o modelo se absteve nesta linha") } };
    }
    const valor = String(linha?.valor ?? "").trim();
    const v = validarArea(valor);
    if (!v.ok) return { pavimento, area: { ok: false, motivo: `resposta inválida: ${v.motivo}` } };
    const conf = Number(linha?.confianca);
    return { pavimento, area: { ok: true, valor, confianca: Number.isFinite(conf) ? conf : null } };
  });

  const textoBrutoEvidencia = typeof json?.textoBrutoEvidencia === "string" ? json.textoBrutoEvidencia.slice(0, 4000) : "";

  return { porCampo, areasPorPavimento, textoBrutoEvidencia };
}

/**
 * Fecha o contrato final (`QuadroAreasExtraido`) a partir da interpretação — ou de "não
 * localizado" quando o localizador (fora deste arquivo, `lib/visao/localizar.ts`) não achou o
 * quadro em nenhuma página. Espelha o bloco `if (!achado) { ... NAO_ENCONTRADO ... }` de
 * `executarVisao` (lib/visao/index.ts), mas devolvendo o contrato desta receita, não
 * `ResultadoCampo` da matriz do LIP — quem for ligar isto na matriz um dia faz essa tradução na
 * borda, não aqui.
 */
export function fecharQuadroAreas(
  interpretacao: InterpretacaoQuadroAreas | null,
  regiao: RegiaoAbsoluta | null,
  motivoNaoLocalizado?: string,
): QuadroAreasExtraido {
  if (!interpretacao) {
    const porCampo = TODOS_ABSTEM(motivoNaoLocalizado ?? "quadro de áreas não localizado em nenhuma página do documento");
    return {
      regiao: null,
      porCampo,
      areasPorPavimento: [],
      unidade: "",
      textoBrutoEvidencia: "",
      necessitaConferenciaHumana: true,
      camposAusentesOuIlegiveis: [...CHAVES_QUADRO_AREAS],
    };
  }
  return {
    regiao,
    porCampo: interpretacao.porCampo,
    areasPorPavimento: interpretacao.areasPorPavimento,
    unidade: interpretacao.unidade || "m²",
    textoBrutoEvidencia: interpretacao.textoBrutoEvidencia,
    necessitaConferenciaHumana: precisaConferenciaHumana(interpretacao.porCampo, interpretacao.areasPorPavimento),
    camposAusentesOuIlegiveis: camposAusentesOuIlegiveis(interpretacao.porCampo, interpretacao.areasPorPavimento),
  };
}
