"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import manifestoVoz from "../../public/urbi/voz/manifesto.json";

export type MotorSTT = "webspeech" | "whisper" | null;

export type WebSpeechState = {
  ouvindo: boolean;
  falando: boolean;
  mudo: boolean;
  suportaSTT: boolean;
  suportaTTS: boolean;
  ultimoErroStt: string | null;
  // Qual motor de escuta este navegador vai usar. "webspeech" é o
  // reconhecimento nativo (Chrome/Edge, de graça e instantâneo); "whisper" é
  // gravar aqui e transcrever no servidor — mais lento e pago, mas é o que
  // faz o URBI ouvir em navegador que não tem SpeechRecognition.
  motorSTT: MotorSTT;
  // Só no motor "whisper": áudio já foi gravado e está indo/voltando do
  // servidor. No "webspeech" nunca fica true (a transcrição é local).
  transcrevendo: boolean;
};

// Falas pré-gravadas (public/urbi/voz/) indexadas pelo próprio texto.
//
// Por que a chave é o texto e não um id: o gerador (scripts/gerar_vozes_urbi.mts)
// sintetiza cada mp3 a partir do campo `resposta` de urbi-intencoes.json. Texto e
// áudio nascem do mesmo lugar, então o texto JÁ é o identificador — casar por ele
// evita passar id em cada ponto de chamada e mantém `falar(texto)` com a mesma
// assinatura de sempre. Se alguém editar uma resposta sem regravar, a busca não
// acha e cai na voz do navegador: degrada, não quebra.
const FALAS = new Map<string, string>(
  Object.values((manifestoVoz as any).falas ?? {}).map((f: any) => [chaveDe(f.texto), f.arquivo as string])
);

function chaveDe(texto: string) {
  return texto.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function useWebSpeech(opcoes?: {
  idioma?: string;
  aoTranscrever?: (texto: string) => void;
}) {
  const idioma = opcoes?.idioma ?? "pt-BR";
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [ultimoErroStt, setUltimoErroStt] = useState<string | null>(null);
  const [suportaSTT, setSuportaSTT] = useState(false);
  const [motorSTT, setMotorSTT] = useState<MotorSTT>(null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const suportaTTS = true;
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const aoTranscreverRef = useRef(opcoes?.aoTranscrever);

  useEffect(() => { aoTranscreverRef.current = opcoes?.aoTranscrever; }, [opcoes?.aoTranscrever]);

  // Decide o motor uma vez, na montagem. SpeechRecognition ganha quando
  // existe: é local, instantâneo e não consome crédito. Onde ele não existe
  // (Firefox, Safari, Chrome com a API desativada por política), cai para
  // gravar e transcrever no servidor — que é o que faz o URBI ouvir em
  // qualquer computador, e não só nos com Chrome.
  useEffect(() => {
    const w = window as any;
    const temWebSpeech = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    const temGravacao =
      typeof MediaRecorder !== "undefined" &&
      !!navigator?.mediaDevices?.getUserMedia;
    const motor: MotorSTT = temWebSpeech ? "webspeech" : temGravacao ? "whisper" : null;
    setMotorSTT(motor);
    setSuportaSTT(motor !== null);
  }, []);

  function soltarMicrofone() {
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
      streamRef.current = null;
    }
  }

  const pararEscuta = useCallback(() => {
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} recRef.current = null; }
    // No motor whisper, parar é o gatilho da transcrição: o onstop do
    // gravador é quem monta o blob e chama o servidor.
    if (gravadorRef.current) {
      try {
        if (gravadorRef.current.state !== "inactive") gravadorRef.current.stop();
      } catch (_) { soltarMicrofone(); }
      gravadorRef.current = null;
    }
    setOuvindo(false);
  }, []);

  const iniciarEscutaWebSpeech = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setUltimoErroStt("Navegador não suporta STT."); return; }
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} }

    const rec = new Ctor();
    rec.lang = idioma;
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      const texto = (e.results[e.results.length - 1]?.[0]?.transcript ?? "").trim();
      if (texto) aoTranscreverRef.current?.(texto);
    };
    rec.onerror = (e: any) => { setUltimoErroStt(e?.error ?? "erro"); };
    rec.onend = () => { setOuvindo(false); recRef.current = null; };

    try { rec.start(); recRef.current = rec; setOuvindo(true); setUltimoErroStt(null); }
    catch (e: any) { setUltimoErroStt(e?.message ?? "Erro ao iniciar mic."); setOuvindo(false); }
  }, [idioma]);

  // Motor whisper: grava no navegador, manda o blob para /api/urbi/stt e usa
  // o texto que volta. O áudio existe só em memória e no corpo dessa
  // requisição — não é salvo em lugar nenhum, nem no cliente nem no servidor.
  const iniciarEscutaGravacao = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      pedacosRef.current = [];

      const tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const tipo = tipos.find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      });

      const gravador = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      gravador.ondataavailable = (e) => { if (e.data?.size > 0) pedacosRef.current.push(e.data); };

      gravador.onstop = async () => {
        soltarMicrofone();
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || "audio/webm" });
        pedacosRef.current = [];
        // Clique sem fala nenhuma: não gasta chamada de servidor à toa.
        if (blob.size < 1200) return;

        setTranscrevendo(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "comando.webm");
          const res = await fetch("/api/urbi/stt", { method: "POST", body: form });
          const json = await res.json().catch(() => null);
          if (res.ok && json?.ok && json.texto?.trim()) {
            setUltimoErroStt(null);
            aoTranscreverRef.current?.(json.texto.trim());
          } else {
            setUltimoErroStt(json?.erro ? "Não entendi o áudio." : "Falha ao transcrever.");
          }
        } catch {
          setUltimoErroStt("Sem conexão para transcrever.");
        } finally {
          setTranscrevendo(false);
        }
      };

      gravador.start();
      gravadorRef.current = gravador;
      setOuvindo(true);
      setUltimoErroStt(null);
    } catch (e: any) {
      soltarMicrofone();
      setOuvindo(false);
      setUltimoErroStt(
        e?.name === "NotAllowedError"
          ? "Permissão de microfone negada."
          : e?.message ?? "Erro ao acessar o microfone.",
      );
    }
  }, []);

  const iniciarEscuta = useCallback(() => {
    if (motorSTT === "whisper") { void iniciarEscutaGravacao(); return; }
    iniciarEscutaWebSpeech();
  }, [motorSTT, iniciarEscutaGravacao, iniciarEscutaWebSpeech]);

  const alternarEscuta = useCallback(() => {
    if (ouvindo) pararEscuta(); else iniciarEscuta();
  }, [ouvindo, iniciarEscuta, pararEscuta]);

  const pararFala = useCallback(() => {
    if (audioRef.current) {
      const a = audioRef.current;
      audioRef.current = null;
      try { a.pause(); a.currentTime = 0; } catch (_) {}
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    setFalando(false);
  }, []);

  // Voz sintetizada pelo navegador — o caminho de sempre, agora usado só
  // quando não existe mp3 pré-gravado para o texto (ou ele não pôde tocar).
  const falarNavegador = useCallback((texto: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "pt-BR";
      u.rate = 1.0;
      u.onstart = () => setFalando(true);
      u.onend = () => setFalando(false);
      u.onerror = () => setFalando(false);
      window.speechSynthesis.speak(u);
    } catch { setFalando(false); }
  }, []);

  const falar = useCallback((texto: string) => {
    if (mudo || !texto?.trim()) return;
    if (typeof window === "undefined") return;

    const arquivo = FALAS.get(chaveDe(texto));
    if (!arquivo) { falarNavegador(texto); return; }

    pararFala();
    try {
      const a = new Audio(`/urbi/voz/${arquivo}`);
      // Só cai para a voz do navegador se ESTE áudio ainda for o corrente:
      // se pararFala() ou uma fala nova já o trocaram, falhar em silêncio é o
      // certo — senão um áudio cancelado voltaria pela voz sintetizada.
      const recuar = () => {
        if (audioRef.current !== a) return;
        audioRef.current = null;
        falarNavegador(texto);
      };
      a.onended = () => { if (audioRef.current === a) { audioRef.current = null; setFalando(false); } };
      a.onerror = recuar;
      audioRef.current = a;
      setFalando(true);
      // play() rejeita quando o navegador exige gesto do usuário; nesse caso a
      // voz sintetizada costuma passar, então vale tentar.
      void a.play().catch(recuar);
    } catch {
      audioRef.current = null;
      falarNavegador(texto);
    }
  }, [mudo, pararFala, falarNavegador]);

  const alternarMudo = useCallback(() => {
    setMudo(prev => { if (!prev) pararFala(); return !prev; });
  }, [pararFala]);

  useEffect(() => {
    // Desmontou com o microfone aberto: solta o dispositivo, senão o
    // indicador de gravação do navegador fica aceso depois de fechar o URBI.
    return () => { pararEscuta(); pararFala(); soltarMicrofone(); };
  }, []);

  const estado: WebSpeechState = {
    ouvindo, falando, mudo, suportaSTT, suportaTTS, ultimoErroStt, motorSTT, transcrevendo,
  };
  return { estado, iniciarEscuta, pararEscuta, alternarEscuta, falar, pararFala, alternarMudo, setMudo };
}
