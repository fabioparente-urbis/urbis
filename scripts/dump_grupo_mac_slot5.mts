import { createClient } from "@supabase/supabase-js";
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const grupo = process.argv[2];
  const { data } = await sb.from("mac_checklist_itens").select("id,ordem,texto,ativo,nota_analista,origem")
    .eq("modelo_id", MODELO_SLOT5).eq("grupo", grupo).order("ordem");
  console.log(JSON.stringify(data, null, 2));
}
main();
