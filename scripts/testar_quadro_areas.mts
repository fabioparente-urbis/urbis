/**
 * scripts/testar_quadro_areas.mts — a Receita "quadro de áreas completo" (preparada na Fase K,
 * 03/09/2026; conectada ao catálogo — ainda desativada — na Fase O, 04/09/2026). Só fixture
 * sintética — sem PDF real, sem Gemini, sem dado pessoal. Esta receita ESTÁ em `RECEITAS`
 * (lib/visao/receitas.ts) desde a Fase O, mas com `ativa: false`: não há caminho real pra
 * exercitar contra documento de verdade ainda, de propósito — ver CHECKLIST_ATIVACAO_VISAO em
 * lib/visao/quadroAreas.ts pro que falta pra isso mudar.
 *
 *   npx tsx scripts/testar_quadro_areas.mts
 */

import {
  QUADRO_AREAS_COMPLETO,
  CHAVES_QUADRO_AREAS,
  interpretarRespostaQuadroAreas,
  fecharQuadroAreas,
  precisaConferenciaHumana,
  camposAusentesOuIlegiveis,
  type InterpretacaoQuadroAreas,
} from "../lib/visao/quadroAreas";
import {
  compararComLip,
  compararComMac,
  compararComDocumento,
  compararCampoDoQuadro,
} from "../lib/visao/quadroAreasComparacao";
import { RECEITAS } from "../lib/visao/receitas";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const interp = (texto: string): InterpretacaoQuadroAreas => {
  const r = interpretarRespostaQuadroAreas(texto);
  return { ...r, unidade: "m²", bruto: texto, custoIA: 0, msRecorte: 0, msModelo: 0, reaproveitada: false };
};

// ─────────────────────────────────────────────────────────────────────────────
secao("0 · no catálogo, mas desligada — NÃO executa Gemini na próxima leitura de pasta");
{
  t("QUADRO_AREAS_COMPLETO está em RECEITAS (Fase O: conectada ao catálogo)",
    RECEITAS.some((r) => r.id === QUADRO_AREAS_COMPLETO.id));
  t("mas com ativa:false (executarVisao pula antes de checar orçamento ou chamar o modelo)",
    QUADRO_AREAS_COMPLETO.ativa === false);
  t("papel é \"projeto\" (mesma família das outras 2 receitas de prancha)",
    QUADRO_AREAS_COMPLETO.papel === "projeto");
  t("declara os 6 campos escalares esperados", QUADRO_AREAS_COMPLETO.chaves.length === 6);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · caminho feliz — quadro completo, com pavimentos");
{
  const RESPOSTA_BOA = JSON.stringify({
    campos: {
      tipoQuadroIdentificado: { valor: "quadro_de_areas", confianca: 0.95 },
      areaTerreno: { valor: "450,00", confianca: 0.95 },
      areaConstruidaTotal: { valor: "320,50", confianca: 0.9 },
      areaPermeavel: { valor: "170,00", confianca: 0.9 },
      areaImpermeavel: { valor: "280,00", confianca: 0.85 },
      areaARegularizar: { abstencao: true, motivo: "projeto não é de regularização" },
    },
    areasPorPavimento: [
      { pavimento: "Térreo", valor: "160,25", confianca: 0.9 },
      { pavimento: "1º Pavimento", valor: "160,25", confianca: 0.9 },
    ],
    textoBrutoEvidencia: "QUADRO DE ÁREAS — TERRENO 450,00 m² ...",
  });

  const r = interp(RESPOSTA_BOA);
  t("tipoQuadroIdentificado lido", r.porCampo.tipoQuadroIdentificado.ok === true
    && r.porCampo.tipoQuadroIdentificado.ok && r.porCampo.tipoQuadroIdentificado.valor === "quadro_de_areas");
  t("areaTerreno lida", r.porCampo.areaTerreno.ok === true && (r.porCampo.areaTerreno as any).valor === "450,00");
  t("areaARegularizar respeitou a abstenção do modelo (projeto não é de regularização)",
    r.porCampo.areaARegularizar.ok === false);
  t("2 linhas de pavimento lidas, na ordem", r.areasPorPavimento.length === 2
    && r.areasPorPavimento[0].pavimento === "Térreo" && r.areasPorPavimento[1].pavimento === "1º Pavimento");
  t("texto bruto de evidência preservado", r.textoBrutoEvidencia.includes("QUADRO DE ÁREAS"));

  const fechado = fecharQuadroAreas(r, { pagina: 0, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.3, alvoPx: 1600 });
  t("necessitaConferenciaHumana = true por causa da abstenção em areaARegularizar (mesmo o resto lido)",
    fechado.necessitaConferenciaHumana === true,
    "abstenção em QUALQUER campo (mesmo opcional) pede conferência — regra conservadora de propósito");
  t("camposAusentesOuIlegiveis lista só o que faltou",
    fechado.camposAusentesOuIlegiveis.length === 1 && fechado.camposAusentesOuIlegiveis[0] === "areaARegularizar");
  t("região preservada no contrato final", fechado.regiao?.pagina === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · quadro totalmente legível e sem pavimentos declarados (não inventa linha)");
{
  const RESPOSTA_SEM_PAVIMENTO = JSON.stringify({
    campos: {
      tipoQuadroIdentificado: { valor: "quadro_de_areas", confianca: 0.95 },
      areaTerreno: { valor: "450,00", confianca: 0.95 },
      areaConstruidaTotal: { valor: "320,50", confianca: 0.95 },
      areaPermeavel: { valor: "170,00", confianca: 0.95 },
      areaImpermeavel: { valor: "280,00", confianca: 0.95 },
      areaARegularizar: { abstencao: true, motivo: "projeto não é de regularização" },
    },
    areasPorPavimento: [],
    textoBrutoEvidencia: "QUADRO DE ÁREAS — sem discriminação por pavimento",
  });
  const r = interp(RESPOSTA_SEM_PAVIMENTO);
  t("lista de pavimentos vazia é aceita, não é erro", r.areasPorPavimento.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · quadro não localizado — contrato explícito de \"não localizado\"");
{
  const fechado = fecharQuadroAreas(null, null, "nenhuma página trazia quadro de área reconhecível");
  t("regiao é null", fechado.regiao === null);
  t("todos os 6 campos ficam ausentes", fechado.camposAusentesOuIlegiveis.length === 6);
  t("necessitaConferenciaHumana = true", fechado.necessitaConferenciaHumana === true);
  t("motivo do não-localizado é preservado",
    fechado.porCampo.tipoQuadroIdentificado.ok === false
    && (fechado.porCampo.tipoQuadroIdentificado as any).motivo.includes("nenhuma página"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · ambíguo — quadro parcial, modelo se abstém de tudo por instrução do prompt");
{
  const RESPOSTA_AMBIGUA = JSON.stringify({
    campos: {
      tipoQuadroIdentificado: { valor: "ambiguo", confianca: 0.4 },
      areaTerreno: { abstencao: true, motivo: "quadro cortado no recorte" },
      areaConstruidaTotal: { abstencao: true, motivo: "quadro cortado no recorte" },
      areaPermeavel: { abstencao: true, motivo: "quadro cortado no recorte" },
      areaImpermeavel: { abstencao: true, motivo: "quadro cortado no recorte" },
      areaARegularizar: { abstencao: true, motivo: "quadro cortado no recorte" },
    },
    areasPorPavimento: [],
    textoBrutoEvidencia: "",
  });
  const r = interp(RESPOSTA_AMBIGUA);
  t("tipoQuadroIdentificado = ambiguo é aceito pelo validador", r.porCampo.tipoQuadroIdentificado.ok === true);
  const fechado = fecharQuadroAreas(r, { pagina: 2, x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: 1600 });
  t("necessitaConferenciaHumana = true (ambíguo + tudo abstido)", fechado.necessitaConferenciaHumana === true);
  t("5 dos 6 campos ausentes (só o tipo foi classificado)", fechado.camposAusentesOuIlegiveis.length === 5);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · validação — nunca inventa área fora de faixa plausível ou tipo fora do vocabulário");
{
  const validador = QUADRO_AREAS_COMPLETO.validadores.areaTerreno;
  t("área negativa/zero recusada", validador("0")?.ok === false);
  t("área absurda (gleba, não lote) recusada", validador("999999")?.ok === false);
  t("texto no lugar de número recusado", validador("quatrocentos")?.ok === false);
  t("formato com milhar aceito", validador("1.234,50")?.ok === true);

  const validadorTipo = QUADRO_AREAS_COMPLETO.validadores.tipoQuadroIdentificado;
  t("tipo fora do vocabulário fechado é recusado", validadorTipo("quadro_qualquer")?.ok === false);
  t("\"nao_localizado\" NÃO é um valor válido do vocabulário do modelo",
    validadorTipo("nao_localizado")?.ok === false,
    "não localizado é ausência de leitura (ok:false + motivo), nunca um valor 'encontrado' — ver fecharQuadroAreas(null, ...)");
  for (const tipo of ["quadro_de_areas", "memorial_de_calculo", "tabela_mista", "ambiguo"]) {
    t(`"${tipo}" é aceito`, validadorTipo(tipo)?.ok === true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · resposta corrompida/vazia nunca lança, sempre vira abstenção total");
{
  t("texto não-JSON não lança", (() => { interpretarRespostaQuadroAreas("desculpe, não consigo"); return true; })());
  const r1 = interp("não é json");
  t("e os 6 campos ficam ausentes", CHAVES_QUADRO_AREAS.every((c) => r1.porCampo[c].ok === false));
  const r2 = interp("");
  t("resposta vazia idem", CHAVES_QUADRO_AREAS.every((c) => r2.porCampo[c].ok === false));
  const r3 = interp('{"abstencao": true, "motivo": "quadro não está neste recorte"}');
  t("abstenção GLOBAL explícita também derruba os 6", CHAVES_QUADRO_AREAS.every((c) => r3.porCampo[c].ok === false));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · confiança baixa pede conferência mesmo com leitura \"ok\"");
{
  const RESPOSTA_BAIXA_CONFIANCA = JSON.stringify({
    campos: {
      tipoQuadroIdentificado: { valor: "quadro_de_areas", confianca: 0.95 },
      areaTerreno: { valor: "450,00", confianca: 0.5 }, // abaixo do piso
      areaConstruidaTotal: { valor: "320,50", confianca: 0.95 },
      areaPermeavel: { valor: "170,00", confianca: 0.95 },
      areaImpermeavel: { valor: "280,00", confianca: 0.95 },
      areaARegularizar: { valor: "50,00", confianca: 0.95 },
    },
    areasPorPavimento: [],
    textoBrutoEvidencia: "x",
  });
  const r = interp(RESPOSTA_BAIXA_CONFIANCA);
  t("todos os campos vieram \"ok\"", Object.values(r.porCampo).every((c) => c.ok === true));
  t("mesmo assim, precisaConferenciaHumana = true por causa da confiança baixa em 1 campo",
    precisaConferenciaHumana(r.porCampo, r.areasPorPavimento) === true);
  t("camposAusentesOuIlegiveis fica vazio (não é ausência, é confiança — informação diferente)",
    camposAusentesOuIlegiveis(r.porCampo, r.areasPorPavimento).length === 0,
    "necessitaConferenciaHumana e camposAusentesOuIlegiveis respondem perguntas diferentes de propósito");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("8 · linha de pavimento também é validada e abstida individualmente");
{
  const RESPOSTA_PAVIMENTO_RUIM = JSON.stringify({
    campos: {
      tipoQuadroIdentificado: { valor: "quadro_de_areas", confianca: 0.9 },
      areaTerreno: { valor: "450,00", confianca: 0.9 },
      areaConstruidaTotal: { valor: "320,50", confianca: 0.9 },
      areaPermeavel: { valor: "170,00", confianca: 0.9 },
      areaImpermeavel: { valor: "280,00", confianca: 0.9 },
      areaARegularizar: { abstencao: true, motivo: "não é regularização" },
    },
    areasPorPavimento: [
      { pavimento: "Térreo", valor: "160,25", confianca: 0.9 },
      { pavimento: "1º Pavimento", valor: "não legível", confianca: 0.9 }, // valor inválido
      { pavimento: "Cobertura", abstencao: true, motivo: "linha cortada" },
    ],
    textoBrutoEvidencia: "x",
  });
  const r = interp(RESPOSTA_PAVIMENTO_RUIM);
  t("3 linhas de pavimento chegaram", r.areasPorPavimento.length === 3);
  t("Térreo ok", r.areasPorPavimento[0].area.ok === true);
  t("1º Pavimento com valor inválido vira abstenção (não texto solto)", r.areasPorPavimento[1].area.ok === false);
  t("Cobertura respeitou abstenção explícita do modelo", r.areasPorPavimento[2].area.ok === false);
  const fechado = fecharQuadroAreas(r, { pagina: 0, x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: 1600 });
  t("camposAusentesOuIlegiveis identifica a linha de pavimento pelo rótulo",
    fechado.camposAusentesOuIlegiveis.includes("pavimento:1º Pavimento")
    && fechado.camposAusentesOuIlegiveis.includes("pavimento:Cobertura"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("9 · comparador — sem tolerância implícita, mesma regra de compararValores");
{
  const quadro = fecharQuadroAreas(interp(JSON.stringify({
    campos: {
      tipoQuadroIdentificado: { valor: "quadro_de_areas", confianca: 0.95 },
      areaTerreno: { valor: "450,00", confianca: 0.95 },
      areaConstruidaTotal: { valor: "320,50", confianca: 0.95 },
      areaPermeavel: { valor: "170,00", confianca: 0.95 },
      areaImpermeavel: { valor: "280,00", confianca: 0.95 },
      areaARegularizar: { abstencao: true, motivo: "n/a" },
    },
    areasPorPavimento: [], textoBrutoEvidencia: "x",
  })), { pagina: 0, x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: 1600 });

  const comLipIgual = compararComLip(quadro, { areaTerreno: { valor: "450,00", fonte: "processos.dados" } });
  t("mesmo valor (formato BR idêntico) = consistente", comLipIgual[0]?.resultado === "consistente");

  const comLipDiferentePorPouco = compararComLip(quadro, { areaTerreno: { valor: "450,01", fonte: "processos.dados" } });
  t("0,01 m² de diferença já é divergência — SEM tolerância implícita",
    comLipDiferentePorPouco[0]?.resultado === "possivel_divergencia");

  const comLipAusente = compararComLip(quadro, {});
  t("sem correspondência declarada não compara nada (não inventa vínculo)", comLipAusente.length === 0);

  const comLipCampoAbstido = compararComLip(quadro, { areaARegularizar: { valor: "100,00", fonte: "processos.dados" } });
  t("campo que o modelo se absteve vira dado_ausente na comparação, nunca 'consistente'",
    comLipCampoAbstido[0]?.resultado === "dado_ausente");

  const comDocumento = compararComDocumento(quadro, { areaConstruidaTotal: { valor: "320,50", fonte: "mhd_resultados_campo" } });
  t("comparação com documento usa a mesma mecânica", comDocumento[0]?.resultado === "consistente");

  const comMacSemFonte = compararComMac(quadro, {});
  t("comparação com MAC preparada mas sem fonte real ainda devolve vazio, não inventa", comMacSemFonte.length === 0);

  const direto = compararCampoDoQuadro("areaTerreno", quadro.porCampo.areaTerreno,
    { valor: "450,00", fonte: "teste" }, "leitura_visual_x_lip");
  t("função central acessível diretamente, mesmo resultado", direto.resultado === "consistente");
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
