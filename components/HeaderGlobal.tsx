"use client";
import { usePathname } from "next/navigation";
import NomeUsuario from "./NomeUsuario";

export default function HeaderGlobal() {
  const pathname = usePathname();
  if (pathname?.startsWith("/login")) return null;
  return (
    <>
      {/* Logo URBIS — canto inferior esquerdo */}
      <div className="fixed bottom-2 left-2 z-40 pointer-events-none" aria-hidden={true}>
        <img
          src="/logo_urbis.png"
          alt="URBIS"
          className="h-14 w-auto opacity-50 select-none"
          draggable={false}
        />
      </div>
      {/* Nome do usuário — canto inferior direito */}
      <div className="fixed bottom-2 right-2 z-40 pointer-events-none flex items-center justify-end px-2 py-1">
        <div className="pointer-events-auto">
          <NomeUsuario />
        </div>
      </div>
    </>
  );
}
