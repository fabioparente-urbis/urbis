/**
 * scripts/testar_fase_ah_guarda_comparacoes.mts — Fase AH (04/09/2026): guarda ESTRUTURAL
 * pós-resposta contra afirmação comparativa sem cruzamento determinístico.
 *
 * Fixtures são os trechos EXATOS que vazaram no 5º reteste do resumo (Regularização SEI,
 * 25.5.000046759-5), listados pelo Fábio:
 *   - Área Regularizada × ART/Laudo;
 *   - Área Terreno × Quadro/Certidão;
 *   - Área Regularizada × Vistoria.
 * Todos devem ser bloqueados enquanto não existir cruzamento determinístico correspondente —
 * e NENHUMA regra de equivalência entre esses campos é criada aqui (decisão humana).
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase_ah_guarda_comparacoes.mts
 */
import { readFileSync } from "node:fs";
import { validarComparacoes, contextoDoRecorte, FRASE_SEM_REGRA, type ContextoComparacao } from "../lib/urbi/validarComparacoes";
import { montarDossieFactual } from "../lib/urbi/montarDossie";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// Rótulos reais da Regularização (vindos de lip_campos.label — os mesmos que o dossiê carrega).
const CTX_SEM_CRUZAMENTO: ContextoComparacao = {
  rotulos: [
    "Área a ser Regularizada TOTAL", "Área a ser Regularizada em Ed. Vertical",
    "Área conforme ART de Levantamento", "Área conforme Laudo Técnico",
    "Área apontada pela Fiscalização (Vistoria)", "Área do Terreno", "Bairro",
    "Número de Pavimentos", "Área Impermeável",
  ],
  cruzamentos: [], // Regularização não tem NENHUM cruzamento determinístico hoje (confirmado)
};

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · Área Regularizada × ART/Laudo — o vazamento literal relatado");
{
  const casos = [
    "* A Área a ser Regularizada TOTAL difere da área da ART/Laudo Técnico.",
    "* Tem uma diferença entre a área de levantamento informada na ART e no Laudo Técnico (2516,01 m²) e a Área a ser Regularizada TOTAL (2768,01 m²). Vale a pena conferir a razão dessa diferença.",
    "* A Área conforme ART de Levantamento (2516,01 m²) é menor que a Área a ser Regularizada TOTAL (2768,01 m²).",
  ];
  for (const caso of casos) {
    const r = validarComparacoes(caso, CTX_SEM_CRUZAMENTO);
    t(`bloqueado: "${caso.slice(0, 70)}..."`, r.bloqueios.length > 0 && r.texto.includes(FRASE_SEM_REGRA), `virou: ${r.texto}`);
    t("  → nenhum resto de relação comparativa sobrevive", !/difere|diferen|menor que|razão dessa/i.test(r.texto), r.texto);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · Área do Terreno × Quadro/Certidão — confirmação implícita entre documentos");
{
  const entrada = "* A área do terreno é de 810,00 m², conforme Quadro de Áreas e Certidão de Matrícula.";
  const r = validarComparacoes(entrada, CTX_SEM_CRUZAMENTO);
  t("cláusula de confirmação entre 2 documentos removida", r.bloqueios.some((b) => b.motivo === "confirmacao_entre_documentos"), JSON.stringify(r.bloqueios));
  t("o FATO isolado sobrevive (valor da área continua na resposta)", r.texto.includes("810,00 m²"), r.texto);
  t('nenhum "conforme <documento> e <documento>" sobra', !/conforme Quadro/i.test(r.texto), r.texto);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · Área Regularizada × Vistoria");
{
  const entrada = "* A Área a ser Regularizada TOTAL (2768,01 m²) confere com a Área apontada pela Fiscalização (Vistoria).";
  const r = validarComparacoes(entrada, CTX_SEM_CRUZAMENTO);
  t("bloqueado (confirmação entre dois campos, sem cruzamento)", r.bloqueios.length > 0 && r.texto.includes(FRASE_SEM_REGRA), r.texto);
  t('nenhum "confere com" sobrevive', !/confere com/i.test(r.texto), r.texto);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · o que NÃO pode ser bloqueado (falso positivo destrói resposta legítima)");
{
  const legitimos = [
    "* A Área do Terreno é de 810,00 m².",
    "* O processo tem 6 pavimentos e 42 unidades.",
    "* Não há itens não conformes registrados na última análise.",
    "* O item do checklist está conforme, segundo a marcação do analista.",
    "* Segundo o dossiê deste processo, o LIP está incompleto.",
    "* A Área do Terreno é de 810,00 m², conforme a Certidão de Matrícula.",
  ];
  for (const frase of legitimos) {
    const r = validarComparacoes(frase, CTX_SEM_CRUZAMENTO);
    t(`intacto: "${frase.slice(0, 60)}..."`, r.texto === frase && r.bloqueios.length === 0, `virou: ${r.texto}`);
  }

  // Falsos positivos REAIS pegos rodando a guarda contra a resposta completa do piloto — a
  // palavra comparativa fazia parte do NOME do campo, não era comparação nenhuma.
  const listaSeparada = '* As áreas informadas são: Área conforme ART de Levantamento (2516,01 m²), Área conforme Laudo Técnico (2516,01 m²), Área a ser Regularizada TOTAL (2768,01 m²).';
  const rLista = validarComparacoes(listaSeparada, CTX_SEM_CRUZAMENTO);
  t("listar cada valor com seu rótulo (fatos SEPARADOS) não é comparação — sobrevive inteiro", rLista.bloqueios.length === 0 && rLista.texto === listaSeparada, `virou: ${rLista.texto}`);

  const ctxComLevante: ContextoComparacao = {
    rotulos: [...CTX_SEM_CRUZAMENTO.rotulos, "Levante confere com Vistoria?", "Mais de 12m de altura?"],
    cruzamentos: [],
  };
  const campoComConfere = '* A vistoria indica que o levante confere com a vistoria ("Sim"), e que tem mais de 12m de altura ("Sim").';
  const rConfere = validarComparacoes(campoComConfere, ctxComLevante);
  t('campo cujo NOME contém "confere" (valor declarado "Sim") não vira comparação inventada', rConfere.bloqueios.length === 0, `virou: ${rConfere.texto}`);

  // ...mas o mesmo verbo, ligando dois campos que NÃO o têm no nome, continua bloqueado.
  const comparacaoReal = "* A Área a ser Regularizada TOTAL (2768,01 m²) confere com a Área apontada pela Fiscalização (Vistoria).";
  const rReal = validarComparacoes(comparacaoReal, ctxComLevante);
  t('"confere com" entre dois campos que não o têm no nome continua bloqueado', rReal.bloqueios.length > 0 && rReal.texto.includes(FRASE_SEM_REGRA), rReal.texto);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · COM cruzamento determinístico compatível, a comparação SOBREVIVE");
{
  const ctxComCruzamento: ContextoComparacao = {
    rotulos: ["Área do Terreno", "Número de Pavimentos"],
    cruzamentos: [{ rotulo: "Área do Terreno", resultado: "possivel_divergencia" }],
  };
  const entrada = "* A Área do Terreno do LIP (810,00 m²) difere do valor lido no documento (815,00 m²).";
  const r = validarComparacoes(entrada, ctxComCruzamento);
  t("comparação com lastro real NÃO é bloqueada", r.bloqueios.length === 0 && r.texto === entrada, r.texto);

  // Mesma frase, mas o cruzamento existente é de OUTRO campo → sem lastro, bloqueia.
  const ctxOutroCampo: ContextoComparacao = {
    rotulos: ["Área do Terreno", "Número de Pavimentos"],
    cruzamentos: [{ rotulo: "Número de Pavimentos", resultado: "possivel_divergencia" }],
  };
  const r2 = validarComparacoes(entrada, ctxOutroCampo);
  t("cruzamento de outro campo não serve de lastro", r2.bloqueios.length > 0 && r2.texto.includes(FRASE_SEM_REGRA), r2.texto);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · parágrafo (não-bullet): só a frase comparativa cai, o resto do fato fica");
{
  const entrada = "O processo está arquivado. A Área a ser Regularizada TOTAL difere da Área conforme ART de Levantamento. O LIP tem 4 campos vazios.";
  const r = validarComparacoes(entrada, CTX_SEM_CRUZAMENTO);
  t("frases legítimas do parágrafo sobrevivem", r.texto.includes("O processo está arquivado.") && r.texto.includes("O LIP tem 4 campos vazios."), r.texto);
  t("a frase comparativa foi substituída", !/difere/i.test(r.texto) && r.texto.includes(FRASE_SEM_REGRA), r.texto);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · contexto vem do recorte REAL do processo do piloto (nada hardcoded)");
{
  const USUARIO_ADMIN = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;
  const r = await montarDossieFactual("25.5.000046759-5", USUARIO_ADMIN);
  if (!r.ok) { t("processo carregou", false, r.erro); }
  else {
    const d = r.data as any;
    const ctx = contextoDoRecorte({ lip: d.lip, cruzamentos: d.cruzamentos });
    t("extraiu rótulos reais do recorte (não lista fixa)", ctx.rotulos.length > 20, `${ctx.rotulos.length} rótulos`);
    t('"Área a ser Regularizada TOTAL" está entre os rótulos reais', ctx.rotulos.includes("Área a ser Regularizada TOTAL"));
    t("Regularização segue sem NENHUM cruzamento determinístico (nada ganhou lastro por acidente)", ctx.cruzamentos.length === 0, `${ctx.cruzamentos.length} cruzamentos`);

    // Com o contexto REAL, o vazamento relatado continua bloqueado.
    const vazamentoReal = "* A Área a ser Regularizada TOTAL (2768,01 m²) difere da Área conforme ART de Levantamento (2516,01 m²).";
    const v = validarComparacoes(vazamentoReal, ctx);
    t("vazamento real bloqueado usando o contexto real do processo", v.bloqueios.length > 0 && v.texto.includes(FRASE_SEM_REGRA), v.texto);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("8 · ligado de verdade na rota, pra resumo E coerência (mesma varredura)");
{
  const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  t("route.ts importa a guarda", rota.includes('import { validarComparacoes, contextoDoRecorte } from "@/lib/urbi/validarComparacoes"'));
  t("guarda roda sobre a resposta sanitizada, com o contexto do recorte", rota.includes("validarComparacoes(respostaSanitizada, contextoDoRecorte(dossie.recorte))"));
  t("bloqueios ficam registrados no log do servidor (auditoria)", rota.includes("afirmação(ões) comparativa(s) sem cruzamento determinístico bloqueada(s)"));
  t("não depende do tipo de pergunta (nenhum if de resumo/coerência em volta)", !/if \([^)]*resumo[^)]*\)[\s\S]{0,200}validarComparacoes/.test(rota));
  // A decisão de declarar dois domínios comparáveis continua HUMANA: podeComparar() segue
  // aceitando só domínio idêntico, sem nenhuma tabela de equivalência entre domínios diferentes.
  const catalogo = readFileSync(new URL("../lib/urbi/catalogoSemantico.ts", import.meta.url), "utf-8");
  t("NENHUMA regra de equivalência entre domínios diferentes foi criada (decisão humana)", catalogo.includes("if (domA !== domB) return null;"));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
