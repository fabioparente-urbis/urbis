/**
 * lib/documentosSei/hashOrigem.ts — identifica DE QUAL PDF um arquivo derivado (recorte, pacote)
 * veio, sem guardar o PDF em lugar nenhum.
 *
 * Acrescentado em 07/09/2026, achado numa conversa com o Fábio: o pacote vigente e o recorte
 * avulso baixam sempre com o MESMO nome (`Pacote vigente - <processo>.zip`,
 * `<processo> - <título>.pdf`) — baixar duas vezes, dias depois, com um PDF do SEI diferente
 * (documento novo entrou), produz dois arquivos INDISTINGUÍVEIS pelo nome, e o Fábio já deixou
 * claro que os arquivos derivados ficam guardados no dispositivo dele, não somem. Isso fere o
 * princípio §5.7 do plano ("todo documento derivado nasce rastreável: ID SEI + páginas de origem +
 * data + motivo + versão") pela metade: tinha data no manifesto, mas nada dizia de qual PDF de
 * origem aquele recorte específico veio.
 *
 * SÓ CLIENTE — usa `crypto.subtle`, disponível no navegador (contexto seguro, https/localhost, que
 * é como o app já roda). Não é usado para achar duplicata nem para nada de segurança: é só um
 * rótulo curto e estável para o nome do arquivo. O hash "de verdade" que decide identidade de
 * documento é outro, em `lib/documentosSei/persistencia.ts` (sobre o texto extraído + Nº SEI, no
 * servidor) — este aqui é sobre os BYTES do PDF inteiro, só para o nome do arquivo baixado.
 */

/** Primeiros 8 caracteres hex do SHA-256 dos bytes — o bastante para distinguir dois arquivos
 *  parecidos no nome, pouco o bastante para não virar ruído visual. */
export async function hashCurtoOrigem(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
}

/** AAAA-MM-DD, hora local — igual em todo lugar que precisa datar um arquivo derivado. */
export function dataParaNomeArquivo(): string {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
