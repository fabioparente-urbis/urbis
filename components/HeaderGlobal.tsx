"use client";

import { usePathname } from "next/navigation";
import NomeUsuario from "./NomeUsuario";

/**
 * Header global do URBIS: logo no canto superior esquerdo e nome do
 * usuario logado no canto superior direito (item 5 e 6).
 *
 * Posicionamento fixo com pointer-events controlados para nao bloquear
 * cliques no conteudo abaixo. Oculto na tela /login para nao competir
 * com o card centralizado.
 */
export default function HeaderGlobal() {
  const pathname = usePathname();
  // Em /login o card ja tem logo centralizado; nao duplica.
  if (pathname?.startsWith("/login")) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 pointer-events-none flex items-center justify-between px-4 py-2"
      aria-hidden={false}
    >
      <div className="pointer-events-auto flex items-center gap-2">
        <img
          src="/logo_urbis.png"
          alt="URBIS"
          className="h-7 w-auto opacity-90 select-none"
          draggable={false}
        />
      </div>
      <div className="pointer-events-auto">
        <NomeUsuario />
      </div>
    </div>
  );
}
