"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UrbiChat from "./UrbiChat";

export default function UrbiGlobal() {
  const [usuario, setUsuario] = useState<any>(null);
  const [urbiAberto, setUrbiAberto] = useState(false);
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const pathname = usePathname();
  const isHome = pathname === "/";

  // Extrai codigo do processo da URL e busca assunto_id
  useEffect(() => {
    const match = pathname.match(/\/(processo|analise-regularizacao)\/([^/?]+)/);
    const codigo = match ? decodeURIComponent(match[2]) : null;
    if (!codigo) { setAssuntoId(null); return; }
    fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.ok) setAssuntoId(j.data?.assunto_id ?? null); })
      .catch(() => {});
  }, [pathname]);

  const buscarUsuario = () => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data?.nome) setUsuario(data.data); })
      .catch(() => {});
  };

  useEffect(() => {
    buscarUsuario();
    window.addEventListener("urbi:refresh", buscarUsuario);
    return () => window.removeEventListener("urbi:refresh", buscarUsuario);
  }, []);

  if (!usuario?.nome) return null;
  if (!usuario?.urbi_ativo) return null;

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
        assuntoId={assuntoId}
      />
    </>
  );
}
