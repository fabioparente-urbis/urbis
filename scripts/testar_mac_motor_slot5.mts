/**
 * Testes do motor híbrido do MAC, Slot 5 (Aprovação de Projeto) — piloto.
 *
 *   npx tsx --env-file=.env.local scripts/testar_mac_motor_slot5.mts
 *
 * Seções 1-14 são PURAS — não chamam o Gemini real, não tocam o banco. Fatos são forjados à mão.
 * Seções 15-16 são de INTEGRAÇÃO — tocam o banco real, só com dados JÁ EXISTENTES (processo e
 * usuário reais, nunca fabricados: `processos.codigo` tem UNIQUE CONSTRAINT global, então não dá
 * para criar dois processos de teste com o mesmo código). A seção 15 cria uma execução de teste e
 * limpa no `finally`, mesmo padrão de scripts/testar_mac_execucao.mts. Nenhuma chama o Gemini
 * (documentos null → fatos vazios).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { interpretarResposta, RespostaGeminiInvalidaError } from "../lib/mac-motor/slot5/gemini";
import { hashPrompt, PROMPT_DIMENSOES_TERRENO, PROMPT_CAIXA_RECARGA } from "../lib/mac-motor/slot5/prompts";
import { decidirDimensoesTerreno, MAC_ITEM_DIMENSOES_TERRENO, TOLERANCIA_ARREDONDAMENTO } from "../lib/mac-motor/slot5/regras/dimensoesTerreno";
import {
  decidirCaixaDeRecarga, MAC_ITEM_CAIXA_RECARGA_MEMORIAL, MAC_ITEM_CAIXA_RECARGA_VOLUME,
} from "../lib/mac-motor/slot5/regras/caixaDeRecarga";
import { compararQuadroDeAreasComCarimbo } from "../lib/mac-motor/slot5/comparadorQuadroCarimbo";
import { validarPdf, TAMANHO_MAXIMO_PDF_BYTES } from "../lib/mac-motor/slot5/validacaoDocumento";
import { lerCampoLip } from "../lib/mac-motor/slot5/camposLip";
import { parseNumeroBR } from "../lib/mac-motor/slot5/util";
import { resolverProcessoSlot5, type UsuarioReq } from "../lib/mac-motor/slot5/autorizacao";
import { executarPilotoSlot5 } from "../lib/mac-motor/slot5";
import { ASSUNTO_ID_SLOT5, TIPO_PROCESSO_SLOT5 } from "../lib/mac-motor/slot5/constantes";
import type { CampoLipCongelado, FatoExtraido } from "../lib/mac-motor/slot5/tipos";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const fatoLido = (nome: string, valor: string, confianca: number, extra: Partial<FatoExtraido> = {}): FatoExtraido =>
  ({ nome, valor, unidade: "m", documento: "teste", pagina: 1, trecho: null, confianca, observacao: null, ...extra } as FatoExtraido);
const fatoAbstido = (nome: string, motivo = "ilegível"): FatoExtraido => ({ nome, abstencao: true, motivo, documento: "teste" });

/** Constrói um CampoLipCongelado direto de um número, para os testes — como se viesse já normalizado. */
const campoLip = (valorNormalizado: number | null, origem = "extraido"): CampoLipCongelado => ({
  valor: valorNormalizado === null ? null : String(valorNormalizado).replace(".", ","),
  valorNormalizado,
  origem: valorNormalizado === null ? null : origem,
});
const CAMPO_VAZIO: CampoLipCongelado = { valor: null, valorNormalizado: null, origem: null };

// ─────────────────────────── 1 · parser da resposta Gemini ───────────────────────────

secao("1 · parser da resposta (interpretarResposta)");
{
  const ok = interpretarResposta(JSON.stringify({
    fatos: [{ nome: "area:certidao", valor: "450,00", unidade: "m²", documento: "certidao_matricula", pagina: 1, trecho: "área de 450,00m²", confianca: 0.92, observacao: null }],
  }));
  t("1a. parseia um fato lido corretamente", ok.length === 1 && !("abstencao" in ok[0]) && (ok[0] as any).valor === "450,00");

  const comAbstencao = interpretarResposta(JSON.stringify({ fatos: [{ nome: "area:certidao", abstencao: true, motivo: "quadro não está no recorte", documento: null }] }));
  t("1b. parseia uma abstenção corretamente", comAbstencao.length === 1 && "abstencao" in comAbstencao[0]);

  const comCercas = interpretarResposta("```json\n" + JSON.stringify({ fatos: [] }) + "\n```");
  t("1c. remove cercas de código (```json ... ```) antes de parsear", Array.isArray(comCercas) && comCercas.length === 0);
}

secao("2 · rejeição de JSON inválido");
{
  let lancou = false;
  try { interpretarResposta("isto não é json"); } catch (e) { lancou = e instanceof RespostaGeminiInvalidaError; }
  t("2a. texto que não é JSON lança RespostaGeminiInvalidaError", lancou);

  let lancou2 = false;
  try { interpretarResposta(JSON.stringify({ algo: "sem campo fatos" })); } catch (e) { lancou2 = e instanceof RespostaGeminiInvalidaError; }
  t("2b. JSON válido mas sem array \"fatos\" lança RespostaGeminiInvalidaError", lancou2);
}

secao("3 · rejeição de item desconhecido/malformado");
{
  const fatos = interpretarResposta(JSON.stringify({
    fatos: [
      { valor: "sem nome, deve ser descartado", confianca: 0.9 },
      { nome: "", valor: "nome vazio, também descartado", confianca: 0.9 },
      { nome: "valido", valor: "100,00", unidade: "m²", documento: "x", pagina: 1, trecho: null, confianca: 0.9, observacao: null },
    ],
  }));
  t("3a. fato sem \"nome\" é descartado, não quebra o parse", fatos.length === 1);
  t("3b. o único fato restante é o válido", fatos[0]?.nome === "valido");

  const semValor = interpretarResposta(JSON.stringify({ fatos: [{ nome: "campoSemValor", confianca: 0.9 }] }));
  t("3c. fato sem \"valor\" nem abstencao vira abstenção defensiva, não erro", semValor.length === 1 && "abstencao" in semValor[0]);
}

// ─────────────────────────── 4 · dimensões do terreno (arquétipo 1) ───────────────────────────

secao("4 · abstenção por evidência insuficiente (dimensões do terreno)");
{
  const semAreaLip = decidirDimensoesTerreno({ areaTerreno: CAMPO_VAZIO, fatos: [] });
  t("4a. sem areaTerreno do LIP nem da planta → INDETERMINADO/NAO_AVALIADO, requer revisão", semAreaLip.aplicabilidade === "INDETERMINADO" && semAreaLip.resultado === "NAO_AVALIADO" && semAreaLip.requerRevisao);

  const certidaoAbstida = decidirDimensoesTerreno({ areaTerreno: campoLip(450), fatos: [fatoAbstido("area:certidao", "matrícula ilegível")] });
  t("4b. certidão abstida (área não comparável) → APLICAVEL/PENDENTE, requer revisão", certidaoAbstida.aplicabilidade === "APLICAVEL" && certidaoAbstida.resultado === "PENDENTE" && certidaoAbstida.requerRevisao);
  t("4c. nunca declara CONFORME quando faltou evidência", certidaoAbstida.resultado !== "CONFORME");
}

const QUATRO_DIMENSOES_IGUAIS: FatoExtraido[] = [
  fatoLido("frente:planta", "20,00", 0.95), fatoLido("frente:certidao", "20,00", 0.95),
  fatoLido("fundo:planta", "22,50", 0.95), fatoLido("fundo:certidao", "22,50", 0.95),
  fatoLido("lateralEsquerda:planta", "15,00", 0.95), fatoLido("lateralEsquerda:certidao", "15,00", 0.95),
  fatoLido("lateralDireita:planta", "15,00", 0.95), fatoLido("lateralDireita:certidao", "15,00", 0.95),
];

secao("5 · baixa confiança exige revisão (mesmo quando a conta bate)");
{
  const baixaConfianca = decidirDimensoesTerreno({
    areaTerreno: campoLip(450),
    fatos: [fatoLido("area:certidao", "450,00", 0.3), ...QUATRO_DIMENSOES_IGUAIS],
  });
  t("5a. área e as 4 dimensões batem, MAS confiança BAIXA em um fato → REVISAO_MANUAL, não CONFORME direto", baixaConfianca.resultado === "REVISAO_MANUAL" && baixaConfianca.requerRevisao);
}

secao("6 · correção — CONFORME automático exige as 4 dimensões, não só uma (2ª rodada de revisão)");
{
  const soArea = decidirDimensoesTerreno({ areaTerreno: campoLip(450), fatos: [fatoLido("area:certidao", "450,00", 0.95)] });
  t("6a. área bate, nenhuma dimensão comparável → REVISAO_MANUAL", soArea.resultado === "REVISAO_MANUAL" && soArea.requerRevisao);

  const areaMaisUmaDimensao = decidirDimensoesTerreno({
    areaTerreno: campoLip(450),
    fatos: [fatoLido("area:certidao", "450,00", 0.95), fatoLido("frente:planta", "20,00", 0.95), fatoLido("frente:certidao", "20,00", 0.95)],
  });
  t("6b. área + APENAS 1 das 4 dimensões (frente) igual → REVISAO_MANUAL, não é mais suficiente", areaMaisUmaDimensao.resultado === "REVISAO_MANUAL" && areaMaisUmaDimensao.requerRevisao);

  const areaMaisTresDimensoes = decidirDimensoesTerreno({
    areaTerreno: campoLip(450),
    fatos: [fatoLido("area:certidao", "450,00", 0.95), ...QUATRO_DIMENSOES_IGUAIS.slice(0, 6)], // frente+fundo+lateralEsquerda, falta lateralDireita
  });
  t("6c. área + 3 das 4 dimensões (falta lateralDireita) → ainda REVISAO_MANUAL", areaMaisTresDimensoes.resultado === "REVISAO_MANUAL" && areaMaisTresDimensoes.requerRevisao);

  const areaMaisQuatroDimensoes = decidirDimensoesTerreno({
    areaTerreno: campoLip(450),
    fatos: [fatoLido("area:certidao", "450,00", 0.95), ...QUATRO_DIMENSOES_IGUAIS],
  });
  t("6d. área + as 4 dimensões, todas iguais → CONFORME de verdade", areaMaisQuatroDimensoes.resultado === "CONFORME" && !areaMaisQuatroDimensoes.requerRevisao);
  t("6e. macItemId sempre o item real confirmado no banco", areaMaisQuatroDimensoes.macItemId === MAC_ITEM_DIMENSOES_TERRENO);

  const umaDimensaoDiverge = decidirDimensoesTerreno({
    areaTerreno: campoLip(450),
    fatos: [fatoLido("area:certidao", "450,00", 0.95), ...QUATRO_DIMENSOES_IGUAIS.slice(0, 6), fatoLido("lateralDireita:planta", "15,00", 0.95), fatoLido("lateralDireita:certidao", "18,00", 0.95)],
  });
  t("6f. as 4 dimensões presentes mas UMA diverge → REVISAO_MANUAL (não decide por CONFORME parcial)", umaDimensaoDiverge.resultado === "REVISAO_MANUAL" && umaDimensaoDiverge.requerRevisao);
}

secao("7 · tolerância fixa de arredondamento (0,02), não os 1% inventados");
{
  t("7a. TOLERANCIA_ARREDONDAMENTO é 0,02, não 0,01 (1%)", TOLERANCIA_ARREDONDAMENTO === 0.02);
  const foraDaToleranciaNova = decidirDimensoesTerreno({ areaTerreno: campoLip(450), fatos: [fatoLido("area:certidao", "450,50", 0.95), ...QUATRO_DIMENSOES_IGUAIS] });
  t("7b. diferença de área que passaria no 1% antigo (0,5/450), mas não nos 0,02 novos → REVISAO_MANUAL", foraDaToleranciaNova.resultado === "REVISAO_MANUAL");
}

secao("8 · presença de Certidão de Limites não gera CONFORME sozinha (parâmetro removido do tipo)");
{
  // se o parâmetro ainda existisse, este objeto literal nem compilaria (TS rejeita propriedade
  // desconhecida) — a prova em runtime é que toda divergência, com ou sem contexto extra, vira
  // REVISAO_MANUAL, nunca CONFORME.
  const divergenciaGrande = decidirDimensoesTerreno({ areaTerreno: campoLip(450), fatos: [fatoLido("area:certidao", "500,00", 0.95), ...QUATRO_DIMENSOES_IGUAIS] });
  t("8a. divergência grande de área → SEMPRE REVISAO_MANUAL, não existe caminho para CONFORME automático", divergenciaGrande.resultado === "REVISAO_MANUAL" && divergenciaGrande.requerRevisao);
}

// ─────────────────────────── 9 · caixa de recarga (arquétipo 2) ───────────────────────────

secao("9 · cálculo da caixa de recarga (memorial + volume)");
{
  // "trecho" precisa conter o número e o rótulo usual — é o que a guarda de evidência
  // (evidenciaMemorialSuficiente, v4) passa a exigir para decidir CONFORME/NAO_CONFORME.
  const TRECHO_MEMORIAL_400 = "ÁREA IMPERMEABILIZADA 400,00 M²";
  const TRECHO_MEMORIAL_350 = "ÁREA IMPERMEABILIZADA 350,00 M²";

  const conforme = decidirCaixaDeRecarga({
    areaTerreno: campoLip(500), areaPermeavelProjetada: campoLip(100), volumeDaCaixaDeRecarga: campoLip(2.0),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "400,00", 0.9, { unidade: "m²", trecho: TRECHO_MEMORIAL_400 })],
  });
  t("9a. memorial usa a fórmula certa (400 = 500-100) → CONFORME", conforme.memorial.resultado === "CONFORME");
  t("9b. volume projetado (2,00) atende o exigido (2,00) → CONFORME", conforme.volume.resultado === "CONFORME");
  t("9c. ambos apontam para os itens reais confirmados no banco", conforme.memorial.macItemId === MAC_ITEM_CAIXA_RECARGA_MEMORIAL && conforme.volume.macItemId === MAC_ITEM_CAIXA_RECARGA_VOLUME);

  const memorialErrado = decidirCaixaDeRecarga({
    areaTerreno: campoLip(500), areaPermeavelProjetada: campoLip(100), volumeDaCaixaDeRecarga: campoLip(2.0),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "350,00", 0.9, { unidade: "m²", trecho: TRECHO_MEMORIAL_350 })],
  });
  t("9d. memorial declara área impermeabilizada errada (350 ≠ 400) → NAO_CONFORME", memorialErrado.memorial.resultado === "NAO_CONFORME");

  const volumeInsuficiente = decidirCaixaDeRecarga({
    areaTerreno: campoLip(500), areaPermeavelProjetada: campoLip(100), volumeDaCaixaDeRecarga: campoLip(1.0),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "400,00", 0.9, { unidade: "m²", trecho: TRECHO_MEMORIAL_400 })],
  });
  t("9e. volume projetado (1,00) abaixo do exigido (2,00) → NAO_CONFORME", volumeInsuficiente.volume.resultado === "NAO_CONFORME");

  const semDadosLip = decidirCaixaDeRecarga({ areaTerreno: CAMPO_VAZIO, areaPermeavelProjetada: CAMPO_VAZIO, volumeDaCaixaDeRecarga: CAMPO_VAZIO, fatos: [] });
  t("9f. sem nenhum dado do LIP nem do Gemini → INDETERMINADO/NAO_AVALIADO nos dois", semDadosLip.memorial.aplicabilidade === "INDETERMINADO" && semDadosLip.volume.aplicabilidade === "INDETERMINADO");

  // 9g-9i — regressão do teste histórico TESTE-HIST-44353-AN3 (2026-08-03): o Gemini se abstinha
  // porque procurava literalmente "ÁREA IMPERMEABILIZADA DO TERRENO", e a prancha real trazia o
  // mesmo valor sob o rótulo "ÁREA PERMEABILIZADA". A REGRA aqui testada não mudou uma linha — ela
  // só compara o VALOR do fato ao cálculo independente, nunca leu o rótulo. Estes testes travam o
  // CONTRATO fato→regra: um fato com rótulo ambíguo mas expressão documental visível (registrada
  // em trecho/observacao pelo prompt v2) tem que continuar decidindo igual a um fato "limpo"; e a
  // ausência de qualquer suporte documental tem que continuar virando PENDENTE, nunca CONFORME.
  const rotuloAmbiguoComExpressao = decidirCaixaDeRecarga({
    areaTerreno: campoLip(420), areaPermeavelProjetada: campoLip(63.07), volumeDaCaixaDeRecarga: campoLip(1.9),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 0.9, {
      unidade: "m²",
      documento: "projeto",
      trecho: "ÁREA PERMEABILIZADA 356,93 M²",
      observacao: "rótulo do quadro diz 'ÁREA PERMEABILIZADA', mas o mesmo quadro mostra ÁREA DO TERRENO 420,00 m² e COBERTURA VEGETAL PERMEÁVEL 63,07 m², e o valor extraído bate com a subtração dos dois",
    })],
  });
  t("9g. reprodução do caso real (420−63,07=356,93): fato com rótulo ambíguo + expressão documental na observação → item MEMORIAL fecha CONFORME", rotuloAmbiguoComExpressao.memorial.resultado === "CONFORME");
  t("9h. mesmo caso: item VOLUME também fecha CONFORME (1,90 projetado ≥ 1,78 exigido)", rotuloAmbiguoComExpressao.volume.resultado === "CONFORME");
  t("9i. a regra não filtra nem descarta a evidência pelo rótulo — o trecho e a observação do fato chegam intactos em fatosUsados", rotuloAmbiguoComExpressao.memorial.fatosUsados.some((f) => !("abstencao" in f) && f.trecho === "ÁREA PERMEABILIZADA 356,93 M²" && (f as any).observacao?.includes("ÁREA PERMEABILIZADA")));

  const semSuporteDocumental = decidirCaixaDeRecarga({
    areaTerreno: campoLip(420), areaPermeavelProjetada: campoLip(63.07), volumeDaCaixaDeRecarga: campoLip(1.9),
    fatos: [fatoAbstido("areaImpermeabilizadaMemorial", "nenhuma linha, rótulo ou expressão do quadro sustenta a área impermeabilizada — nem sob o rótulo usual, nem sob rótulo alternativo com conta visível")],
  });
  t("9j. sem trecho/expressão documental (abstenção explícita) → item MEMORIAL continua PENDENTE, requer revisão, nunca CONFORME por dedução", semSuporteDocumental.memorial.resultado === "PENDENTE" && semSuporteDocumental.memorial.requerRevisao === true);
}

secao("10 · volume usa área impermeável INDEPENDENTE, nunca o memorial divergente");
{
  const memorialSubestimado = decidirCaixaDeRecarga({
    areaTerreno: campoLip(500), areaPermeavelProjetada: campoLip(100), volumeDaCaixaDeRecarga: campoLip(1.80),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "350,00", 0.9, { unidade: "m²", trecho: "ÁREA IMPERMEABILIZADA 350,00 M²" })],
  });
  t("10a. memorial diverge (350≠400) → item MEMORIAL aponta NAO_CONFORME", memorialSubestimado.memorial.resultado === "NAO_CONFORME");
  t("10b. volume usa o exigido do cálculo INDEPENDENTE (400/200=2,00), não do memorial (350/200=1,75) — 1,80 não atende 2,00 → NAO_CONFORME", memorialSubestimado.volume.resultado === "NAO_CONFORME");
}

secao("11 · correção — resultado do VOLUME grava os campos LIP efetivamente usados");
{
  const resultado = decidirCaixaDeRecarga({
    areaTerreno: campoLip(500, "extraido"), areaPermeavelProjetada: campoLip(100, "extraido"), volumeDaCaixaDeRecarga: campoLip(2.0, "manual"),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "400,00", 0.9, { unidade: "m²", trecho: "ÁREA IMPERMEABILIZADA 400,00 M²" })],
  });
  const campos = resultado.volume.camposLip as Record<string, CampoLipCongelado>;
  t("11a. camposLip do item VOLUME não é mais {} — tem os 3 campos usados", Object.keys(campos).length === 3, JSON.stringify(campos));
  t("11b. tem areaTerreno, areaPermeavelProjetada e volumeDaCaixaDeRecarga", "areaTerreno" in campos && "areaPermeavelProjetada" in campos && "volumeDaCaixaDeRecarga" in campos);
  t("11c. cada campo preserva valor bruto, valorNormalizado e origem", campos.areaTerreno.valor === "500" && campos.areaTerreno.valorNormalizado === 500 && campos.areaTerreno.origem === "extraido");
  t("11d. origem de volumeDaCaixaDeRecarga é a que veio do processo (\"manual\"), preservada sem reinterpretar", campos.volumeDaCaixaDeRecarga.origem === "manual");
}

secao("12 · correção — valor bruto e origem do LIP preservados em campos_lip_json (não só o número)");
{
  const resultado = decidirDimensoesTerreno({ areaTerreno: campoLip(450, "extraido"), fatos: [fatoLido("area:certidao", "450,00", 0.95), ...QUATRO_DIMENSOES_IGUAIS] });
  const campo = (resultado.camposLip as any).areaTerreno as CampoLipCongelado;
  t("12a. camposLip.areaTerreno tem valor bruto (string)", campo.valor === "450");
  t("12b. camposLip.areaTerreno tem valorNormalizado (número)", campo.valorNormalizado === 450);
  t("12c. camposLip.areaTerreno preserva a origem exata do processo", campo.origem === "extraido");

  const lidoDeDados = lerCampoLip({ areaTerreno: { valor: "500,00", origem: "confirmado_analista" } }, "areaTerreno");
  t("12d. lerCampoLip lê valor e origem crus de processos.dados sem reinterpretar o vocabulário", lidoDeDados.valor === "500,00" && lidoDeDados.origem === "confirmado_analista" && lidoDeDados.valorNormalizado === 500);
  const semCampo = lerCampoLip({}, "areaTerreno");
  t("12e. campo ausente em processos.dados → os 3 valores null", semCampo.valor === null && semCampo.valorNormalizado === null && semCampo.origem === null);
}

// ─────────────────────────── 13 · comparador quadro × carimbo (experimental) ───────────────────────────

secao("13 · comparador quadro × carimbo (experimental, sem item MAC)");
{
  const okBate = compararQuadroDeAreasComCarimbo([fatoLido("quadroArea:PAVIMENTO TERREO", "200,00", 0.9), fatoLido("quadroArea:PAVIMENTO SUPERIOR", "150,00", 0.9), fatoLido("carimboAreaTotalConstruida", "350,00", 0.9)]);
  t("13a. soma do quadro bate com o carimbo → status OK", okBate.status === "OK" && okBate.somaQuadro === 350);
  const divergente = compararQuadroDeAreasComCarimbo([fatoLido("quadroArea:PAVIMENTO TERREO", "200,00", 0.9), fatoLido("carimboAreaTotalConstruida", "500,00", 0.9)]);
  t("13b. soma do quadro diverge do carimbo → status DIVERGENTE, com a diferença reportada", divergente.status === "DIVERGENTE" && divergente.divergencias.length === 1 && divergente.divergencias[0].diferencaM2 === 300);
  const semDados = compararQuadroDeAreasComCarimbo([fatoAbstido("carimboAreaTotalConstruida")]);
  t("13c. sem quadro nem carimbo suficientes → DADOS_INSUFICIENTES", semDados.status === "DADOS_INSUFICIENTES");
  t("13d. resultado nunca aponta para um mac_item_id (é experimental, sem vínculo)", !("macItemId" in okBate));
}

secao("14 · versionamento/hash do prompt · validação de PDF · isolamento do Slot 1");
{
  const h1 = hashPrompt(PROMPT_DIMENSOES_TERRENO);
  t("14a. hashPrompt é determinístico", h1 === hashPrompt(PROMPT_DIMENSOES_TERRENO) && h1.length > 0);
  t("14b. mudar o texto do prompt muda o hash", h1 !== hashPrompt({ ...PROMPT_DIMENSOES_TERRENO, texto: PROMPT_DIMENSOES_TERRENO.texto + " " }));

  const hCaixa = hashPrompt(PROMPT_CAIXA_RECARGA);
  t("14a2. hashPrompt de PROMPT_CAIXA_RECARGA também é determinístico", hCaixa === hashPrompt(PROMPT_CAIXA_RECARGA) && hCaixa.length > 0);
  t("14b2. mudar o texto de PROMPT_CAIXA_RECARGA muda o hash", hCaixa !== hashPrompt({ ...PROMPT_CAIXA_RECARGA, texto: PROMPT_CAIXA_RECARGA.texto + " " }));
  t("14b3. PROMPT_CAIXA_RECARGA está na v3 (exige número documental no trecho + distingue EXIGIDO×ATENDIDO, 2026-08-03)", PROMPT_CAIXA_RECARGA.versao === 3);
  t("14b4. o texto do prompt instrui a aceitar rótulo alternativo só com expressão documental visível", /rótulo alternativo/i.test(PROMPT_CAIXA_RECARGA.texto) && /por conta própria/i.test(PROMPT_CAIXA_RECARGA.texto));
  t("14b5. o texto do prompt mantém a instrução de abstenção quando não há suporte documental", /abstenha-se deste fato/i.test(PROMPT_CAIXA_RECARGA.texto) && /Nunca infira ou\s+calcule um/i.test(PROMPT_CAIXA_RECARGA.texto));
  t("14b6. o texto do prompt proíbe fórmula simbólica sem número como evidência", /FÓRMULA simbólica sozinha/i.test(PROMPT_CAIXA_RECARGA.texto) && /LINHA COM O\s+NÚMERO/i.test(PROMPT_CAIXA_RECARGA.texto));
  t("14b7. o texto do prompt reforça a distinção EXIGIDO × ATENDIDO/PROJETADO com autoverificação", /NÃO confunda\s+"EXIGIDO"/i.test(PROMPT_CAIXA_RECARGA.texto) && /EXATAMENTE IGUAIS/i.test(PROMPT_CAIXA_RECARGA.texto));

  const pdfValido = new TextEncoder().encode("%PDF-1.4\n%conteúdo fictício de teste");
  t("14c. PDF com assinatura/MIME/tamanho corretos → válido", validarPdf({ bytes: pdfValido, mimeDeclarado: "application/pdf", nomeArquivo: "x.pdf", tamanhoBytes: pdfValido.byteLength }).ok === true);
  const disfarçado = new TextEncoder().encode("isto não é um pdf");
  t("14d. arquivo sem assinatura %PDF- é rejeitado mesmo com MIME/nome corretos", validarPdf({ bytes: disfarçado, mimeDeclarado: "application/pdf", nomeArquivo: "x.pdf", tamanhoBytes: disfarçado.byteLength }).ok === false);
  t("14e. arquivo acima do tamanho máximo é rejeitado", validarPdf({ bytes: pdfValido, mimeDeclarado: "application/pdf", nomeArquivo: "x.pdf", tamanhoBytes: TAMANHO_MAXIMO_PDF_BYTES + 1 }).ok === false);

  const raiz = join(process.cwd(), "lib", "mac-motor", "slot5");
  const importsProibidos = [/from\s+["'].*analise-regularizacao/i, /from\s+["'].*despacho-regularizacao/i, /from\s+["'].*mac\/p3/i, /from\s+["'].*admin\/prompts/i, /\.from\(\s*["']lip_prompts["']\s*\)/i];
  function arquivosTs(dir: string): string[] {
    const out: string[] = [];
    for (const nome of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, nome.name);
      if (nome.isDirectory()) out.push(...arquivosTs(caminho));
      else if (nome.name.endsWith(".ts")) out.push(caminho);
    }
    return out;
  }
  const arquivos = [...arquivosTs(raiz), join(process.cwd(), "app", "api", "mac", "slot-05", "executar-piloto", "route.ts")];
  let achouProibido: string | null = null;
  for (const arq of arquivos) {
    const conteudo = readFileSync(arq, "utf8");
    for (const re of importsProibidos) { if (re.test(conteudo)) { achouProibido = `${arq} casa ${re}`; break; } }
    if (achouProibido) break;
  }
  t("14f. nenhum arquivo do motor (nem a rota) importa código ou consulta lip_prompts do Slot 1", achouProibido === null, achouProibido ?? "");

  const rotaConteudo = readFileSync(join(process.cwd(), "app", "api", "mac", "slot-05", "executar-piloto", "route.ts"), "utf8");
  // busca só dentro do CORPO da função (depois de "export async function POST") — o cabeçalho
  // de documentação menciona os dois termos antes, e confundiria uma busca ingênua por índice.
  const corpoDaRota = rotaConteudo.slice(rotaConteudo.indexOf("export async function POST"));
  t("14g. a rota autentica ANTES de ler o formData (usuarioDaRequisicao(req) antes de req.formData() no corpo da função)",
    corpoDaRota.indexOf("usuarioDaRequisicao(req)") < corpoDaRota.indexOf("req.formData()"));
  t("14h. a rota não aceita mais criadoPor nem valores de LIP do formulário do cliente",
    !/form\.get\(\s*["']criadoPor["']/.test(rotaConteudo) && !/form\.get\(\s*["']areaTerrenoLip["']/.test(rotaConteudo));
  t("14i. a rota usa a resolução exclusiva do Slot 5 (trio codigo+assunto_id+tipo_processo), não a genérica de lib/autorizacao",
    rotaConteudo.includes("resolverProcessoSlot5") && !rotaConteudo.includes("from \"@/lib/autorizacao\""));
}

// ─────────────────────────── 15 · integração — vinculos_bip_json, criado_por da sessão ───────────────────────────

secao("15 · integração — vinculos_bip_json persistido, criado_por da execução");
{
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: processo } = await supabase.from("processos").select("id").eq("assunto_id", ASSUNTO_ID_SLOT5).eq("tipo_processo", TIPO_PROCESSO_SLOT5).limit(1).maybeSingle();
  const { data: usuario } = await supabase.from("usuarios").select("id").limit(1).maybeSingle();

  if (!processo || !usuario) {
    console.log("  (pulado — precisa de ao menos 1 processo do Slot 5 e 1 usuário no banco; não conta como falha)");
  } else {
    let execucaoId: string | null = null;
    try {
      const resultado = await executarPilotoSlot5({
        processoId: processo.id, criadoPor: usuario.id, apiKey: "não usada — sem documentos, motor não chama o Gemini",
        areaTerreno: CAMPO_VAZIO, areaPermeavelProjetada: CAMPO_VAZIO, volumeDaCaixaDeRecarga: CAMPO_VAZIO,
        documentoCertidao: null, documentoPrancha: null,
      });
      execucaoId = resultado.execucaoId;

      const { data: exec } = await supabase.from("mac_execucoes").select("criado_por").eq("id", execucaoId).maybeSingle();
      t("15a. mac_execucoes.criado_por é exatamente o usuário informado (sessão)", exec?.criado_por === usuario.id);

      const { data: itensGravados } = await supabase.from("mac_resultados_item").select("mac_item_id, vinculos_bip_json, campos_lip_json").eq("execucao_id", execucaoId);
      t("15b. os 3 resultados foram gravados nesta execução", (itensGravados?.length ?? 0) === 3);
      const todosTemVinculo = (itensGravados ?? []).every((r: any) => Array.isArray(r.vinculos_bip_json) && r.vinculos_bip_json.length > 0);
      t("15c. vinculos_bip_json não veio vazio em nenhum dos 3 itens", todosTemVinculo, JSON.stringify((itensGravados ?? []).map((r: any) => ({ item: r.mac_item_id, n: r.vinculos_bip_json?.length }))));

      const itemVolume = (itensGravados ?? []).find((r: any) => r.mac_item_id === MAC_ITEM_CAIXA_RECARGA_VOLUME);
      t("15d. campos_lip_json do item VOLUME (persistido no banco) tem os 3 campos, não {}", !!itemVolume && Object.keys(itemVolume.campos_lip_json ?? {}).length === 3, JSON.stringify(itemVolume?.campos_lip_json));
    } finally {
      if (execucaoId) {
        await supabase.from("mac_execucoes").delete().eq("id", execucaoId);
        console.log(`  limpeza: execução de teste ${execucaoId} removida (cascata apaga resultados)`);
      }
    }
  }
}

// ─────────────────────────── 16 · integração — código de outro slot não resolve no Slot 5 ───────────────────────────

secao("16 · integração — código de um processo de OUTRO slot não é encontrado pela resolução do Slot 5");
{
  // NOTA: `processos.codigo` tem UNIQUE CONSTRAINT global (processos_codigo_unique) — confirmado
  // ao rodar este teste pela primeira vez (a tentativa de inserir dois processos de teste com o
  // mesmo código falhou com "duplicate key value violates unique constraint processos_codigo_unique").
  // Ou seja, HOJE não é possível ter duas linhas com o mesmo código em slots diferentes — o cenário
  // literal da revisão não é reproduzível via insert. O teste abaixo prova a mesma proteção pelo
  // caminho que É possível hoje: um processo REAL de outro slot, buscado pelo próprio código, tem
  // que ser IGNORADO pela resolução exclusiva do Slot 5 — isto é o que `lib/autorizacao.ts`
  // (buscando só por `codigo`) NÃO garantiria, e é exatamente o que resolverProcessoSlot5 corrige,
  // com ou sem duplicidade de fato existir no banco hoje.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: usuarioRow } = await supabase.from("usuarios").select("id, perfis, gerencia").limit(1).maybeSingle();
  const { data: procOutroSlot } = await supabase.from("processos").select("id, codigo").neq("assunto_id", ASSUNTO_ID_SLOT5).not("codigo", "is", null).limit(1).maybeSingle();
  const { data: procSlot5 } = await supabase.from("processos").select("id, codigo").eq("assunto_id", ASSUNTO_ID_SLOT5).eq("tipo_processo", TIPO_PROCESSO_SLOT5).not("codigo", "is", null).limit(1).maybeSingle();

  if (!usuarioRow || !procOutroSlot) {
    console.log("  (pulado — precisa de 1 usuário e de 1 processo real de outro slot cadastrado; não conta como falha)");
  } else {
    const perfis: string[] = usuarioRow.perfis ?? [];
    const usuario: UsuarioReq = { id: usuarioRow.id, perfis, gerencia: usuarioRow.gerencia ?? null, irrestrito: true, gerenciaDoPerfil: null };

    const resolucaoOutroSlot = await resolverProcessoSlot5(usuario, procOutroSlot.codigo);
    t("16a. código de um processo de OUTRO slot → resolverProcessoSlot5 diz \"não encontrado\" (404), não retorna o processo errado", resolucaoOutroSlot.ok === false && (resolucaoOutroSlot as any).status === 404);

    if (procSlot5) {
      const resolucaoSlot5 = await resolverProcessoSlot5(usuario, procSlot5.codigo);
      t("16b. código de um processo REAL do Slot 5 → resolverProcessoSlot5 encontra exatamente esse processo", resolucaoSlot5.ok === true && resolucaoSlot5.ok && resolucaoSlot5.processo.id === procSlot5.id);
    } else {
      console.log("  (16b pulado — nenhum processo real do Slot 5 no banco; não conta como falha)");
    }
  }
}

// ─────────────────────────── 17 · parser BR aceita unidade colada, rejeita lixo ───────────────────────────

secao("17 · parseNumeroBR aceita unidade colada (m², m, m³) e continua rejeitando lixo");
{
  t("17a. \"420,00 m²\" → 420", parseNumeroBR("420,00 m²") === 420);
  t("17b. \"15,00 m\" → 15", parseNumeroBR("15,00 m") === 15);
  t("17c. \"1,90 m³\" → 1.9", parseNumeroBR("1,90 m³") === 1.9);
  t("17d. \"356,93 M²\" (unidade maiúscula, sem espaço) → 356.93", parseNumeroBR("356,93M²") === 356.93);
  t("17e. \"1.234,56 m²\" (milhar) → 1234.56", parseNumeroBR("1.234,56 m²") === 1234.56);
  t("17f. número puro sem unidade continua funcionando (\"420,00\" → 420)", parseNumeroBR("420,00") === 420);
  t("17g. número inteiro sem vírgula continua funcionando (\"15\" → 15)", parseNumeroBR("15") === 15);

  t("17h. texto solto não vira número (\"aproximadamente 420,00 m²\") → null", parseNumeroBR("aproximadamente 420,00 m²") === null);
  t("17i. lixo textual (\"não informado\") → null", parseNumeroBR("não informado") === null);
  t("17j. vírgula ambígua/duplicada (\"12,34,56\") → null", parseNumeroBR("12,34,56") === null);
  t("17k. unidade sem número (\"m²\") → null", parseNumeroBR("m²") === null);
  t("17l. string vazia → null", parseNumeroBR("") === null);
  t("17m. unidade não reconhecida não é removida, e o resto não é um número BR válido (\"420,00 kg\") → null", parseNumeroBR("420,00 kg") === null);
}

// ─────────────────────────── 18 · guarda de evidência do memorial (v4) ───────────────────────────

secao("18 · memorial exige valor literal + rótulo/observação documental — nunca por fórmula genérica");
{
  const base = { areaTerreno: campoLip(420), areaPermeavelProjetada: campoLip(63.07), volumeDaCaixaDeRecarga: campoLip(1.9) };

  // reprodução EXATA do caso real do reteste: trecho é uma fórmula simbólica, sem nenhum dígito.
  const formulaSemNumero = decidirCaixaDeRecarga({
    ...base,
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, {
      unidade: "m²", documento: "projeto", trecho: "ÁREA IMPERMEABILIZADA (AI) = AT - ACVP", observacao: null,
    })],
  });
  t("18a. trecho é só uma fórmula simbólica, sem nenhum número → PENDENTE, nunca CONFORME por dedução", formulaSemNumero.memorial.resultado === "PENDENTE" && formulaSemNumero.memorial.requerRevisao === true);

  // trecho sem número nenhum (null) — mesmo com um valor "lido", sem trecho não há prova.
  const semTrecho = decidirCaixaDeRecarga({
    ...base,
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, { unidade: "m²", trecho: null, observacao: null })],
  });
  t("18b. sem trecho nenhum → PENDENTE", semTrecho.memorial.resultado === "PENDENTE" && semTrecho.memorial.requerRevisao === true);

  // rótulo alternativo (não contém "IMPERMEABILIZAD") com número presente, mas SEM observação
  // explicando a expressão documental — não é suficiente sozinho.
  const rotuloAlternativoSemObservacao = decidirCaixaDeRecarga({
    ...base,
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, {
      unidade: "m²", trecho: "ÁREA PERMEABILIZADA 356,93 M²", observacao: null,
    })],
  });
  t("18c. rótulo ambíguo com número, mas SEM observação explicando a expressão documental → PENDENTE", rotuloAlternativoSemObservacao.memorial.resultado === "PENDENTE" && rotuloAlternativoSemObservacao.memorial.requerRevisao === true);

  // rótulo alternativo + número + observação explicando a expressão documental → evidência
  // suficiente, decide normalmente (CONFORME, porque 420-63,07=356,93 bate).
  const rotuloAlternativoComObservacao = decidirCaixaDeRecarga({
    ...base,
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, {
      unidade: "m²", trecho: "ÁREA PERMEABILIZADA 356,93 M²",
      observacao: "rótulo do quadro diz 'ÁREA PERMEABILIZADA', mas o mesmo quadro mostra ÁREA DO TERRENO 420,00 m² e COBERTURA VEGETAL PERMEÁVEL 63,07 m², e o valor extraído bate com a subtração dos dois",
    })],
  });
  t("18d. rótulo ambíguo + número no trecho + observação documental → evidência suficiente → CONFORME", rotuloAlternativoComObservacao.memorial.resultado === "CONFORME");

  // rótulo usual ("ÁREA IMPERMEABILIZADA") com número — não precisa de observação, é o caso comum.
  const rotuloUsualComNumero = decidirCaixaDeRecarga({
    ...base,
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, { unidade: "m²", trecho: "ÁREA IMPERMEABILIZADA 356,93 M²", observacao: null })],
  });
  t("18e. rótulo usual + número no trecho, sem observação → evidência suficiente → CONFORME (rótulo usual não exige observação)", rotuloUsualComNumero.memorial.resultado === "CONFORME");

  // número no trecho não bate com o valor declarado (ex.: trecho cita outro número) — evidência
  // não corrobora o valor extraído, mesmo com rótulo usual presente.
  const trechoComNumeroDiferente = decidirCaixaDeRecarga({
    ...base,
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, { unidade: "m²", trecho: "ÁREA IMPERMEABILIZADA DO TERRENO ADJACENTE 900,00 M²", observacao: null })],
  });
  t("18f. trecho tem número, mas não bate com o valor extraído → PENDENTE (trecho não corrobora o valor)", trechoComNumeroDiferente.memorial.resultado === "PENDENTE");
}

// ─────────────────────────── 19 · cruzamento LIP × Gemini do volume PROJETADO/ATENDIDO (v4) ───────────────────────────

secao("19 · volume projetado: LIP × Gemini divergentes → REVISAO_MANUAL; fallback ao LIP é explícito");
{
  const base = { areaTerreno: campoLip(420), areaPermeavelProjetada: campoLip(63.07) };
  const trechoMemorialOk = { unidade: "m²", trecho: "ÁREA IMPERMEABILIZADA 356,93 M²", observacao: null } as const;

  // reprodução do caso real: LIP diz 1,90 (ATENDIDO real, ART), Gemini leu 1,78 (confundiu com o
  // EXIGIDO) — a versão anterior da regra IGNORAVA o Gemini e ficava CONFORME "por acidente"; agora
  // tem que travar em REVISAO_MANUAL, preservando os dois valores na justificativa/evidências.
  const divergente = decidirCaixaDeRecarga({
    ...base, volumeDaCaixaDeRecarga: campoLip(1.9),
    fatos: [
      fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, trechoMemorialOk),
      fatoLido("volumeProjetadoCarimbo", "1,78", 0.9, { unidade: "m³", trecho: "VOLUME ATENDIDO (Va) 1,78 M³" }),
    ],
  });
  t("19a. LIP 1,90 × Gemini 1,78 (divergem além da tolerância) → REVISAO_MANUAL, não CONFORME nem NAO_CONFORME silencioso", divergente.volume.resultado === "REVISAO_MANUAL" && divergente.volume.requerRevisao === true);
  t("19b. justificativa preserva os DOIS valores (LIP e Gemini)", divergente.volume.justificativa.includes("1.90") && divergente.volume.justificativa.includes("1.78"));
  t("19c. evidência do Gemini para volumeProjetadoCarimbo continua em fatosUsados (nada é descartado)", divergente.volume.fatosUsados.some((f) => !("abstencao" in f) && f.nome === "volumeProjetadoCarimbo" && f.valor === "1,78"));

  // LIP e Gemini concordam (dentro da tolerância) → decide normalmente, mas a justificativa deixa
  // registrado que houve confirmação documental.
  const concordante = decidirCaixaDeRecarga({
    ...base, volumeDaCaixaDeRecarga: campoLip(1.9),
    fatos: [
      fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, trechoMemorialOk),
      fatoLido("volumeProjetadoCarimbo", "1,90", 0.95, { unidade: "m³", trecho: "VOLUME ATENDIDO (Va) 1,90 M³" }),
    ],
  });
  t("19d. LIP 1,90 × Gemini 1,90 (concordam) → CONFORME normalmente", concordante.volume.resultado === "CONFORME");
  t("19e. justificativa registra que houve confirmação documental do Gemini", /confirmado pela leitura documental do Gemini/i.test(concordante.volume.justificativa));

  // Gemini ausente (não achou/absteve-se) × só o LIP → fallback permitido, mas TEM que constar
  // explicitamente que não houve confirmação documental — nunca se apresenta como se o motor
  // tivesse lido o carimbo.
  const fallbackLip = decidirCaixaDeRecarga({
    ...base, volumeDaCaixaDeRecarga: campoLip(1.9),
    fatos: [fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, trechoMemorialOk)], // sem volumeProjetadoCarimbo nenhum
  });
  t("19f. Gemini ausente × LIP 1,90 → decide com o LIP (fallback permitido)", fallbackLip.volume.resultado === "CONFORME");
  t("19g. justificativa deixa EXPLÍCITO que não houve confirmação documental (fallback, não confirmação)", /NÃO confirmou documentalmente/i.test(fallbackLip.volume.justificativa));
  t("19h. confiança do fallback puro nunca é ALTA, mesmo com o fato do memorial em confiança 1.0 — reflete que a leitura documental do CARIMBO não corroborou", fallbackLip.volume.confianca !== "ALTA");

  // Gemini com abstenção explícita (não com fato ausente) × LIP — mesmo comportamento de fallback.
  const geminiAbstidoExplicito = decidirCaixaDeRecarga({
    ...base, volumeDaCaixaDeRecarga: campoLip(1.9),
    fatos: [
      fatoLido("areaImpermeabilizadaMemorial", "356,93", 1, trechoMemorialOk),
      fatoAbstido("volumeProjetadoCarimbo", "linha ATENDIDO/PROJETADO não encontrada no carimbo"),
    ],
  });
  t("19i. Gemini se abstém explicitamente (não é ausência silenciosa) × LIP → mesmo fallback explícito", geminiAbstidoExplicito.volume.resultado === "CONFORME" && /NÃO confirmou documentalmente/i.test(geminiAbstidoExplicito.volume.justificativa));
}

// ─────────────────────────── resultado ───────────────────────────

console.log(falhas === 0 ? "\ntodos passaram" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
