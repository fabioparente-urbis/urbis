/**
 * scripts/testar_fase_ac_correcoes_piloto.mts — Fase AC (04/09/2026): os 3 defeitos achados na
 * Etapa 1 do piloto humano real (Regularização SEI, 25.5.000046759-5) e a bateria obrigatória
 * pedida antes de retomar o piloto:
 *   1. resumo sem chave técnica exposta como fonte
 *   2. fontes só com rótulos humanos
 *   3. nenhuma divergência sem regra semântica (bloqueio de comparação livre do Gemini)
 *   4. coerência responde ou mostra erro específico/auditável (nunca mais some sem registro)
 *   5. nenhuma alteração em LIP/MAC/documento/despacho/numeração/MRP/BIP
 *
 * A verificação de dado real (rótulo humano contra `lip_campos` de verdade) já está em
 * scripts/testar_rotulos_lip_reais.mts — aqui só a checagem estrutural do que mudou nos
 * arquivos (prompt, try/catch, ausência de escrita nova), mesmo método do teste 7 de
 * scripts/testar_coanalista_fase_r.mts.
 *
 *   npx tsx --env-file=.env.local scripts/testar_fase_ac_correcoes_piloto.mts
 */
import { readFileSync } from "node:fs";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

const rota = readFileSync(new URL("../app/api/urbi/chat/route.ts", import.meta.url), "utf-8");
const montarDossie = readFileSync(new URL("../lib/urbi/montarDossie.ts", import.meta.url), "utf-8");
const dossieProcesso = readFileSync(new URL("../lib/urbi/dossieProcesso.ts", import.meta.url), "utf-8");
const cruzamento = readFileSync(new URL("../lib/urbi/cruzamento.ts", import.meta.url), "utf-8");

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · rótulo humano — fonte real (lip_campos), nunca lista hardcoded");
{
  t("montarDossie.ts consulta lip_campos de verdade (join com lip_abas.assunto_id)", montarDossie.includes('supabaseAdmin.from("lip_campos").select("chave, label, lip_abas!inner(assunto_id)")'));
  t("o mapa chave→rótulo é montado A PARTIR do resultado da consulta (não é objeto literal fixo)", /rotuloPorChaveLip\s*=\s*new Map\(camposCatalogoLip\.map/.test(montarDossie));
  t("nenhum mapa {chave: 'rótulo'} hardcoded de campo específico (ex.: areaArt/bairro/tombado) foi adicionado ao código do dossiê", !/["']areaArt["']\s*:\s*["']|["']bairro["']\s*:\s*["']|["']tombado["']\s*:\s*["']/.test(montarDossie) && !/["']areaArt["']\s*:\s*["']|["']bairro["']\s*:\s*["']|["']tombado["']\s*:\s*["']/.test(dossieProcesso));
  t("CampoLipTecnico ganhou o campo rotulo", /rotulo:\s*string;/.test(dossieProcesso));
  t("SEM_ROTULO_CADASTRADO exportado, string exata pedida pelo Fábio", dossieProcesso.includes('export const SEM_ROTULO_CADASTRADO = "Campo sem rótulo cadastrado";'));
  t("camposTecnicosDoLip usa o rótulo real com fallback pro SEM_ROTULO_CADASTRADO (nunca a chave crua)", /rotulo:\s*rotuloPorChave\?\.get\(chave\)\s*\?\?\s*SEM_ROTULO_CADASTRADO/.test(dossieProcesso));
  t("cruzarLipComDocumento expõe campoLip.rotulo (nunca mais 'chave' como rótulo)", cruzamento.includes("rotulo: campoLip.rotulo,") && !cruzamento.includes("rotulo: chave, // chave do LIP já é um identificador técnico legível"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · fontes só com rótulos humanos — prompt instrui usar 'rotulo', nunca a chave/caminho");
{
  t('prompt instrui SEMPRE usar "rotulo", nunca a chave do objeto', rota.includes('use SEMPRE "rotulo", NUNCA a chave do objeto'));
  t('prompt trata "Campo sem rótulo cadastrado" como base_insuficiente pra identificação', rota.includes('trate a identificação deste campo como "base_insuficiente"'));
  // Fase AE (04/09/2026): o contrato passou de "escreva Fontes consultadas sem caminho técnico"
  // pra "não escreva essa seção — o sistema anexa em código" (ver scripts/testar_fase_ae_*.mts,
  // a garantia real virou estrutural, não mais uma proibição de prompt) — aqui só confirma que a
  // instrução de usar "rotulo" (nunca a chave) continua valendo pro resto da resposta.
  t('prompt continua proibindo citar a chave do objeto, só o "rotulo"', rota.includes('use SEMPRE "rotulo", NUNCA a chave do objeto'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · nenhuma divergência sem regra semântica — bloqueio de comparação livre");
{
  t("prompt tem a REGRA ABSOLUTA contra comparar número bruto por conta própria", rota.includes("REGRA ABSOLUTA — nunca comparar número bruto por conta própria"));
  t('regra cobre explicitamente LIP × LIP (não só LIP × MAC/documento)', rota.includes("LIP × LIP, LIP × documento, LIP × item do MAC"));
  t('regra nomeia o par real do achado (areaArt/areaLaudo × areaTotal/areaVertical) como só fato até haver regra aprovada', rota.includes('"areaArt"/"areaLaudo"') && rota.includes('"areaTotal"/"areaVertical"'));
  t('instrução antiga que convidava a "cruzar lip.campos_tecnicos com o texto de mac.pendencias" livremente foi removida', !rota.includes('cruze "lip.campos_tecnicos" (valor preenchido) com o texto de'));
  t('nova instrução restringe a fonte de divergência a "cruzamentos"/"lip.incoerencias" (nunca cálculo do modelo)', rota.includes('sua ÚNICA fonte de divergência/incoerência entre dois valores é'));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · falha da pergunta de coerência nunca mais some sem registro");
{
  t("fetch ao Gemini (chamada principal) está dentro de try/catch", /try\s*\{\s*res = await fetch\(/.test(rota));
  t("catch de falha de rede chama registrarChamadaIA (nunca mais silencioso)", /catch \(erroRede: any\) \{\s*await registrarChamadaIA/.test(rota));
  t("falha de rede devolve `detalhe` específico e auditável ao cliente (não o fallback genérico)", rota.includes("FALHA_REDE_GEMINI") && rota.includes("Tive uma falha de conexão ao consultar a IA agora"));
  t("resposta de parsing inválido do Gemini também é tratada e registrada", rota.includes("RESPOSTA_INVALIDA_GEMINI") && /catch \(erroParse: any\) \{\s*await registrarChamadaIA/.test(rota));
  t("erro HTTP normal (!res.ok) também ganhou `detalhe` legível (antes só tinha `erro` cru)", /if \(!res\.ok\) \{[\s\S]{0,300}detalhe: "A IA recusou/.test(rota));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · nenhuma alteração em LIP/MAC/documento/despacho/numeração/MRP/BIP");
{
  // A única mudança de acesso a dado nesta rodada foi uma leitura nova (lip_campos). Confirma
  // que ela é .select (leitura), nunca .insert/.update/.delete/.upsert.
  const linhaLipCampos = montarDossie.split("\n").find((l) => l.includes('from("lip_campos")')) ?? "";
  t('a consulta nova a lip_campos é só leitura (.select, sem insert/update/delete/upsert na mesma linha)', linhaLipCampos.includes(".select(") && !/\.(insert|update|delete|upsert)\(/.test(linhaLipCampos));
  // Nenhuma tabela de slot (LIP/MAC/documento/despacho/numeração/MRP/BIP) recebeu escrita nova
  // nestes 3 arquivos — só urbis_api_calls (via registrarChamadaIA, já existia) e a leitura nova.
  const tabelasProibidasDeEscrita = ["processos", "analises_mac", "mac_checklist_itens", "mhd_documentos", "mdp_registros", "mrp_registros", "mac_bip_vinculos", "mac_lip_vinculos"];
  for (const tabela of tabelasProibidasDeEscrita) {
    const padraoEscrita = new RegExp(`from\\("${tabela}"\\)[^;]*\\.(insert|update|delete|upsert)\\(`);
    t(`nenhuma escrita nova em "${tabela}" em montarDossie.ts/route.ts`, !padraoEscrita.test(montarDossie) && !padraoEscrita.test(rota));
  }
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntodos passaram");
process.exit(falhas);
