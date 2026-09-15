"use client";

/**
 * hooks/useAtalhosTeclado.ts — liga uma lista de `Atalho` (lib/documentosSei/atalhosTeclado.ts) a
 * `keydown` da janela. Nunca dispara com foco em campo editável (mesma guarda de
 * `components/urbi/UrbiGlobal.tsx`).
 */

import { useEffect } from "react";
import { eventoCasaComAtalho, focoEmCampoEditavel, focoEmControleDeEspaco, type Atalho } from "@/lib/documentosSei/atalhosTeclado";

export function useAtalhosTeclado(atalhos: Atalho[], ativo: boolean = true) {
  useEffect(() => {
    if (!ativo) return;
    function onKeyDown(e: KeyboardEvent) {
      if (focoEmCampoEditavel()) return;
      // Espaço com foco em checkbox/radio/botão é do próprio controle (marcar a caixinha) —
      // senão o atalho de espaço da tela rouba o espaço e a caixinha nunca marca via teclado.
      if (e.key === " " && focoEmControleDeEspaco()) return;
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
