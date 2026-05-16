"use client";
import { useEffect, useRef, useState } from "react";

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
};

export default function UrbiChat({ usuario, aberto: abertoProp, setAberto }: Props) {
  const [fase, setFase] = useState<"fora"|"entrando"|"idle"|"saindo">("fora");
  const [poseId, setPoseId] = useState("sucesso");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [poseOpacity, setPoseOpacity] = useState(1);
  const [videoAtivo, setVideoAtivo] = useState(false);
  const [history, setHistory] = useState<GeminiMsg[]>([]);
  const [balaoVisivel, setBalaoVisivel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (abertoProp && fase === "fora") abrir();
    if (!abertoProp && (fase === "idle" || fase === "entrando")) fechar();
  }, [abertoProp]);

  function abrir() {
    setVideoAtivo(true);
  }

  function onVideoEnd() {
    setVideoAtivo(false);
    setFase("entrando");
    setPoseId("planejando");
    setTimeout(() => {
      setPoseId("tudo-ok");
      setFase("idle");
      setBalaoVisivel(true);
      setMsgs([{ role: "urbi", texto: `Fala, ${usuario.nome.split(" ")[0]}! Sou o URBI. Como posso ajudar?` }]);
    }, 900);
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

  async function enviar() {
    const texto = input.trim();
    if (!texto || carregando) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", texto }]);
    setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("pensando", poseId)); setPoseOpacity(1); }, 200);
    setCarregando(true);
    const novoHistory: GeminiMsg[] = [...history, { role: "user", parts: [{ text: texto }] }];
    try {
      const res = await fetch("/api/urbi/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: texto, history, usuario }),
      });
      const json = await res.json();
      if (json.ok) {
        const tipo = detectTipo(json.resposta);
        setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose(tipo, poseId)); setPoseOpacity(1); }, 200);
        setMsgs(m => [...m, { role: "urbi", texto: json.resposta }]);
        setHistory([...novoHistory, { role: "model", parts: [{ text: json.resposta }] }]);
        await fetch("/api/urbi/historico", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario_id: usuario.id ?? null, usuario_nome: usuario.nome, mensagem_usuario: texto, resposta_urbi: json.resposta, linha: "geral", pose_usada: poseId }),
        });
        if (json.sair) setTimeout(() => fechar(), 1800);
      } else {
        setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("negativo", poseId)); setPoseOpacity(1); }, 200);
        setMsgs(m => [...m, { role: "urbi", texto: "Tive um problema técnico. Tenta de novo." }]);
      }
    } catch {
      setPoseId(selectPose("negativo"));
      setMsgs(m => [...m, { role: "urbi", texto: "Sem conexão. Verifica a rede." }]);
    }
    setCarregando(false);
  }

  if (fase === "fora" && !videoAtivo) return null;

  return (
    <>

      {videoAtivo && (
        <video
          src="/urbi/abertura-urbi.mp4"
          autoPlay
          muted
          playsInline
          onEnded={onVideoEnd}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(560px, 65vw)",
            height: "auto",
            mixBlendMode: "screen",
            zIndex: 960,
            pointerEvents: "none",
          }}
        />
      )}
      <style>{`
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
      `}</style>

      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        zIndex: 950,
        display: "flex", alignItems: "flex-end", gap: 24,
        pointerEvents: "none",
      }}>
        {/* BALÃO */}
        {balaoVisivel && (
          <div className="urbi-balao" style={{
            pointerEvents: "all", position: "relative",
            background: "#ffffff", borderRadius: 16,
            padding: "14px 16px", width: 320, maxHeight: 440,
            boxShadow: "0 8px 32px #00000033",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "10px solid #ffffff",
            }} />
            <div style={{
              flex: 1, overflowY: "auto", maxHeight: 300,
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
                placeholder="Pergunte ao URBI..."
                style={{
                  flex: 1, border: "1px solid #e2e8f0", borderRadius: 8,
                  padding: "7px 10px", fontSize: 12,
                  fontFamily: "system-ui, sans-serif",
                  outline: "none", color: "#1e293b", background: "#f8fafc",
                }}
              />
              <button onClick={enviar} disabled={carregando || !input.trim()} style={{
                background: carregando ? "#94a3b8" : "#1d4ed8", border: "none",
                borderRadius: 8, color: "#fff", padding: "7px 12px",
                cursor: carregando ? "not-allowed" : "pointer", fontSize: 13,
              }}>→</button>
              <button onClick={fechar} style={{
                background: "transparent", border: "1px solid #e2e8f0",
                borderRadius: 8, color: "#94a3b8", padding: "7px 10px",
                cursor: "pointer", fontSize: 12, pointerEvents: "all",
              }}>✕</button>
            </div>
          </div>
        )}

        {/* BONECO */}
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
            alt=""
            title=""
            draggable={false}
            style={{
              width: 220, height: 280,
              objectFit: "contain",
              userSelect: "none",
              pointerEvents: "none",
              background: "transparent",
              filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.25))",
            }}
          />
        </div>
      </div>
    </>
  );
}
