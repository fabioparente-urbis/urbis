/**
 * Inspeciona um grupo do MAC Slot 5: itens ativos/inativos, vínculos LIP/BIP, respostas gravadas.
 * Ferramenta de leitura pra reconciliação item-a-item (mesmo método usado nos itens 1 e 2).
 *
 *   npx tsx --env-file=.env.local scripts/inspecionar_grupo_mac_slot5.mts "CARIMBO"
 */
import { createClient } from "@supabase/supabase-js";

const grupo = process.argv[2];
if (!grupo) throw new Error("uso: inspecionar_grupo_mac_slot5.mts <nome do grupo>");
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: itens, error } = await sb.from("mac_checklist_itens")
    .select("id, ordem, texto, ativo, nota_analista, origem, versao_compatibilizacao")
    .eq("modelo_id", MODELO_SLOT5).eq("grupo", grupo).order("ordem");
  if (error) throw error;
  console.log(`grupo "${grupo}": ${itens.length} itens no banco (ativos + inativos)`);
  const ids = itens.map((i) => i.id);

  const { data: lipVinc } = await sb.from("mac_lip_vinculos").select("mac_item_id, lip_chave").in("mac_item_id", ids);
  const { data: bipVinc } = await sb.from("mac_bip_vinculos").select("mac_item_id, bip_fragmento_id").in("mac_item_id", ids);
  const lipPorItem = new Map<string, string[]>();
  for (const v of lipVinc ?? []) (lipPorItem.get(v.mac_item_id) ?? lipPorItem.set(v.mac_item_id, []).get(v.mac_item_id)!).push(v.lip_chave);
  const bipCountPorItem = new Map<string, number>();
  for (const v of bipVinc ?? []) bipCountPorItem.set(v.mac_item_id, (bipCountPorItem.get(v.mac_item_id) ?? 0) + 1);

  for (const i of itens) {
    const status = i.ativo ? "ATIVO  " : "inativo";
    console.log(`\n[${status}] ordem=${i.ordem} id=${i.id.slice(0, 8)}`);
    console.log(`  texto: ${i.texto}`);
    if (i.nota_analista) console.log(`  nota_analista: ${i.nota_analista}`);
    if (i.versao_compatibilizacao) console.log(`  versao_compatibilizacao: ${i.versao_compatibilizacao}`);
    const lipChaves = lipPorItem.get(i.id) ?? [];
    const bipCount = bipCountPorItem.get(i.id) ?? 0;
    console.log(`  vínculos: LIP=[${lipChaves.join(", ")}] BIP=${bipCount}`);
  }
}

main();
