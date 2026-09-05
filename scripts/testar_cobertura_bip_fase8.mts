/**
 * scripts/testar_cobertura_bip_fase8.mts — Fase 8 do mandato de 12 fases (05/09/2026): BIP —
 * cobertura/candidatos, nunca auto-aprovação. Cobre o item novo desta fase (detectar vínculo
 * afetado por mudança de catálogo) — os demais itens (fila, candidatos, proposta/aprovação
 * separadas, impedir autoaprovação, painel de cobertura) já existiam desde 03/09 e não são
 * repetidos aqui.
 *
 *   npx tsx --env-file=.env.local scripts/testar_cobertura_bip_fase8.mts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { vinculosBipPossivelmenteDesatualizados } from "../lib/mac/vinculosFila";

let falhas = 0;
const t = (nome: string, cond: boolean, detalhe = "") => {
  console.log((cond ? "  ok    " : "  FALHA ") + nome + (cond || !detalhe ? "" : `\n           ${detalhe}`));
  if (!cond) falhas++;
};
const secao = (n: string) => console.log(`\n── ${n}`);

// ─────────────────────────────────────────────────────────────────────────────
secao("1 · hoje, com dado real, NENHUM vínculo é sinalizado (mac_checklist_itens_historico vazia)");
{
  const { count: totalHistorico } = await supabaseAdmin.from("mac_checklist_itens_historico").select("*", { count: "exact", head: true });
  t("confirma achado da auditoria: histórico de catálogo está vazio no banco inteiro", totalHistorico === 0, `total=${totalHistorico}`);

  const { data: vinculosReais } = await supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id, criado_em").limit(800);
  t("existem vínculos BIP reais pra testar (amostra real, Slot 5)", (vinculosReais?.length ?? 0) > 0, `n=${vinculosReais?.length}`);
  const afetados = await vinculosBipPossivelmenteDesatualizados((vinculosReais ?? []) as any[]);
  t("nenhum vínculo real é sinalizado hoje (histórico vazio = nada pra comparar)", afetados.size === 0, `afetados=${afetados.size}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("2 · SE existir uma mudança real de catálogo depois do vínculo, o sinal ativa (mesmo padrão já usado em testar_radar_cobertura_integral.mts pra este mesmo tipo de teste)");
{
  const { data: umVinculo } = await supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id, criado_em").limit(1).maybeSingle();
  if (!umVinculo) throw new Error("precisa de pelo menos 1 vínculo BIP real pra este teste (Slot 5 tem 727)");

  const idHistorico = randomUUID();
  const depoisDoVinculo = new Date(new Date((umVinculo as any).criado_em).getTime() + 86_400_000).toISOString();
  await supabaseAdmin.from("mac_checklist_itens_historico").insert({
    id: idHistorico, item_id: (umVinculo as any).mac_item_id, modelo_id: null, tipo_processo: "slot_05",
    acao: "atualizado", campos_alterados: { teste: true }, criado_em: depoisDoVinculo,
  });

  const afetados = await vinculosBipPossivelmenteDesatualizados([umVinculo as any]);
  t("vínculo com mudança de catálogo REAL depois dele é sinalizado", afetados.has((umVinculo as any).mac_item_id), JSON.stringify([...afetados]));

  await supabaseAdmin.from("mac_checklist_itens_historico").delete().eq("id", idHistorico);
  const { count: totalDepoisDaLimpeza } = await supabaseAdmin.from("mac_checklist_itens_historico").select("*", { count: "exact", head: true });
  t("limpeza real — histórico volta a ficar vazio (não deixa lixo de teste)", totalDepoisDaLimpeza === 0, `total=${totalDepoisDaLimpeza}`);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("3 · mudança de catálogo ANTES do vínculo NÃO sinaliza (só o que veio depois importa)");
{
  const { data: umVinculo } = await supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id, criado_em").limit(1).maybeSingle();
  const idHistorico = randomUUID();
  const antesDoVinculo = new Date(new Date((umVinculo as any).criado_em).getTime() - 86_400_000).toISOString();
  await supabaseAdmin.from("mac_checklist_itens_historico").insert({
    id: idHistorico, item_id: (umVinculo as any).mac_item_id, modelo_id: null, tipo_processo: "slot_05",
    acao: "criado", campos_alterados: {}, criado_em: antesDoVinculo,
  });
  const afetados = await vinculosBipPossivelmenteDesatualizados([umVinculo as any]);
  t("mudança ANTERIOR ao vínculo não sinaliza nada (o vínculo já nasceu depois dela)", !afetados.has((umVinculo as any).mac_item_id));
  await supabaseAdmin.from("mac_checklist_itens_historico").delete().eq("id", idHistorico);
}

// ─────────────────────────────────────────────────────────────────────────────
secao("4 · nunca desfaz vínculo sozinho — função só lê, nunca escreve em mac_bip_vinculos/mac_lip_vinculos");
{
  const codigoFonte = readFileSync(new URL("../lib/mac/vinculosFila.ts", import.meta.url), "utf-8");
  t('vinculosBipPossivelmenteDesatualizados nunca escreve em mac_bip_vinculos', !codigoFonte.includes('.from("mac_bip_vinculos").delete') && !codigoFonte.includes('.from("mac_bip_vinculos").update'));
  const rotaFila = readFileSync(new URL("../app/api/mac/vinculos-fila/route.ts", import.meta.url), "utf-8");
  t('rota da fila reaproveita a função (nunca duplica a lógica)', rotaFila.includes("vinculosBipPossivelmenteDesatualizados("));
  const rotaSlot5 = readFileSync(new URL("../app/api/mac/vinculos-fila/cobertura-slot5/route.ts", import.meta.url), "utf-8");
  t('rota do Slot 5 também reaproveita a MESMA função (nunca duplica)', rotaSlot5.includes("vinculosBipPossivelmenteDesatualizados("));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("5 · impedir autoaprovação continua valendo (garantia já existente, confirmada sem regressão)");
{
  const codigoDecidir = readFileSync(new URL("../app/api/mac/vinculos-fila/decidir/route.ts", import.meta.url), "utf-8");
  t("rota de decisão bloqueia quem propôs de decidir a própria proposta", codigoDecidir.includes("criado_por === ctx.userId"));
  t("rota de decisão exige perfil irrestrito (Administrador/Diretora)", codigoDecidir.includes("ctx.irrestrito"));
}

// ─────────────────────────────────────────────────────────────────────────────
secao("6 · zero chamada Gemini");
{
  const { count: antes } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  const { data: vinculosReais } = await supabaseAdmin.from("mac_bip_vinculos").select("mac_item_id, criado_em").limit(50);
  await vinculosBipPossivelmenteDesatualizados((vinculosReais ?? []) as any[]);
  const { count: depois } = await supabaseAdmin.from("urbis_api_calls").select("*", { count: "exact", head: true });
  t("contagem de urbis_api_calls não mudou", antes === depois, `antes=${antes} depois=${depois}`);
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
process.exit(falhas);
