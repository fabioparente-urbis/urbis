/**
 * scripts/testar_visao.mts — os 11 comportamentos que a visão localizada tem que garantir.
 *
 *   npx tsx scripts/testar_visao.mts              (sem chamar modelo — determinístico)
 *   npx tsx scripts/testar_visao.mts --com-modelo (chama o Gemini de verdade, custa dinheiro)
 *
 * O caminho feliz roda com fixture REAL (a prancha da amostra, recortada pelo mupdf de verdade),
 * mas com a INTERPRETAÇÃO dublada — o teste da governança não pode ficar refém de cota, de rede
 * nem do humor do modelo. A chamada real fica atrás de flag, para quando se quer medir de fato.
 */

import fs from "node:fs";
import { recortar } from "../lib/visao/rasterizar";
import { RECEITAS, hashReceita, hashRegiao, receitaDaChave } from "../lib/visao/receitas";
import { interpretarResposta } from "../lib/visao/interpretar";
import { matriz } from "../lib/rastreabilidade";
import { fecharResultados } from "../lib/rastreabilidade/fechar";
import type { ResultadoCampo } from "../lib/lerPastaSlot5";

const AMOSTRA = process.env.HOME + "/Desktop/SLOT 5";
const comModelo = process.argv.includes("--com-modelo");

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const receita = receitaDaChave("vagasPcdExigido")!;

/* Usa a `interpretarResposta` DE PRODUÇÃO — o que se dubla é só a resposta do modelo. Reproduzir o
 * mapeamento aqui testaria uma cópia, e cópia diverge do original exatamente quando importa. */
const leu = (resposta: string, chave = "vagasPcdExigido") => interpretarResposta(resposta, receita)[chave];
const valorDe = (resposta: string, chave = "vagasPcdExigido") => {
  const c = leu(resposta, chave);
  return c?.ok ? c.valor : null;
};
const abstevesse = (resposta: string, chave = "vagasPcdExigido") => leu(resposta, chave)?.ok === false;

const RESPOSTA_BOA = JSON.stringify({
  campos: {
    totalDeVagasExigidasParaEssas: { valor: "5", confianca: 0.95 },
    vagasPcdExigido: { valor: "1", confianca: 0.95 },
    vagasIdosoExigido: { valor: "2", confianca: 0.9 },
  },
});
const ilegivel = (motivo: string): ResultadoCampo => ({
  resultado: "FONTE_ILEGIVEL", fonte: "visão localizada",
  tentativa: { procurou: [receita.id], motivo, motivoIlegivel: "CONTEUDO_NAO_INTERPRETAVEL" },
});

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · caminho feliz — recorte real da prancha da amostra");
if (!fs.existsSync(`${AMOSTRA}/PROJETO.pdf`)) {
  console.log("  (pulado — amostra não encontrada)");
} else {
  const pdf = new Uint8Array(fs.readFileSync(`${AMOSTRA}/PROJETO.pdf`));
  // a receita não fixa mais região: aqui se recorta uma faixa qualquer só para exercitar o mupdf
  const r = await recortar(pdf, { pagina: 0, x0: 0.7, y0: 0.4, x1: 0.9, y1: 0.65, alvoPx: receita.localizacao.alvoPx });
  t("recorta a região da tabela de vagas", r.png.length > 5000 && r.larguraPx > 500,
    `${r.larguraPx}x${r.alturaPx}px, ${(r.png.length / 1024).toFixed(0)}KB, ${r.ms.toFixed(0)}ms, ${r.dpiEfetivo}dpi`);
  t("PNG de verdade (assinatura no cabeçalho)", r.png[1] === 0x50 && r.png[2] === 0x4e && r.png[3] === 0x47);
  t("lado maior respeita o alvo em pixels da receita",
    Math.abs(Math.max(r.larguraPx, r.alturaPx) - receita.localizacao.alvoPx) <= 2,
    `${Math.max(r.larguraPx, r.alturaPx)} vs alvo ${receita.localizacao.alvoPx}`);
  console.log(`         medido: recorte ${r.ms.toFixed(0)}ms · ${(r.png.length / 1024).toFixed(0)}KB · ${r.dpiEfetivo}dpi`);

  t("os 3 campos do quadro saem de UMA resposta só",
    valorDe(RESPOSTA_BOA, "vagasPcdExigido") === "1"
    && valorDe(RESPOSTA_BOA, "vagasIdosoExigido") === "2"
    && valorDe(RESPOSTA_BOA, "totalDeVagasExigidasParaEssas") === "5",
    "todos conferidos no gabarito");
  t("a receita declara os 3 campos", receita.chaves.length === 3, receita.chaves.join(", "));

  if (comModelo) {
    secao("1b · chamada REAL ao modelo (custa dinheiro)");
    const { executarVisao } = await import("../lib/visao");
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256").update(pdf).digest("hex");
    const res = await executarVisao({
      entradas: [{ hash, papeis: ["projeto"], buffer: pdf }],
      processoCodigo: "TESTE-VISAO", usuarioId: null, jaResolvidos: {},
    });
    console.log(`  resposta: ${JSON.stringify(res.campos.vagasPcdExigido)}`);
    console.log(`  chamadas ${res.chamadas} · reaproveitadas ${res.reaproveitadas} · US$ ${res.custoTotal.toFixed(6)} · ${res.msTotal.toFixed(0)}ms`);
    console.log(`  pulos: ${JSON.stringify(res.pulos)}`);
    t("modelo real devolveu INFERIDO com o valor do gabarito",
      res.campos.vagasPcdExigido?.resultado === "INFERIDO" && res.campos.vagasPcdExigido?.valor === "1");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2-4 · abstenção, resposta inválida e resposta corrompida");
{
  const absteveTudo = interpretarResposta('{"abstencao": true, "motivo": "a tabela não está neste recorte"}', receita);
  t("2. abstenção global derruba os 3 campos", receita.chaves.every((c) => absteveTudo[c].ok === false));
  t("   e preserva o motivo dado pelo modelo",
    (absteveTudo.vagasPcdExigido as any).motivo.includes("não está neste recorte"));

  // ── ABSTENÇÃO INDIVIDUAL: uma linha ilegível não derruba as outras do mesmo quadro
  const parcial = interpretarResposta(JSON.stringify({
    campos: {
      totalDeVagasExigidasParaEssas: { valor: "5", confianca: 0.9 },
      vagasPcdExigido: { valor: "1", confianca: 0.9 },
      vagasIdosoExigido: { abstencao: true, motivo: "linha cortada no recorte" },
    },
  }), receita);
  t("2b. abstenção INDIVIDUAL preserva os campos legíveis",
    parcial.vagasPcdExigido.ok === true && parcial.totalDeVagasExigidasParaEssas.ok === true);
  t("2c. e marca só o campo ilegível", parcial.vagasIdosoExigido.ok === false,
    "é o que separa 'parte do quadro ilegível' de 'quadro inútil'");

  t("3. valor fora da faixa plausível é recusado", abstevesse('{"campos":{"vagasPcdExigido":{"valor":"0"}}}'));
  t("3b. decimal da coluna errada é recusado", abstevesse('{"campos":{"vagasPcdExigido":{"valor":"0,08129556"}}}'));
  t("3c. texto no lugar de número é recusado", abstevesse('{"campos":{"vagasPcdExigido":{"valor":"uma vaga"}}}'));
  t("3d. campo ausente da resposta é recusado", abstevesse('{"campos":{"vagasIdosoExigido":{"valor":"2"}}}'));

  t("4. resposta corrompida vira abstenção, não exceção", abstevesse("desculpe, não consigo ajudar"));
  t("4b. resposta vazia idem", abstevesse(""));
  t("4c. objeto achatado ainda é aceito (modelo às vezes responde assim)",
    valorDe('{"campos":{"vagasPcdExigido":"1","vagasIdosoExigido":"2","totalDeVagasExigidasParaEssas":"5"}}') === "1");
}

secao("2e · coerência entre campos do mesmo recorte");
{
  const incoerente = interpretarResposta(JSON.stringify({
    campos: {
      totalDeVagasExigidasParaEssas: { valor: "2" },
      vagasPcdExigido: { valor: "3" },
      vagasIdosoExigido: { valor: "4" },
    },
  }), receita);
  t("leitura internamente incoerente derruba o RECORTE inteiro",
    receita.chaves.every((c) => incoerente[c].ok === false),
    "3 PCD + 4 idoso não cabem em 2 vagas — não dá para saber qual está errado");
  t("e o motivo explica a incoerência",
    (incoerente.vagasPcdExigido as any).motivo.includes("incoerente"));

  const coerente = interpretarResposta(RESPOSTA_BOA, receita);
  t("leitura coerente passa (1 + 2 <= 5)", receita.chaves.every((c) => coerente[c].ok === true));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · página inexistente na receita não derruba, vira erro tratável");
{
  const pdf = fs.existsSync(`${AMOSTRA}/USO DO SOLO.pdf`)
    ? new Uint8Array(fs.readFileSync(`${AMOSTRA}/USO DO SOLO.pdf`)) : null;
  if (!pdf) { console.log("  (pulado)"); }
  else {
    let erro = "";
    try { await recortar(pdf, { pagina: 99, x0: 0, y0: 0, x1: 1, y1: 1, alvoPx: 800 }); } catch (e: any) { erro = e.message; }
    t("recorte de página inexistente lança erro claro (capturado por executarVisao)",
      erro.includes("não existe"), erro);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · chave de reuso: muda receita ou modelo → outra interpretação");
{
  const h1 = hashReceita(receita);
  const h2 = hashReceita({ ...receita, prompt: receita.prompt + " " });
  const h3 = hashReceita({ ...receita, modelo: "outro-modelo" });
  const h4 = hashReceita({ ...receita, localizacao: { ...receita.localizacao, alvo: "outro quadro" } });
  t("prompt diferente muda o hash", h1 !== h2);
  t("modelo diferente muda o hash", h1 !== h3, "trocar de modelo é mudança funcional");
  t("alvo de localização diferente muda o hash", h1 !== h4);
  t("mesma receita dá o mesmo hash (reuso funciona)", h1 === hashReceita(receita));
  const reg = { pagina: 1, x0: 0.7001, y0: 0.4, x1: 0.9, y1: 0.65 };
  t("região arredonda a 3 casas (meio pixel não é outra região)",
    hashRegiao(reg) === hashRegiao({ ...reg, x0: 0.70009 }));
  t("região de outra página é outra região", hashRegiao(reg) !== hashRegiao({ ...reg, pagina: 2 }));
  t("validadores não entram no hash (função não serializa estável)",
    h1 === hashReceita({ ...receita, validadores: {} }),
    "por isso `versao` DEVE subir quando um validador mudar de comportamento");
  t("versão diferente muda o hash", h1 !== hashReceita({ ...receita, versao: 99 }));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · o fechamento em 136 sobrevive à visão");
{
  const campos = matriz("LIP", "slot_05")!.campos!;
  const chavesMatriz = new Set(campos.map((c) => c.chave));

  const comVisao = fecharResultados(campos, {
    vagasPcdExigido: { resultado: "INFERIDO", valor: "1", fonte: "visão" },
  });
  const comObs: Record<string, ResultadoCampo> = {
    ...comVisao,
    observacoes: { resultado: "CALCULADO", valor: "log", fonte: "aceite" },
  };
  t("com visão resolvendo 1 campo, ainda fecha em 136",
    Object.keys(comObs).filter((k) => chavesMatriz.has(k)).length === 136);
  t("o campo de visão fica INFERIDO e não é sobrescrito por fecharResultados",
    comObs.vagasPcdExigido?.resultado === "INFERIDO");

  /* Com visão desligada/sem orçamento/indisponível, o campo cai para NAO_ENCONTRADO — e não mais
   * para NAO_IMPLEMENTADO, como no Sprint 1. A diferença é a matriz dizendo a verdade: o leitor
   * EXISTE agora (`implementado: true`), então alegar "não implementado" seria mentira. Os outros
   * 11 campos do Grupo C, esses sim ainda sem receita, seguem em NAO_IMPLEMENTADO. */
  const semVisao = fecharResultados(campos, {});
  t("com visão DESLIGADA, campo implementado cai para NAO_ENCONTRADO (não mente sobre estar implementado)",
    semVisao.vagasPcdExigido?.resultado === "NAO_ENCONTRADO", semVisao.vagasPcdExigido?.resultado);
  t("e campo do Grupo C ainda sem receita continua NAO_IMPLEMENTADO",
    semVisao.vagasPcdAtendidas?.resultado === "NAO_IMPLEMENTADO", semVisao.vagasPcdAtendidas?.resultado);
  t("e o total continua fechando em 136",
    Object.keys(semVisao).filter((k) => chavesMatriz.has(k)).length + 1 === 136,
    "135 do fechamento + observacoes, que só nasce no aceite");

  const ilegivelFecha = fecharResultados(campos, { vagasPcdExigido: ilegivel("abstenção") });
  t("com abstenção, o campo fica FONTE_ILEGIVEL e o total não muda",
    ilegivelFecha.vagasPcdExigido.resultado === "FONTE_ILEGIVEL"
    && Object.keys(ilegivelFecha).filter((k) => chavesMatriz.has(k)).length === 135);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("8 · a matriz continua coerente com a receita");
{
  for (const r of RECEITAS) {
    const campos = matriz("LIP", "slot_05")!.campos!;
    for (const chave of r.chaves) {
      const c = campos.find((x) => x.chave === chave);
      t(`${chave} existe na matriz`, !!c);
      t(`${chave} declara uso de IA`, c?.usaIA === true, "campo lido por modelo tem que declarar usaIA");
      t(`${chave} declara método de visão`, !!c?.metodos.includes("VISAO_LOCALIZADA"));
    }
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
if (!comModelo) console.log("(chamada real ao modelo não executada — rode com --com-modelo para medir custo)");
process.exit(falhas);
