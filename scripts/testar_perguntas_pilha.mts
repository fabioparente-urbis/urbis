/**
 * scripts/testar_perguntas_pilha.mts — Camada 2 da arquitetura mestra do URBI (05/09/2026):
 * perguntas factuais ricas sobre a Pilha, respondidas sem Gemini a partir dos retratos do Radar.
 * Bateria pedida: onerosa, bairro, pavimentos, terceira análise, indeferidos no ano, retornados
 * da gerência, "mais perto de emitir".
 *
 *   npx tsx --env-file=.env.local scripts/testar_perguntas_pilha.mts
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { montarDossieFactual } from "../lib/urbi/montarDossie";
import { montarRelatorioMotor } from "../lib/urbi/motorProducao";
import { montarBlocoAtributosConsultaveis } from "../lib/urbi/catalogoConsultaPilha";
import { processarProximoPendente, type VisibilidadeUsuario } from "../lib/urbi/radar";
import { responderPerguntaPilha } from "../lib/urbi/perguntasPilha";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const ADMIN: VisibilidadeUsuario = { userId: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", irrestrito: true, gerencia: null, perfis: ["Administrador"] };
const USUARIO_ADMIN_REQ = { id: ADMIN.userId, perfis: ADMIN.perfis, gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · auditoria de chave real por slot (confere contra lip_campos de verdade, não suposição)");
{
  const { data: assuntos } = await supabaseAdmin.from("assuntos").select("id, slug").in("slug", ["regularizacao", "aceite_sei", "slot_05"]);
  for (const slug of ["regularizacao", "aceite_sei", "slot_05"]) {
    const assunto = (assuntos ?? []).find((a: any) => a.slug === slug) as any;
    const { data: campos } = await supabaseAdmin.from("lip_campos").select("chave, label, lip_abas!inner(assunto_id)").eq("lip_abas.assunto_id", assunto.id);
    const chaveEsperada = slug === "slot_05" ? "outorgaOnerosa" : "onerosa";
    const existe = (campos ?? []).some((c: any) => c.chave === chaveEsperada);
    t(`[${slug}] chave de onerosa "${chaveEsperada}" existe de verdade em lip_campos`, existe);
    t(`[${slug}] chave "bairro" existe de verdade em lip_campos`, (campos ?? []).some((c: any) => c.chave === "bairro"));
    t(`[${slug}] chave "pav" existe de verdade em lip_campos`, (campos ?? []).some((c: any) => c.chave === "pav"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · montarBlocoAtributosConsultaveis — sintético, cobre os 3 slots e a normalização onerosa≠onerosa");
{
  const relatorioFake = { situacao: "x", acoes: [], esforco: "rapido" as const, motivo: "x" };
  const dReg = {
    processo: { tipo_processo: "regularizacao", porte: "GP", area_construida: 300 },
    lip: { campos_tecnicos: { bairro: { valor: "SETOR BUENO", rotulo: "Bairro" }, onerosa: { valor: "Sim", rotulo: "Tem Onerosa?" }, pav: { valor: "6", rotulo: "Número de Pavimentos" } }, campos_vazios: 4, campos_em_x: 0, campos_totais: 86 },
    mac: { ultima_analise: { numero_analise: 2 }, pendencias_ultima_analise: [{}, {}] },
    situacoes: { geral: { classe: "MAC em análise" } },
    fluxo: { aguardando_retorno: [], retrabalho_entre_passadas: [{}] },
  };
  const blocoReg = montarBlocoAtributosConsultaveis(dReg, relatorioFake, []);
  t("bloco Regularização: bairro disponível e correto", blocoReg.bairro.disponivel && blocoReg.bairro.valor === "SETOR BUENO");
  t("bloco Regularização: onerosa=true (chave 'onerosa')", blocoReg.onerosa.disponivel && blocoReg.onerosa.valor === true);
  t("bloco Regularização: pavimentos=6", blocoReg.pavimentos.disponivel && blocoReg.pavimentos.valor === 6);
  t("bloco Regularização: faixa_area = de_251_a_1000 (300 m²)", blocoReg.faixa_area.valor === "de_251_a_1000");
  t("bloco Regularização: porte vem de processos.porte, não do LIP", blocoReg.porte.valor === "GP");
  t("bloco Regularização: analise_atual = 2", blocoReg.analise_atual.valor === 2);
  t("bloco Regularização: retorno_gerencia SEMPRE indisponível, motivo explícito", !blocoReg.retorno_gerencia.disponivel && /nenhuma tabela ou tag/.test(blocoReg.retorno_gerencia.motivo ?? ""));

  const dSlot5 = {
    ...dReg,
    processo: { ...dReg.processo, tipo_processo: "slot_05" },
    lip: { ...dReg.lip, campos_tecnicos: { bairro: { valor: "SETOR BUENO", rotulo: "Bairro" }, outorgaOnerosa: { valor: "Não", rotulo: "Outorga Onerosa?" }, pav: { valor: "10", rotulo: "NÚMERO DE PAVIMENTOS" } } },
  };
  const blocoSlot5 = montarBlocoAtributosConsultaveis(dSlot5, relatorioFake, []);
  t("bloco Slot 5: onerosa lida da chave DIFERENTE 'outorgaOnerosa' (nunca 'onerosa')", blocoSlot5.onerosa.disponivel && blocoSlot5.onerosa.valor === false);
  t("bloco Slot 5: pavimentos=10 (chave 'pav' estável entre slots)", blocoSlot5.pavimentos.valor === 10);

  // Indeferimento com tag real
  const tagsComIndeferimento = [{ tipo: "indeferimento", criado_em: "2026-03-15T10:00:00Z" }];
  const blocoIndeferido = montarBlocoAtributosConsultaveis({ ...dReg, situacoes: { geral: { classe: "Arquivado/indeferido" } } }, relatorioFake, tagsComIndeferimento);
  t("data_indeferimento populada a partir da tag real", blocoIndeferido.data_indeferimento.disponivel && blocoIndeferido.data_indeferimento.valor === "2026-03-15T10:00:00Z");
  const blocoSemTag = montarBlocoAtributosConsultaveis(dReg, relatorioFake, []);
  t("sem tag de indeferimento → indisponível, nunca inventado", !blocoSemTag.data_indeferimento.disponivel);

  // Nunca chave crua nem dado pessoal
  const jsonBloco = JSON.stringify(blocoReg);
  t("nenhuma chave técnica crua no bloco serializado (fonte é sempre rótulo/descrição humana)", !/"chave"\s*:/.test(jsonBloco));
  t("bloco não inclui nome/CPF/telefone (não existe campo pra isso na lista autorizada)", !/proprietario|cpf|telefone/i.test(jsonBloco));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · atualiza campos_consulta de processos REAIS (força reprocessamento) — necessário pro teste 4");
{
  const processosReais = ["25.5.000046759-5", "25.5.000016900-4", "48533"];
  for (const codigo of processosReais) {
    await supabaseAdmin.from("urbi_radar_retratos").delete().eq("processo_codigo", codigo).in("estado", ["pendente", "em_atualizacao"]);
    const { data: ultimo } = await supabaseAdmin.from("urbi_radar_retratos").select("versao").eq("processo_codigo", codigo).order("versao", { ascending: false }).limit(1).maybeSingle();
    // tipo_processo vem de `processos` de verdade (nunca de um retrato anterior que pode nem
    // existir mais) — é exatamente o achado real que expôs o bug corrigido em radar.ts.
    const { data: processoReal } = await supabaseAdmin.from("processos").select("tipo_processo").eq("codigo", codigo).maybeSingle();
    await supabaseAdmin.from("urbi_radar_retratos").insert({ processo_codigo: codigo, tipo_processo: (processoReal as any)?.tipo_processo ?? null, versao: ((ultimo as any)?.versao ?? 0) + 1, estado: "pendente", motivo_disparo: "reforçar teste da Camada 2" });
  }
  for (let i = 0; i < processosReais.length; i++) {
    const r = await processarProximoPendente(ADMIN);
    t(`processou item ${i + 1}/${processosReais.length} da fila de teste`, r.processado, JSON.stringify(r));
  }
  const { data: verificacao } = await supabaseAdmin.from("urbi_radar_retratos").select("processo_codigo, tipo_processo, campos_consulta").in("processo_codigo", processosReais).order("versao", { ascending: false });
  // Mantém só a PRIMEIRA ocorrência por código (a de maior versão, já que a consulta ordena
  // DESC) — `new Map(array.map(...))` guardaria a ÚLTIMA, que é a de menor versão.
  const comCampos = new Set<string>();
  const tipoPorCodigo = new Map<string, string | null>();
  for (const r of (verificacao ?? []) as any[]) {
    if (r.campos_consulta) comCampos.add(r.processo_codigo);
    if (!tipoPorCodigo.has(r.processo_codigo)) tipoPorCodigo.set(r.processo_codigo, r.tipo_processo);
  }
  for (const codigo of processosReais) {
    t(`${codigo}: campos_consulta populado de verdade`, comCampos.has(codigo));
    // Achado real: tipo_processo só era gravado no INSERT (fila), nunca reconferido no UPDATE —
    // se o enqueue chegasse nulo, o retrato ficava "slot não identificado" pra sempre.
    t(`${codigo}: tipo_processo REAFIRMADO pelo próprio processamento (nunca 'slot não identificado')`, !!tipoPorCodigo.get(codigo), `veio: ${tipoPorCodigo.get(codigo)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · responderPerguntaPilha — as 7 perguntas pedidas, contra dado REAL");
{
  const perguntas: [string, RegExp][] = [
    ["Quais processos têm onerosa?", /onerosa|nenhum processo visível com onerosa/i],
    ["Quais processos são do Setor Bueno?", /bueno|nenhum processo visível no bairro/i],
    ["Quais processos têm 6 pavimentos?", /pavimento/i],
    ["Quais estão na terceira análise?", /análise|analise/i],
    ["Quais foram indeferidos este ano?", /indeferid|base insuficiente/i],
    ["Quais processos retornaram da gerência?", /base insuficiente.*ger[êe]ncia|ger[êe]ncia.*base insuficiente/i],
    ["Qual está mais perto de emitir?", /mais perto de emitir|base insuficiente/i],
  ];
  for (const [pergunta, padraoEsperado] of perguntas) {
    const resposta = await responderPerguntaPilha(pergunta, ADMIN);
    t(`"${pergunta}" → respondida (não caiu no fluxo normal)`, resposta !== null, String(resposta));
    if (resposta) t(`"${pergunta}" → conteúdo condizente`, padraoEsperado.test(resposta), resposta);
  }

  // Pergunta que NÃO deveria casar nenhum padrão (fica pro Gemini decidir, se pedido) — confirma
  // que o reconhecedor não é ganancioso.
  const foraDoEscopo = await responderPerguntaPilha("O que é AEIS?", ADMIN);
  t('pergunta fora do escopo ("O que é AEIS?") devolve null — nunca inventa resposta factual', foraDoEscopo === null);
}

// ─────────────────────────────────────────────────────────────────────────────
secao('5 · "mais perto de emitir" — critério visível na resposta, sem ranking nominal');
{
  const resposta = await responderPerguntaPilha("qual processo está mais perto de emitir?", ADMIN);
  t("resposta existe", resposta !== null);
  if (resposta) {
    t('declara o CRITÉRIO por extenso ("esforço provável do Motor de Produção")', /esforço provável do motor de produção|esforço provável/i.test(resposta));
    t("nunca cita nome de analista/profissional (não é ranking nominal de pessoa)", !/analista|profissional|autor|respons[áa]vel t[ée]cnico/i.test(resposta));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · zero Gemini — checagem estrutural + real");
{
  const fs = await import("node:fs");
  const src1 = fs.readFileSync(new URL("../lib/urbi/perguntasPilha.ts", import.meta.url), "utf-8");
  const src2 = fs.readFileSync(new URL("../lib/urbi/catalogoConsultaPilha.ts", import.meta.url), "utf-8");
  t("perguntasPilha.ts nunca referencia a API do Gemini", !src1.includes("generativelanguage.googleapis.com") && !src1.includes("GEMINI_API_KEY"));
  t("catalogoConsultaPilha.ts nunca referencia a API do Gemini", !src2.includes("generativelanguage.googleapis.com") && !src2.includes("GEMINI_API_KEY"));

  const { count } = await supabaseAdmin
    .from("urbis_api_calls")
    .select("*", { count: "exact", head: true })
    .eq("modulo", "URBI")
    .not("modelo", "is", null)
    .gte("criado_em", new Date(Date.now() - 5 * 60 * 1000).toISOString());
  t("nenhuma chamada de modelo registrada em urbis_api_calls nos últimos 5 min por causa deste teste", (count ?? 0) === 0, `count=${count}`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
