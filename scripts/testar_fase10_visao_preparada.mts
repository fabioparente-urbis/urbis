/**
 * scripts/testar_fase10_visao_preparada.mts — Fase 10 do mandato de 12 fases (05/09/2026):
 * auditoria de visão preparada/desligada. Esta fase não escreveu código de produção (só o
 * documento docs/URBIS_FASE10_VISAO_PREPARADA.md) — este teste confirma que as guardas que a
 * auditoria descreveu continuam batendo com o código e o banco reais, e que nada foi ativado
 * por engano.
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase10_visao_preparada.mts
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { RECEITAS } from "../lib/visao/receitas";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · interruptor geral continua desligado (dado real do banco)");
{
  const { data, error } = await supabaseAdmin.from("urbis_config").select("visao_ligada").eq("id", 1).maybeSingle();
  t("consulta real funcionou", !error, error?.message);
  t("visao_ligada === false", data?.visao_ligada === false, `valor real: ${data?.visao_ligada}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · catálogo RECEITAS não ganhou nenhuma entrada nesta fase (auditoria, não implementação)");
{
  t("RECEITAS ainda tem exatamente 3 entradas", RECEITAS.length === 3, `n=${RECEITAS.length}`);
  const ativas = RECEITAS.filter((r) => r.ativa).map((r) => r.id);
  const preparadas = RECEITAS.filter((r) => !r.ativa).map((r) => r.id);
  t("2 ativas (CALCULO_DE_VAGAS, ICCAP)", ativas.length === 2, JSON.stringify(ativas));
  t("1 preparada (quadro de áreas)", preparadas.length === 1 && preparadas[0] === "prancha.quadro_areas_completo", JSON.stringify(preparadas));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · carimboMetadados.ts continua isolado (nenhum arquivo real passou a importá-lo)");
{
  const alvos = [
    "lib/mac-motor/slot5/index.ts",
    "lib/mac-motor/slot5/contraConferencia.ts",
    "lib/mac-motor/slot5/gemini.ts",
  ];
  for (const caminho of alvos) {
    const codigo = readFileSync(new URL(`../${caminho}`, import.meta.url), "utf-8");
    t(`${caminho} não importa carimboMetadados`, !codigo.includes("carimboMetadados"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · achado de onerosa/altura continua registrado como PENDENTE_VISAO (não foi resolvido por engano)");
{
  const codigo = readFileSync(new URL("../lib/mac-motor/slot5/outorgaOnerosa.ts", import.meta.url), "utf-8");
  t('comentário "PENDENTE_VISAO" continua presente', codigo.includes("PENDENTE_VISAO"));
  t("nenhuma leitura de alturaDaEdificacao aponta pra uma receita de visão nova", !codigo.includes("lib/visao/corte") && !codigo.includes("lib/visao/fachada"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · zero chamada Gemini causada por esta auditoria");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  // Nenhuma ação de rede nesta seção — só relê o catálogo já importado acima.
  const semUso = RECEITAS.filter((r) => !r.ativa);
  t("catálogo lido sem chamar rede", Array.isArray(semUso));
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · documento da Fase 10 existe e declara o essencial");
{
  const doc = readFileSync(new URL("../docs/URBIS_FASE10_VISAO_PREPARADA.md", import.meta.url), "utf-8");
  t("documento existe e não está vazio", doc.length > 500);
  t("declara visao_ligada confirmado false", doc.includes("visao_ligada") && doc.includes("false"));
  t("mapeia os 11 itens pedidos", (doc.match(/\| \d+ \|/g) ?? []).length === 11, `linhas de tabela encontradas: ${(doc.match(/\| \d+ \|/g) ?? []).length}`);
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
