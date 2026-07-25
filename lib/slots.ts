// ============================================================
// Zerar slot (assunto) — inventário + limpeza total.
//
// Contexto: os 15 "slots" da tabela `assuntos` são trilhos de processo.
// Ativar um slot dispara o auto-clone de Regularização (LIP + MAC +
// prompts) em `PUT /api/admin/assuntos`. Zerar é a operação inversa:
// devolve o slot ao estado de fábrica — sem abas, sem checklist, sem
// prompts, com nome/slug genéricos (`Slot 07` / `slot_07`) e inativo.
//
// O que NUNCA é apagado aqui:
//   - `processos`, `analises_mac`, `mrp_registros`, `mdp_registros` —
//     trabalho real do analista. Se existir qualquer um deles, o zerar
//     é BLOQUEADO (ver `bloqueios` no inventário). Apagar produção é
//     decisão separada, não pode sair de um botão de configuração.
//   - `lip_prompts_historico` — o histórico é global por `prompt_chave`,
//     compartilhado entre slots; apagar ali destruiria histórico alheio.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const SLUG_FIXO = "regularizacao";

export type InventarioSlot = {
  /** Configuração clonável — é isto que o zerar apaga. */
  config: {
    lip_abas: number;
    lip_campos: number;
    lip_prompts: number;
    mac_modelos: number;
    mac_itens: number;
    total: number;
  };
  /** Trabalho real — se houver qualquer coisa aqui, o zerar é bloqueado. */
  bloqueios: {
    processos: number;
    analises_mac: number;
    mrp_registros: number;
    mdp_registros: number;
    total: number;
  };
};

async function contar(tabela: string, coluna: string, valores: string[]): Promise<number> {
  if (valores.length === 0) return 0;
  const { count, error } = await supabaseAdmin
    .from(tabela)
    .select("*", { count: "exact", head: true })
    .in(coluna, valores);
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return count ?? 0;
}

async function idsFilhos(tabela: string, assunto_id: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from(tabela).select("id").eq("assunto_id", assunto_id);
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return (data ?? []).map((r: any) => r.id);
}

/** Conta tudo que está pendurado no slot, separando config de trabalho real. */
export async function inventariarSlot(assunto_id: string): Promise<InventarioSlot> {
  const abas = await idsFilhos("lip_abas", assunto_id);
  const modelos = await idsFilhos("mac_checklist_modelos", assunto_id);

  const lip_campos = await contar("lip_campos", "aba_id", abas);
  const mac_itens = await contar("mac_checklist_itens", "modelo_id", modelos);
  const lip_prompts = await contar("lip_prompts", "assunto_id", [assunto_id]);

  const processos = await contar("processos", "assunto_id", [assunto_id]);
  const analises_mac = await contar("analises_mac", "assunto_id", [assunto_id]);
  const mrp_registros = await contar("mrp_registros", "assunto_id", [assunto_id]);
  const mdp_registros = await contar("mdp_registros", "assunto_id", [assunto_id]);

  return {
    config: {
      lip_abas: abas.length,
      lip_campos,
      lip_prompts,
      mac_modelos: modelos.length,
      mac_itens,
      total: abas.length + lip_campos + lip_prompts + modelos.length + mac_itens,
    },
    bloqueios: {
      processos,
      analises_mac,
      mrp_registros,
      mdp_registros,
      total: processos + analises_mac + mrp_registros + mdp_registros,
    },
  };
}

/** Nome/slug de fábrica de um slot, a partir da sua ordem (7 -> slot_07 / "Slot 07"). */
export function padraoDoSlot(ordem: number): { slug: string; nome: string } {
  const n = String(ordem).padStart(2, "0");
  return { slug: `slot_${n}`, nome: `Slot ${n}` };
}

/**
 * Apaga a configuração do slot e devolve nome/slug genéricos.
 * Pressupõe que os guardas (perfil, slot fixo, slot inativo, ausência de
 * trabalho real, confirmação digitada) já foram aplicados pela rota.
 */
export async function zerarSlot(assunto: { id: string; ordem: number }): Promise<{
  apagado: InventarioSlot["config"];
  slug: string;
  nome: string;
}> {
  const inv = await inventariarSlot(assunto.id);

  const abas = await idsFilhos("lip_abas", assunto.id);
  const modelos = await idsFilhos("mac_checklist_modelos", assunto.id);

  // Filhos primeiro — as FKs apontam para cá.
  if (abas.length) {
    const { error } = await supabaseAdmin.from("lip_campos").delete().in("aba_id", abas);
    if (error) throw new Error(`lip_campos: ${error.message}`);
  }
  if (modelos.length) {
    const { error } = await supabaseAdmin.from("mac_checklist_itens").delete().in("modelo_id", modelos);
    if (error) throw new Error(`mac_checklist_itens: ${error.message}`);
  }
  for (const [tabela, coluna, valores] of [
    ["lip_abas", "id", abas],
    ["mac_checklist_modelos", "id", modelos],
    ["lip_prompts", "assunto_id", [assunto.id]],
  ] as [string, string, string[]][]) {
    if (valores.length === 0) continue;
    const { error } = await supabaseAdmin.from(tabela).delete().in(coluna, valores);
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }

  // Volta ao padrão de fábrica. O slug só é trocado se ninguém mais o usa
  // (ele é UNIQUE); se houver conflito, mantém o slug atual e zera só o nome.
  const padrao = padraoDoSlot(assunto.ordem);
  const { data: conflito } = await supabaseAdmin
    .from("assuntos").select("id").eq("slug", padrao.slug).neq("id", assunto.id).maybeSingle();

  const patch: Record<string, unknown> = { nome: padrao.nome, ativo: false };
  if (!conflito) patch.slug = padrao.slug;

  const { data: atualizado, error: errUp } = await supabaseAdmin
    .from("assuntos").update(patch).eq("id", assunto.id).select("slug, nome").single();
  if (errUp) throw new Error(`assuntos: ${errUp.message}`);

  return { apagado: inv.config, slug: atualizado.slug, nome: atualizado.nome };
}
