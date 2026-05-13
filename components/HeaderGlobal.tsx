"use client";

import { usePathname } from "next/navigation";
import NomeUsuario from "./NomeUsuario";

/**
 * Header global do URBIS:
 * - Logo grande, 50% de opacidade, fixada no canto INFERIOR esquerdo
 *   (marca-d'água, não compete com o conteúdo).
 * - Nome do usuário logado no canto SUPERIOR direito.
 *
 * Oculto na tela /login (o card de login já tem logo centralizado).
 */
export default function HeaderGlobal() {
  const pathname = usePathname();
  if (pathname?.startsWith("/login")) return null;

  return (
    <>
      {/* Nome do usuário no topo direito (mantido) */}
      <div
        className="fixed top-0 right-0 z-40 pointer-events-none flex items-center justify-end px-4 py-2"
        aria-hidden={false}
      >
        <div className="pointer-events-auto">
          <NomeUsuario />
        </div>
      </div>

      {/* Logo URBIS — canto inferior esquerdo, dobrada e 50% de opacidade */}
      <div
        className="fixed bottom-2 left-2 z-40 pointer-events-none"
        aria-hidden={true}
      >
        <img
          src="/logo_urbis.png"
          alt="URBIS"
          className="h-14 w-auto opacity-50 select-none"
          draggable={false}
        />
      </div>
    </>
  );
}
