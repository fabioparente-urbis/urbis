"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import UrbiChat from "./UrbiChat";

export default function UrbiGlobal() {
  const [usuario, setUsuario] = useState<any>(null);
  const [urbiAberto, setUrbiAberto] = useState(false);
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const globalRecRef = useRef<any>(null);
  const globalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartingRef = useRef(false);

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

  // Listener global de voz na Home — "oi urbi", "ligar som", "ligar microfone", "ligar bip"
  const iniciarListenerGlobal = useCallback(() => {
    if (!isHome) return;
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (globalRecRef.current) { try { globalRecRef.current.stop(); } catch (_) {} }

    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const texto = e.results[e.results.length - 1]?.[0]?.transcript?.toLowerCase().trim() ?? "";
      if (texto.includes("urbi")) {
        setUrbiAberto(true);
        window.dispatchEvent(new CustomEvent("urbi:abrir_com_voz"));
      }
      if (texto.includes("ligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_som" }));
      if (texto.includes("desligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_som" }));
      if (texto.includes("ligar microfone")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_mic" }));
      if (texto.includes("desligar microfone")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_mic" }));
      if (texto.includes("ligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_bip" }));
      if (texto.includes("desligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_bip" }));
    };
    rec.onend = () => { if (isHome && !urbiAberto && !restartingRef.current) { restartingRef.current = true; setTimeout(() => { restartingRef.current = false; iniciarListenerGlobal(); }, 500); } };
    try { rec.start(); globalRecRef.current = rec; } catch (_) {}

    // Para após 2 min de inatividade se URBI fechado
    if (globalTimerRef.current) clearTimeout(globalTimerRef.current);
    globalTimerRef.current = setTimeout(() => {
      if (!urbiAberto && globalRecRef.current) {
        try { globalRecRef.current.stop(); } catch (_) {}
        globalRecRef.current = null;
      }
    }, 120000);
  }, [isHome, urbiAberto]);

  useEffect(() => {
    buscarUsuario();
    window.addEventListener("urbi:refresh", buscarUsuario);
    const fecharUrbi = () => setUrbiAberto(false);
    window.addEventListener("urbi:fechar", fecharUrbi);
    return () => {
      window.removeEventListener("urbi:refresh", buscarUsuario);
      window.removeEventListener("urbi:fechar", fecharUrbi);
    };
  }, []);

  // Inicia listener global quando na Home e URBI fechado
  useEffect(() => {
    if (isHome && !urbiAberto && usuario?.urbi_ativo) {
      iniciarListenerGlobal();
    } else {
      if (globalRecRef.current) { try { globalRecRef.current.stop(); } catch (_) {} globalRecRef.current = null; }
      if (globalTimerRef.current) clearTimeout(globalTimerRef.current);
    }
  }, [isHome, urbiAberto, usuario?.urbi_ativo]);

  if (!usuario?.nome) return null;
  if (!usuario?.urbi_ativo) return null;

  return (
    <>
      {!urbiAberto && isHome && (
        <button onClick={() => setUrbiAberto(true)}
          style={{ position: "fixed", bottom: 80, right: 24, background: "transparent", border: "none", cursor: "pointer", zIndex: 1000 }}>
          <img src="/urbi/urbi-botao.jpg"
            style={{ width: 130, height: 130, borderRadius: "50%", objectFit: "cover", boxShadow: "0 4px 24px #3b82f688" }} />
        </button>
      )}
      <UrbiChat
        usuario={usuario}
        aberto={urbiAberto}
        setAberto={setUrbiAberto}
        modo={isHome ? "center" : "corner"}
        assuntoId={assuntoId}
        urbiVoz={usuario?.urbi_voz ?? false}
      />
    </>
  );
}
