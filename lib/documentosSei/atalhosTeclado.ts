/**
 * lib/documentosSei/atalhosTeclado.ts — Fase 6 do fatiador
 * (docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md §6): tela 100% operável por teclado, Mac e
 * Windows. Não existia nenhuma convenção Mac/Cmd vs Windows/Ctrl no projeto antes disso — o único
 * atalho global existente (`components/urbi/UrbiGlobal.tsx`, Shift+U) trata os dois modificadores
 * como "não é este atalho". Aqui é o oposto: `mod` é o modificador principal de cada plataforma.
 */

export type Atalho = {
  /** tecla, no formato de `KeyboardEvent.key` (minúsculo pra letras: "n", "Enter", "ArrowUp", "?") */
  tecla: string;
  /** true = precisa do modificador principal da plataforma (Cmd no Mac, Ctrl no Windows/Linux) */
  mod?: boolean;
  shift?: boolean;
  acao: () => void;
  /** rótulo curto pro mapa de atalhos ("?") — omitido quando o atalho não deve aparecer lá */
  descricao?: string;
};

export function ehMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
}

/** "⌘" no Mac, "Ctrl" em qualquer outra plataforma — usado só pra RÓTULO na tela. */
export function rotuloModificador(): string {
  return ehMac() ? "⌘" : "Ctrl";
}

export function rotuloAtalho(a: Atalho): string {
  const partes: string[] = [];
  if (a.mod) partes.push(rotuloModificador());
  if (a.shift) partes.push("Shift");
  partes.push(a.tecla.length === 1 ? a.tecla.toUpperCase() : a.tecla);
  return partes.join("+");
}

/**
 * true quando o alvo do evento é um campo onde o analista está digitando — atalho nunca dispara
 * ali (mesma guarda de `UrbiGlobal.tsx`), senão "N" de "novo corte" viraria letra digitada num
 * campo de título editável.
 */
export function focoEmCampoEditavel(): boolean {
  const alvo = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  const tag = alvo?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!alvo?.isContentEditable;
}

/** Testa se um `KeyboardEvent` casa com um `Atalho` — extraído pra ser testável sem DOM. */
export function eventoCasaComAtalho(e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, a: Atalho): boolean {
  const modPressionado = e.metaKey || e.ctrlKey;
  if (!!a.mod !== modPressionado) return false;
  if (!!a.shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === a.tecla.toLowerCase();
}
