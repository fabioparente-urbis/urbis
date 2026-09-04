/**
 * scripts/testar_sugestoes.mts — Fase M da Inteligência URBIS: auditoria de que toda sugestão
 * carrega processo/slot/tipo/fonte/grau/estado/data, e que o dedupe não some sugestão real
 * entre passadas. Puro — sem banco, sem rede (registrarSugestoesAutomaticas grava de verdade e
 * fica de fora deste script de propósito).
 *
 *   npx tsx scripts/testar_sugestoes.mts
 */
import { derivarSugestoesAutomaticas } from "../lib/urbi/sugestoes";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · toda sugestão sai com os campos que a Fase M exige poder mostrar");
{
  const dossie = {
    cruzamentos: [{
      tipo: "lip_x_documento", chave: "areaConstruida", resultado: "possivel_divergencia",
      motivo: "300 × 320", campos_comparados: ["areaConstruida"], fontes: ["processos.dados", "mhd_resultados_campo"],
    }],
    fluxo: { analises: [{ numero_analise: 1, atualizado_em: "2026-09-01T00:00:00Z", numero_despacho: null, numero_parecer: null, numero_despacho_interno: null }] },
  };
  const s = derivarSugestoesAutomaticas(dossie as any);
  t("gerou 1 sugestão", s.length === 1);
  const linha = s[0];
  // processo/slot são responsabilidade de quem CHAMA registrarSugestoesAutomaticas (processo_codigo
  // é parâmetro obrigatório da função, slot é o 3º parâmetro) — aqui confere o que a função PURA
  // já garante: tipo, fonte(s), grau de certeza.
  t("tem tipo", typeof linha.tipo === "string" && linha.tipo.length > 0);
  t("tem fonte(s)", Array.isArray(linha.fontes) && linha.fontes.length > 0);
  t("tem grau de certeza", typeof linha.grau_certeza === "string" && linha.grau_certeza.length > 0);
  t("tem chave (base do dedupe, que por sua vez sustenta 'estado' e 'data' no banco)", typeof linha.chave === "string" && linha.chave.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · BUG REAL corrigido — divergência LIP×documento gera linha NOVA numa passada posterior");
{
  const dossieAnalise1 = {
    cruzamentos: [{
      tipo: "lip_x_documento", chave: "areaConstruida", resultado: "possivel_divergencia",
      motivo: "300 × 320", campos_comparados: ["areaConstruida"], fontes: ["processos.dados", "mhd_resultados_campo"],
    }],
    fluxo: { analises: [{ numero_analise: 1, atualizado_em: "2026-09-01T00:00:00Z", numero_despacho: null, numero_parecer: null, numero_despacho_interno: null }] },
  };
  const dossieAnalise2 = {
    ...dossieAnalise1,
    fluxo: { analises: [dossieAnalise1.fluxo.analises[0], { numero_analise: 2, atualizado_em: "2026-09-10T00:00:00Z", numero_despacho: null, numero_parecer: null, numero_despacho_interno: null }] },
  };
  const chave1 = derivarSugestoesAutomaticas(dossieAnalise1 as any)[0].chave;
  const chave2 = derivarSugestoesAutomaticas(dossieAnalise2 as any)[0].chave;
  t("chave muda entre análise 1 e análise 2 (ON CONFLICT não vai mais colapsar as duas)",
    chave1 !== chave2, `chave1=${chave1} chave2=${chave2}`);
  t("chave inclui o número da análise", chave2.includes("analise-2"));

  // mesma análise, chamada 2x (ex.: 2 mensagens de chat seguidas) — TEM que continuar
  // deduplicando, senão vira spam a cada mensagem.
  const chave1DeNovo = derivarSugestoesAutomaticas(dossieAnalise1 as any)[0].chave;
  t("mesma análise, chamada de novo, MESMA chave (dedupe continua funcionando dentro da passada)",
    chave1 === chave1DeNovo);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · mesmo fix para item_sem_base_juridica e incoerencia_lip_mac");
{
  const base = (numeroAnalise: number) => ({
    cruzamentos: [{
      tipo: "mac_item_x_bip", chave: "item-x", resultado: "base_juridica_ausente",
      motivo: "sem vínculo", campos_comparados: ["item-x"], fontes: ["mac_bip_vinculos"],
    }],
    lip: { incoerencias: [{ campo: "areaTerreno", explicacao: "não é número" }] },
    fluxo: { analises: [{ numero_analise: numeroAnalise, atualizado_em: "2026-09-01T00:00:00Z", numero_despacho: null, numero_parecer: null, numero_despacho_interno: null }] },
  });
  const s1 = derivarSugestoesAutomaticas(base(1) as any);
  const s2 = derivarSugestoesAutomaticas(base(2) as any);
  const juridicaChave1 = s1.find((x) => x.tipo === "item_sem_base_juridica")!.chave;
  const juridicaChave2 = s2.find((x) => x.tipo === "item_sem_base_juridica")!.chave;
  t("item_sem_base_juridica: chave muda entre passadas", juridicaChave1 !== juridicaChave2);

  const incoerenciaChave1 = s1.find((x) => x.tipo === "incoerencia_lip_mac")!.chave;
  const incoerenciaChave2 = s2.find((x) => x.tipo === "incoerencia_lip_mac")!.chave;
  t("incoerencia_lip_mac: chave muda entre passadas", incoerenciaChave1 !== incoerenciaChave2);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · sem análise nenhuma (processo recém-criado), não quebra — só sem sufixo");
{
  const s = derivarSugestoesAutomaticas({
    cruzamentos: [{ tipo: "lip_x_documento", chave: "campo1", resultado: "possivel_divergencia", motivo: "x", campos_comparados: ["campo1"], fontes: ["a", "b"] }],
  } as any);
  t("gera sugestão mesmo sem dossie.fluxo.analises", s.length === 1);
  t("chave não tem sufixo de análise (não inventa análise que não existe)", s[0].chave === "campo1");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · tipos que já eram passada-aware antes desta fase continuam intactos");
{
  const s = derivarSugestoesAutomaticas({
    mac: { evolucao: { itens_voltaram_nao_conforme: [{ item_id: "i1", texto: "x", quando: "2026-01-01", analise_id: "uuid-1" }] } },
  } as any);
  t("item_voltou_nao_conforme continua incluindo analise_id na chave", s[0].chave === "i1:uuid-1");
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
