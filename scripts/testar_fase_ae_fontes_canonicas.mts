/**
 * scripts/testar_fase_ae_fontes_canonicas.mts — Fase AE (04/09/2026): 2º reteste da Etapa 1 do
 * piloto achou mais 3 defeitos reais:
 *   1. "Fontes consultadas" ainda vazava identificador técnico, só que em formato novo
 *      ("Processo — codigo", "MAC — ultima_analise.status") — o sanitizador por padrão
 *      (Fase AD) não bastou porque o padrão de vazamento mudou de novo.
 *   2. "área construída total" foi usado pra um valor de Regularização que não é área
 *      construída (é a MESMA área a regularizar, exposta 2x — uma com rótulo certo, outra
 *      (processo.area_construida) sem rótulo nenhum).
 *   3. A resposta dizia "4 de 86 campos vazios" enquanto o manifesto dizia "0 vazios" —
 *      duas fontes de verdade divergentes (na real, um bug de tipo: campos_vazios era um
 *      ARRAY de chaves, não uma contagem).
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase_ae_fontes_canonicas.mts
 */
import { readFileSync } from "node:fs";
import { montarFontesConsultadas, textoFontesConsultadas, removerSecaoFontesConsultadas } from "../lib/urbi/fontesConsultadas";
import { montarDossieFactual } from "../lib/urbi/montarDossie";
import { montarManifestoFontes } from "../lib/urbi/manifestoFontes";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);
const PADRAO_CAMINHO_OU_CHAVE_CRUA = /\b(?:processo|situacoes|lip|mac|fluxo|cruzamentos|tecnico|cobertura)\.[a-zA-Z0-9_.]+\b|ultima_analise\.status|campos_vazios\b|\bcodigo\b(?!\s*—)/;

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · truncar a seção 'Fontes consultadas' do Gemini, qualquer formato real observado");
{
  // Formato real da 1ª pergunta retestada (heading h3, sem negrito).
  const texto1 = `Processo analisado: X — Y\n\n### Fatos do dossiê:\n- fato 1.\n\n### Fontes consultadas:\n\nProcesso — codigo\nMAC — ultima_analise.status`;
  const limpo1 = removerSecaoFontesConsultadas(texto1);
  t("trunca a partir do heading '### Fontes consultadas:'", !limpo1.includes("Fontes consultadas") && !limpo1.includes("Processo — codigo"));
  t("preserva o conteúdo anterior intacto", limpo1.includes("### Fatos do dossiê:") && limpo1.includes("- fato 1."));

  // Formato real da 2ª pergunta retestada (negrito, sem heading h3).
  const texto2 = `Processo analisado: X — Y\n\n**Fatos do dossiê:**\n- fato 1.\n\n**Fontes consultadas:**\n\nProcesso — codigo\nLIP — campos_vazios`;
  const limpo2 = removerSecaoFontesConsultadas(texto2);
  t("trunca a partir do heading '**Fontes consultadas:**' (negrito, sem #)", !limpo2.includes("Fontes consultadas") && !limpo2.includes("LIP — campos_vazios"));
  t("preserva o conteúdo anterior intacto (negrito)", limpo2.includes("**Fatos do dossiê:**"));

  // Sem seção nenhuma — não deve mexer em nada.
  const texto3 = "Processo analisado: X — Y\n\n### Fatos do dossiê:\n- fato 1.";
  t("texto sem a seção passa intacto", removerSecaoFontesConsultadas(texto3) === texto3);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · lista de fontes montada em código — zero identificador técnico, mesmo padrão do achado real");
{
  const recorteFicticio = {
    processo: { codigo: "X", assunto: "Regularização", tipo_processo: "regularizacao", porte: "GP", criado_em: "2026-01-01" },
    situacoes: { geral: { classe: "x" }, lip: { classe: "Incompleto", motivo: "4 de 86..." }, mac: { classe: "x" } },
    lip: {
      campos_tecnicos: { bairro: { valor: "SETOR BUENO", fonte: null, origem: null, rotulo: "Bairro" }, areaTotal: { valor: "2768,01", fonte: null, origem: null, rotulo: "Área a ser Regularizada TOTAL" } },
      campos_vazios_rotulos: ["Área Impermeável"], campos_em_x_rotulos: [],
      incoerencias: [], historico_alteracoes: [],
    },
    mac: {
      ultima_analise: { status: "arquivado" }, resumo_ultima_analise: { em_branco: 55 },
      pendencias_ultima_analise: [{ item_id: "abc", texto: "Apresentar laudo", vinculos_bip: [{ referencia: "Art. 5º", trecho: "x", confianca_vinculo: "ALTA" }] }],
      itens_em_branco: [], itens_relacionados_pergunta: [],
      evolucao: { itens_corrigidos: [], itens_voltaram_nao_conforme: [], itens_pendentes_mantidos: [] },
    },
    fluxo: { documentos_emitidos: [{ numero_analise: 1, tipo: "despacho", numero: "123" }], documentos_mhd: [{ rotulo: "ART de Levantamento" }] },
    cruzamentos: [{ tipo: "lip_x_documento", chave: "Área do Terreno", resultado: "possivel_divergencia", motivo: "x", regra: "x" }],
  };
  const itens = montarFontesConsultadas(recorteFicticio);
  t("gerou itens (não veio vazio com recorte preenchido)", itens.length > 0);
  for (const i of itens) {
    t(`[${i.categoria} — ${i.rotulo}] sem caminho técnico/chave crua`, !PADRAO_CAMINHO_OU_CHAVE_CRUA.test(`${i.categoria}.${i.rotulo}`) && !PADRAO_CAMINHO_OU_CHAVE_CRUA.test(i.rotulo), `${i.categoria} — ${i.rotulo}`);
  }
  t('inclui "Processo — Código" (nunca "Processo — codigo")', itens.some((i) => i.categoria === "Processo" && i.rotulo === "Código"));
  t('inclui "MAC — Situação da última análise" (nunca "MAC — ultima_analise.status")', itens.some((i) => i.categoria === "MAC" && i.rotulo === "Situação da última análise"));
  t('inclui "LIP — Bairro" (rótulo real do campo técnico)', itens.some((i) => i.categoria === "LIP" && i.rotulo === "Bairro"));
  t('inclui "BIP — Art. 5º" (referência extraída do vínculo dentro da pendência)', itens.some((i) => i.categoria === "BIP" && i.rotulo === "Art. 5º"));
  t('inclui "Documento — Despacho nº 123"', itens.some((i) => i.categoria === "Documento" && i.rotulo === "Despacho nº 123"));
  t('inclui "Cruzamento — Área do Terreno" (chave já é rótulo humano)', itens.some((i) => i.categoria === "Cruzamento" && i.rotulo === "Área do Terreno"));

  const texto = textoFontesConsultadas(recorteFicticio);
  t('texto final abre com "Fontes consultadas:"', texto.startsWith("Fontes consultadas:"));
  t("texto final não tem parênteses (formato Categoria — Rótulo puro)", !texto.includes("("));

  const semNadaCitavel = textoFontesConsultadas({ processo: {}, situacoes: {}, lip: {}, mac: {}, fluxo: {}, cruzamentos: [] });
  t("recorte sem nada citável ainda produz a seção (nunca omite), dizendo isso explicitamente", semNadaCitavel.includes("Nenhuma fonte específica"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · contagem canônica única — contra o processo real do piloto (25.5.000046759-5)");
{
  const USUARIO_ADMIN = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;
  const r = await montarDossieFactual("25.5.000046759-5", USUARIO_ADMIN);
  if (!r.ok) { t("processo carregou", false, r.erro); }
  else {
    const d = r.data as any;
    t("lip.campos_vazios é NÚMERO (não array)", typeof d.lip.campos_vazios === "number", JSON.stringify(d.lip.campos_vazios));
    t("lip.campos_em_x é NÚMERO (não array)", typeof d.lip.campos_em_x === "number");
    t("lip.campos_totais existe e é número", typeof d.lip.campos_totais === "number" && d.lip.campos_totais > 0);
    // A MESMA fonte que classifica situacoes.lip agora também alimenta lip.campos_vazios/totais —
    // as duas frases (uma vinda de "vw_bdi_campos_criticos", outra do número exposto ao modelo)
    // têm que concordar SEMPRE, por construção (nunca mais duas contas separadas).
    const motivoSituacao: string = d.situacoes.lip.motivo;
    const bateComSituacao = motivoSituacao.includes(`${d.lip.campos_vazios} de ${d.lip.campos_totais}`) || d.lip.campos_vazios === 0;
    t("lip.campos_vazios/campos_totais concordam com situacoes.lip.motivo (fonte única, nunca diverge)", bateComSituacao, `motivo="${motivoSituacao}" vazios=${d.lip.campos_vazios} totais=${d.lip.campos_totais}`);
    t("campos_vazios_rotulos é lista de rótulo humano (nunca chave crua tipo 'artCx')", Array.isArray(d.lip.campos_vazios_rotulos) && d.lip.campos_vazios_rotulos.every((r: string) => !/^[a-z][a-zA-Z0-9]*$/.test(r) || r === "Campo sem rótulo cadastrado"), JSON.stringify(d.lip.campos_vazios_rotulos));

    // O manifesto (Fase AB) lia os mesmos campos com Number(array)||0 — sempre 0 antes desta
    // correção, independente do valor real. Agora que são números de verdade, tem que refletir.
    const manifesto = montarManifestoFontes({
      codigo: "25.5.000046759-5", slot: "regularizacao", nomeSlot: "Regularização SEI",
      camposTecnicos: Object.keys(d.lip.campos_tecnicos ?? {}).length,
      camposVazios: Number(d.lip.campos_vazios) || 0, camposEmX: Number(d.lip.campos_em_x) || 0,
      historicoLipTotal: 0, historicoLipMostrado: 0,
      numeroAnalises: d.mac.numero_analises, numeroUltimaAnalise: d.mac.ultima_analise?.numero_analise ?? null,
      pendenciasTotal: 0, pendenciasMostradas: 0, itensEmBrancoTotal: 0, itensEmBrancoMostrados: 0, itensChecklistTotal: 0,
      evolucaoCorrigidosTotal: 0, evolucaoCorrigidosMostrados: 0, evolucaoVoltaramTotal: 0, evolucaoVoltaramMostrados: 0,
      evolucaoMantidosTotal: 0, evolucaoMantidosMostrados: 0, cruzamentosTotal: 0, cruzamentosMostrados: 0,
      referenciasBip: [], documentosEmitidos: 0, documentosMhd: 0, coberturaCompleta: true, fontesIndisponiveis: [],
    });
    const linhaLip = manifesto.fontes.find((f) => f.tipo === "LIP" && f.detalhe.includes("vazio"));
    t('manifesto NÃO mostra mais "0 vazio(s)" indevidamente (bug de Number(array) corrigido)', !!linhaLip && !linhaLip.detalhe.includes("0 vazio(s)"), linhaLip?.detalhe);

    // processo.area_construida continua existindo no dossiê bruto (outros consumidores podem
    // precisar dele) — só não vai mais pro recorte enviado ao Gemini (checado estruturalmente
    // no teste 4 abaixo, contra o código real de app/api/urbi/chat/route.ts).
    t("processo.area_construida ainda existe no dossiê bruto (não removido da fonte, só do recorte)", d.processo.area_construida !== undefined);
    t('campos_tecnicos.areaTotal tem o rótulo correto de Regularização ("Área a ser Regularizada TOTAL", nunca "área construída")', d.lip.campos_tecnicos.areaTotal?.rotulo === "Área a ser Regularizada TOTAL");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · verificação estrutural — route.ts liga tudo isso de verdade");
{
  const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  t("route.ts remove a seção do modelo antes de sanitizar o resto", /removerSecaoFontesConsultadas\(texto\.replace/.test(rota));
  t("route.ts anexa a lista montada em código quando há dossiê", rota.includes("textoFontesConsultadas(dossie.recorte)"));
  const blocoRecorte = rota.slice(rota.indexOf("const recorte = {"), rota.indexOf("const serializado"));
  // A explicação de POR QUE fica num comentário logo acima (menciona "area_construida" de
  // propósito) — o que importa é que o OBJETO literal (chave: valor) não tenha esse campo.
  t('recorte.processo NUNCA inclui "area_construida" (só os campos explicitamente listados)', !/\barea_construida:/.test(blocoRecorte) && !/processo: d\.processo,/.test(blocoRecorte));
  t("prompt instrui o modelo a NÃO escrever a seção de fontes", readFileSync(new URL("../lib/urbi/contratoResposta.ts", import.meta.url), "utf-8").includes("NÃO escreva você mesmo uma seção"));
  const dossieProcesso = readFileSync(new URL("../lib/urbi/dossieProcesso.ts", import.meta.url), "utf-8");
  t("fatosDoLip recebe contagem canônica como parâmetro (não recalcula sozinho)", dossieProcesso.includes("resumoCanonico?.vazios ?? 0"));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
