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




function selectPose(tipo: "pensando"|"positivo"|"negativo"|"atencao"|"critico"|"idle"): string {
  const map: Record<string, string[]> = {
    pensando: ["analisando","planejando"],
    positivo: ["sucesso","tudo-ok"],
    negativo: ["oops","algo-errado"],
    atencao:  ["atencao","oh-nao"],
    critico:  ["bravo","dados-errados"],
    idle:     ["sucesso","tudo-ok"],
  };
  const ids = map[tipo];
  return ids[Math.floor(Math.random() * ids.length)];
}

function detectTipo(texto: string): "positivo"|"negativo"|"atencao"|"critico" {
  const t = texto.toLowerCase();
  if (t.includes("erro crítico")||t.includes("falha crítica")||t.includes("inválido")) return "critico";
  if (t.includes("atenção")||t.includes("pendência")||t.includes("verificar")) return "atencao";
  if (t.includes("erro")||t.includes("não encontrado")||t.includes("não foi possível")) return "negativo";
  return "positivo";
}

type Msg = { role: "user"|"urbi"; texto: string };
type GeminiMsg = { role: string; parts: { text: string }[] };
type Props = { usuario: { nome: string; perfil: string; id?: string } };

export default function UrbiChat({ usuario }: Props) {
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<"fora"|"entrando"|"idle"|"saindo">("fora");
  const [poseId, setPoseId] = useState("sucesso");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [history, setHistory] = useState<GeminiMsg[]>([]);
  const [balaoVisivel, setBalaoVisivel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function abrir() {
    setAberto(true);
    setFase("entrando");
    setPoseId("planejando");
    setTimeout(() => {
      setPoseId("tudo-ok");
      setFase("idle");
      setBalaoVisivel(true);
      const saudacao = `Fala, ${usuario.nome.split(" ")[0]}! Sou o URBI. Como posso ajudar?`;
      setMsgs([{ role: "urbi", texto: saudacao }]);
    }, 900);
  }

  function fechar() {
    setBalaoVisivel(false);
    setFase("saindo");
    setTimeout(() => {
      setAberto(false);
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
    setPoseId(selectPose("pensando"));
    setCarregando(true);

    const novoHistory: GeminiMsg[] = [...history, { role: "user", parts: [{ text: texto }] }];

    try {
      const res = await fetch("/api/urbi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: texto, history, usuario }),
      });
      const json = await res.json();
      if (json.ok) {
        const tipo = detectTipo(json.resposta);
        setPoseId(selectPose(tipo));
        setMsgs(m => [...m, { role: "urbi", texto: json.resposta }]);
        setHistory([...novoHistory, { role: "model", parts: [{ text: json.resposta }] }]);
        await fetch("/api/urbi/historico", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario_id: usuario.id ?? null, usuario_nome: usuario.nome, mensagem_usuario: texto, resposta_urbi: json.resposta, linha: "geral", pose_usada: poseId }),
        });
        if (json.sair) setTimeout(() => fechar(), 1800);
      } else {
        setPoseId(selectPose("negativo"));
        setMsgs(m => [...m, { role: "urbi", texto: "Tive um problema técnico. Tenta de novo." }]);
      }
    } catch {
      setPoseId(selectPose("negativo"));
      setMsgs(m => [...m, { role: "urbi", texto: "Sem conexão. Verifica a rede." }]);
    }
    setCarregando(false);
  }

  const nomeFirst = usuario.nome.split(" ")[0];

  return (
    <>
      <style>{`
        @keyframes urbiEntrada {
          0%   { transform: translateX(160%) scaleX(0.9); }
          70%  { transform: translateX(-15px) scaleX(1.05); }
          85%  { transform: translateX(5px) scaleX(0.98); }
          100% { transform: translateX(0) scaleX(1); }
        }
        @keyframes urbiSaida {
          0%   { transform: translateX(0) scaleX(1); opacity: 1; }
          100% { transform: translateX(160%) scaleX(0.9); opacity: 0; }
        }
        @keyframes urbiIdle {
          0%, 100% { transform: translateY(0) scaleY(1); }
          50%       { transform: translateY(-5px) scaleY(1.02); }
        }
        @keyframes balaoEntrada {
          0%   { opacity: 0; transform: scale(0.8) translateX(20px); }
          100% { opacity: 1; transform: scale(1) translateX(0); }
        }
        @keyframes botaoPulse {
          0%, 100% { box-shadow: 0 4px 20px #00000044, 0 0 0 0 #3b82f633; }
          50%       { box-shadow: 0 4px 20px #00000044, 0 0 0 8px #3b82f611; }
        }
        .urbi-entrando { animation: urbiEntrada 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .urbi-idle     { animation: urbiIdle 3s ease-in-out infinite; }
        .urbi-saindo   { animation: urbiSaida 0.5s ease-in forwards; }
        .urbi-balao    { animation: balaoEntrada 0.3s ease-out forwards; }
        .urbi-botao    { animation: botaoPulse 2.5s ease-in-out infinite; }
      `}</style>

      {/* BOTÃO CHAMAR URBI */}
      {!aberto && (
        <button onClick={abrir} title="Chamar URBI" className="urbi-botao" style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 900,
          width: 76, height: 76, borderRadius: "50%",
          border: "none", cursor: "pointer", padding: 0,
          overflow: "hidden", background: "transparent",
        }}>
          <img src="/urbi/urbi-botao.jpg" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
        </button>
      )}

      {/* PERSONAGEM + BALÃO */}
      {aberto && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 950,
          display: "flex", alignItems: "flex-end", gap: 12,
          pointerEvents: "none",
        }}>

          {/* BALÃO DE FALA */}
          {balaoVisivel && (
            <div className="urbi-balao" style={{
              pointerEvents: "all",
              position: "relative",
              background: "#ffffff",
              borderRadius: 16,
              padding: "14px 16px",
              width: 320,
              maxHeight: 420,
              boxShadow: "0 8px 32px #00000033",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}>
              {/* Triângulo apontando pro URBI */}
              <div style={{
                position: "absolute", right: -10, bottom: 32,
                width: 0, height: 0,
                borderTop: "10px solid transparent",
                borderBottom: "10px solid transparent",
                borderLeft: "10px solid #ffffff",
              }} />

              {/* Mensagens */}
              <div style={{
                flex: 1, overflowY: "auto", maxHeight: 280,
                display: "flex", flexDirection: "column", gap: 8,
                paddingBottom: 8,
              }}>
                {msgs.map((msg, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}>
                    <div style={{
                      maxWidth: "88%",
                      background: msg.role === "user" ? "#1d4ed8" : "#f1f5f9",
                      color: msg.role === "user" ? "#ffffff" : "#1e293b",
                      borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      padding: "7px 11px",
                      fontSize: 12,
                      lineHeight: 1.6,
                      fontFamily: "system-ui, sans-serif",
                      whiteSpace: "pre-wrap",
                    }}>
                      {msg.texto}
                    </div>
                  </div>
                ))}
                {carregando && (
                  <div style={{
                    background: "#f1f5f9", borderRadius: "12px 12px 12px 2px",
                    padding: "7px 14px", fontSize: 16, color: "#94a3b8",
                    width: "fit-content",
                  }}>···</div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
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
                  background: carregando ? "#94a3b8" : "#1d4ed8",
                  border: "none", borderRadius: 8, color: "#fff",
                  padding: "7px 12px", cursor: carregando ? "not-allowed" : "pointer",
                  fontSize: 13, transition: "background 0.2s",
                }}>→</button>
                <button onClick={fechar} style={{
                  background: "transparent", border: "1px solid #e2e8f0",
                  borderRadius: 8, color: "#94a3b8",
                  padding: "7px 10px", cursor: "pointer", fontSize: 12,
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
            onClick={() => !balaoVisivel && setBalaoVisivel(true)}
          >
            <img
              src={POSE_MAP[poseId] ?? POSE_MAP["sucesso"]}
              alt="URBI"
              style={{ width: 160, height: 200, objectFit: "contain", userSelect: "none", filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.25))" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
