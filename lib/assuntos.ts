// ============================================================
// Resolução canônica de "qual slot (assunto) é este".
//
// Motivação (auditoria 2026-07-24): existiam dois caminhos gravando
// `mrp_registros.tipo_processo` com valores diferentes na MESMA linha
// (upsert por usuario_id+numero_despacho) — o servidor gravava o slug
// `regularizacao` e o cliente caía num default `"Regularização"`. O
// resultado foram 4 grafias para a mesma coisa e um filtro de MRP que
// enxergava 4 de 69 registros.
//
// Regra a partir daqui: NINGUÉM inventa o valor do slot. Todo caminho
// de gravação chama `resolverSlot()`, que tem uma única fonte de
// verdade — o próprio processo — e devolve slug + id juntos.
// ============================================================
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Slot = { slug: string | null; assunto_id: string | null; nome: string | null };
const VAZIO: Slot = { slug: null, assunto_id: null, nome: null };

const ehUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Grafias históricas que já foram gravadas em `tipo_processo` antes da
 * normalização. Só usadas como último recurso, quando não dá para chegar
 * ao processo. Mantidas para que registros antigos reprocessados não
 * voltem a divergir.
 */
const LEGADO: Record<string, string> = {
  "regularização": "regularizacao",
  "regularização sei": "regularizacao",
  "regularizacao sei": "regularizacao",
  "aceite sei": "aceite_sei",
  "aceite": "aceite_sei",
};

/**
 * Descobre o slot a partir do que estiver disponível, em ordem de
 * confiabilidade:
 *   1. `assunto_id` explícito (vínculo firme)
 *   2. o processo no banco (fonte de verdade)
 *   3. o texto `tipo_processo` — slug, grafia legada ou nome do slot
 *
 * Nunca lança: falha de banco devolve o slot vazio para que a gravação
 * do MRP/MDP não derrube a emissão do documento.
 */
export async function resolverSlot(input: {
  processo_codigo?: string | null;
  tipo_processo?: string | null;
  assunto_id?: string | null;
}): Promise<Slot> {
  try {
    // 1. assunto_id explícito
    if (ehUuid(input.assunto_id)) {
      const { data } = await supabaseAdmin
        .from("assuntos").select("id, slug, nome").eq("id", input.assunto_id).maybeSingle();
      if (data) return { slug: data.slug, assunto_id: data.id, nome: data.nome };
    }

    // 2. o processo manda — é o que o usuário escolheu ao abrir
    if (input.processo_codigo) {
      const { data: proc } = await supabaseAdmin
        .from("processos").select("tipo_processo, assunto_id")
        .eq("codigo", input.processo_codigo).maybeSingle();
      if (proc) {
        if (ehUuid(proc.assunto_id)) {
          const { data } = await supabaseAdmin
            .from("assuntos").select("id, slug, nome").eq("id", proc.assunto_id).maybeSingle();
          if (data) return { slug: data.slug, assunto_id: data.id, nome: data.nome };
        }
        const porSlug = await porTexto(proc.tipo_processo);
        if (porSlug.slug) return porSlug;
      }
    }

    // 3. texto solto
    return await porTexto(input.tipo_processo);
  } catch {
    return VAZIO;
  }
}

async function porTexto(valor: string | null | undefined): Promise<Slot> {
  const t = String(valor ?? "").toLowerCase().trim();
  if (!t) return VAZIO;
  const alvo = LEGADO[t] ?? t;

  const { data: porSlug } = await supabaseAdmin
    .from("assuntos").select("id, slug, nome").eq("slug", alvo).maybeSingle();
  if (porSlug) return { slug: porSlug.slug, assunto_id: porSlug.id, nome: porSlug.nome };

  // Último recurso: o texto era o NOME do slot (ex.: "Regularização SEI").
  const { data: todos } = await supabaseAdmin.from("assuntos").select("id, slug, nome");
  const achado = (todos ?? []).find((a) => String(a.nome).toLowerCase().trim() === t);
  return achado ? { slug: achado.slug, assunto_id: achado.id, nome: achado.nome } : VAZIO;
}
