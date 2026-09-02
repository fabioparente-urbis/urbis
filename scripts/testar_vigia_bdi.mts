/**
 * Testes do vigia e da triagem por evidência.
 *
 *   npx tsx scripts/testar_vigia_bdi.mts
 *
 * Puro: sem banco, sem rede, sem chave. Roda offline em segundos.
 */
import {
  numeroBR, resumirCampos, acharIncoerencias, contarAnalises, temIndeferimento,
  montarAvisos, triar, CRITERIOS,
} from "../lib/bdi/vigia";

let ok = 0, falhou = 0;
function conferir(rotulo: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; return; }
  falhou++;
  console.error(`✕ ${rotulo}\n    esperado: ${b}\n    veio:     ${a}`);
}
function campo(valor: string) { return { valor, fonte: "teste", origem: "teste" }; }

// ------------------------------------------------------------- numeroBR
conferir("número simples", numeroBR("375"), 375);
conferir("vírgula decimal", numeroBR("375,00"), 375);
conferir("milhar + decimal", numeroBR("1.234,56"), 1234.56);
conferir("já numérico", numeroBR(88.5), 88.5);
conferir("texto não numérico vira null", numeroBR("não informado"), null);
conferir("vazio vira null", numeroBR(""), null);

// --------------------------------------------------------- campos: X ≠ vazio
const dados = {
  areaTerreno: campo("500,00"),
  proprietario: campo("MARIA DE SOUZA"),
  seiEmbargo: campo("X"),
  seiCheadv: campo("x"),
  certidao: campo(""),
  iptu: campo("   "),
};
const resumo = resumirCampos(dados);
conferir("conta vazios (inclui só espaços)", resumo.vazios.sort(), ["certidao", "iptu"]);
conferir("conta X em maiúscula e minúscula", resumo.emX.sort(), ["seiCheadv", "seiEmbargo"]);
conferir("total de campos", resumo.totais, 6);

// ------------------------------------------------------------ incoerências
conferir("área construída maior que terreno",
  acharIncoerencias({ codigo: "A", area_construida: 900, dados: { areaTerreno: campo("500,00") } })
    .map(i => i.campo),
  ["area_construida"]);
conferir("dentro do terreno não acusa",
  acharIncoerencias({ codigo: "A", area_construida: 300, dados: { areaTerreno: campo("500,00") } }),
  []);
conferir("área ilegível VIRA aviso, não some",
  acharIncoerencias({ codigo: "A", area_construida: 300, dados: { areaTerreno: campo("quinhentos") } })
    .map(i => i.campo),
  ["areaTerreno"]);

// ------------------------------------------------------------------- tags
conferir("conta a maior análise", contarAnalises([{ numero_analise: 1 }, { numero_analise: 3 }]), 3);
conferir("tag em texto solto não quebra", contarAnalises(["TESTE", { numero_analise: 2 }]), 2);
conferir("sem tags", contarAnalises(null), 0);
conferir("acha indeferimento", temIndeferimento([{ tipo: "indeferimento" }]), true);
conferir("sem indeferimento", temIndeferimento([{ tipo: "despacho" }]), false);

// ----------------------------------------------------------------- avisos
const avisosBase = montarAvisos({
  processo: { codigo: "A", dados, tags: [{ numero_analise: 2, tipo: "despacho" }] },
  retrabalho: { trocas_totais: 120, virou_nao_conforme: 7, foi_resolvido: 3 },
  numeracao: [
    { tipo: "parecer", restantes: 0, situacao: "ESGOTADA" },
    { tipo: "parecer", restantes: 0, situacao: "ESGOTADA" },
    { tipo: "despacho", restantes: 42, situacao: "OK" },
  ],
});
const ids = avisosBase.map(a => a.id);
conferir("avisa campos vazios", ids.includes("campos_vazios"), true);
conferir("avisa campos em X", ids.includes("campos_em_x"), true);
conferir("avisa retrabalho", ids.includes("retrabalho"), true);
conferir("avisa numeração esgotada", ids.includes("numeracao_parecer"), true);
conferir("NÃO avisa numeração que está ok", ids.some(i => i.includes("despacho")), false);
// Duas faixas esgotadas do mesmo tipo = UM aviso, não dois.
conferir("agrega faixas do mesmo tipo num aviso só",
  ids.filter(i => i === "numeracao_parecer").length, 1);
// Faixas que somadas ainda dão folga não viram aviso.
conferir("faixas somadas com folga não avisam",
  montarAvisos({ processo: { codigo: "A", dados: {} }, numeracao: [
    { tipo: "parecer", restantes: 0, situacao: "ESGOTADA" },
    { tipo: "parecer", restantes: 40, situacao: "OK" },
  ]}).some(a => a.id === "numeracao_parecer"), false);
conferir("X é informação, não alerta",
  avisosBase.find(a => a.id === "campos_em_x")?.severidade, "info");
conferir("toda origem é declarada",
  avisosBase.every(a => ["campo do processo","histórico do MAC","checklist","BIP","view do BDI"].includes(a.fonte)), true);

// --------------------------------------------- lei só com vínculo real
const semLei = montarAvisos({ processo: { codigo: "A", dados: {} } });
conferir("sem vínculo no BIP, nenhuma lei é citada",
  semLei.some(a => a.id === "referencia_legal"), false);
const comLei = montarAvisos({
  processo: { codigo: "A", dados: {} },
  vinculosLegais: [{ referencia: "LC 364/2023, Art. 102", confianca: "ALTA" }],
});
conferir("com vínculo, cita e diz que veio do BIP",
  comLei.find(a => a.id === "referencia_legal")?.fonte, "BIP");

// ---------------------------------------------------------------- triagem
const risco = triar({
  processo: { codigo: "A", dados: {}, tags: [{ tipo: "indeferimento", numero_analise: 1 }] },
  retrabalho: { trocas_totais: 200, virou_nao_conforme: 9, foi_resolvido: 1 },
});
conferir("indeferimento + muita troca = risco", risco.classe, "maior risco de retrabalho");
conferir("risco sempre explica por quê", risco.motivos.length > 0, true);

const atencao = triar({
  processo: { codigo: "B", area_construida: 900, dados: { areaTerreno: campo("500,00") }, tags: [] },
});
conferir("incoerência = exige atenção", atencao.classe, "exige atenção");

const simples = triar({
  processo: { codigo: "C", area_construida: 120, dados: { x: campo("preenchido") },
              tags: [{ numero_analise: 3, tipo: "despacho" }] },
  retrabalho: { trocas_totais: 0, virou_nao_conforme: 0, foi_resolvido: 0 },
});
conferir("3ª análise, sem vazio e sem troca = mais simples", simples.classe, "mais simples para análise");
conferir("simples também explica", simples.motivos.length > 0, true);

// Nenhuma classificação pode conter número de probabilidade.
for (const t of [risco, atencao, simples]) {
  const temPct = t.motivos.some(m => /%|probabilidade|chance|prazo estimado/i.test(m));
  conferir(`sem porcentagem inventada em "${t.classe}"`, temPct, false);
}

// Critérios têm que ser legíveis e ajustáveis de fora.
conferir("critérios expostos", typeof CRITERIOS.trocasParaRisco === "number", true);

console.log(`\n${ok} passaram, ${falhou} falharam.`);
process.exit(falhou > 0 ? 1 : 0);
