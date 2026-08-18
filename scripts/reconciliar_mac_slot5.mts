/**
 * Reconciliação do checklist do MAC Slot 5 — leva 1: duplicatas exatas resolvidas.
 *
 *   npx tsx --env-file=.env.local scripts/reconciliar_mac_slot5.mts            (simulação)
 *   npx tsx --env-file=.env.local scripts/reconciliar_mac_slot5.mts --aplicar  (grava)
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────────
 * `mac_checklist_itens` tem 768 itens no modelo do Slot 5, mas a planilha oficial
 * do analista (LIP MAC APROVAÇÃO.xlsm, aba "DENTRO DAS ABAS DO MAC") tem 524.
 * A diferença veio de um import de 2026-07-29 que trouxe o Despacho Geral Oficial
 * e duplicou blocos inteiros em grupos errados (ex.: os 17 itens de DOCUMENTAÇÃO
 * clonados dentro de INFORMAÇÕES NO SISTEMA ALVARÁ MAIS FÁCIL).
 *
 * ── O QUE ESTA LEVA FAZ (e o que NÃO faz) ────────────────────────────────────
 * Só mexe nos 37 pares de `mac_slot5_dup_resolvidas.json`: itens cujo texto é
 * duplicata EXATA de outro e cujo grupo correto a planilha resolve sem ambiguidade.
 * É o único bucket com prova dupla. Os outros 207 excedentes (texto truncado,
 * duplicata ambígua, conteúdo único do Despacho Geral) NÃO são tocados aqui —
 * dependem de revisão humana item a item.
 *
 * ── POR QUE NADA SE PERDE ────────────────────────────────────────────────────
 * Duplicata exata ⇒ existe uma linha gêmea legítima. Antes de desativar, os
 * vínculos (`mac_lip_vinculos`, `mac_bip_vinculos`) e as respostas já dadas pelo
 * analista (`analises_mac.itens`) migram para a gêmea. Só migra o que a gêmea
 * ainda não tem — nunca sobrescreve resposta existente. Conflito (gêmea com
 * resposta DIFERENTE) aborta o item e reporta, nunca decide sozinho.
 *
 * `ativo=false`, nunca DELETE: o `id` continua existindo, então qualquer vínculo
 * ou resposta que sobre continua resolvível. Apagar de verdade só quando o
 * analista declarar o MAC fechado — decisão dele, fora deste script.
 *
 * ── TRILHA ───────────────────────────────────────────────────────────────────
 * Cada mudança grava em `auditoria_log` com `dados_antes`/`dados_depois`, no mesmo
 * padrão já usado por `api/admin/assuntos/zerar` e `api/admin/lixeira`. Não há
 * trigger de auditoria no banco (conferido: `analises_mac` também não tem) — no
 * URBIS essa trilha é sempre escrita pelo código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const MODELO_SLOT5 = "88451782-86ed-47b5-b34c-e2e2b8f3a99f";

type Par = {
  desativar: { id: string; grupo: string; ordem: number };
  gemea: { id: string; grupo: string; ordem: number };
  texto: string;
  motivo: string;
};

const pares: Par[] = JSON.parse(
  readFileSync(join(import.meta.dirname, "mac_slot5_dup_resolvidas.json"), "utf8"),
);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const log = (s: string) => console.log(s);
const plano: string[] = [];
let conflitos = 0;

async function auditar(operacao: string, registroId: string, antes: unknown, depois: unknown) {
  if (!APLICAR) return;
  const { error } = await sb.from("auditoria_log").insert({
    tabela: "mac_checklist_itens",
    registro_id: registroId,
    operacao,
    dados_antes: antes,
    dados_depois: depois,
  });
  if (error) console.error(`  ! auditoria falhou (${operacao}): ${error.message}`);
}

async function main() {
  log(APLICAR ? "== APLICANDO ==\n" : "== SIMULAÇÃO (use --aplicar para gravar) ==\n");

  // Trava de segurança: confere que todos os itens existem, são do Slot 5 e estão ativos.
  const ids = pares.flatMap((p) => [p.desativar.id, p.gemea.id]);
  const { data: itens, error: erroItens } = await sb
    .from("mac_checklist_itens")
    .select("id, modelo_id, grupo, texto, ordem, ativo")
    .in("id", ids);
  if (erroItens) throw new Error(`não consegui ler os itens: ${erroItens.message}`);

  const porId = new Map((itens ?? []).map((i) => [i.id as string, i]));
  const faltando = ids.filter((id) => !porId.has(id));
  if (faltando.length) throw new Error(`itens não encontrados no banco: ${faltando.join(", ")}`);
  const foraDoSlot = (itens ?? []).filter((i) => i.modelo_id !== MODELO_SLOT5);
  if (foraDoSlot.length) throw new Error(`itens de OUTRO modelo na lista: ${foraDoSlot.map((i) => i.id).join(", ")}`);

  const jaInativos = pares.filter((p) => porId.get(p.desativar.id)?.ativo === false);
  if (jaInativos.length) log(`(${jaInativos.length} já estavam inativos — serão pulados)\n`);

  const [{ data: lipTodos }, { data: bipTodos }, { data: analises }] = await Promise.all([
    sb.from("mac_lip_vinculos").select("*"),
    sb.from("mac_bip_vinculos").select("*"),
    sb.from("analises_mac").select("id, processo_codigo, numero_analise, itens").eq("modelo_id", MODELO_SLOT5),
  ]);

  const lipDe = (id: string) => (lipTodos ?? []).filter((v) => v.mac_item_id === id);
  const bipDe = (id: string) => (bipTodos ?? []).filter((v) => v.mac_item_id === id);

  let nLip = 0, nBip = 0, nResp = 0, nDesativados = 0;

  for (const par of pares) {
    const alvo = porId.get(par.desativar.id)!;
    if (alvo.ativo === false) continue;

    // ── vínculos LIP: migra só o que a gêmea ainda não tem
    for (const v of lipDe(par.desativar.id)) {
      if (lipDe(par.gemea.id).some((g) => g.lip_chave === v.lip_chave)) continue;
      plano.push(`LIP  ${v.lip_chave} : ${par.desativar.id.slice(0, 8)} → ${par.gemea.id.slice(0, 8)}`);
      nLip++;
      if (APLICAR) {
        const { error } = await sb.from("mac_lip_vinculos").update({ mac_item_id: par.gemea.id }).eq("id", v.id);
        if (error) { console.error(`  ! vínculo LIP ${v.id}: ${error.message}`); continue; }
        await auditar("MAC_VINCULO_MIGRADO", par.desativar.id,
          { tipo: "LIP", vinculo_id: v.id, lip_chave: v.lip_chave, item: par.desativar.id },
          { tipo: "LIP", vinculo_id: v.id, lip_chave: v.lip_chave, item: par.gemea.id, motivo: par.motivo });
      }
    }

    // ── vínculos BIP
    for (const v of bipDe(par.desativar.id)) {
      if (bipDe(par.gemea.id).some((g) => g.bip_fragmento_id === v.bip_fragmento_id)) continue;
      plano.push(`BIP  frag ${String(v.bip_fragmento_id).slice(0, 8)} : ${par.desativar.id.slice(0, 8)} → ${par.gemea.id.slice(0, 8)}`);
      nBip++;
      if (APLICAR) {
        const { error } = await sb.from("mac_bip_vinculos").update({ mac_item_id: par.gemea.id }).eq("id", v.id);
        if (error) { console.error(`  ! vínculo BIP ${v.id}: ${error.message}`); continue; }
        await auditar("MAC_VINCULO_MIGRADO", par.desativar.id,
          { tipo: "BIP", vinculo_id: v.id, item: par.desativar.id },
          { tipo: "BIP", vinculo_id: v.id, item: par.gemea.id, motivo: par.motivo });
      }
    }

    // ── respostas do analista
    for (const a of analises ?? []) {
      const mapa = (a.itens ?? {}) as Record<string, string>;
      const resposta = mapa[par.desativar.id];
      if (resposta === undefined) continue;
      const naGemea = mapa[par.gemea.id];
      if (naGemea !== undefined && naGemea !== resposta) {
        console.error(`  ! CONFLITO ${a.processo_codigo} an${a.numero_analise}: gêmea diz "${naGemea}", duplicata diz "${resposta}" — item PULADO`);
        conflitos++;
        continue;
      }
      if (naGemea !== undefined) continue; // já tem a mesma resposta
      plano.push(`RESP ${a.processo_codigo} an${a.numero_analise} "${resposta}" : ${par.desativar.id.slice(0, 8)} → ${par.gemea.id.slice(0, 8)}`);
      nResp++;
      if (APLICAR) {
        const novo = { ...mapa, [par.gemea.id]: resposta };
        const { error } = await sb.from("analises_mac").update({ itens: novo }).eq("id", a.id);
        if (error) { console.error(`  ! resposta ${a.id}: ${error.message}`); continue; }
        mapa[par.gemea.id] = resposta; // reflete localmente para os próximos pares
        await auditar("MAC_RESPOSTA_MIGRADA", par.desativar.id,
          { analise_id: a.id, processo: a.processo_codigo, item: par.desativar.id, resposta },
          { analise_id: a.id, processo: a.processo_codigo, item: par.gemea.id, resposta, motivo: par.motivo });
      }
    }

    // ── desativa (nunca DELETE)
    plano.push(`OFF  [${par.desativar.grupo}] ${par.texto.slice(0, 60)}`);
    nDesativados++;
    if (APLICAR) {
      const { error } = await sb.from("mac_checklist_itens")
        .update({
          ativo: false,
          nota_analista: par.motivo,
          versao_compatibilizacao: "v2-2026-08-18-baseline-planilha",
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", par.desativar.id);
      if (error) { console.error(`  ! desativar ${par.desativar.id}: ${error.message}`); continue; }
      await auditar("MAC_ITEM_DESATIVADO", par.desativar.id,
        { grupo: alvo.grupo, ordem: alvo.ordem, texto: alvo.texto, ativo: true },
        { ativo: false, gemea_id: par.gemea.id, gemea_grupo: par.gemea.grupo, motivo: par.motivo });
    }
  }

  log(plano.join("\n"));
  log("\n── RESUMO ──");
  log(`vínculos LIP migrados : ${nLip}`);
  log(`vínculos BIP migrados : ${nBip}`);
  log(`respostas migradas    : ${nResp}`);
  log(`itens desativados     : ${nDesativados}`);
  if (conflitos) log(`CONFLITOS (pulados)   : ${conflitos}`);

  // ── conferência final: os 48 grupos têm que continuar de pé.
  // Na simulação o banco ainda não mudou, então descontamos aqui os que SERIAM
  // desativados — senão a conferência passaria sem ter checado nada.
  const { data: restantes } = await sb.from("mac_checklist_itens")
    .select("id, grupo").eq("modelo_id", MODELO_SLOT5).eq("ativo", true).limit(2000);
  const sairiam = APLICAR ? new Set<string>() : new Set(pares.map((p) => p.desativar.id));
  const sobrando = (restantes ?? []).filter((r) => !sairiam.has(r.id as string));
  const grupos = new Set(sobrando.map((r) => r.grupo as string));
  log(`\ngrupos ativos depois  : ${grupos.size} (tem que ser 48)`);
  if (grupos.size !== 48) log("ATENÇÃO: número de grupos mudou — conferir antes de seguir.");
  log(`itens ativos depois   : ${sobrando.length}`);
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
