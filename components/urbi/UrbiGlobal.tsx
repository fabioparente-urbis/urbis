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

  // ── Rotina padrão de dicas do URBI ──────────────────────────────────
  // Quando algo no app tem uma dica factual pra dar (ex: histórico do RT
  // no LIP) e o URBI está fechado, ele não abre sozinho: aparece uma
  // bolha escurecida no canto INFERIOR ESQUERDO (o chat normal vive no
  // direito). Se o analista não clicar em 10s, a bolha some — mas a dica
  // fica guardada por processo e é entregue automaticamente na próxima
  // vez que o URBI for reativado naquele mesmo processo.
  const [peekAtivo, setPeekAtivo] = useState(false);
  const [dicaPeek, setDicaPeek] = useState<string | null>(null);
  const [mensagemInicial, setMensagemInicial] = useState<string | null>(null);
  const dicasPendentesRef = useRef<Map<string, string[]>>(new Map());
  const peekTimerRef = useRef<any>(null);
  const processoIdRef = useRef<string | null>(null);

  useEffect(() => { urbiAbertoRef.current = urbiAberto; }, [urbiAberto]);

  useEffect(() => {
    const match = pathname.match(/\/(processo|analise-regularizacao|analise-aceite-sei)\/([^/?]+)/);
    processoIdRef.current = match ? decodeURIComponent(match[2]) : null;
  }, [pathname]);

  useEffect(() => {
    function onDica(e: Event) {
      const { processoId, mensagem } = (e as CustomEvent).detail || {};
      if (!processoId || !mensagem) return;
      if (urbiAbertoRef.current) {
        window.dispatchEvent(new CustomEvent("urbi:entregar-dica", { detail: { mensagem } }));
        return;
      }
      const fila = dicasPendentesRef.current.get(processoId) ?? [];
      fila.push(mensagem);
      dicasPendentesRef.current.set(processoId, fila);
      setDicaPeek(mensagem);
      setPeekAtivo(true);
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
      peekTimerRef.current = setTimeout(() => setPeekAtivo(false), 10000);
    }
    window.addEventListener("urbi:dica", onDica);
    return () => { window.removeEventListener("urbi:dica", onDica); if (peekTimerRef.current) clearTimeout(peekTimerRef.current); };
  }, []);

  function ativarComDica() {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    setPeekAtivo(false);
    const codigo = processoIdRef.current;
    const fila = codigo ? (dicasPendentesRef.current.get(codigo) ?? []) : [];
    const proxima = fila.shift() ?? dicaPeek ?? null;
    if (codigo) dicasPendentesRef.current.set(codigo, fila);
    setMensagemInicial(proxima);
    setUrbiAberto(true);
  }

  // Entrega dicas pendentes do processo atual sempre que o URBI é
  // reaberto por qualquer caminho (não só pelo clique na bolha).
  useEffect(() => {
    if (!urbiAberto) return;
    const codigo = processoIdRef.current;
    if (!codigo) return;
    const fila = dicasPendentesRef.current.get(codigo);
    if (fila && fila.length > 0) {
      const proxima = fila.shift();
      setMensagemInicial(proxima ?? null);
    }
  }, [urbiAberto]);

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

  // O layout raiz não remonta entre navegações (App Router só troca
  // {children}), então login/logout não desmonta o URBI sozinho. Sem isso,
  // ao expirar a sessão (useAutoLogout) ou clicar em "Sair", o widget
  // continua vivo com o usuário e a conversa antigos por cima da tela de
  // login.
  useEffect(() => {
    if (pathname?.startsWith("/login") || pathname?.startsWith("/redefinir-senha")) {
      setUsuario(null);
      setUrbiAberto(false);
    }
  }, [pathname]);

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
      {!urbiAberto && peekAtivo && dicaPeek && (
        <div
          onClick={ativarComDica}
          role="button"
          aria-label="URBI tem uma dica sobre este processo"
          style={{
            position: "fixed", bottom: 24, left: 24, zIndex: 1000,
            display: "flex", alignItems: "flex-end", gap: 8,
            cursor: "pointer", userSelect: "none",
          }}
        >
          <img
            src="/urbi/poses/urbi-atencao.png"
            alt=""
            style={{
              width: 56, height: 72, objectFit: "contain",
              filter: "brightness(0.55) saturate(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
            }}
          />
          <div style={{
            background: "#0f172a", color: "#e2e8f0", borderRadius: 10,
            padding: "8px 12px", fontSize: 12, lineHeight: 1.4, maxWidth: 220,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}>
            {dicaPeek.length > 90 ? `${dicaPeek.slice(0, 87)}…` : dicaPeek}
          </div>
        </div>
      )}
      <UrbiChat
        usuario={usuario}
        aberto={urbiAberto}
        setAberto={setUrbiAberto}
        modo={isHome ? "center" : "corner"}
        assuntoId={assuntoId}
        urbiVoz={usuario?.urbi_voz ?? false}
        mensagemInicial={mensagemInicial}
        onMensagemInicialConsumida={() => setMensagemInicial(null)}
      />
    </>
  );
}
