/**
 * scripts/testar_catalogo_semantico.mts — Fase AA da Inteligência URBIS (05/09/2026): mapa
 * semântico de campos LIP/MAC. Bateria obrigatória pedida pelo Fábio.
 *
 *   npx tsx --env-file=.env.local scripts/testar_catalogo_semantico.mts
 */
import { dominioDoCampo, rotuloDoCampo, podeComparar } from "../lib/urbi/catalogoSemantico";
import { compararPorSemantica, cruzarItensMacComBip, cruzarEvolucaoChecklist, type CampoParaComparar } from "../lib/urbi/cruzamento";
import { montarDossieFactual } from "../lib/urbi/montarDossie";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);
const PADRAO_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · área construída total × área do terreno NUNCA volta a gerar divergência");
{
  const areaConstruida: CampoParaComparar = { slot: "slot_05", chave: "areaTotal", valor: "2768,01", fonte: "processos.dados" };
  const areaTerreno: CampoParaComparar = { slot: "slot_05", chave: "areaTerreno", valor: "810,00", fonte: "processos.dados" };
  const r = compararPorSemantica(areaConstruida, areaTerreno);
  t("resultado é nao_aplicavel (domínios diferentes, sem regra)", r.resultado === "nao_aplicavel", r.resultado);
  t("motivo cita os dois domínios diferentes", /domínio/i.test(r.motivo));
  t("nunca 'possivel_divergencia' pra este par, mesmo com construída > terreno", r.resultado !== "possivel_divergencia");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · mesma semântica, valores distintos → possivel_divergencia (só com regra explícita = mesmo domínio)");
{
  const impermeavelLip: CampoParaComparar = { slot: "regularizacao", chave: "areaImpermeavel", valor: "300,00", fonte: "processos.dados" };
  const impermeavelDocumento: CampoParaComparar = { slot: "regularizacao", chave: "areaImpermeavel", valor: "305,50", fonte: "mhd_resultados_campo" };
  const r = compararPorSemantica(impermeavelLip, impermeavelDocumento);
  t("mesmo domínio (area_impermeavel), valores diferentes → possivel_divergencia", r.resultado === "possivel_divergencia", r.resultado);

  const iguais = compararPorSemantica(impermeavelLip, { ...impermeavelDocumento, valor: "300,00" });
  t("mesmo domínio, mesmo valor → consistente", iguais.resultado === "consistente", iguais.resultado);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · caixa de recarga sem campo catalogado (ex.: área ocupada) → base_insuficiente");
{
  const volumeCaixa: CampoParaComparar = { slot: "regularizacao", chave: "volAt", valor: "12,50", fonte: "processos.dados" };
  const campoInexistente: CampoParaComparar = { slot: "regularizacao", chave: "areaOcupadaGeral", valor: "500,00", fonte: "processos.dados" };
  const r = compararPorSemantica(volumeCaixa, campoInexistente);
  t("campo sem entrada no catálogo → base_insuficiente", r.resultado === "base_insuficiente", r.resultado);
  t("motivo aponta a ausência de catalogação, não inventa comparação", /não tem domínio semântico catalogado/i.test(r.motivo));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · troca de slot — mesma chave, domínio e rótulo corretos por slot (achado real)");
{
  // "areaTotal" é o caso crítico: mesma chave, domínio DIFERENTE entre Regularização e Slot 5.
  const domReg = dominioDoCampo("regularizacao", "areaTotal");
  const domSlot5 = dominioDoCampo("slot_05", "areaTotal");
  t("areaTotal em Regularização é area_a_regularizar", domReg === "area_a_regularizar", String(domReg));
  t("areaTotal em Slot 5 é area_construida_total (DIFERENTE)", domSlot5 === "area_construida_total", String(domSlot5));
  t("os dois domínios são diferentes entre si (não pode tratar como o mesmo dado)", domReg !== domSlot5);

  const rotuloReg = rotuloDoCampo("regularizacao", "areaTotal");
  const rotuloSlot5 = rotuloDoCampo("slot_05", "areaTotal");
  t("rótulo humano também muda por slot", rotuloReg !== rotuloSlot5, `"${rotuloReg}" vs "${rotuloSlot5}"`);

  // área do terreno, ao contrário, é estável nos 3 slots — confirmando que a variação acima é
  // real (achado), não um efeito de bug de leitura do catálogo.
  const terrenoReg = dominioDoCampo("regularizacao", "areaTerreno");
  const terrenoAceite = dominioDoCampo("aceite_sei", "areaTerreno");
  const terrenoSlot5 = dominioDoCampo("slot_05", "areaTerreno");
  t("areaTerreno é area_terreno nos 3 slots, sem variar", terrenoReg === "area_terreno" && terrenoAceite === "area_terreno" && terrenoSlot5 === "area_terreno");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · nenhum UUID no rótulo/campos_comparados exposto (chave interna pode ser UUID, rótulo nunca)");
{
  const itensNaoConformes = [
    { item_id: "1dcb19d3-825a-4fd7-a90c-f4c2d70bac03", texto: "Apresentar poço de infiltração/caixa de recarga" },
  ];
  const vinculos = new Map([["1dcb19d3-825a-4fd7-a90c-f4c2d70bac03", [{ referencia: "Art. 5º", confianca: "ALTA" }]]]);
  const cruzamentos = cruzarItensMacComBip(itensNaoConformes, vinculos);
  for (const c of cruzamentos) {
    t(`[mac_item_x_bip] rotulo sem UUID ("${c.rotulo}")`, !PADRAO_UUID.test(c.rotulo));
    t(`[mac_item_x_bip] campos_comparados sem UUID`, !c.campos_comparados.some((x) => PADRAO_UUID.test(x)));
    t(`[mac_item_x_bip] chave interna AINDA é o item_id (dedupe estável, nunca exposta)`, c.chave === "1dcb19d3-825a-4fd7-a90c-f4c2d70bac03");
  }

  const evolucao = { itens_corrigidos: [{ item_id: "cd94efb6-355b-49f6-ae7c-193942e2f2ef", texto: "Quadro (Qd.)", de: "nao_conforme", para: "conforme", quando: "2026-08-01", analista_nome: "Fulano", analise_id: "x" }], itens_pendentes_mantidos: [], itens_voltaram_nao_conforme: [] } as any;
  const cruzEvolucao = cruzarEvolucaoChecklist(evolucao);
  for (const c of cruzEvolucao) {
    t(`[evolucao_checklist] rotulo sem UUID ("${c.rotulo}")`, !PADRAO_UUID.test(c.rotulo));
    t(`[evolucao_checklist] campos_comparados sem UUID`, !c.campos_comparados.some((x) => PADRAO_UUID.test(x)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · processo real de cada slot — só leitura, sem UUID vazando em cruzamentos.rotulo");
{
  const USUARIO_ADMIN = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;
  const processos: [string, string][] = [
    ["25.5.000046759-5", "Regularização SEI"],
    ["25.5.000016900-4", "Aceite SEI"],
    ["48533", "Aprovação de Projeto"],
  ];
  for (const [codigo, nome] of processos) {
    const r = await montarDossieFactual(codigo, USUARIO_ADMIN);
    if (!r.ok) { t(`${nome} (${codigo}) carregou`, false, r.erro); continue; }
    const d = r.data as any;
    t(`${nome} (${codigo}) carregou (só leitura, nada alterado)`, true);
    const cruzamentos = d.cruzamentos ?? [];
    const algumUuidNoRotulo = cruzamentos.some((c: any) => c.rotulo && PADRAO_UUID.test(c.rotulo));
    t(`${nome}: nenhum dos ${cruzamentos.length} cruzamentos vaza UUID no rótulo`, !algumUuidNoRotulo);
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
