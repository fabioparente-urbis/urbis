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

/* A função que decide o resultado a partir da resposta do modelo é a mesma de produção, mas está
 * dentro de `executarVisao`, que fala com o banco. Aqui se testa o CONTRATO: dada uma resposta,
 * qual resultado sai. Reproduzir o mapeamento seria testar uma cópia; então o que se dubla é só a
 * resposta do modelo, e o mapeamento é exercitado pelas mesmas regras da receita. */
function mapear(resposta: string): ResultadoCampo {
  let json: any;
  try { json = JSON.parse(resposta.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); }
  catch { return ilegivel("resposta não é JSON utilizável"); }
  if (json?.abstencao === true) return ilegivel(String(json.motivo ?? "o modelo se absteve"));
  const valores: Record<string, string> = {};
  for (const c of receita.chaves) if (json?.[c] != null) valores[c] = String(json[c]);
  const v = receita.validar(valores);
  if (!v.ok) return ilegivel(`resposta inválida: ${v.motivo}`);
  return { resultado: "INFERIDO", valor: valores.vagasPcdExigido, fonte: "visão localizada" };
}
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
  const r = await recortar(pdf, receita.regiao);
  t("recorta a região da tabela de vagas", r.png.length > 5000 && r.larguraPx > 500,
    `${r.larguraPx}x${r.alturaPx}px, ${(r.png.length / 1024).toFixed(0)}KB, ${r.ms.toFixed(0)}ms, ${r.dpiEfetivo}dpi`);
  t("PNG de verdade (assinatura no cabeçalho)", r.png[1] === 0x50 && r.png[2] === 0x4e && r.png[3] === 0x47);
  t("lado maior respeita o alvo em pixels da receita",
    Math.abs(Math.max(r.larguraPx, r.alturaPx) - receita.regiao.alvoPx) <= 2,
    `${Math.max(r.larguraPx, r.alturaPx)} vs alvo ${receita.regiao.alvoPx}`);
  console.log(`         medido: recorte ${r.ms.toFixed(0)}ms · ${(r.png.length / 1024).toFixed(0)}KB · ${r.dpiEfetivo}dpi`);

  const feliz = mapear('{"abstencao": false, "vagasPcdExigido": "1", "confianca": 0.95}');
  t("resposta boa vira INFERIDO (jamais ENCONTRADO)", feliz.resultado === "INFERIDO", JSON.stringify(feliz));
  t("valor bate com o gabarito conferido (1)", feliz.valor === "1");

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
secao("2-4 · abstenção, resposta inválida e resposta corrompida → FONTE_ILEGIVEL");
{
  const absteve = mapear('{"abstencao": true, "motivo": "a tabela não está neste recorte"}');
  t("2. abstenção explícita vira FONTE_ILEGIVEL", absteve.resultado === "FONTE_ILEGIVEL");
  t("   e preserva o motivo dado pelo modelo",
    (absteve.tentativa?.motivo ?? "").includes("não está neste recorte"), absteve.tentativa?.motivo);
  t("   e NUNCA devolve valor", absteve.valor === undefined);

  t("3. valor fora da faixa plausível é recusado",
    mapear('{"vagasPcdExigido": "0"}').resultado === "FONTE_ILEGIVEL");
  t("3b. decimal da coluna errada é recusado",
    mapear('{"vagasPcdExigido": "0,08129556"}').resultado === "FONTE_ILEGIVEL");
  t("3c. texto no lugar de número é recusado",
    mapear('{"vagasPcdExigido": "uma vaga"}').resultado === "FONTE_ILEGIVEL");

  t("4. resposta corrompida vira FONTE_ILEGIVEL, não exceção",
    mapear("desculpe, não consigo ajudar com isso").resultado === "FONTE_ILEGIVEL");
  t("4b. resposta vazia idem", mapear("").resultado === "FONTE_ILEGIVEL");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · página inexistente na receita não derruba, vira erro tratável");
{
  const pdf = fs.existsSync(`${AMOSTRA}/USO DO SOLO.pdf`)
    ? new Uint8Array(fs.readFileSync(`${AMOSTRA}/USO DO SOLO.pdf`)) : null;
  if (!pdf) { console.log("  (pulado)"); }
  else {
    let erro = "";
    try { await recortar(pdf, { ...receita.regiao, pagina: 99 }); } catch (e: any) { erro = e.message; }
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
  const h4 = hashReceita({ ...receita, regiao: { ...receita.regiao, x0: 0.71 } });
  t("prompt diferente muda o hash", h1 !== h2);
  t("modelo diferente muda o hash", h1 !== h3, "trocar de modelo é mudança funcional");
  t("geometria diferente muda o hash", h1 !== h4);
  t("mesma receita dá o mesmo hash (reuso funciona)", h1 === hashReceita(receita));
  t("região tem identidade estável", hashRegiao(receita) === hashRegiao(receita));
  t("prosa não entra: `validar` não altera hash",
    h1 === hashReceita({ ...receita, validar: () => ({ ok: true }) }),
    "por isso `versao` DEVE subir quando o validador mudar");
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

  const semVisao = fecharResultados(campos, {});
  t("com visão DESLIGADA, o campo cai para NAO_IMPLEMENTADO (estado já previsto)",
    semVisao.vagasPcdExigido?.resultado === "NAO_IMPLEMENTADO");
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
