/**
 * lib/mac-motor/slot5/prompts.ts — os prompts do motor híbrido do Slot 5, versionados em código.
 *
 * Mesma decisão de governança de `lib/visao/receitas.ts`: prompt fica em CÓDIGO, não em
 * `lip_prompts` (banco editável sem histórico imutável). Regra suprema do usuário em 2026-07-30:
 * "o prompt do Gemini deve ser próprio, versionado e exclusivo do Slot 5" — nada aqui é
 * compartilhado com P3_MAC (Regularização/Aceite) nem com qualquer prompt de `lip_prompts`.
 *
 * `hashPrompt` usa o mesmo FNV-1a duplo de `lib/mac-execucao/versao.ts` — duplicado localmente
 * pelo mesmo motivo de lá: não há função de hash de string exportada, e importar community só
 * para isto criaria acoplamento desnecessário entre módulos que devem poder evoluir sozinhos.
 */

import { GEMINI_MODEL } from "@/lib/constants";

export type PromptSlot5 = {
  id: string;
  versao: number;
  modelo: string;
  papeisEsperados: string[];
  texto: string;
};

function hashString(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function hashPrompt(p: PromptSlot5): string {
  const funcional = { id: p.id, versao: p.versao, modelo: p.modelo, papeisEsperados: [...p.papeisEsperados].sort(), texto: p.texto };
  return hashString(JSON.stringify(funcional));
}

const REGRAS_COMUNS = [
  "Responda SOMENTE com JSON, sem cercas de código (sem ```), no formato:",
  '{"fatos": [',
  '  {"nome": "<nome_do_fato>", "valor": "<string, como aparece no documento>", "unidade": "<m²|m³|null>",',
  '   "documento": "<papel do documento>", "pagina": <número ou null>, "trecho": "<citação curta>",',
  '   "confianca": <0.0 a 1.0>, "observacao": null},',
  '  {"nome": "<nome_do_fato>", "abstencao": true, "motivo": "<por que não deu para ler>", "documento": "<papel ou null>"}',
  "]}",
  "",
  "Abstenha-se FATO A FATO, nunca do documento inteiro: se um valor está ilegível ou o quadro não",
  "aparece, devolva abstencao=true SÓ para aquele fato — os demais continuam normais.",
  "Responder um valor plausível que você não leu com clareza é PIOR do que se abster: este dado",
  "entra num laudo que fundamenta alvará municipal e pode decidir deferimento ou indeferimento.",
  "",
  "Você NUNCA decide se o projeto está conforme, nem calcula nada — só extrai e transcreve o que",
  "está escrito no documento. A decisão é de um código determinístico, fora desta chamada.",
].join("\n");

/**
 * v2 em 2026-07-30: passou de 1 fato (só área da certidão) para até 10 (área + 4 medidas de
 * perímetro, dos DOIS documentos) — correção de revisão independente: o item MAC pede
 * "compatibilizar a ÁREA E AS DIMENSÕES do terreno", e comparar só área deixava passar um terreno
 * com a mesma área mas formato/perímetro diferente (ex.: 20×22,5 declarado como 15×30 — mesma
 * área, lote errado). `papel: "projeto"` é a MESMA prancha usada por PROMPT_CAIXA_RECARGA — o
 * motor faz duas chamadas de Gemini sobre o mesmo arquivo, uma por recorte de interesse.
 */
export const PROMPT_DIMENSOES_TERRENO: PromptSlot5 = {
  id: "slot5.dimensoesTerreno",
  versao: 2,
  modelo: GEMINI_MODEL,
  papeisEsperados: ["projeto", "certidao_matricula"],
  texto: [
    "Você está lendo DOIS documentos de um processo de aprovação de projeto brasileiro:",
    "(1) uma prancha de PROJETO ARQUITETÔNICO (planta de situação/carimbo) e",
    "(2) uma CERTIDÃO DE MATRÍCULA do imóvel (registro de imóveis).",
    "",
    "De CADA documento, extraia até 5 fatos sobre o TERRENO (não a edificação):",
    "",
    "  área — a área do terreno/lote, em m².",
    "  frente — a medida da testada/frente do terreno, em metros linares (m).",
    "  fundo — a medida do fundo do terreno, em m.",
    "  lateralEsquerda — a medida da divisa lateral esquerda, em m.",
    "  lateralDireita — a medida da divisa lateral direita, em m.",
    "",
    "Nomeie cada fato como \"<medida>:<documento>\", usando exatamente estas chaves:",
    '  "area:planta", "frente:planta", "fundo:planta", "lateralEsquerda:planta", "lateralDireita:planta",',
    '  "area:certidao", "frente:certidao", "fundo:certidao", "lateralEsquerda:certidao", "lateralDireita:certidao".',
    "",
    "ATENÇÃO:",
    "- Na planta, a área do terreno costuma estar no carimbo, rótulo \"ÁREA DO TERRENO\"; as medidas",
    "  de frente/fundo/laterais aparecem como cotas no desenho da planta de situação.",
    "- Na certidão, a descrição do imóvel costuma trazer as medidas em prosa (\"medindo XX,XXm de",
    "  frente... por YY,YYm da frente aos fundos...\") — esquerda/direita podem estar na perspectiva",
    "  de quem está na rua olhando o lote, ou de quem está dentro; se não der para determinar qual",
    "  lateral é qual com segurança, extraia como \"lateralEsquerda\" a primeira citada no texto e",
    "  registre essa ambiguidade em \"observacao\".",
    "- Nem todo documento traz as 5 medidas — abstenha-se, fato a fato, do que não encontrar.",
    "- Um terreno pode ter só 3 lados (esquina, formato irregular) — abstenha-se da medida que não existir.",
    "",
    REGRAS_COMUNS,
  ].join("\n"),
};

/**
 * v2 em 2026-08-03 — teste histórico do processo 44353 (TESTE-HIST-44353-AN3, pasta Análise 3)
 * mostrou o Gemini se abstendo do fato areaImpermeabilizadaMemorial: ele procurava literalmente o
 * rótulo "ÁREA IMPERMEABILIZADA DO TERRENO", e a prancha real trazia o mesmo valor (356,93 m²) sob
 * o rótulo "ÁREA PERMEABILIZADA" — ambíguo/tecnicamente incorreto do desenhista, mas a conta do
 * próprio quadro (ÁREA DO TERRENO 420,00 − COBERTURA VEGETAL PERMEÁVEL 63,07) bate exatamente com
 * o número. A REGRA (decidirMemorial, regras/caixaDeRecarga.ts) NÃO muda — ela só compara o valor
 * do fato com o cálculo independente, nunca leu o rótulo. O ajuste é inteiramente na instrução ao
 * Gemini: reconhecer a expressão documental mesmo com rótulo errado, sem nunca inferir um número
 * que o documento não mostra escrito ou visivelmente derivável.
 *
 * v3 em 2026-08-03 (mesmo dia, reteste seguinte) — o prompt v2 corrigiu o rótulo, mas o reteste
 * expôs duas falhas novas: (1) o Gemini respondeu `trecho` com uma FÓRMULA simbólica ("ÁREA
 * IMPERMEABILIZADA (AI) = AT - ACVP"), sem nenhum número — o prompt já pedia "transcreva o texto
 * exato", mas não deixava explícito que uma fórmula sem número ao lado NÃO conta como evidência (a
 * regra determinística agora TRAVA isso via `evidenciaMemorialSuficiente()`, mas o prompt precisa
 * parar de produzir esse caso, não só ser pego depois); (2) o Gemini leu o MESMO valor (1,78) para
 * `volumeExigidoCarimbo` e `volumeProjetadoCarimbo` — confundiu as duas linhas do quadro ICCAP.
 *
 * v4 em 2026-08-04 — preparação visual isolada (`recorteIccap.ts`): em vez da prancha A0 inteira
 * (instável para o Gemini ler), o motor agora pode enviar só o(s) recorte(s) PNG do quadro ICCAP,
 * localizados por busca de texto (MuPDF) antes da chamada. Único ajuste: um parágrafo avisando que
 * a imagem pode já vir cortada — a leitura em si (rótulos, linhas, guarda de evidência) não mudou
 * nem uma palavra. Regra determinística também não muda; só troca ONDE o Gemini olha, nunca O QUE
 * ele decide.
 */
export const PROMPT_CAIXA_RECARGA: PromptSlot5 = {
  id: "slot5.caixaDeRecarga",
  versao: 4,
  modelo: GEMINI_MODEL,
  papeisEsperados: ["projeto"],
  texto: [
    "Você está lendo o CARIMBO e o quadro \"Cálculo do Índice de Controle de Captação de Água",
    "Pluvial\" (ICCAP) de uma prancha de projeto arquitetônico brasileira (prefeitura de Goiânia).",
    "",
    "A imagem pode ser a prancha inteira OU um ou mais recortes já focados no quadro ICCAP",
    "(carimbo e/ou memorial de cálculo) — nos dois casos, procure e leia normalmente o que estiver",
    "visível; se receber vários recortes, trate cada um como parte do mesmo quadro, nunca como",
    "documentos independentes.",
    "",
    "Extraia até quatro fatos, cada um pela linha correspondente do quadro ICCAP ou do carimbo:",
    "",
    "1. areaImpermeabilizadaMemorial — a área impermeabilizada do terreno usada no cálculo da caixa",
    "   de recarga, em m². O rótulo mais comum é \"ÁREA IMPERMEABILIZADA\" ou \"ÁREA IMPERMEABILIZADA",
    "   DO TERRENO\". Alguns desenhos usam um rótulo ambíguo ou tecnicamente incorreto para o MESMO",
    "   valor (ex.: \"ÁREA PERMEABILIZADA\" designando, na verdade, a área NÃO permeável). Aceite um",
    "   rótulo alternativo SOMENTE se o próprio quadro também mostrar, na mesma linha ou em linhas",
    "   vizinhas, a expressão ou os dois números-fonte de onde o valor vem — normalmente \"ÁREA DO",
    "   TERRENO\" e \"COBERTURA VEGETAL PERMEÁVEL\" (ou equivalente) — com o valor extraído batendo",
    "   com (área do terreno − cobertura vegetal permeável). Você NUNCA deve fazer essa subtração",
    "   por conta própria a partir de dois números soltos sem relação visível entre si no quadro —",
    "   só reconheça o rótulo alternativo quando o documento deixar a conta ou a relação entre os",
    "   números claramente à mostra.",
    "   IMPORTANTE: uma FÓRMULA simbólica sozinha (ex.: \"ÁREA IMPERMEABILIZADA (AI) = AT - ACVP\",",
    "   com letras no lugar de números) NUNCA é evidência suficiente, mesmo que você saiba calcular o",
    "   resultado de cabeça. Você só pode responder este fato se encontrar, escrita no documento, a",
    "   LINHA COM O NÚMERO (o rótulo — usual ou alternativo — seguido do valor em m², como",
    "   \"356,93 M²\"). Se só existir a fórmula com letras e você não achar a linha com o número real",
    "   ao lado, isso é o MESMO que não ter encontrado o dado — abstenha-se.",
    "2. volumeExigidoCarimbo — linha ICCAP \"EXIGIDO\", em m³ (o carimbo pode omitir; se omitido, abstenha-se).",
    "3. volumeProjetadoCarimbo — linha ICCAP \"ATENDIDO\" (ou equivalente: \"PROJETADO\", \"UTILIZADO\" —",
    "   o volume da caixa de recarga efetivamente projetada/instalada), em m³.",
    "4. nDeCaixas — número de caixas de recarga/retenção indicado no carimbo ou na planta, se houver.",
    "",
    "ATENÇÃO — não confunda \"ÁREA IMPERMEABILIZADA\" (ou seu rótulo alternativo válido, ver acima)",
    "com \"ÁREA DO TERRENO\" (maior, linha diferente). NÃO confunda \"EXIGIDO\" com \"ATENDIDO\"/",
    "\"PROJETADO\"/\"UTILIZADO\" — são DUAS LINHAS DISTINTAS do mesmo quadro ICCAP, com rótulos",
    "diferentes, mesmo lado a lado ou em colunas vizinhas. O volume ATENDIDO/PROJETADO normalmente é",
    "maior ou igual ao EXIGIDO (a caixa instalada cobre o mínimo calculado) — se os dois números que",
    "você está prestes a reportar forem EXATAMENTE IGUAIS, releia as duas linhas com atenção antes de",
    "responder: é um sinal de que você pode ter copiado a mesma célula duas vezes. Só reporte os dois",
    "iguais se, relendo, tiver certeza de que o documento realmente mostra o mesmo número nas duas",
    "linhas — e cite em \"trecho\" o texto de CADA linha separadamente (rótulo + valor de cada uma).",
    "",
    "Para o fato areaImpermeabilizadaMemorial, em \"trecho\" transcreva o texto exato da LINHA COM O",
    "NÚMERO do quadro (rótulo + valor, nunca só a fórmula), tal como está escrito (mesmo se o rótulo",
    "parecer incorreto). Se você usou um rótulo alternativo, registre em \"observacao\" qual foi o",
    "rótulo literal e por que reconheceu aquele valor como a área impermeabilizada — por exemplo:",
    "\"rótulo do quadro diz 'ÁREA PERMEABILIZADA', mas o mesmo quadro mostra ÁREA DO TERRENO 420,00 m²",
    "e COBERTURA VEGETAL PERMEÁVEL 63,07 m², e o valor extraído bate com a subtração dos dois\".",
    "",
    "Se não houver, em lugar nenhum do quadro ou do carimbo, uma linha, rótulo ou expressão com o",
    "NÚMERO que sustente claramente o valor de areaImpermeabilizadaMemorial — nem sob o rótulo usual,",
    "nem sob um rótulo alternativo com a conta visível — abstenha-se deste fato. Nunca infira ou",
    "calcule um valor que o documento não mostra escrito ou derivável de números visivelmente",
    "relacionados.",
    "",
    REGRAS_COMUNS,
  ].join("\n"),
};

/** Experimental — sem item MAC vinculado ainda (ver lib/mac-motor/slot5/comparadorQuadroCarimbo.ts). */
export const PROMPT_QUADRO_AREAS_CARIMBO: PromptSlot5 = {
  id: "slot5.quadroAreasCarimbo.experimental",
  versao: 1,
  modelo: GEMINI_MODEL,
  papeisEsperados: ["projeto"],
  texto: [
    "Você está lendo uma prancha de projeto arquitetônico brasileira. Ela tem DOIS lugares",
    "diferentes onde áreas aparecem: um \"QUADRO DE ÁREAS\" (tabela com uma linha por pavimento",
    "ou por uso, cada uma com sua área em m²) e o CARIMBO (que traz totais consolidados, como",
    "\"ÁREA TOTAL DA CONSTRUÇÃO\").",
    "",
    "Para CADA linha do quadro de áreas, extraia um fato:",
    '  nome = "quadroArea:<rótulo da linha, ex. \'PAVIMENTO TERREO\'>", valor = a área em m².',
    "",
    "Para os totais do carimbo, extraia (quando existirem):",
    '  "carimboAreaTotalConstruida", "carimboAreaTotalPrivativa".',
    "",
    REGRAS_COMUNS,
  ].join("\n"),
};

export const PROMPTS_SLOT5 = [PROMPT_DIMENSOES_TERRENO, PROMPT_CAIXA_RECARGA, PROMPT_QUADRO_AREAS_CARIMBO];
