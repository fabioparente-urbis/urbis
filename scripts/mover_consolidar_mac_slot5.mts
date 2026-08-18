/**
 * Leva 4 da reconciliação do MAC Slot 5 — casos onde NENHUMA das cópias duplicadas estava no
 * grupo certo (diferente das levas 1-3, onde uma cópia já morava no lugar certo). O Despacho
 * Geral Oficial resolveu a seção correta; a cópia de menor `ordem` (a mais antiga, evitando as
 * de `ordem>=9000` do import de 29/07 quando possível) sobrevive e MUDA de grupo; as demais
 * entregam vínculo/resposta pra ela e são desativadas — mesma trava de segurança dos scripts
 * anteriores: migra só o que a sobrevivente ainda não tem, conflito aborta o item.
 *
 *   npx tsx --env-file=.env.local scripts/mover_consolidar_mac_slot5.mts            (simulação)
 *   npx tsx --env-file=.env.local scripts/mover_consolidar_mac_slot5.mts --aplicar  (grava)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";

type Caso = {
  sobrevive: { id: string; grupo_de: string; grupo_para: string; ordem_de: number; ordem_para: number };
  perde: { id: string; grupo: string; ordem: number }[];
  texto: string;
  motivo: string;
};

const casos: Caso[] = JSON.parse(readFileSync(join(import.meta.dirname, "mac_slot5_mover_leva4.json"), "utf8"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function auditar(operacao: string, registroId: string, antes: unknown, depois: unknown) {
  if (!APLICAR) return;
  const { error } = await sb.from("auditoria_log").insert({ tabela: "mac_checklist_itens", registro_id: registroId, operacao, dados_antes: antes, dados_depois: depois });
  if (error) console.error(`  ! auditoria falhou (${operacao}): ${error.message}`);
}

async function main() {
  console.log(APLICAR ? "== APLICANDO ==\n" : "== SIMULAÇÃO ==\n");

  const perdedoresIds = casos.flatMap((c) => c.perde.map((p) => p.id));
  const sobreviventesIds = casos.map((c) => c.sobrevive.id);
  const { data: check } = await sb.from("mac_checklist_itens").select("id, modelo_id, ativo").in("id", [...perdedoresIds, ...sobreviventesIds]);
  const foraDoSlot = (check ?? []).filter((i) => i.modelo_id !== MODELO_SLOT5);
  if (foraDoSlot.length) throw new Error(`item de outro modelo na lista: ${foraDoSlot.map((i) => i.id).join(",")}`);

  const [{ data: lipTudo }, { data: bipTudo }, { data: analises }] = await Promise.all([
    sb.from("mac_lip_vinculos").select("*"),
    sb.from("mac_bip_vinculos").select("*"),
    sb.from("analises_mac").select("id, processo_codigo, numero_analise, itens").eq("modelo_id", MODELO_SLOT5),
  ]);
  const lipDe = (id: string) => (lipTudo ?? []).filter((v) => v.mac_item_id === id);
  const bipDe = (id: string) => (bipTudo ?? []).filter((v) => v.mac_item_id === id);

  let nMovidos = 0, nDesativados = 0, nLip = 0, nBip = 0, nResp = 0, nConflitos = 0;

  for (const c of casos) {
    console.log(`[${c.texto.slice(0, 55)}] ${c.sobrevive.grupo_de} → ${c.sobrevive.grupo_para}`);

    // ── move a sobrevivente ──
    nMovidos++;
    if (APLICAR) {
      const { error } = await sb.from("mac_checklist_itens").update({
        grupo: c.sobrevive.grupo_para, ordem: c.sobrevive.ordem_para,
        nota_analista: c.motivo, versao_compatibilizacao: "v2-2026-08-18-baseline-planilha",
        atualizado_em: new Date().toISOString(),
      }).eq("id", c.sobrevive.id);
      if (error) { console.error(`  ! mover ${c.sobrevive.id}: ${error.message}`); continue; }
      await auditar("MAC_ITEM_MOVIDO", c.sobrevive.id,
        { grupo: c.sobrevive.grupo_de, ordem: c.sobrevive.ordem_de },
        { grupo: c.sobrevive.grupo_para, ordem: c.sobrevive.ordem_para, motivo: c.motivo });
    }

    for (const perdedor of c.perde) {
      // vínculos LIP/BIP
      for (const v of lipDe(perdedor.id)) {
        if (lipDe(c.sobrevive.id).some((g) => g.lip_chave === v.lip_chave)) continue;
        nLip++;
        console.log(`   LIP ${v.lip_chave} : ${perdedor.id.slice(0, 8)} → ${c.sobrevive.id.slice(0, 8)}`);
        if (APLICAR) {
          const { error } = await sb.from("mac_lip_vinculos").update({ mac_item_id: c.sobrevive.id }).eq("id", v.id);
          if (!error) await auditar("MAC_VINCULO_MIGRADO", perdedor.id, { tipo: "LIP", vinculo_id: v.id, item: perdedor.id }, { tipo: "LIP", vinculo_id: v.id, item: c.sobrevive.id });
        }
      }
      for (const v of bipDe(perdedor.id)) {
        if (bipDe(c.sobrevive.id).some((g) => g.bip_fragmento_id === v.bip_fragmento_id)) continue;
        nBip++;
        console.log(`   BIP frag ${v.bip_fragmento_id.slice(0, 8)} : ${perdedor.id.slice(0, 8)} → ${c.sobrevive.id.slice(0, 8)}`);
        if (APLICAR) {
          const { error } = await sb.from("mac_bip_vinculos").update({ mac_item_id: c.sobrevive.id }).eq("id", v.id);
          if (!error) await auditar("MAC_VINCULO_MIGRADO", perdedor.id, { tipo: "BIP", vinculo_id: v.id, item: perdedor.id }, { tipo: "BIP", vinculo_id: v.id, item: c.sobrevive.id });
        }
      }
      // respostas
      for (const a of analises ?? []) {
        const mapa = (a.itens ?? {}) as Record<string, string>;
        const resposta = mapa[perdedor.id];
        if (resposta === undefined) continue;
        const naSobrevive = mapa[c.sobrevive.id];
        if (naSobrevive !== undefined && naSobrevive !== resposta) {
          console.error(`   ! CONFLITO ${a.processo_codigo} an${a.numero_analise}: sobrevivente="${naSobrevive}" perdedor="${resposta}" — pulado`);
          nConflitos++; continue;
        }
        if (naSobrevive !== undefined) continue;
        nResp++;
        console.log(`   RESP ${a.processo_codigo} an${a.numero_analise} "${resposta}" : ${perdedor.id.slice(0, 8)} → ${c.sobrevive.id.slice(0, 8)}`);
        if (APLICAR) {
          const novo = { ...mapa, [c.sobrevive.id]: resposta };
          const { error } = await sb.from("analises_mac").update({ itens: novo }).eq("id", a.id);
          if (!error) { mapa[c.sobrevive.id] = resposta; await auditar("MAC_RESPOSTA_MIGRADA", perdedor.id, { analise_id: a.id, item: perdedor.id, resposta }, { analise_id: a.id, item: c.sobrevive.id, resposta }); }
        }
      }

      // desativa a perdedora
      nDesativados++;
      console.log(`   OFF [${perdedor.grupo}] ordem ${perdedor.ordem}`);
      if (APLICAR) {
        const { error } = await sb.from("mac_checklist_itens").update({
          ativo: false, nota_analista: `duplicata; sobrevivente movida para ${c.sobrevive.grupo_para} (${c.sobrevive.id})`,
          versao_compatibilizacao: "v2-2026-08-18-baseline-planilha", atualizado_em: new Date().toISOString(),
        }).eq("id", perdedor.id);
        if (!error) await auditar("MAC_ITEM_DESATIVADO", perdedor.id, { grupo: perdedor.grupo, ordem: perdedor.ordem, ativo: true }, { ativo: false, motivo: c.motivo });
      }
    }
    console.log();
  }

  console.log("── RESUMO ──");
  console.log(`itens movidos de grupo : ${nMovidos}`);
  console.log(`itens desativados      : ${nDesativados}`);
  console.log(`vínculos LIP migrados  : ${nLip}`);
  console.log(`vínculos BIP migrados  : ${nBip}`);
  console.log(`respostas migradas     : ${nResp}`);
  if (nConflitos) console.log(`CONFLITOS (pulados)    : ${nConflitos}`);

  const { data: restantes } = await sb.from("mac_checklist_itens").select("id, grupo").eq("modelo_id", MODELO_SLOT5).eq("ativo", true).limit(2000);
  const sairiam = APLICAR ? new Set<string>() : new Set(casos.flatMap((c) => c.perde.map((p) => p.id)));
  const sobrando = (restantes ?? []).filter((r) => !sairiam.has(r.id as string));
  const grupos = new Set(sobrando.map((r) => r.grupo as string));
  console.log(`\ngrupos ativos depois   : ${grupos.size} (tem que ser 48)`);
  console.log(`itens ativos depois    : ${sobrando.length}`);
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
