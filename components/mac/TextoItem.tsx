/** Texto de item do checklist. Começando com "ATENÇÃO:", essa palavra sai em negrito. */
export default function TextoItem({ texto }: { texto: string }) {
  const m = texto.match(/^ATENÇÃO:\s*/);
  if (!m) return <>{texto}</>;
  return <><strong>ATENÇÃO:</strong> {texto.slice(m[0].length)}</>;
}
