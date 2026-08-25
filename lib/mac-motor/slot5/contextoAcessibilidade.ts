/**
 * lib/mac-motor/slot5/contextoAcessibilidade.ts — texto oficial da NBR 9050:2020 para o Gemini
 * julgar os itens do ÍTEM 48 (grupo "ACESSIBILIDADE - NBR9050") com a norma na mão, não de memória.
 *
 * O prompt geral (`promptP3.ts`) manda o modelo "atender a NBR 9050" sem nunca lhe dar a norma —
 * ele decide de memória, que é exatamente o tipo de julgamento sem evidência que a regra 1 do
 * Slot 5 proíbe ("SÓ MARQUE conforme SE VOCÊ VIU A EVIDÊNCIA"). O BIP já tem a norma inteira
 * fragmentada e vinculada item a item (`mac_bip_vinculos`, 57/57 itens do grupo cobertos, 24/08/2026)
 * — este arquivo só busca esse texto e monta o bloco de contexto.
 *
 * Cabe inteiro no prompt sem truncar hoje (37 fragmentos, ~122 mil caracteres). O `LIMITE_CHARS`
 * é rede de segurança para quando o BIP crescer, não uma expectativa de uso normal.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const GRUPO_ACESSIBILIDADE = "ACESSIBILIDADE - NBR9050";

const LIMITE_CHARS = 220_000;

type ItemPendente = { id: string; texto: string; grupo: string };

/**
 * Busca os fragmentos da NBR 9050 vinculados aos itens de acessibilidade que ainda estão
 * pendentes e monta o bloco de texto a anexar ao prompt. Devolve `null` quando não há item de
 * acessibilidade pendente — nesse caso não vale a pena gastar contexto com a norma inteira.
 */
export async function contextoNbrAcessibilidade(pendentes: ItemPendente[]): Promise<string | null> {
  const itensAcess = pendentes.filter((i) => i.grupo === GRUPO_ACESSIBILIDADE);
  if (!itensAcess.length) return null;

  const idsItens = itensAcess.map((i) => i.id);
  const { data: vinculos, error: erroV } = await supabaseAdmin
    .from("mac_bip_vinculos")
    .select("mac_item_id, bip_fragmento_id")
    .in("mac_item_id", idsItens);
  if (erroV || !vinculos?.length) return null;

  const fragmentoIds = [...new Set(vinculos.map((v) => v.bip_fragmento_id))];
  const { data: fragmentos, error: erroF } = await supabaseAdmin
    .from("bdi_lei_fragmentos")
    .select("id, referencia, texto")
    .in("id", fragmentoIds);
  if (erroF || !fragmentos?.length) return null;

  // Mais citado primeiro — se precisar cortar pelo limite, perde o que menos itens usam.
  const usosPorFragmento = new Map<string, number>();
  for (const v of vinculos) usosPorFragmento.set(v.bip_fragmento_id, (usosPorFragmento.get(v.bip_fragmento_id) ?? 0) + 1);
  const ordenados = [...fragmentos].sort((a, b) => (usosPorFragmento.get(b.id) ?? 0) - (usosPorFragmento.get(a.id) ?? 0));

  const blocos: string[] = [];
  let total = 0;
  for (const f of ordenados) {
    const texto = String(f.texto ?? "").trim();
    if (!texto) continue;
    const bloco = `[${f.referencia ?? "NBR 9050:2020"}]\n${texto}`;
    if (total + bloco.length > LIMITE_CHARS) break;
    blocos.push(bloco);
    total += bloco.length;
  }
  if (!blocos.length) return null;

  return (
    `===== NORMA NBR 9050:2020 — TEXTO OFICIAL DAS SEÇÕES QUE O CHECKLIST DE ACESSIBILIDADE CITA =====\n` +
    `Abaixo está o texto oficial das seções da NBR 9050:2020 ligadas aos ${itensAcess.length} item(ns) ` +
    `pendentes do grupo "${GRUPO_ACESSIBILIDADE}". Use este texto como A NORMA em si — não decida pelo que ` +
    `você lembra dela. Para cada item desse grupo: ache a seção correspondente aqui embaixo, compare a ` +
    `medida/cota exigida por ela com o que você VÊ desenhado no PDF (regra 1 do prompt: sem ver a cota, ` +
    `use null) e cite a seção na "fonte" (ex.: "NBR 9050:2020, Seção 6.6 — inclinação de 8,3% medida no ` +
    `corte, norma exige máx. 8,33% para essa altura"). Uma seção pode servir a mais de um item; um item ` +
    `pode exigir mais de uma seção — leia todo o bloco antes de decidir.\n\n` +
    blocos.join("\n\n")
  );
}
