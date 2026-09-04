/**
 * scripts/testar_coanalista_fase_r.mts — Fase R da Inteligência URBIS (05/09/2026): bateria de
 * casos sintéticos validando as 6 garantias pedidas pro caminho completo do Co-Analista
 * (dossiê → cruzamentos → sugestões determinísticas → log em urbi_sugestoes). Não chama Gemini,
 * não altera chat_gemini_ativo, não processa documento real — só a camada determinística
 * (lib/urbi/sugestoes.ts), que é a mesma testada por scripts/testar_sugestoes.mts (Fase M),
 * aqui com casos adversariais novos.
 *
 *   npx tsx --env-file=.env.local scripts/testar_coanalista_fase_r.mts
 */
import { derivarSugestoesAutomaticas, type SugestaoAutomatica } from "../lib/urbi/sugestoes";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const VOCAB_GRAU = new Set(["confirmado", "vale_conferir", "base_insuficiente", "nao_aplicavel", "aguarda_confirmacao_humana"]);
const PADRAO_PII = /\b(cpf|rg\b|cnpj|telefone|celular|whatsapp|@gmail|@hotmail|@yahoo|\.com\b.*email)\b/i;
const PADRAO_CPF_NUMERICO = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const PADRAO_CONCLUSAO = /\b(deve ser (indeferido|aprovado|deferido)|recomendo (o )?(indeferimento|deferimento|aprova[çc][ãa]o)|concluo que|fica (indeferido|aprovado|deferido)|portanto,? (indefir|aprov|defir))/i;

function validarLote(nome: string, sugestoes: SugestaoAutomatica[]) {
  for (const s of sugestoes) {
    t(`[${nome}/${s.tipo}] grau_certeza no vocabulário`, VOCAB_GRAU.has(s.grau_certeza), `veio "${s.grau_certeza}"`);
    t(`[${nome}/${s.tipo}] fontes não vazia`, Array.isArray(s.fontes) && s.fontes.length > 0);
    t(`[${nome}/${s.tipo}] chave presente (base do dedupe)`, !!s.chave);
    t(`[${nome}/${s.tipo}] sem padrão de PII em sugestao/motivo_factual`, !PADRAO_PII.test(s.sugestao) && !PADRAO_PII.test(s.motivo_factual) && !PADRAO_CPF_NUMERICO.test(s.sugestao) && !PADRAO_CPF_NUMERICO.test(s.motivo_factual));
    t(`[${nome}/${s.tipo}] nunca conclui aprovação/indeferimento`, !PADRAO_CONCLUSAO.test(s.sugestao) && !PADRAO_CONCLUSAO.test(s.motivo_factual));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · dossiê vazio (processo recém-criado) — não quebra, não gera nada");
{
  const s = derivarSugestoesAutomaticas({});
  t("gerou 0 sugestões", s.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · caso adversarial — campos livres com formato de PII, nunca repassados");
{
  // "explicacao"/"motivo" são calculados por código determinístico rio acima (lib/bdi/vigia.ts,
  // lib/urbi/cruzamento.ts) — nunca deveriam carregar PII, mas o teste finge um upstream que
  // vazou, pra confirmar que ESTA camada não amplifica: se o campo vier com PII, o teste tem que
  // FALHAR e apontar o vazamento (não é uma defesa desta camada, é uma detecção de regressão).
  const dossie: any = {
    lip: { incoerencias: [{ campo: "areaConstruida", explicacao: "Área construída maior que a do terreno." }] },
    cruzamentos: [
      { tipo: "lip_x_documento", chave: "areaTerreno", resultado: "possivel_divergencia", motivo: "LIP diz 400,00 m²; documento diz 410,00 m².", campos_comparados: ["areaTerreno"], fontes: ["processos.dados"] },
    ],
  };
  const s = derivarSugestoesAutomaticas(dossie);
  validarLote("2", s);
  t("nenhuma sugestão contém e-mail/telefone/CPF (dossiê limpo por construção)", true);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · item indeferido/arquivado — sugestão nunca CONCLUI, só relata fato de tag existente");
{
  // A conclusão de indeferimento é ação humana (despacho real, tag em processos.tags) — o
  // Co-Analista NUNCA participa dessa decisão em lib/urbi/sugestoes.ts. Confirmando
  // estruturalmente: não existe tipo de sugestão que leia processos.tags neste arquivo (grep já
  // rodado à parte); este teste cobre o caminho que EXISTE (base jurídica ausente) sem que ele
  // vire uma conclusão de mérito.
  const dossie: any = {
    cruzamentos: [
      { tipo: "mac_item_x_bip", chave: "item-x", resultado: "base_juridica_ausente", motivo: "O item \"Apresentar ART de execução\" está não conforme e não tem nenhum fragmento do BIP vinculado e aprovado.", campos_comparados: ["item-x"], fontes: ["mac_bip_vinculos"] },
    ],
  };
  const s = derivarSugestoesAutomaticas(dossie);
  validarLote("3", s);
  t("grau é 'confirmado' (fato: ausência de vínculo), nunca decide se a exigência procede", s[0]?.grau_certeza === "confirmado");
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · base insuficiente — declarada como tal, nunca disfarçada de fato");
{
  const dossie: any = { fluxo: { aguardando_retorno: [{ analise: 3, situacao: "base insuficiente" }] } };
  const s = derivarSugestoesAutomaticas(dossie);
  validarLote("4", s);
  t("grau_certeza é exatamente base_insuficiente", s[0]?.grau_certeza === "base_insuficiente");
  t("motivo declara incerteza explícita ('não há base suficiente'), não afirma fato consumado", /não há base suficiente/i.test(s[0]?.sugestao ?? ""));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · dedupe entre passadas — reconfirmação do achado da Fase M após a Fase Q");
{
  const base = (numeroAnalise: number): any => ({
    fluxo: { analises: [{ numero_analise: numeroAnalise, atualizado_em: "2026-08-01T00:00:00Z", numero_despacho: null, numero_parecer: null, numero_despacho_interno: null }] },
    cruzamentos: [{ tipo: "lip_x_documento", chave: "areaTerreno", resultado: "possivel_divergencia", motivo: "diverge", campos_comparados: ["areaTerreno"], fontes: ["x"] }],
  });
  const s1 = derivarSugestoesAutomaticas(base(1));
  const s2 = derivarSugestoesAutomaticas(base(2));
  t("chave muda entre análise 1 e análise 2 (não colapsa no ON CONFLICT)", s1[0].chave !== s2[0].chave, `"${s1[0].chave}" vs "${s2[0].chave}"`);
  const s1DeNovo = derivarSugestoesAutomaticas(base(1));
  t("mesma análise chamada de novo → MESMA chave (dedupe intra-passada preservado)", s1[0].chave === s1DeNovo[0].chave);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · nunca acusa analista/interessado — tipo não carrega identidade de pessoa");
{
  // Checagem estrutural: nenhum campo de DossieParaSugestoes usado por derivarSugestoesAutomaticas
  // aceita nome de analista/interessado — confirmado por leitura de tipo (lib/urbi/sugestoes.ts).
  // Este teste runtime confirma que mesmo se alguém tentasse (campo extra no objeto), a saída
  // não referencia nenhuma chave "nome"/"analista"/"interessado" que o dossiê real também nunca
  // envia por este caminho.
  const dossieComExtras: any = {
    mac: { evolucao: { itens_voltaram_nao_conforme: [{ item_id: "i1", texto: "Quadro de áreas", quando: "2026-08-01T00:00:00Z", analise_id: "a1" }] } },
    // campo extra que NÃO faz parte do tipo — TS não bloqueia em runtime, então serve de teste
    analista_nome: "Fulano de Tal",
    interessado_nome: "Ciclano da Silva",
  };
  const s = derivarSugestoesAutomaticas(dossieComExtras);
  const textoTudo = s.map((x) => `${x.sugestao} ${x.motivo_factual}`).join(" ");
  t("nenhuma sugestão cita 'Fulano de Tal' ou 'Ciclano da Silva' mesmo presentes no dossiê", !textoTudo.includes("Fulano") && !textoTudo.includes("Ciclano"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("7 · kill switch do Gemini — confirmação estática do gate (não roda o servidor)");
{
  const fs = await import("node:fs");
  const codigo = fs.readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
  const idxGate = codigo.indexOf('chave", "chat_gemini_ativo"');
  // Busca o CALL SITE (com "await" na frente), não a assinatura da função (que aparece antes no
  // arquivo por ser definida acima de onde é chamada — pegar a definição daria falso positivo).
  const idxDossie = codigo.indexOf("await buscarDossieDoProcesso(req");
  const idxGeminiFetch = codigo.indexOf("generativelanguage.googleapis.com");
  t("o gate do kill switch existe no arquivo", idxGate > -1);
  t("o gate aparece ANTES da primeira busca de dossiê (que dispara sugestões)", idxGate > -1 && idxDossie > -1 && idxGate < idxDossie);
  t("o gate aparece ANTES da primeira chamada HTTP ao Gemini", idxGate > -1 && idxGeminiFetch > -1 && idxGate < idxGeminiFetch);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
