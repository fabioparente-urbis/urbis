/**
 * Reconciliação do MAC Slot 5 — item 3 (grupo CARIMBO), mesmo método usado nos itens 1 e 2:
 * estrutura conferida contra a planilha (24 itens 3.1-3.24, todos batem 1:1 com ordem 28-51),
 * texto completo comparado com o Despacho Geral Oficial (/tmp/despacho_paragrafos.txt, parágrafos
 * 73-134) pra achar corte.
 *
 * 3 casos:
 *   1. ordem=27 (1995bdd7) — truncado, faltava a URL da Instrução Normativa 007/2024.
 *   2. ordem=33 (a112fe6d) — truncado, faltava a lista de sufixos do título (EDIFICAÇÃO NOVA /
 *      MODIFICAÇÃO COM ACRÉSCIMO / etc, despacho parágrafos 80-85).
 *   3. ordem=9033 (690bdb6c) "/EDIFICAÇÃO NOVA;" — resíduo do import de 29/07: é só o parágrafo 80
 *      isolado (faltam 81-85), sobra órfã depois que ordem=33 é completado com a lista inteira.
 *      Sem vínculo LIP/BIP (conferido antes de escrever este script) — desativa direto, sem migração.
 *
 *   npx tsx --env-file=.env.local scripts/reconciliar_mac_slot5_item3_carimbo.mts            (simulação)
 *   npx tsx --env-file=.env.local scripts/reconciliar_mac_slot5_item3_carimbo.mts --aplicar  (grava)
 */
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TEXTO_COMPLETO_27 =
  "Apresentar carimbo em que conste as informações do modelo abaixo, disponível na Instrução Normativa nº 007/2024, em https://www.goiania.go.gov.br/seplanh/legislacao-2/";

const TEXTO_COMPLETO_33 =
  "Rever título do projeto. Deverá constar: PROJETO LEGAL DE ARQUITETURA - APROVAÇÃO DE PROJETOS\n/EDIFICAÇÃO NOVA;\n/ MODIFICAÇÃO COM ACRÉSCIMO;\n/MODIFICAÇÃO SEM ACRÉSCIMO;\n/ MODIFICAÇÃO SEM ACRESCIMO “AS BUILT”;\n/RECONSTRUÇÃO;\n/RESTAURO;";

const TEXTO_COMPLETO_42 = "Rever o conteúdo da prancha; compatibilizar com a representação do projeto;";

async function auditar(operacao: string, registroId: string, antes: unknown, depois: unknown) {
  if (!APLICAR) return;
  const { error } = await sb.from("auditoria_log").insert({ tabela: "mac_checklist_itens", registro_id: registroId, operacao, dados_antes: antes, dados_depois: depois });
  if (error) console.error(`  ! auditoria falhou (${operacao}): ${error.message}`);
}

async function completarTexto(id: string, ordem: number, textoNovo: string) {
  const { data: atual } = await sb.from("mac_checklist_itens").select("id, ordem, texto, versao_compatibilizacao").eq("id", id).single();
  if (!atual) throw new Error(`item ${id} não encontrado`);
  console.log(`\n[TEXTO_COMPLETADO] ordem=${ordem} id=${id.slice(0, 8)}`);
  console.log(`  antes:  ${atual.texto}`);
  console.log(`  depois: ${textoNovo}`);
  if (APLICAR) {
    const { error } = await sb.from("mac_checklist_itens").update({ texto: textoNovo }).eq("id", id);
    if (error) throw error;
    await auditar("MAC_TEXTO_COMPLETADO", id, { texto: atual.texto }, { texto: textoNovo });
  }
}

async function desativarSemVinculo(id: string, ordem: number, motivo: string) {
  const { data: lip } = await sb.from("mac_lip_vinculos").select("id").eq("mac_item_id", id).limit(1);
  const { data: bip } = await sb.from("mac_bip_vinculos").select("id").eq("mac_item_id", id).limit(1);
  if ((lip && lip.length) || (bip && bip.length)) {
    throw new Error(`item ${id} tem vínculo — não pode desativar sem migração (rever script)`);
  }
  console.log(`\n[ITEM_DESATIVADO] ordem=${ordem} id=${id.slice(0, 8)} — ${motivo}`);
  if (APLICAR) {
    const { error } = await sb.from("mac_checklist_itens").update({ ativo: false, nota_analista: motivo }).eq("id", id);
    if (error) throw error;
    await auditar("MAC_ITEM_DESATIVADO", id, { ativo: true }, { ativo: false, motivo });
  }
}

async function main() {
  console.log(APLICAR ? "== APLICANDO — item 3 (CARIMBO) ==" : "== SIMULAÇÃO — item 3 (CARIMBO) ==");

  await completarTexto("1995bdd7-8df7-40c9-a818-3c6f9b7f0184", 27, TEXTO_COMPLETO_27);
  await completarTexto("a112fe6d-7077-4355-a1b4-d31ea851961f", 33, TEXTO_COMPLETO_33);
  await completarTexto("35064e3a-f4fe-402a-8cb4-ed365f46cfd2", 42, TEXTO_COMPLETO_42);
  await desativarSemVinculo(
    "690bdb6c-af12-431d-a59d-1a1d25232f81", 9033,
    "resíduo do import de 29/07: só o parágrafo 80 do Despacho Geral Oficial isolado " +
    "(\"/EDIFICAÇÃO NOVA;\"), sem os parágrafos 81-85 que completam a lista de sufixos do " +
    "título — coberto pelo texto completo de ordem=33 (mesmo grupo CARIMBO), sem vínculo LIP/BIP.",
  );

  console.log(APLICAR ? "\n== APLICADO ==" : "\n== fim da simulação — rode com --aplicar pra gravar ==");
}

main();
