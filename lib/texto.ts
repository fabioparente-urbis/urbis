/**
 * Normalização de texto para busca: minúsculas, sem acentos, sem espaço
 * sobrando. Usada dos dois lados (gravação e consulta) para que "JOAO",
 * "joão" e " João " encontrem o mesmo registro.
 *
 * NFD separa a letra do acento; o range ̀-ͯ remove as marcas
 * combinantes resultantes. Preferido a `unaccent` do Postgres para não
 * depender de extensão nem de função IMMUTABLE em índice.
 */
export function normalizarBusca(...partes: (string | null | undefined)[]): string {
  return partes
    .map((p) => String(p ?? ""))
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
