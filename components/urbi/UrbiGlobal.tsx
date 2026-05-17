"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UrbiChat from "./UrbiChat";

export default function UrbiGlobal() {
  const [usuario, setUsuario] = useState<any>(null);
  const [urbiAberto, setUrbiAberto] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data?.nome) setUsuario(data.data); })
      .catch(() => {});
  }, []);

  // Na Home, abre automaticamente quando usuario carrega
  useEffect(() => {
    if (isHome && usuario?.nome) setUrbiAberto(true);
  }, [isHome, usuario]);

  if (!usuario?.nome) return null;

  return (
    <>
      <UrbiChat
        usuario={usuario}
        aberto={urbiAberto}
        setAberto={setUrbiAberto}
        modo={isHome ? "center" : "corner"}
      />
    </>
  );
}
