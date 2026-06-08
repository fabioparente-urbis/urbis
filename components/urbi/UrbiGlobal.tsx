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
  const recRef = useRef<any>(null);
  const urbiAbertoRef = useRef(false);
  const bufferRef = useRef("");
  const timerRef = useRef<any>(null);
  const micAtivoRef = useRef(false);

  useEffect(() => { urbiAbertoRef.current = urbiAberto; }, [urbiAberto]);

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

  const pararEscuta = useCallback(() => {
    micAtivoRef.current = false;
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} recRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    bufferRef.current = "";
  }, []);

  const iniciarEscuta = useCallback(() => {
    if (!isHome || urbiAbertoRef.current) return;
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} }

    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    bufferRef.current = "";

    rec.onresult = (e: any) => {
      let texto = "";
      for (let i = 0; i < e.results.length; i++) {
        texto += e.results[i][0].transcript;
      }
      bufferRef.current = texto.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const b = bufferRef.current;
      const temUrbi = b.includes("urbi") || b.includes("urby") || b.includes("orbi");
      if (temUrbi && !urbiAbertoRef.current) {
        setUrbiAberto(true);
        pararEscuta();
      }
      if (b.includes("ligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_som" }));
      if (b.includes("desligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_som" }));
      if (b.includes("ligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_bip" }));
      if (b.includes("desligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_bip" }));
    };

    rec.onerror = () => {};
    rec.onend = () => {
      if (!micAtivoRef.current) return;
      setTimeout(() => iniciarEscuta(), 300);
    };

    micAtivoRef.current = true;
    try { rec.start(); recRef.current = rec; } catch (_) {}

    // Para após 60 segundos
    timerRef.current = setTimeout(() => {
      pararEscuta();
    }, 60000);
  }, [isHome, pararEscuta]);

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

  // Microfone só liga com clique — nunca automático
  useEffect(() => {
    return () => pararEscuta();
  }, []);

  if (!usuario?.nome) return null;
  if (!usuario?.urbi_ativo) return null;

  return (
    <>
      {!urbiAberto && isHome && (
        <button onClick={() => { iniciarEscuta(); setUrbiAberto(true); }}
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
