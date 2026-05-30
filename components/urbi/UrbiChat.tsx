"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSpeech } from "./useWebSpeech";
import intencoesJson from "./urbi-intencoes.json";

type IntencaoAcao =
  | { tipo: "navegar"; rota: string }
  | { tipo: "fechar" }
  | { tipo: "mudo"; valor: boolean };

type Intencao = {
  id: string;
  frases: string[];
  acao: IntencaoAcao;
  resposta?: string;
};

const INTENCOES: Intencao[] = (intencoesJson as { comandos: Intencao[] }).comandos;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function casarIntencao(texto: string): Intencao | null {
  const alvo = normalizar(texto);
  if (!alvo) return null;
  for (const intencao of INTENCOES) {
    for (const frase of intencao.frases) {
      const fraseNorm = normalizar(frase);
      if (alvo === fraseNorm || alvo.includes(fraseNorm)) {
        return intencao;
      }
    }
  }
  return null;
}

const POSE_MAP: Record<string, string> = {
  sucesso:          "/urbi/poses/urbi-sucesso.png",
  "tudo-ok":        "/urbi/poses/urbi-tudo-ok.png",
  oops:             "/urbi/poses/urbi-oops.png",
  "oh-nao":         "/urbi/poses/urbi-oh-nao.png",
  atencao:          "/urbi/poses/urbi-atencao.png",
  "algo-errado":    "/urbi/poses/urbi-algo-errado.png",
  analisando:       "/urbi/poses/urbi-analisando.png",
  planejando:       "/urbi/poses/urbi-planejando.png",
  "dados-errados":  "/urbi/poses/urbi-dados-errados.png",
  bravo:            "/urbi/poses/urbi-bravo.png",
};

function selectPose(tipo: "pensando"|"positivo"|"negativo"|"atencao"|"critico"|"idle", atual?: string): string {
  const map: Record<string, string[]> = {
    pensando: ["analisando","planejando"],
    positivo: ["sucesso","tudo-ok"],
    negativo: ["oops","algo-errado"],
    atencao:  ["atencao","oh-nao"],
    critico:  ["bravo","dados-errados"],
    idle:     ["sucesso","tudo-ok"],
  };
  const ids = map[tipo];
  const opcoes = ids.filter(id => id !== atual);
  return opcoes.length > 0 ? opcoes[Math.floor(Math.random() * opcoes.length)] : ids[0];
}

function detectTipo(texto: string): "positivo"|"negativo"|"atencao"|"critico" {
  const t = texto.toLowerCase();
  if (t.includes("erro crítico")||t.includes("inválido")) return "critico";
  if (t.includes("atenção")||t.includes("pendência")||t.includes("verificar")) return "atencao";
  if (t.includes("erro")||t.includes("não encontrado")) return "negativo";
  return "positivo";
}

type Msg = { role: "user"|"urbi"; texto: string };
type GeminiMsg = { role: string; parts: { text: string }[] };
type Props = {
  usuario: { nome: string; perfil: string; id?: string };
  aberto: boolean;
  setAberto: (v: boolean) => void;
  modo?: "center" | "corner";
  assuntoId?: string | null;
};

const DEFAULT_CORNER = { bottom: 24, right: 24 };

export default function UrbiChat({ usuario, aberto: abertoProp, setAberto, modo = "center", assuntoId = null }: Props) {
  const router = useRouter();
  const [fase, setFase] = useState<"fora"|"entrando"|"idle"|"saindo">("fora");
  const [poseId, setPoseId] = useState("sucesso");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [poseOpacity, setPoseOpacity] = useState(1);
  const [videoAtivo, setVideoAtivo] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [overlayVisivel, setOverlayVisivel] = useState(false);
  const [history, setHistory] = useState<GeminiMsg[]>([]);
  const [balaoVisivel, setBalaoVisivel] = useState(false);
  const [cornerPos, setCornerPos] = useState(DEFAULT_CORNER);
  const dragStart = useRef<{ mouseX: number; mouseY: number; bottom: number; right: number } | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ----- Web Speech (STT + TTS) ------------------------------------------
  const { estado: speech, alternarEscuta, falar, pararFala, alternarMudo, setMudo } =
    useWebSpeech({
      idioma: "pt-BR",
      aoTranscrever: (texto) => {
        // Reflete a transcrição no input e dispara o envio direto.
        setInput(texto);
        void enviar(texto);
      },
    });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (abertoProp && fase === "fora") abrir();
    if (!abertoProp && (fase === "idle" || fase === "entrando")) fechar();
  }, [abertoProp]);


  async function saudacaoOnMount() {
    try {
      const res = await fetch("/api/urbi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "OnMount", assunto_id: assuntoId, usuario }),
      });
      const json = await res.json();
      if (json.ok && json.resposta) {
        setMsgs([{ role: "urbi", texto: json.resposta }]);
        return;
      }
    } catch (_) {}
    setMsgs([{ role: "urbi", texto: `Fala, ${usuario.nome.split(" ")[0]}! Como posso ajudar?` }]);
  }
  function abrir() {
    if (modo === "corner") {
      setFase("idle");
      setPoseId("tudo-ok");
      setBalaoVisivel(true);
      setMsgs([{ role: "urbi", texto: "..." }]);
      saudacaoOnMount();
      return;
    }
    setOverlayVisivel(true);
    setTimeout(() => setOverlayOpacity(1), 10);
    setTimeout(() => setVideoAtivo(true), 600);
  }

  function onVideoEnd() {
    setVideoAtivo(false);
    setTimeout(() => setOverlayOpacity(0), 200);
    setTimeout(() => {
      setOverlayVisivel(false);
      setFase("entrando");
      setPoseId("planejando");
      setTimeout(() => {
        setPoseId("tudo-ok");
        setFase("idle");
        setBalaoVisivel(true);
        setMsgs([{ role: "urbi", texto: "..." }]);
        saudacaoOnMount();
      }, 900);
    }, 800);
  }

  function fechar() {
    setBalaoVisivel(false);
    setFase("saindo");
    setAberto(false);
    setTimeout(() => {
      setFase("fora");
      setMsgs([]);
      setHistory([]);
      setPoseId("sucesso");
    }, 500);
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    if (snapTimer.current) clearTimeout(snapTimer.current);
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, bottom: cornerPos.bottom, right: cornerPos.right };

    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      setCornerPos({
        bottom: Math.max(0, dragStart.current.bottom - dy),
        right: Math.max(0, dragStart.current.right - dx),
      });
    }

    function onUp() {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      snapTimer.current = setTimeout(() => setCornerPos(DEFAULT_CORNER), 3000);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function aplicarAcaoIntencao(acao: IntencaoAcao) {
    switch (acao.tipo) {
      case "navegar":
        router.push(acao.rota);
        break;
      case "fechar":
        setTimeout(() => fechar(), 1500);
        break;
      case "mudo":
        setMudo(acao.valor);
        break;
    }
  }

  async function enviar(textoForcado?: string) {
    const texto = (textoForcado ?? input).trim();
    if (!texto || carregando) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", texto }]);
    setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("pensando", poseId)); setPoseOpacity(1); }, 200);

    // Antes de chamar a API, tenta casar com uma intenção local (comando de voz/atalho).
    const intencao = casarIntencao(texto);
    if (intencao) {
      const resposta = intencao.resposta ?? "Ok.";
      setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("positivo", poseId)); setPoseOpacity(1); }, 200);
      setMsgs(m => [...m, { role: "urbi", texto: resposta }]);
      if (!speech.mudo) falar(resposta);
      aplicarAcaoIntencao(intencao.acao);
      return;
    }

    setCarregando(true);
    const novoHistory: GeminiMsg[] = [...history, { role: "user", parts: [{ text: texto }] }];
    try {
      const res = await fetch("/api/urbi/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: texto, history, usuario, assunto_id: assuntoId }),
      });
      const json = await res.json();
      if (json.ok) {
        const tipo = detectTipo(json.resposta);
        setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose(tipo, poseId)); setPoseOpacity(1); }, 200);
        setMsgs(m => [...m, { role: "urbi", texto: json.resposta }]);
        setHistory([...novoHistory, { role: "model", parts: [{ text: json.resposta }] }]);
        if (!speech.mudo) falar(json.resposta);
        await fetch("/api/urbi/historico", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario_id: usuario.id ?? null, usuario_nome: usuario.nome, mensagem_usuario: texto, resposta_urbi: json.resposta, linha: "geral", pose_usada: poseId }),
        });
        if (json.sair) setTimeout(() => fechar(), 1800);
      } else {
        setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("negativo", poseId)); setPoseOpacity(1); }, 200);
        const fallback = "Tive um problema técnico. Tenta de novo.";
        setMsgs(m => [...m, { role: "urbi", texto: fallback }]);
        if (!speech.mudo) falar(fallback);
      }
    } catch {
      setPoseId(selectPose("negativo"));
      const fallback = "Sem conexão. Verifica a rede.";
      setMsgs(m => [...m, { role: "urbi", texto: fallback }]);
      if (!speech.mudo) falar(fallback);
    }
    setCarregando(false);
  }

  if (fase === "fora" && !videoAtivo) return null;

  const css = `
    @keyframes urbiEntrada {
      0%   { transform: translateX(160%); opacity: 0; }
      60%  { opacity: 1; }
      75%  { transform: translateX(-12px); }
      90%  { transform: translateX(6px); }
      100% { transform: translateX(0); }
    }
    @keyframes urbiSaida {
      0%   { transform: translateX(0); opacity: 1; }
      100% { transform: translateX(160%); opacity: 0; }
    }
    @keyframes urbiIdle {
      0%, 100% { transform: translateY(0); }
      50%       { transform: translateY(-6px); }
    }
    @keyframes balaoEntrada {
      0%   { opacity: 0; transform: scale(0.85) translateX(16px); }
      100% { opacity: 1; transform: scale(1) translateX(0); }
    }
    .urbi-entrando { animation: urbiEntrada 0.8s cubic-bezier(0.25,1,0.5,1) forwards; }
    .urbi-idle     { animation: urbiIdle 3s ease-in-out infinite; }
    .urbi-saindo   { animation: urbiSaida 0.5s ease-in forwards; }
    .urbi-balao    { animation: balaoEntrada 0.3s ease-out forwards; }
  `;

  const chatContent = (small?: boolean) => (
    <>
      <div style={{
        flex: 1, overflowY: "auto", maxHeight: small ? 220 : 300,
        display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8,
      }}>
        {msgs.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%",
              background: msg.role === "user" ? "#1d4ed8" : "#f1f5f9",
              color: msg.role === "user" ? "#ffffff" : "#1e293b",
              borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              padding: "7px 11px", fontSize: 12, lineHeight: 1.6,
              fontFamily: "system-ui, sans-serif", whiteSpace: "pre-wrap",
            }}>{msg.texto}</div>
          </div>
        ))}
        {carregando && (
          <div style={{ background: "#f1f5f9", borderRadius: "12px 12px 12px 2px", padding: "7px 14px", fontSize: 16, color: "#94a3b8", width: "fit-content" }}>···</div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 6, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviar()}
          placeholder={speech.ouvindo ? "Ouvindo..." : "Pergunte ao URBI..."}
          style={{
            flex: 1, border: "1px solid #e2e8f0", borderRadius: 8,
            padding: "7px 10px", fontSize: 12,
            fontFamily: "system-ui, sans-serif",
            outline: "none", color: "#1e293b", background: "#f8fafc",
          }}
        />
        <button onClick={() => enviar()} disabled={carregando || !input.trim()} style={{
          background: carregando ? "#94a3b8" : "#1d4ed8", border: "none",
          borderRadius: 8, color: "#fff", padding: "7px 12px",
          cursor: carregando ? "not-allowed" : "pointer", fontSize: 13,
        }}>→</button>
        <button onClick={fechar} style={{
          background: "transparent", border: "1px solid #e2e8f0",
          borderRadius: 8, color: "#94a3b8", padding: "7px 10px",
          cursor: "pointer", fontSize: 12,
        }}>✕</button>
      </div>
      <div style={{
        display: "flex", gap: 8, paddingTop: 8, minHeight: 36,
        borderTop: "1px solid #f1f5f9", marginTop: 6,
        alignItems: "center",
      }}>
        {/* Microfone (STT) */}
        <button
          type="button"
          onClick={alternarEscuta}
          disabled={!speech.suportaSTT}
          title={
            !speech.suportaSTT
              ? "Reconhecimento de voz não suportado neste navegador"
              : speech.ouvindo
                ? "Parar de ouvir"
                : "Falar com o URBI (microfone)"
          }
          aria-label="Microfone"
          aria-pressed={speech.ouvindo}
          style={{
            background: speech.ouvindo ? "#dc2626" : "#e2e8f0",
            color: speech.ouvindo ? "#ffffff" : "#1e293b",
            border: "none",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: speech.suportaSTT ? "pointer" : "not-allowed",
            fontSize: 14,
            opacity: speech.suportaSTT ? 1 : 0.4,
          }}
        >
          {speech.ouvindo ? "● Ouvindo" : "🎙"}
        </button>

        {/* Switch mudo/som (TTS) */}
        <button
          type="button"
          onClick={() => {
            if (speech.falando) pararFala();
            alternarMudo();
          }}
          disabled={!speech.suportaTTS}
          title={
            !speech.suportaTTS
              ? "Síntese de voz não suportada neste navegador"
              : speech.mudo
                ? "Ativar som das respostas"
                : "Silenciar respostas"
          }
          aria-label={speech.mudo ? "Ativar som" : "Silenciar"}
          aria-pressed={speech.mudo}
          style={{
            background: speech.mudo ? "#e2e8f0" : "#1d4ed8",
            color: speech.mudo ? "#64748b" : "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: speech.suportaTTS ? "pointer" : "not-allowed",
            fontSize: 14,
            opacity: speech.suportaTTS ? 1 : 0.4,
          }}
        >
          {speech.mudo ? "🔇 Mudo" : speech.falando ? "🔊 Falando…" : "🔊 Som"}
        </button>

        {speech.ultimoErroStt && (
          <span style={{ fontSize: 11, color: "#dc2626" }}>
            Mic: {speech.ultimoErroStt}
          </span>
        )}
      </div>
    </>
  );

  if (modo === "corner") {
    return (
      <>
        <style>{css}</style>
        <div style={{
          position: "fixed",
          bottom: cornerPos.bottom,
          right: cornerPos.right,
          zIndex: 950,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 0,
          userSelect: "none",
        }}>
          {balaoVisivel && (
            <div className="urbi-balao" style={{
              position: "relative",
              background: "#ffffff", borderRadius: 16,
              padding: "14px 16px", width: 280, maxHeight: 360,
              boxShadow: "0 8px 32px #00000033",
              display: "flex", flexDirection: "column",
              pointerEvents: "all",
              marginBottom: 6,
            }}>
              {chatContent(true)}
              <div style={{
                position: "absolute",
                bottom: -10,
                right: 32,
                width: 0,
                height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "10px solid #ffffff",
              }} />
              <div style={{
                position: "absolute",
                bottom: -13,
                right: 30,
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderTop: "12px solid rgba(0,0,0,0.08)",
                zIndex: -1,
              }} />
            </div>
          )}
          <div
            className={fase === "idle" ? "urbi-idle" : fase === "saindo" ? "urbi-saindo" : ""}
            onMouseDown={onMouseDown}
            onClick={() => setBalaoVisivel(v => !v)}
            style={{ cursor: "grab", pointerEvents: "all" }}
          >
            <img
              src={POSE_MAP[poseId] ?? POSE_MAP["sucesso"]}
              alt="" draggable={false}
              style={{
                width: 100, height: 128,
                objectFit: "contain",
                opacity: poseOpacity,
                transition: "opacity 0.2s",
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
                background: "transparent",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {overlayVisivel && (
        <div style={{
          position: "fixed", inset: 0,
          background: "#000000",
          opacity: overlayOpacity,
          transition: "opacity 0.8s ease",
          zIndex: 955,
          pointerEvents: overlayOpacity > 0.5 ? "all" : "none",
        }} />
      )}
      {videoAtivo && (
        <video
          src="/urbi/abertura-urbi-v3.mp4"
          autoPlay muted playsInline
          onEnded={onVideoEnd}
          style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(640px, 70vw)", height: "auto",
            zIndex: 960, pointerEvents: "none", borderRadius: 12,
          }}
        />
      )}
      <style>{css}</style>
      <div style={{
        position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 950,
        display: "flex", alignItems: "flex-start", gap: 24,
        pointerEvents: "none",
      }}>
        {balaoVisivel && (
          <div className="urbi-balao" style={{
            pointerEvents: "all", position: "relative",
            background: "#ffffff", borderRadius: 16,
            padding: "14px 16px", width: 420, maxHeight: 560,
            boxShadow: "0 8px 32px #00000033",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              position: "absolute", right: -10, top: 16,
              width: 0, height: 0,
              borderTop: "10px solid transparent",
              borderBottom: "10px solid transparent",
              borderLeft: "10px solid #ffffff",
            }} />
            <div style={{
              position: "absolute", right: -13, top: 14,
              width: 0, height: 0,
              borderTop: "12px solid transparent",
              borderBottom: "12px solid transparent",
              borderLeft: "12px solid rgba(0,0,0,0.08)",
              zIndex: -1,
            }} />
            {chatContent()}
          </div>
        )}
        {fase !== "fora" && (
          <div
            className={
              fase === "entrando" ? "urbi-entrando" :
              fase === "idle"     ? "urbi-idle"     :
              fase === "saindo"   ? "urbi-saindo"   : ""
            }
            style={{ pointerEvents: "all", flexShrink: 0, cursor: "pointer", background: "transparent" }}
            onClick={() => setBalaoVisivel(v => !v)}
          >
            <img
              src={POSE_MAP[poseId] ?? POSE_MAP["sucesso"]}
              alt="" draggable={false}
              style={{
                width: 220, height: 280,
                objectFit: "contain",
                userSelect: "none", pointerEvents: "none",
                background: "transparent",
                filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.25))",
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
