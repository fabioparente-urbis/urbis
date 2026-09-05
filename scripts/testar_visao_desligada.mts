/**
 * scripts/testar_visao_desligada.mts — confirma, contra o banco real, que `urbis_config.
 * visao_ligada=false` bloqueia QUALQUER receita ativa de chamar o Gemini — a garantia pedida
 * antes do Radar (05/09/2026: "teste que nenhuma rota de visão pode chamar Gemini enquanto ela
 * estiver desligada").
 *
 * Roda `executarVisao` de verdade (mesma função que /api/lip/ler-pasta chama), com PNG fictício,
 * pra um documento com papel "projeto" — se a chave estivesse ligada e a receita ativa, isso
 * tentaria chamar o Gemini de verdade. Confirma que NENHUMA chamada acontece: 0 `chamadas`, custo
 * 0, e o pulo registrado é "DESLIGADA" (não "SEM_CHAVE"/"FALHA", que confundiriam causa raiz).
 *
 *   npx tsx --env-file=.env.local scripts/testar_visao_desligada.mts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { executarVisao } from "../lib/visao";
import { RECEITAS } from "../lib/visao/receitas";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

secao("1 · confirma o estado real do banco antes de testar (fato, não suposição)");
{
  const { data, error } = await supabaseAdmin.from("urbis_config").select("visao_ligada").eq("id", 1).maybeSingle();
  t("consulta funcionou", !error, error?.message);
  t("visao_ligada é false de verdade neste banco agora", data?.visao_ligada === false, JSON.stringify(data));
}

secao("2 · receitas ativas continuam ativas no CÓDIGO (a garantia é o interruptor, não desativar a receita)");
{
  const ativas = RECEITAS.filter((r) => r.ativa).map((r) => r.id);
  t("CALCULO_DE_VAGAS e ICCAP seguem ativa:true no catálogo (não mexemos em receita)", ativas.includes("prancha.calculo_de_vagas") && ativas.includes("prancha.iccap"), ativas.join(", "));
}

secao("3 · executarVisao real, documento com papel certo presente — zero chamada ao Gemini");
{
  // PNG mínimo válido (1x1 transparente) — não importa o conteúdo: a checagem de "ligada" acontece
  // ANTES de montar recorte ou chamar o modelo (ver lib/visao/index.ts, ordem das defesas).
  const png1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const resultado = await executarVisao({
    entradas: [{ hash: "hash-fake-teste-desligada", papeis: ["projeto"], buffer: new Uint8Array(png1x1) }],
    processoCodigo: "TESTE-VISAO-DESLIGADA-000",
    usuarioId: null,
    jaResolvidos: {},
  });
  t("nenhuma chamada ao Gemini (chamadas === 0)", resultado.chamadas === 0, JSON.stringify(resultado));
  t("custo total é zero", resultado.custoTotal === 0);
  t("pulou as receitas ativas por causa do interruptor (motivo DESLIGADA)", resultado.pulos.some((p) => p.motivo === "DESLIGADA" && /vis[aã]o desligada/i.test(p.detalhe)), JSON.stringify(resultado.pulos));
  // Nenhum "campo" saiu como se tivesse sido lido — desligada nunca produz resultado de leitura.
  t("nenhum campo populado (a leitura não aconteceu, silenciosamente)", Object.keys(resultado.campos).length === 0, JSON.stringify(resultado.campos));
}

secao("4 · confirma que NENHUMA linha nova entrou em mhd_interpretacoes_visao por causa deste teste");
{
  const { count } = await supabaseAdmin
    .from("mhd_interpretacoes_visao")
    .select("*", { count: "exact", head: true })
    .eq("hash_documento", "hash-fake-teste-desligada");
  t("zero linhas gravadas pro hash de teste (nada foi processado nem cacheado)", (count ?? 0) === 0, String(count));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
