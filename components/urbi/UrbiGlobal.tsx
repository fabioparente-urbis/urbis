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

  if (!usuario?.nome) return null;

  return (
    <>
      {!urbiAberto && isHome && (
        <button
          onClick={() => setUrbiAberto(true)}
          style={{
            position: "fixed",
            bottom: 80,
            right: 24,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            zIndex: 1000,
          }}
        >
          <img
            src="/urbi/urbi-botao.jpg"
            style={{
              width: isHome ? 130 : 80,
              height: isHome ? 130 : 80,
              borderRadius: "50%",
              objectFit: "cover",
              boxShadow: "0 4px 24px #3b82f688",
            }}
          />
        </button>
      )}
      <UrbiChat
        usuario={usuario}
        aberto={urbiAberto}
        setAberto={setUrbiAberto}
        modo={isHome ? "center" : "corner"}
      />
    </>
  );
}
