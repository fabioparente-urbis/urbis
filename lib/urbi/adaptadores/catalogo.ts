import type { CoberturaFonte, MudancaEstrutural } from "./tipos";
import type { EventoMacHistorico } from "../dossieProcesso";

/**
 * Helpers puros compartilhados pelos 3 adaptadores de slot — nenhum lê banco, só classifica o
 * que já foi lido. Ver lib/urbi/adaptadores/tipos.ts pro contrato.
 */

/** Declara se uma fonte opcional (mhd_resultados_campo, vínculos BIP aprovados, etc.) tem dado
 *  real PRA ESTE PROCESSO agora — nunca "este slot nunca tem", sempre "este processo tem ou não
 *  tem, agora" (evita generalizar de propósito, ver ADENDO regra 5: histórico ≠ regra geral). */
export function montarCobertura(fonte: string, linhas: unknown[] | null, erro: string | null): CoberturaFonte {
  if (erro) {
    return { fonte, disponivel: false, quantidade: 0, motivo_ausencia: `falha ao consultar: ${erro}` };
  }
  const quantidade = linhas?.length ?? 0;
  return {
    fonte,
    disponivel: quantidade > 0,
    quantidade,
    motivo_ausencia: quantidade > 0 ? null : "nenhum registro encontrado para este processo nesta fonte",
  };
}

/**
 * ADENDO regra 5: "se um campo/item não existia na época, ou mudou, o URBI deve dizer
 * 'estrutura mudou' ou 'base histórica insuficiente', nunca chamar isso de erro do interessado
 * ou do analista." mac_historico.item_texto é o texto do item NO MOMENTO em que foi marcado
 * (coluna já gravada como snapshot, não um join vivo — confirmado em
 * app/api/mac/slot-05/analise/route.ts) — comparar isso contra o texto ATUAL do item
 * (mac_checklist_itens.texto, catálogo vigente) revela mudança real de catálogo sem precisar
 * de nenhuma tabela de versão nova.
 */
export function detectarMudancasEstruturais(
  historico: EventoMacHistorico[],
  itemAtualPorId: Map<string, { texto: string; ativo: boolean }>,
): MudancaEstrutural[] {
  const ultimoTextoPorItem = new Map<string, { texto: string; quando: string }>();
  for (const ev of historico) {
    if (!ev.checklist_item_id || !ev.item_texto) continue;
    const anterior = ultimoTextoPorItem.get(ev.checklist_item_id);
    if (!anterior || Date.parse(ev.criado_em) > Date.parse(anterior.quando)) {
      ultimoTextoPorItem.set(ev.checklist_item_id, { texto: ev.item_texto, quando: ev.criado_em });
    }
  }

  const saida: MudancaEstrutural[] = [];
  for (const [itemId, historico_] of ultimoTextoPorItem) {
    const atual = itemAtualPorId.get(itemId);
    if (!atual) {
      saida.push({
        item_id: itemId,
        texto_historico: historico_.texto,
        texto_atual: null,
        ultimo_registro_com_texto_antigo: historico_.quando,
      });
      continue;
    }
    if (atual.texto.trim() !== historico_.texto.trim()) {
      saida.push({
        item_id: itemId,
        texto_historico: historico_.texto,
        texto_atual: atual.texto,
        ultimo_registro_com_texto_antigo: historico_.quando,
      });
    }
  }
  return saida;
}
