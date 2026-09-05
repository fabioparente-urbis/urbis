/**
 * scripts/testar_motor_producao.mts — Motor de Produção do Co-Analista. Bateria pedida:
 *   1. ação curta;
 *   2. prioridade correta;
 *   3. esforço classificado com fonte;
 *   4. ausência de dado → base insuficiente;
 *   5. nenhuma alteração automática.
 * Contra processos REAIS dos 3 slots, só leitura. Não chama Gemini.
 *
 *   npx tsx --env-file=.env.local scripts/testar_motor_producao.mts
 */
import { montarDossieFactual } from "../lib/urbi/montarDossie";
import { montarRelatorioMotor, formatarRelatorioMotor, type RelatorioMotor } from "../lib/urbi/motorProducao";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const USUARIO_ADMIN = { id: "1781e5cf-b09a-404c-87f6-6363cc4d8fe9", perfis: ["Administrador"], gerencia: null, irrestrito: true, gerenciaDoPerfil: null } as any;
const ESFORCOS_VALIDOS = new Set(["rapido", "exige_atencao", "depende_documento", "base_insuficiente"]);
const PADRAO_TECNICO = /\b(processo|situacoes|lip|mac|fluxo|cruzamentos|tecnico|cobertura)\.[a-z_]+/i;
const PADRAO_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LIMITE_LINHA = 140; // "curto" — nenhuma ação vira parágrafo

function validarRelatorio(nome: string, r: RelatorioMotor) {
  t(`[${nome}] no máximo 3 ações`, r.acoes.length <= 3, `${r.acoes.length} ações`);
  t(`[${nome}] esforço é um dos 4 rótulos válidos`, ESFORCOS_VALIDOS.has(r.esforco), r.esforco);
  t(`[${nome}] motivo presente e curto (fonte objetiva)`, r.motivo.length > 0 && r.motivo.length < 200, r.motivo);
  t(`[${nome}] situação presente`, r.situacao.length > 0, r.situacao);
  for (const [i, a] of r.acoes.entries()) {
    t(`[${nome}] ação ${i + 1} é curta (≤${LIMITE_LINHA} car.)`, a.texto.length <= LIMITE_LINHA, a.texto);
    t(`[${nome}] ação ${i + 1} tem motivo com fonte`, a.motivo.length > 0);
    t(`[${nome}] ação ${i + 1} sem chave técnica/caminho`, !PADRAO_TECNICO.test(a.texto) && !PADRAO_TECNICO.test(a.motivo), `${a.texto} | ${a.motivo}`);
    t(`[${nome}] ação ${i + 1} sem UUID`, !PADRAO_UUID.test(a.texto) && !PADRAO_UUID.test(a.motivo));
    t(`[${nome}] ações em ordem de prioridade não-decrescente (tier)`, i === 0 || a.tier >= r.acoes[i - 1].tier, `tiers: ${r.acoes.map((x) => x.tier).join(",")}`);
    t(`[${nome}] ação ${i + 1} não promete prazo/data (sem "em X dias"/"até")`, !/\bem \d+ dias?\b|\baté \d{1,2}\/\d{1,2}\b/i.test(a.texto));
    // Achado real (Slot 5, 48533): truncar o texto composto inteiro cortava o "(grupo)." no
    // meio, deixando parêntese pendurado sem fechar — corrigido reservando espaço fixo pro
    // sufixo (ver compor() em motorProducao.ts). Confirma que nunca mais falta o fechamento.
    const abertos = (a.texto.match(/\(/g) ?? []).length;
    const fechados = (a.texto.match(/\)/g) ?? []).length;
    t(`[${nome}] ação ${i + 1} nunca deixa parêntese aberto sem fechar`, abertos === fechados, a.texto);
  }
  const texto = formatarRelatorioMotor(r);
  t(`[${nome}] formatação segue o template exato`, texto.startsWith("Situação:") && texto.includes("\nAgora:\n") && texto.includes("\nEsforço provável:\n•") && texto.includes("\nMotivo:\n•"), texto);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · Regularização SEI (25.5.000046759-5) — processo real com pendência conhecida");
{
  const r = await montarDossieFactual("25.5.000046759-5", USUARIO_ADMIN);
  if (!r.ok) { t("carregou", false, r.erro); }
  else {
    const relatorio = montarRelatorioMotor(r.data as any);
    validarRelatorio("Regularização", relatorio);
    console.log("\n  --- saída real ---\n" + formatarRelatorioMotor(relatorio).split("\n").map((l) => "  " + l).join("\n"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · Aceite SEI (25.5.000016900-4)");
{
  const r = await montarDossieFactual("25.5.000016900-4", USUARIO_ADMIN);
  if (!r.ok) { t("carregou", false, r.erro); }
  else {
    const relatorio = montarRelatorioMotor(r.data as any);
    validarRelatorio("Aceite SEI", relatorio);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · Aprovação de Projeto / Slot 5 (48533) — mais complexo, 539 itens de checklist");
{
  const r = await montarDossieFactual("48533", USUARIO_ADMIN);
  if (!r.ok) { t("carregou", false, r.erro); }
  else {
    const relatorio = montarRelatorioMotor(r.data as any);
    validarRelatorio("Slot 5", relatorio);
    console.log("\n  --- saída real ---\n" + formatarRelatorioMotor(relatorio).split("\n").map((l) => "  " + l).join("\n"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · prioridade correta — sintético, ordem fixa mesmo com todos os tiers presentes");
{
  const dSintetico = {
    situacoes: { lip: { classe: "Incompleto" }, mac: { classe: "Em análise" } },
    lip: { campos_vazios_rotulos: ["DOC SEI — ART de Execução", "Bairro"], campos_em_x_rotulos: [] },
    mac: {
      pendencias_ultima_analise: [{ item_id: "1", grupo: "Recuos", texto: "Apresentar comprovante de recuo", vinculos_bip: [] }],
      marcacoes_ultima_analise: [{ item_id: "2", grupo: "X", texto: "Item com observação", observacao: "nota do analista" }],
      evolucao: { itens_voltaram_nao_conforme: [{ item_id: "3", texto: "Voltou", quando: "2026-08-01" }], itens_pendentes_mantidos: [] },
    },
    fluxo: { retrabalho_entre_passadas: [], aguardando_retorno: [] },
    cruzamentos: [{ tipo: "lip_x_documento", chave: "Área do Terreno", resultado: "possivel_divergencia", motivo: "LIP diz 400; documento diz 410." }],
    tecnico: { mudancas_estruturais: [] },
    cobertura: { completo: true, fontes_indisponiveis: [] },
  };
  const relatorio = montarRelatorioMotor(dSintetico);
  t("tier 1 (pendência MAC) vem primeiro, mesmo com tiers 2-6 disponíveis", relatorio.acoes[0]?.tier === 1, JSON.stringify(relatorio.acoes.map((a) => a.tier)));
  t("só as 3 primeiras (por tier) aparecem, mesmo havendo 5 candidatos no total", relatorio.acoes.length === 3);
  t("tier 2 (documento) vem antes do tier 3 (campo comum)", relatorio.acoes[1]?.tier === 2);
  validarRelatorio("sintético-prioridade", relatorio);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · ausência de dado → base insuficiente (cobertura incompleta, sem candidato)");
{
  const dSemCobertura = {
    situacoes: { lip: { classe: "Completo" }, mac: { classe: "Não iniciado" } },
    lip: { campos_vazios_rotulos: [], campos_em_x_rotulos: [] },
    mac: { pendencias_ultima_analise: [], marcacoes_ultima_analise: [], evolucao: {} },
    fluxo: { retrabalho_entre_passadas: [], aguardando_retorno: [] },
    cruzamentos: [],
    tecnico: {},
    cobertura: { completo: false, fontes_indisponiveis: ["mac_historico: timeout"] },
  };
  const relatorio = montarRelatorioMotor(dSemCobertura);
  t("zero ações", relatorio.acoes.length === 0);
  t("esforço vira base_insuficiente (nunca finge saber)", relatorio.esforco === "base_insuficiente", relatorio.esforco);
  t("motivo cita a fonte indisponível", relatorio.motivo.includes("fonte(s) indisponível"), relatorio.motivo);

  // Processo limpo (cobertura completa, mas sem nenhum sinal) é DIFERENTE de base insuficiente —
  // é "em dia", não "sem dado".
  const dLimpo = { ...dSemCobertura, cobertura: { completo: true, fontes_indisponiveis: [] } };
  const relatorioLimpo = montarRelatorioMotor(dLimpo);
  t("processo sem pendência E com cobertura completa NÃO vira base_insuficiente (é 'em dia')", relatorioLimpo.esforco !== "base_insuficiente", relatorioLimpo.esforco);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · nenhuma alteração automática — checagem estrutural do código");
{
  const fs = await import("node:fs");
  const motor = fs.readFileSync(new URL("../lib/urbi/motorProducao.ts", import.meta.url), "utf-8");
  t("motorProducao.ts não importa supabaseAdmin nem faz nenhuma escrita", !motor.includes("supabaseAdmin") && !/\.(insert|update|delete|upsert)\(/.test(motor));
  t("motorProducao.ts não chama a API do Gemini (nenhum fetch/endpoint real)", !motor.includes("generativelanguage.googleapis.com") && !motor.includes("fetch("));

  const rota = fs.readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  // Há 2 chamadas ao Gemini no arquivo (OnMount, mais acima; e o fluxo principal, mais abaixo) —
  // o motor intercepta ANTES da chamada do FLUXO PRINCIPAL (a que o Co-Analista usaria), então
  // compara com a ÚLTIMA ocorrência do endpoint, não a primeira (que é só a saudação OnMount).
  t("motor intercepta ANTES da chamada principal ao Gemini (fetch)", rota.indexOf("montarRelatorioMotor(dossie.dBruto)") < rota.lastIndexOf("generativelanguage.googleapis.com"));
  t("motor nunca ativa em modo BIP", /!modoBipAtivo && !pedeDetalheCompleto/.test(rota));
  t("motor só ativa com dossiê OK (processo em contexto)", /dossie\?\.status === "ok" && !modoBipAtivo/.test(rota));
  t('palavras de escape ("detalhe"/"fonte"/"histórico"/"lei") cobertas', ["detalhe", "fonte", "histórico", "lei"].every((p) => rota.includes(p)));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
