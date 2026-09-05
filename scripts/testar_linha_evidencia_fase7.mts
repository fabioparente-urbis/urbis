/**
 * scripts/testar_linha_evidencia_fase7.mts — Fase 7 do mandato de 12 fases (05/09/2026):
 * aprimorar a linha de evidência. Valida:
 *  1. o contrato futuro de vínculo estrutural é INERTE hoje (nenhum despacho real grava
 *     checklist_item_id) — nenhuma mudança de comportamento em produção;
 *  2. SE um dia existir (testado com dado fabricado em memória, nunca gravado no banco — Slot 5/
 *     Aceite SEI/Regularização são só-leitura, nunca escrevemos em mdp_registros pra testar
 *     isto), o contrato ativa corretamente como vínculo_estruturado, validado contra o modelo
 *     certo;
 *  3. as garantias já existentes da Fase 2/Camada 3 continuam valendo: texto nunca vira
 *     "confirmado", resultado misto com regressão continua "reincidiu", Slot 5 continua com
 *     `mhd_eventos.compatibilizacao` só como candidato.
 *
 *   npx tsx --env-file=.env.local scripts/testar_linha_evidencia_fase7.mts
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { tentarVinculoEstruturalFuturo, montarLinhaEvidenciaExigencias } from "../lib/urbi/linhaEvidencia";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · contrato futuro é INERTE com dado real de hoje (nenhum despacho grava checklist_item_id)");
{
  const { data: amostraReal } = await supabaseAdmin.from("mdp_registros").select("conteudo").not("conteudo->pendencias_mac", "is", null).limit(20);
  let algumComId = false;
  for (const m of amostraReal ?? []) {
    const pendencias = (m as any).conteudo?.pendencias_mac ?? [];
    if (pendencias.some((p: any) => typeof p.checklist_item_id === "string")) algumComId = true;
  }
  t("nenhum despacho real (amostra de 20) grava checklist_item_id hoje", !algumComId);

  const resultado = tentarVinculoEstruturalFuturo(
    [{ grupo: "Documentação", texto: "qualquer coisa" }], // sem checklist_item_id — igual a 100% dos despachos reais
    [{ id: "fake-id", texto: "qualquer coisa", grupo: "Documentação" }],
  );
  t("função pura devolve null quando a pendência não tem checklist_item_id (comportamento de hoje)", resultado === null);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · SE existir checklist_item_id (dado fabricado em memória, nunca gravado no banco), ativa corretamente");
{
  const catalogo = [{ id: "item-real-123", texto: "Anexar ART/RRT de execução;", grupo: "Documentação" }];

  const comIdValido = tentarVinculoEstruturalFuturo(
    [{ grupo: "Documentação", texto: "Anexar ART/RRT de execução;", checklist_item_id: "item-real-123" }],
    catalogo,
  );
  t("id que existe no catálogo do modelo certo → vínculo estrutural reconhecido", comIdValido !== null && comIdValido.length === 1, JSON.stringify(comIdValido));
  t("rótulo vem do catálogo (fonte confiável), com grupo", comIdValido?.[0]?.grupo === "Documentação");

  const comIdInvalido = tentarVinculoEstruturalFuturo(
    [{ grupo: "Documentação", texto: "outra coisa", checklist_item_id: "id-que-nao-existe-nesse-modelo" }],
    catalogo,
  );
  t("id que NÃO existe no catálogo desta análise → tratado como se não existisse (nunca confia cegamente)", comIdInvalido === null, JSON.stringify(comIdInvalido));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · garantias já existentes da Camada 3 continuam valendo (não regrediram)");
{
  const codigoFonte = readFileSync(new URL("../lib/urbi/linhaEvidencia.ts", import.meta.url), "utf-8");
  t("texto idêntico e único nunca vira 'confirmado' (trava explícita no código)", codigoFonte.includes('grau = "parcial"; // regra rígida: nunca "confirmado" quando a origem é texto'));
  t("resultado misto com regressão continua forçando 'reincidiu'", codigoFonte.includes("naoAtendidas.length > 0 ? \"reincidiu\" : \"confirmado_atendido\""));
  t("Slot 5: compatibilizacao continua só como candidato, nunca resultado direto", codigoFonte.includes("candidato, não é nova análise MAC"));
  t('mhd_versoes.rodada nunca é usado como número de análise (nenhuma consulta .from("mhd_versoes") neste arquivo — só o comentário que documenta o achado)', !codigoFonte.includes('.from("mhd_versoes")'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · linha de evidência real (3 slots) continua funcionando sem regressão");
{
  const { montarDossieFactual } = await import("../lib/urbi/montarDossie");
  const { montarRelatorioMotor } = await import("../lib/urbi/motorProducao");
  const USUARIO = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;
  for (const codigo of ["25.5.000046759-5", "25.5.000016900-4", "48533"]) {
    const resultado = await montarDossieFactual(codigo, USUARIO);
    if (!resultado.ok) { t(`[${codigo}] dossiê ok`, false, resultado.erro); continue; }
    const d = resultado.data as any;
    const relatorio = montarRelatorioMotor(d);
    const { data: proc } = await supabaseAdmin.from("processos").select("tags").eq("codigo", codigo).maybeSingle();
    const tagsProcesso = Array.isArray((proc as any)?.tags) ? (proc as any).tags : [];
    const bloco = await montarLinhaEvidenciaExigencias(codigo, d, tagsProcesso);
    t(`[${codigo}] monta sem lançar exceção`, Array.isArray(bloco.registros));
    t(`[${codigo}] nenhum registro com metodo_relacao='vinculo_estruturado' vindo de texto (só de retrabalho ou do contrato futuro, nunca de texto)`, bloco.registros.every((r) => r.metodo_relacao !== "vinculo_estruturado" || r.limitacoes.length === 0 || !r.limitacoes.some((l) => l.includes("igualdade exata de texto"))));
  }
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
