/**
 * Leva 6 da reconciliação do MAC Slot 5 — em 37 dos 48 grupos, o TÍTULO do grupo (o "ITEM N.0"
 * da planilha real, cabeçalho da seção) foi importado como se fosse o primeiro item MARCÁVEL do
 * checklist (ex.: "17.ALTURA DE EDIFICAÇÃO;"). Achado pelo Fábio olhando o item 1 ("Conferir os
 * dados informados... no Sistema Alvará Fácil:" não é exigência, é o título) — mesmo padrão se
 * repete em 36 outros grupos.
 *
 * ATENÇÃO — lista de pares CONGELADA, não recalcular com heurística solta: uma primeira tentativa
 * usando "o primeiro item do grupo contém o nome do grupo" pegou 42 candidatos, mas 4 eram itens
 * REAIS que só citam o tema do grupo na frase (CARIMBO, ATIVIDADE ECONÔMICA, SOLUÇÃO ALTERNATIVA
 * PARA CARGA E DESCARGA, PLANTA DE SITUAÇÃO — os 3 primeiros achados por olho, o 4º confirmado
 * batendo contra o ITEM 6.1 real da planilha, que é literalmente esse texto). A lista abaixo é só
 * os 37 que batem >=0.75 de similaridade contra o "ITEM N.0" real da planilha (`/tmp/excel_itens.json`
 * → `headers`) — prova documental, não achismo de formato de texto.
 *
 * Diferente das levas 1-5 (duplicata com gêmea pra migrar): aqui NÃO existe gêmea — o título é
 * único no banco. `ativo=false` sem destino de migração; vínculos/respostas presos nele ficam
 * registrados no `auditoria_log` (dados_antes preserva tudo), sem lugar pra ir.
 *
 * Conferido antes de rodar: nenhum dos 48 grupos fica com 0 itens ativos ao tirar o título.
 *
 *   npx tsx --env-file=.env.local scripts/desativar_titulos_como_item_leva6.mts            (simulação)
 *   npx tsx --env-file=.env.local scripts/desativar_titulos_como_item_leva6.mts --aplicar  (grava)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";

type Header = { id: string; grupo: string; ordem: number; texto: string };
const headers: Header[] = JSON.parse(readFileSync(join(import.meta.dirname, "mac_slot5_titulos_confirmados.json"), "utf8"));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log(APLICAR ? "== APLICANDO ==\n" : "== SIMULAÇÃO ==\n");
  console.log(`títulos confirmados (batem >=0.75 contra o cabeçalho real da planilha): ${headers.length}`);

  const ids = headers.map((h) => h.id);
  const { data: check } = await sb.from("mac_checklist_itens").select("id, modelo_id, ativo, grupo").in("id", ids);
  const foraDoSlot = (check ?? []).filter((i) => i.modelo_id !== MODELO_SLOT5);
  if (foraDoSlot.length) throw new Error(`item de outro modelo: ${foraDoSlot.map((i) => i.id).join(",")}`);

  // trava de segurança: nenhum grupo pode ficar vazio
  const { data: todosAtivos } = await sb.from("mac_checklist_itens").select("id, grupo").eq("modelo_id", MODELO_SLOT5).eq("ativo", true);
  const porGrupo = new Map<string, number>();
  for (const it of todosAtivos ?? []) porGrupo.set(it.grupo, (porGrupo.get(it.grupo) ?? 0) + 1);
  const vazios = headers.filter((h) => (porGrupo.get(h.grupo) ?? 0) <= 1);
  if (vazios.length) throw new Error(`ABORTADO: esvazia grupo(s): ${vazios.map((v) => v.grupo).join(", ")}`);

  const [{ data: lip }, { data: bip }, { data: analises }] = await Promise.all([
    sb.from("mac_lip_vinculos").select("*").in("mac_item_id", ids),
    sb.from("mac_bip_vinculos").select("*").in("mac_item_id", ids),
    sb.from("analises_mac").select("id, processo_codigo, numero_analise, itens").eq("modelo_id", MODELO_SLOT5),
  ]);
  console.log(`vínculos LIP presos (sem destino, só registrados no log): ${lip?.length ?? 0}`);
  console.log(`vínculos BIP presos (sem destino, só registrados no log): ${bip?.length ?? 0}`);

  for (const h of headers) {
    const atual = (check ?? []).find((c) => c.id === h.id);
    if (atual?.ativo === false) { console.log(`(já inativo) [${h.grupo}]`); continue; }
    console.log(`OFF [${h.grupo}] ${h.texto.slice(0, 70)}`);
    if (APLICAR) {
      const { error } = await sb.from("mac_checklist_itens").update({
        ativo: false,
        nota_analista: "título do grupo estava sentado como item marcável — não é exigência de verdade, é o cabeçalho da seção (achado do Fábio revisando item 1; confirmado contra o ITEM N.0 real da planilha)",
        versao_compatibilizacao: "v2-2026-08-18-baseline-planilha",
        atualizado_em: new Date().toISOString(),
      }).eq("id", h.id);
      if (error) { console.error(`  ! ${h.id}: ${error.message}`); continue; }
      await sb.from("auditoria_log").insert({
        tabela: "mac_checklist_itens", registro_id: h.id, operacao: "MAC_ITEM_DESATIVADO",
        dados_antes: { grupo: h.grupo, ordem: h.ordem, texto: h.texto, ativo: true },
        dados_depois: {
          ativo: false, motivo: "titulo-do-grupo-marcavel",
          vinculos_lip_perdidos: (lip ?? []).filter((v) => v.mac_item_id === h.id),
          vinculos_bip_perdidos: (bip ?? []).filter((v) => v.mac_item_id === h.id),
        },
      });
    }
  }

  console.log("\n── RESUMO ──");
  const { data: restantes } = await sb.from("mac_checklist_itens").select("id, grupo").eq("modelo_id", MODELO_SLOT5).eq("ativo", true).limit(2000);
  const sairiam = APLICAR ? new Set<string>() : new Set(ids);
  const sobrando = (restantes ?? []).filter((r) => !sairiam.has(r.id as string));
  console.log(`grupos ativos depois: ${new Set(sobrando.map((r) => r.grupo)).size} (tem que ser 48)`);
  console.log(`itens ativos depois : ${sobrando.length}`);
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
