"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ===========================================================================
// useWebSpeech — Hook utilitário para a Web Speech API (STT + TTS)
// ===========================================================================
// Encapsula SpeechRecognition (reconhecimento de fala) e SpeechSynthesis
// (síntese de voz) com fallback silencioso quando o navegador não suporta.
// Toda a UI (botão microfone, switch mudo, etc.) é responsabilidade do
// componente que consome este hook.
// ===========================================================================

type MinimalRecognitionEvent = {
  results: { 0: { transcript: string }; isFinal: boolean }[];
};

type MinimalRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: MinimalRecognitionEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => MinimalRecognition;
  webkitSpeechRecognition?: new () => MinimalRecognition;
};

function getRecognitionCtor():
  | (new () => MinimalRecognition)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithSpeech;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type WebSpeechState = {
  ouvindo: boolean;
  falando: boolean;
  mudo: boolean;
  suportaSTT: boolean;
  suportaTTS: boolean;
  ultimoErroStt: string | null;
};

export function useWebSpeech(opcoes?: {
  idioma?: string; // default: pt-BR
  aoTranscrever?: (texto: string) => void;
}) {
  const idioma = opcoes?.idioma ?? "pt-BR";

  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [ultimoErroStt, setUltimoErroStt] = useState<string | null>(null);

  const recognitionRef = useRef<MinimalRecognition | null>(null);
  const transcricaoAtualRef = useRef<string>("");
  const aoTranscreverRef = useRef(opcoes?.aoTranscrever);
  // Mantém o callback sempre atualizado, sem ler/escrever ref durante render.
  useEffect(() => {
    aoTranscreverRef.current = opcoes?.aoTranscrever;
  }, [opcoes?.aoTranscrever]);

  const suportaSTT = typeof window !== "undefined" && !!getRecognitionCtor();
  const suportaTTS =
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";

  // ----- STT --------------------------------------------------------------
  const iniciarEscuta = useCallback(() => {
    if (!suportaSTT) {
      setUltimoErroStt("Navegador não suporta reconhecimento de voz.");
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = idioma;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    transcricaoAtualRef.current = "";

    rec.onresult = (ev) => {
      const results = ev.results;
      const final = results[results.length - 1];
      if (final && final.isFinal) {
        const texto = (final[0]?.transcript ?? "").trim();
        if (texto) {
          transcricaoAtualRef.current = texto;
          aoTranscreverRef.current?.(texto);
        }
      }
    };
    rec.onerror = (ev) => {
      setUltimoErroStt(ev?.error ?? "erro_desconhecido");
    };
    rec.onend = () => {
      setOuvindo(false);
      recognitionRef.current = null;
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setOuvindo(true);
      setUltimoErroStt(null);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível iniciar o microfone.";
      setUltimoErroStt(msg);
      setOuvindo(false);
    }
  }, [idioma, suportaSTT]);

  const pararEscuta = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
    }
    setOuvindo(false);
  }, []);

  const alternarEscuta = useCallback(() => {
    if (ouvindo) pararEscuta();
    else iniciarEscuta();
  }, [ouvindo, iniciarEscuta, pararEscuta]);

  // ----- TTS --------------------------------------------------------------
  const falar = useCallback(
    (texto: string) => {
      if (!suportaTTS) return;
      if (mudo) return;
      if (!texto || !texto.trim()) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = idioma;
        u.rate = 1.0;
        u.pitch = 1.0;
        u.onstart = () => setFalando(true);
        u.onend = () => setFalando(false);
        u.onerror = () => setFalando(false);
        window.speechSynthesis.speak(u);
      } catch {
        setFalando(false);
      }
    },
    [idioma, mudo, suportaTTS],
  );

  const pararFala = useCallback(() => {
    if (!suportaTTS) return;
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    setFalando(false);
  }, [suportaTTS]);

  const alternarMudo = useCallback(() => {
    setMudo((prev) => {
      const novo = !prev;
      if (novo && suportaTTS) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
        setFalando(false);
      }
      return novo;
    });
  }, [suportaTTS]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
      }
      if (suportaTTS) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      }
    };
  }, [suportaTTS]);

  const estado: WebSpeechState = {
    ouvindo,
    falando,
    mudo,
    suportaSTT,
    suportaTTS,
    ultimoErroStt,
  };

  return {
    estado,
    iniciarEscuta,
    pararEscuta,
    alternarEscuta,
    falar,
    pararFala,
    alternarMudo,
    setMudo,
  };
}
