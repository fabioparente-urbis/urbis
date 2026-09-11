"use client";

/**
 * hooks/useAtalhosTeclado.ts — liga uma lista de `Atalho` (lib/documentosSei/atalhosTeclado.ts) a
 * `keydown` da janela. Nunca dispara com foco em campo editável (mesma guarda de
 * `components/urbi/UrbiGlobal.tsx`).
 */

import { useEffect } from "react";
import { eventoCasaComAtalho, focoEmCampoEditavel, type Atalho } from "@/lib/documentosSei/atalhosTeclado";

export function useAtalhosTeclado(atalhos: Atalho[], ativo: boolean = true) {
  useEffect(() => {
    if (!ativo) return;
    function onKeyDown(e: KeyboardEvent) {
      if (focoEmCampoEditavel()) return;
      for (const a of atalhos) {
        if (eventoCasaComAtalho(e, a)) {
          e.preventDefault();
          a.acao();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `atalhos` é recriado a cada render de
    // propósito (fecha sobre estado atual); comparar por referência quebraria os handlers.
  }, [atalhos, ativo]);
}
