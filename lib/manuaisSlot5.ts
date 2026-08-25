/**
 * lib/manuaisSlot5.ts — leitura server-side dos manuais de referência do Slot 5.
 *
 * Os arquivos moram em `docs/manuais/` (fora de `public/`, de propósito — nada aqui é servido como
 * arquivo estático baixável). Só esta lista pode ser lida; a chave da URL nunca vira caminho de
 * arquivo direto, pra não abrir travessia de diretório.
 */

import fs from "fs/promises";
import path from "path";
import { marked } from "marked";

export const MANUAIS_SLOT5 = {
  lip: { titulo: "Manual do LIP — Slot 5", arquivo: "MANUAL_SLOT5_LIP.md" },
  mac: { titulo: "Manual do MAC — Slot 5", arquivo: "MANUAL_SLOT5_MAC.md" },
} as const;

export type ChaveManualSlot5 = keyof typeof MANUAIS_SLOT5;

export function ehChaveManualSlot5(v: string): v is ChaveManualSlot5 {
  return v === "lip" || v === "mac";
}

export async function lerManualSlot5(chave: ChaveManualSlot5): Promise<{ titulo: string; html: string }> {
  const { titulo, arquivo } = MANUAIS_SLOT5[chave];
  const caminho = path.join(process.cwd(), "docs", "manuais", arquivo);
  const md = await fs.readFile(caminho, "utf-8");
  const html = await marked.parse(md, { gfm: true });
  return { titulo, html };
}
