/**
 * scripts/testar_fase_ab_contrato.mts — Fase AB da Inteligência URBIS (04/09/2026): contrato de
 * resposta do Co-Analista com evidência verificável. Bateria pedida pelo Fábio:
 *   1. resposta contextualizada por slot/processo
 *   2. fonte humana sem UUID
 *   3. ausência de fonte → base insuficiente
 *   4. área construída × terreno bloqueada (redundante com testar_catalogo_semantico.mts —
 *      confirmado de novo aqui porque é regra que o CONTRATO desta fase depende de continuar
 *      valendo)
 *   5. troca de processo não reaproveita fonte anterior
 *
 * Só a camada determinística/pura (lib/urbi/contratoResposta.ts, lib/urbi/manifestoFontes.ts) +
 * checagem estrutural por leitura de arquivo (mesmo método do teste 7 de
 * scripts/testar_coanalista_fase_r.mts) pra confirmar que o texto novo está de fato ligado nos
 * arquivos certos. Não chama Gemini, não abre o navegador, não altera nada.
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase_ab_contrato.mts
 */
import { readFileSync } from "node:fs";
import { blocoContratoResposta, nomeHumanoDoSlot } from "../lib/urbi/contratoResposta";
import { montarManifestoFontes, type EntradaManifesto } from "../lib/urbi/manifestoFontes";
import { compararPorSemantica, type CampoParaComparar } from "../lib/urbi/cruzamento";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);
const PADRAO_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const ENTRADA_VAZIA: EntradaManifesto = {
  codigo: "25.5.000016900-4", slot: "aceite_sei", nomeSlot: "Aceite SEI",
  camposTecnicos: 0, camposVazios: 0, camposEmX: 0,
  historicoLipTotal: 0, historicoLipMostrado: 0,
  numeroAnalises: 0, numeroUltimaAnalise: null,
  pendenciasTotal: 0, pendenciasMostradas: 0,
  itensEmBrancoTotal: 0, itensEmBrancoMostrados: 0, itensChecklistTotal: 0,
  evolucaoCorrigidosTotal: 0, evolucaoCorrigidosMostrados: 0,
  evolucaoVoltaramTotal: 0, evolucaoVoltaramMostrados: 0,
  evolucaoMantidosTotal: 0, evolucaoMantidosMostrados: 0,
  cruzamentosTotal: 0, cruzamentosMostrados: 0,
  referenciasBip: [],
  documentosEmitidos: 0, documentosMhd: 0,
  coberturaCompleta: true, fontesIndisponiveis: [],
};

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · resposta contextualizada por slot/processo");
{
  const bloco = blocoContratoResposta("25.5.000046759-5", "Regularização SEI");
  t("contrato abre exigindo a linha 'Processo analisado: <código> — <slot>'", bloco.includes('Processo analisado: 25.5.000046759-5 — Regularização SEI'));
  t("contrato exige seção 'Fatos do dossiê:'", bloco.includes("Fatos do dossiê:"));
  t("contrato exige seção 'Vale conferir:'", bloco.includes("Vale conferir:"));
  t("contrato exige seção 'Base insuficiente:'", bloco.includes("Base insuficiente:"));
  // Fase AE (04/09/2026): "Fontes consultadas" deixou de ser uma seção que o MODELO escreve —
  // virou uma seção montada em código (ver scripts/testar_fase_ae_fontes_canonicas.mts) e o
  // contrato agora instrui o modelo a NÃO escrevê-la. A garantia de que ela aparece pro
  // analista está no backend (route.ts sempre anexa), não mais numa exigência de prompt.
  t('contrato menciona "Fontes consultadas" (agora pra dizer que o modelo NÃO deve escrevê-la)', bloco.includes("Fontes consultadas"));

  // Slot muda → texto muda junto (não é um template fixo que ignora o argumento).
  const blocoOutroSlot = blocoContratoResposta("48533", "Aprovação de Projeto");
  t("mesmo template, processo/slot diferentes → texto realmente diferente", bloco !== blocoOutroSlot);
  t("nomeHumanoDoSlot cobre os 3 slots reais", nomeHumanoDoSlot("regularizacao") === "Regularização SEI" && nomeHumanoDoSlot("aceite_sei") === "Aceite SEI" && nomeHumanoDoSlot("slot_05") === "Aprovação de Projeto");
  t("nomeHumanoDoSlot nunca inventa nome pra slot desconhecido", nomeHumanoDoSlot("slot_99") === "slot não identificado" && nomeHumanoDoSlot(null) === "slot não identificado");

  const manifesto = montarManifestoFontes({ ...ENTRADA_VAZIA, codigo: "25.5.000046759-5", slot: "regularizacao", nomeSlot: "Regularização SEI", camposTecnicos: 5 });
  t("manifesto ecoa o código do processo pedido", manifesto.processo === "25.5.000046759-5");
  t("manifesto ecoa o slot pedido", manifesto.slot === "regularizacao" && manifesto.nome_slot === "Regularização SEI");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · fonte humana sem UUID");
{
  const manifesto = montarManifestoFontes({
    ...ENTRADA_VAZIA,
    camposTecnicos: 8, camposVazios: 2, camposEmX: 1,
    historicoLipTotal: 3, historicoLipMostrado: 3,
    numeroAnalises: 2, numeroUltimaAnalise: 2,
    pendenciasTotal: 25, pendenciasMostradas: 20,
    itensEmBrancoTotal: 4, itensEmBrancoMostrados: 4, itensChecklistTotal: 55,
    evolucaoCorrigidosTotal: 1, evolucaoCorrigidosMostrados: 1,
    evolucaoVoltaramTotal: 1, evolucaoVoltaramMostrados: 1,
    evolucaoMantidosTotal: 2, evolucaoMantidosMostrados: 2,
    cruzamentosTotal: 3, cruzamentosMostrados: 3,
    referenciasBip: ["Lei Complementar nº 171/2007, art. 12", "Decreto nº 500, art. 3º"],
    documentosEmitidos: 4, documentosMhd: 6,
  });
  t("manifesto gerou fontes (não veio vazio com entrada preenchida)", manifesto.fontes.length > 0);
  for (const f of manifesto.fontes) {
    t(`[${f.tipo}] detalhe sem padrão de UUID`, !PADRAO_UUID.test(f.detalhe), f.detalhe);
    t(`[${f.tipo}] detalhe não cita 'item_id'/'chave_lip'/tabela crua`, !/item_id|chave_lip|mac_checklist_itens|processos\.dados/i.test(f.detalhe), f.detalhe);
  }
  const tipos = manifesto.fontes.map((f) => f.tipo);
  t("tipos de fonte são só categorias humanas (LIP/MAC/BIP/Documentos/Cruzamento)", tipos.every((tp) => /^(LIP|MAC|BIP|Documentos|Cruzamento)/.test(tp)), tipos.join(", "));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · ausência de fonte → base insuficiente");
{
  const manifesto = montarManifestoFontes(ENTRADA_VAZIA);
  t("dossiê sem nenhum dado real → manifesto de fontes vazio (nada a mostrar, não inventa fonte)", manifesto.fontes.length === 0);
  t("cobertura_completa reflete o que foi passado", manifesto.cobertura_completa === true);

  const manifestoIncompleto = montarManifestoFontes({ ...ENTRADA_VAZIA, coberturaCompleta: false, fontesIndisponiveis: ["mdp: timeout", "recorte cortado por limite de contexto"] });
  t("cobertura incompleta reportada como tal (nunca escondida)", manifestoIncompleto.cobertura_completa === false);
  t("fontes_indisponiveis preservadas pro analista conferir o que faltou", manifestoIncompleto.fontes_indisponiveis.length === 2);

  const bloco = blocoContratoResposta("25.5.000016900-4", "Aceite SEI");
  t("contrato instrui explicitamente a nunca omitir 'Base insuficiente' quando faltar dado", /nunca omita esta seção/i.test(bloco));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · área construída × terreno continua bloqueada (regra da Fase AA, exigida por esta Fase AB)");
{
  const areaConstruida: CampoParaComparar = { slot: "slot_05", chave: "areaTotal", valor: "2768,01", fonte: "processos.dados" };
  const areaTerreno: CampoParaComparar = { slot: "slot_05", chave: "areaTerreno", valor: "810,00", fonte: "processos.dados" };
  const r = compararPorSemantica(areaConstruida, areaTerreno);
  t("continua nao_aplicavel (nunca possivel_divergencia só por construída > terreno)", r.resultado === "nao_aplicavel", r.resultado);

  const codigo = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  t("prompt ainda proíbe inferir ocupação do lote a partir de área construída total", codigo.includes("NUNCA infira que"));
  t("prompt ainda proíbe tratar item em branco como reprovação", /NUNCA trate um item em branco como reprovado/i.test(codigo));
  t("prompt injeta o CONTRATO DE RESPOSTA (blocoContratoResposta) no bloco Co-Analista", codigo.includes("blocoContratoResposta(codigoLimpo, dossie.nomeSlot)"));
  t("manifesto de fontes é calculado a partir do MESMO recorte (não do dossiê bruto)", codigo.includes("montarManifestoFontes({"));
  t("resposta ao cliente devolve fontes do manifesto (dossie.manifesto.fontes)", codigo.includes("fontes: dossie.manifesto.fontes"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · troca de processo não reaproveita fonte anterior");
{
  const codigo = readFileSync(new URL("../components/urbi/UrbiChat.tsx", import.meta.url), "utf-8");
  const idxEffect = codigo.indexOf("useEffect(() => {\n    setMsgsBip([]); setHistoryBip([]);");
  t("useEffect que zera as duas conversas ao trocar de processo continua presente", idxEffect > -1);
  t("o efeito depende de [processoCodigo] (dispara em toda troca, inclusive pra/de null)", codigo.includes("}, [processoCodigo]);"));
  // Zerar `msgs` (o array inteiro) implicitamente descarta qualquer `fontesDossie` anexada a
  // mensagem antiga — não existe um caminho que preserve `fontesDossie` isolado do array de msgs.
  t("Msg carrega fontesDossie só por mensagem (não em estado solto que sobreviveria ao reset)", codigo.includes("fontesDossie?: FonteDossie[];"));
  const chamadasSessionStorage = [...codigo.matchAll(/sessionStorage\.\w+\([^)]*\)/g)].map((m) => m[0]);
  t("estado de UI (fontesAbertasIndice) não persiste em storage — reseta com o componente", chamadasSessionStorage.every((c) => !c.includes("fontesAbertasIndice")), chamadasSessionStorage.join(" | "));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
