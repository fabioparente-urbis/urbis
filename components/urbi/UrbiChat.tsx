"use client";
import { useEffect, useRef, useState } from "react";

type Pose = {
  id: string;
  col: number;
  row: number;
  label: string;
};

const POSES: Pose[] = [
  { id: "sucesso",       col: 0, row: 0, label: "SUCESSO!" },
  { id: "tudo-ok",       col: 1, row: 0, label: "TUDO OK!" },
  { id: "oops",          col: 2, row: 0, label: "OOPS..." },
  { id: "oh-nao",        col: 3, row: 0, label: "OH NÃO..." },
  { id: "atencao",       col: 4, row: 0, label: "ATENÇÃO!" },
  { id: "algo-errado",   col: 0, row: 1, label: "ALGO ERRADO!" },
  { id: "analisando",    col: 1, row: 1, label: "ANALISANDO..." },
  { id: "planejando",    col: 2, row: 1, label: "PLANEJANDO..." },
  { id: "dados-errados", col: 3, row: 1, label: "DADOS ERRADOS!" },
  { id: "bravo",         col: 4, row: 1, label: "O QUÊ?!" },
];

function getPoseStyle(pose: Pose, size: number) {
  return {
    width: size,
    height: size,
    backgroundImage: "url('/urbi/urbi-poses.jpg')",
    backgroundSize: "500% 200%",
    backgroundPosition: `${pose.col * 25}% ${pose.row * 100}%`,
    backgroundRepeat: "no-repeat",
    borderRadius: 8,
    flexShrink: 0,
  };
}

function selectPose(tipo: "pensando" | "positivo" | "negativo" | "atencao" | "critico" | "idle"): Pose {
  const map: Record<string, string[]> = {
    pensando:  ["analisando", "planejando"],
    positivo:  ["sucesso", "tudo-ok"],
    negativo:  ["oops", "algo-errado"],
    atencao:   ["atencao", "oh-nao"],
    critico:   ["bravo", "dados-errados"],
    idle:      ["sucesso", "tudo-ok"],
  };
  const ids = map[tipo];
  const id = ids[Math.floor(Math.random() * ids.length)];
  return POSES.find(p => p.id === id) ?? POSES[0];
}

function detectTipo(texto: string): "positivo" | "negativo" | "atencao" | "critico" {
  const t = texto.toLowerCase();
  if (t.includes("erro crítico") || t.includes("falha crítica") || t.includes("inválido")) return "critico";
  if (t.includes("atenção") || t.includes("pendência") || t.includes("verificar") || t.includes("cuidado")) return "atencao";
  if (t.includes("erro") || t.includes("não encontrado") || t.includes("não foi possível")) return "negativo";
  return "positivo";
}

type Msg = { role: "user" | "urbi"; texto: string };
type GeminiMsg = { role: string; parts: { text: string }[] };

type Props = {
  usuario: { nome: string; perfil: string; id?: string };
};

export default function UrbiChat({ usuario }: Props) {
  const [aberto, setAberto] = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pose, setPose] = useState<Pose>(POSES[0]);
  const [carregando, setCarregando] = useState(false);
  const [history, setHistory] = useState<GeminiMsg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aberto && msgs.length === 0) {
      const saudacao: Msg = { role: "urbi", texto: `Fala, ${usuario.nome.split(" ")[0]}! Sou o URBI. Como posso ajudar?` };
      setMsgs([saudacao]);
      setPose(selectPose("idle"));
    }
  }, [aberto]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  function abrir() {
    setAberto(true);
    setTimeout(() => setVisivel(true), 10);
  }

  function fechar() {
    setVisivel(false);
    setTimeout(() => { setAberto(false); setMsgs([]); setHistory([]); }, 400);
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || carregando) return;
    setInput("");

    const novaMsgUser: Msg = { role: "user", texto };
    setMsgs(m => [...m, novaMsgUser]);
    setPose(selectPose("pensando"));
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
        setPose(selectPose(tipo));
        setMsgs(m => [...m, { role: "urbi", texto: json.resposta }]);
        setHistory([...novoHistory, { role: "model", parts: [{ text: json.resposta }] }]);

        await fetch("/api/urbi/historico", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usuario_id: usuario.id ?? null,
            usuario_nome: usuario.nome,
            mensagem_usuario: texto,
            resposta_urbi: json.resposta,
            linha: "geral",
            pose_usada: pose.id,
          }),
        });

        if (json.sair) setTimeout(() => fechar(), 1800);
      } else {
        setPose(selectPose("negativo"));
        setMsgs(m => [...m, { role: "urbi", texto: "Tive um problema técnico. Tenta de novo." }]);
      }
    } catch {
      setPose(selectPose("negativo"));
      setMsgs(m => [...m, { role: "urbi", texto: "Sem conexão. Verifica a rede." }]);
    }

    setCarregando(false);
  }

  return (
    <>
      <style>{`
        @keyframes urbiEntrada {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes urbiSaida {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(110%); opacity: 0; }
        }
        @keyframes urbiBotaoPulse {
          0%, 100% { box-shadow: 0 0 0 0 #3b82f633; }
          50%       { box-shadow: 0 0 0 8px #3b82f611; }
        }
        .urbi-panel {
          animation: urbiEntrada 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .urbi-panel.saindo {
          animation: urbiSaida 0.35s ease-in forwards;
        }
      `}</style>

      {/* Botão CHAMAR URBI */}
      {!aberto && (
        <button
          onClick={abrir}
          title="Chamar URBI"
          style={{
            position: "fixed", bottom: 28, right: 28, zIndex: 900,
            width: 72, height: 72, borderRadius: "50%", border: "none",
            cursor: "pointer", padding: 0, overflow: "hidden",
            animation: "urbiBotaoPulse 2.5s ease-in-out infinite",
            boxShadow: "0 4px 20px #00000055",
          }}
        >
          <img src="/urbi/urbi-botao.jpg" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </button>
      )}

      {/* Painel */}
      {aberto && (
        <div
          className={`urbi-panel${!visivel ? " saindo" : ""}`}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 950,
            width: 360, maxHeight: "75vh",
            background: "#0d0d14",
            border: "1px solid #3b82f633",
            borderRadius: 14,
            display: "flex", flexDirection: "column",
            boxShadow: "0 8px 40px #00000088",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid #ffffff11",
            background: "#0a0a0f",
          }}>
            <div style={getPoseStyle(pose, 48)} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>URBI</div>
              <div style={{ color: "#3b82f6", fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>{pose.label}</div>
            </div>
            <button onClick={fechar} style={{
              background: "transparent", border: "none", color: "#ffffff33",
              fontSize: 18, cursor: "pointer", lineHeight: 1,
            }}>×</button>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%",
                  background: msg.role === "user" ? "#1d4ed822" : "#1a1a2e",
                  border: `1px solid ${msg.role === "user" ? "#3b82f644" : "#ffffff11"}`,
                  borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  padding: "8px 12px",
                  color: msg.role === "user" ? "#93c5fd" : "#e2e8f0",
                  fontSize: 12,
                  lineHeight: 1.6,
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.texto}
                </div>
              </div>
            ))}
            {carregando && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  background: "#1a1a2e", border: "1px solid #ffffff11",
                  borderRadius: "12px 12px 12px 2px", padding: "8px 16px",
                  color: "#ffffff44", fontSize: 12, fontFamily: "monospace",
                }}>...</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "10px 12px",
            borderTop: "1px solid #ffffff11",
            display: "flex", gap: 8,
            background: "#0a0a0f",
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviar()}
              placeholder="Pergunte ao URBI..."
              style={{
                flex: 1, background: "#0d0d14", border: "1px solid #ffffff22",
                borderRadius: 8, color: "#f0f0f0", padding: "8px 12px",
                fontSize: 12, fontFamily: "monospace", outline: "none",
              }}
            />
            <button
              onClick={enviar}
              disabled={carregando || !input.trim()}
              style={{
                background: carregando ? "#1e3a5f" : "#1d4ed8",
                border: "none", borderRadius: 8, color: "#fff",
                padding: "8px 14px", cursor: carregando ? "not-allowed" : "pointer",
                fontSize: 12, fontFamily: "monospace",
                transition: "background 0.2s",
              }}
            >→</button>
          </div>
        </div>
      )}
    </>
  );
}
