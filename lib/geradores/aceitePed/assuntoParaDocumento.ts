// ============================================================
// SLOT 4 — ACEITE PED. Cabeçalho de assunto dos documentos.
//
// CÓPIA POR LEITURA de `assuntoParaDocumento` em lib/geradores.ts, feita em
// 16/10/2026. No Slot 2 essa função é importada do arquivo de geradores do
// Slot 1; aqui o Slot 4 tem a sua, para que mexer nos geradores do Slot 1 não
// mude o cabeçalho dos documentos do Aceite PED. Código idêntico na data da cópia.
// ============================================================

/**
 * Assunto que aparece no cabeçalho dos documentos gerados (despacho,
 * indeferimento, arquivamento).
 *
 * Lê o nome do slot direto da tabela `assuntos` (em maiúsculas). Assim um
 * slot novo já sai com o cabeçalho certo sem deploy, e renomear o slot no
 * admin muda o texto do documento. Aceita o slug (`tipo_processo`) ou o
 * `assunto_id` — este último tem prioridade por ser o vínculo firme.
 *
 * Só cai no genérico "APROVAÇÃO DE PROJETO" se o slot não for encontrado
 * (processo órfão, sem tipo). Falha de banco também cai no genérico: o
 * documento NÃO deve deixar de ser emitido por causa do cabeçalho.
 */
export async function assuntoParaDocumento(
  tipoProcesso: string | null | undefined,
  assuntoId?: string | null,
): Promise<string> {
  const GENERICO = "APROVAÇÃO DE PROJETO";
  const slug = String(tipoProcesso ?? "").toLowerCase().trim();
  const idValido = typeof assuntoId === "string" && /^[0-9a-f-]{36}$/i.test(assuntoId);
  if (!idValido && !slug) return GENERICO;

  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    // `select("*")` de propósito: `nome_documento` é coluna nova e um
    // select explícito quebraria o documento se o deploy chegasse antes da
    // migration. Aqui, coluna ausente vira `undefined` e cai no `nome`.
    const q = supabaseAdmin.from("assuntos").select("*");
    const { data } = idValido
      ? await q.eq("id", assuntoId).maybeSingle()
      : await q.eq("slug", slug).maybeSingle();
    const row = data as { nome?: string; nome_documento?: string | null } | null;
    // O nome de TELA ("Regularização SEI") não serve para o cabeçalho do
    // ato oficial; quando existe `nome_documento`, ele manda.
    const nome = String(row?.nome_documento ?? row?.nome ?? "").trim();
    return nome ? nome.toUpperCase() : GENERICO;
  } catch {
    return GENERICO;
  }
}
