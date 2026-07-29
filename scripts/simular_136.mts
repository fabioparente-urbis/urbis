/**
 * scripts/simular_136.mts — simulações controladas do fechamento dos 136 resultados.
 *
 *   npx tsx scripts/simular_136.mts
 *
 * Em vez de editar os PDFs de amostra (irreversível/arriscado sem necessidade), cada cenário
 * constrói um `vig` (Record<papel, ItemCatalogo>) sintético em memória e roda `preencherLip` +
 * `fecharResultados` direto — os mesmos dois passos que rodam em produção. Nada em disco muda;
 * não há nada a reverter.
 */

import { preencherLip, type ItemCatalogo } from "../lib/lerPastaSlot5";
import { matriz, CHAVES_FANTASMA } from "../lib/rastreabilidade";
import { fecharResultados } from "../lib/rastreabilidade/fechar";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const doc = (extra: Partial<ItemCatalogo> = {}): ItemCatalogo => ({
  nome: "arquivo.pdf", rodada: 1, hash: "hash-simulado", ext: "pdf",
  bytes: 1000, paginas: 1, charsTexto: 500, temCamadaTexto: true,
  papeis: [], confianca: "alta", prova: "simulação", atividades: [],
  soPresenca: false, dataDocumento: null, revisao: null, dados: {},
  ...extra,
});

const campos = matriz("LIP", "slot_05")!.campos!;
const chavesMatriz = new Set(campos.map((c) => c.chave));
const fantasmas = new Set(CHAVES_FANTASMA["LIP:slot_05"] ?? []);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · rótulo alterado — o padrão não acha o dado num documento legível → NAO_ENCONTRADO");
{
  const vig = { uso_solo: doc({ papeis: ["uso_solo"], dados: { /* via: ausente de propósito */ } }) };
  const r = preencherLip(vig as any);
  t("logradouro vira NAO_ENCONTRADO", r.logradouro?.resultado === "NAO_ENCONTRADO",
    JSON.stringify(r.logradouro));
  t("carrega tentativa com o que procurou", !!r.logradouro?.tentativa?.procurou?.length);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · documento sem camada de texto → FONTE_ILEGIVEL");
{
  /* ACHADO: nenhuma chamada de `set()` em `preencherLip` passa o parâmetro `doc` — só os
   * wrappers `lido`/`calc` (nunca usados) o repassam. Por isso o ramo FONTE_ILEGIVEL de `set()`
   * é hoje inatingível pelo pipeline real: sem documento algum na entrada, "quadra" cai em
   * NAO_ENCONTRADO com "documento de origem não está no catálogo", mesmo quando o Uso do Solo
   * está na pasta e só não tem camada de texto. Fora do escopo desta etapa consertar (exigiria
   * mexer em ~10 chamadas de `set()`); reportado ao usuário como achado separado. */
  const vig = { uso_solo: doc({ papeis: ["uso_solo"], temCamadaTexto: false, dados: {} }) };
  const r = preencherLip(vig as any);
  t("hoje (achado): sem `doc` ligado, quadra cai em NAO_ENCONTRADO mesmo com Uso do Solo ilegível na pasta",
    r.quadra?.resultado === "NAO_ENCONTRADO", JSON.stringify(r.quadra));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · campo legitimamente não aplicável → NAO_APLICAVEL, com regra e evidência");
{
  // uma via só no Uso do Solo: via2/3/4 são NP por PROVA POSITIVA (leu, aplicou regra, concluiu)
  const vig = { uso_solo: doc({ papeis: ["uso_solo"], dados: { via: "RUA 1", quadra: "A", lote: "1" } }) };
  const r = preencherLip(vig as any);
  t("via2 vira NAO_APLICAVEL", r.via2?.resultado === "NAO_APLICAVEL", JSON.stringify(r.via2));
  t("carrega evidência positiva", !!r.via2?.evidencia?.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · campo do Grupo C — leitor nunca toca, fecharResultados sintetiza NAO_IMPLEMENTADO");
{
  const vig = { uso_solo: doc({ papeis: ["uso_solo"], dados: { via: "RUA 1" } }) };
  const parcial = preencherLip(vig as any);
  const fechado = fecharResultados(campos, parcial);
  t("dimensoesDoLoteNaCertidao (PENDENTE_VISAO) vira NAO_IMPLEMENTADO",
    fechado.dimensoesDoLoteNaCertidao?.resultado === "NAO_IMPLEMENTADO",
    JSON.stringify(fechado.dimensoesDoLoteNaCertidao));
  const campoGrupoC = campos.find((c) => c.chave === "dimensoesDoLoteNaCertidao")!;
  t("o campo declarado continua implementado=false (a matriz não mudou)", campoGrupoC.implementado === false);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · total final da execução — exatamente 136");
{
  // cenário completo: bastante preenchido para exercitar o máximo de ramos do leitor
  const vig = {
    uso_solo: doc({ papeis: ["uso_solo"], dados: {
      via: "RUA 1", quadra: "A", lote: "1", bairro: "CENTRO", iptu: "123",
      numero: "1", unidadeTerritorial: "SETOR CONSOLIDADO", classificacaoVia: "COLETORA",
      tipo: "APROVAÇÃO DE PROJETO", cnaes: [],
    } }),
    projeto: doc({ papeis: ["projeto"], dados: {
      endereco: "QUADRA A LOTE 01", arquiteto: "FULANO", cau: "1", pavimentos: "1",
      areaTerreno: 500, areaTotalConstrucao: 300, permeavel: 50, iccapExigido: 10,
    } }),
    requerimento: doc({ papeis: ["requerimento"], dados: { interessado: "FULANO", iptu: "123", tipoUso: "comercial", enderecoImovel: "QUADRA A LOTE 01" } }),
    certidao_matricula: doc({ papeis: ["certidao_matricula"], dados: { matricula: "1" } }),
    art_projeto: doc({ papeis: ["art_projeto"], dados: { numero: "1", atividades: [] } }),
    art_execucao: doc({ papeis: ["art_execucao"], dados: { numero: "2", atividades: [] } }),
    art_caixa: doc({ papeis: ["art_caixa"], dados: { numero: "3", atividades: [] } }),
  };
  const parcial = preencherLip(vig as any);
  const fechado = fecharResultados(campos, parcial);
  // `observacoes` só nasce no aceite — simula o que /api/lip/aceitar-pasta faz
  const completo = { ...fechado, observacoes: { resultado: "CALCULADO" as const, valor: "log simulado", fonte: "simulação" } };

  // chaves fantasma (ex.: `certidao`, herança da Regularização) não são da matriz — contam à parte
  const naMatriz = Object.keys(completo).filter((k) => chavesMatriz.has(k));
  const sobrando = Object.keys(completo).filter((k) => !chavesMatriz.has(k) && !fantasmas.has(k));
  const faltando = [...chavesMatriz].filter((k) => !(k in completo));

  t("total fecha em 136", naMatriz.length === 136, `${naMatriz.length} de 136`);
  t("nenhum campo da matriz falta", faltando.length === 0, faltando.join(", "));
  t("nenhuma chave estranha à matriz (fora as fantasmas declaradas)", sobrando.length === 0, sobrando.join(", "));

  const distribuicao = Object.entries(completo).filter(([k]) => chavesMatriz.has(k))
    .reduce((acc: Record<string, number>, [, v]: any) => {
    acc[v.resultado] = (acc[v.resultado] ?? 0) + 1; return acc;
  }, {});
  console.log(`\n  distribuição: ${Object.entries(distribuicao).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos os cenários bateram com o esperado");
console.log("nada em disco foi alterado — nenhuma reversão necessária.");
process.exit(falhas);
