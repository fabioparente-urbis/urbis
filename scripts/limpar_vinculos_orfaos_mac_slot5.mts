/**
 * Limpeza pós-aplicação de scripts/reconciliar_mac_slot5.mts.
 *
 * A migração de vínculos usa um snapshot lido uma vez no início — quando duas
 * duplicatas diferentes (ex.: "26d11c1d" e "0f6c04d1") migram pro MESMO
 * fragmento/campo na MESMA gêmea, a segunda bate na constraint UNIQUE
 * (mac_item_id, bip_fragmento_id) porque a primeira já migrou aquele fragmento
 * segundos antes, dentro do mesmo run. O UPDATE falha e a linha antiga fica
 * presa no item agora inativo — sem perda de dado (o conteúdo já está
 * representado na gêmea via a linha que migrou com sucesso), só suja.
 *
 * Este script confere, item por item da lista de desativados, que TODO vínculo
 * (LIP e BIP) e toda resposta que ficou presa tem equivalente na gêmea antes de
 * apagar — aborta se achar um único caso não coberto.
 *
 *   npx tsx --env-file=.env.local scripts/limpar_vinculos_orfaos_mac_slot5.mts            (simulação)
 *   npx tsx --env-file=.env.local scripts/limpar_vinculos_orfaos_mac_slot5.mts --aplicar  (apaga)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const pares: { desativar: { id: string }; gemea: { id: string } }[] = JSON.parse(
  readFileSync(join(import.meta.dirname, "mac_slot5_dup_resolvidas.json"), "utf8"),
);
const gemeaDe = new Map(pares.map((p) => [p.desativar.id, p.gemea.id]));
const ids = [...gemeaDe.keys()];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  log(APLICAR ? "== APLICANDO ==" : "== SIMULAÇÃO (--aplicar para apagar de verdade) ==");

  const [{ data: lipTravado }, { data: bipTravado }, { data: lipTudo }, { data: bipTudo }] = await Promise.all([
    sb.from("mac_lip_vinculos").select("*").in("mac_item_id", ids),
    sb.from("mac_bip_vinculos").select("*").in("mac_item_id", ids),
    sb.from("mac_lip_vinculos").select("mac_item_id, lip_chave"),
    sb.from("mac_bip_vinculos").select("mac_item_id, bip_fragmento_id"),
  ]);

  let apagarLip = 0, apagarBip = 0, naoCobertos = 0;

  for (const v of lipTravado ?? []) {
    const g = gemeaDe.get(v.mac_item_id)!;
    const coberto = (lipTudo ?? []).some((x) => x.mac_item_id === g && x.lip_chave === v.lip_chave);
    if (!coberto) { console.error(`  ! LIP ${v.id} (${v.lip_chave}) NÃO coberto pela gêmea — abortando esta linha, não apago.`); naoCobertos++; continue; }
    log(`LIP  apaga redundante ${v.id} (${v.lip_chave})`);
    apagarLip++;
    if (APLICAR) {
      const antes = { ...v };
      const { error } = await sb.from("mac_lip_vinculos").delete().eq("id", v.id);
      if (error) { console.error(`  ! falha ao apagar ${v.id}: ${error.message}`); continue; }
      await sb.from("auditoria_log").insert({
        tabela: "mac_lip_vinculos", registro_id: v.id, operacao: "MAC_VINCULO_REDUNDANTE_REMOVIDO",
        dados_antes: antes, dados_depois: { motivo: `gêmea ${g} já cobre lip_chave=${v.lip_chave}` },
      });
    }
  }

  for (const v of bipTravado ?? []) {
    const g = gemeaDe.get(v.mac_item_id)!;
    const coberto = (bipTudo ?? []).some((x) => x.mac_item_id === g && x.bip_fragmento_id === v.bip_fragmento_id);
    if (!coberto) { console.error(`  ! BIP ${v.id} (frag ${v.bip_fragmento_id}) NÃO coberto pela gêmea — abortando esta linha, não apago.`); naoCobertos++; continue; }
    log(`BIP  apaga redundante ${v.id} (frag ${v.bip_fragmento_id})`);
    apagarBip++;
    if (APLICAR) {
      const antes = { ...v };
      const { error } = await sb.from("mac_bip_vinculos").delete().eq("id", v.id);
      if (error) { console.error(`  ! falha ao apagar ${v.id}: ${error.message}`); continue; }
      await sb.from("auditoria_log").insert({
        tabela: "mac_bip_vinculos", registro_id: v.id, operacao: "MAC_VINCULO_REDUNDANTE_REMOVIDO",
        dados_antes: antes, dados_depois: { motivo: `gêmea ${g} já cobre bip_fragmento_id=${v.bip_fragmento_id}` },
      });
    }
  }

  log(`\n── RESUMO ──`);
  log(`LIP redundantes apagados : ${apagarLip}`);
  log(`BIP redundantes apagados : ${apagarBip}`);
  if (naoCobertos) log(`NÃO COBERTOS (deixados como estavam, revisar na mão): ${naoCobertos}`);
  else log(`não cobertos              : 0`);
}

function log(s: string) { console.log(s); }
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
