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

  const iniciarWakeWord = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} }
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const texto = e.results[e.results.length - 1]?.[0]?.transcript?.toLowerCase().trim() ?? "";
      const norm = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const temUrbi = norm.includes("urbi") || norm.includes("urby") || norm.includes("orbi");
      const temGatilho = ["oi","ola","hei","hey","ok","hi","alo","ou","on","up","ve","diz","fale","fal","vai","vem","da","faz","vo","po","manda","man","uai","so","bao","ah","eh","oh","no","tche","zure","viu","e ai","eai"].some(g => norm.includes(g));
      if (temUrbi && !urbiAbertoRef.current) {
        setUrbiAberto(true);
      }
      if (texto.includes("ligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_som" }));
      if (texto.includes("desligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_som" }));
      if (texto.includes("ligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_bip" }));
      if (texto.includes("desligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_bip" }));
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (isHome && !urbiAbertoRef.current) {
        setTimeout(() => iniciarWakeWord(), 500);
      }
    };
    try { rec.start(); recRef.current = rec; } catch (_) {}
  }, [isHome]);

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

  useEffect(() => {
    if (isHome && !urbiAberto && usuario?.urbi_ativo) {
      iniciarWakeWord();
    } else {
      if (recRef.current) { try { recRef.current.stop(); } catch (_) {} recRef.current = null; }
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
