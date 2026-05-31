"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type WebSpeechState = {
  ouvindo: boolean;
  falando: boolean;
  mudo: boolean;
  suportaSTT: boolean;
  suportaTTS: boolean;
  ultimoErroStt: string | null;
};

export function useWebSpeech(opcoes?: {
  idioma?: string;
  aoTranscrever?: (texto: string) => void;
}) {
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [ultimoErroStt, setUltimoErroStt] = useState<string | null>(null);
  const [suportaSTT, setSuportaSTT] = useState(false);
  const suportaTTS = true;

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aoTranscreverRef = useRef(opcoes?.aoTranscrever);

  useEffect(() => { aoTranscreverRef.current = opcoes?.aoTranscrever; }, [opcoes?.aoTranscrever]);

  useEffect(() => {
    setSuportaSTT(typeof navigator !== "undefined" && !!navigator.mediaDevices);
  }, []);

  const iniciarEscuta = useCallback(async () => {
    if (ouvindo) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) { setOuvindo(false); return; }
        const form = new FormData();
        form.append("audio", blob, "audio.webm");
        try {
          const res = await fetch("/api/urbi/stt", { method: "POST", body: form });
          const json = await res.json();
          if (json.texto) aoTranscreverRef.current?.(json.texto);
          else setUltimoErroStt("Não entendi. Tente novamente.");
        } catch {
          setUltimoErroStt("Erro ao transcrever.");
        }
        setOuvindo(false);
      };
      rec.start(100);
      mediaRecorderRef.current = rec;
      setOuvindo(true);
      setUltimoErroStt(null);
    } catch (e: any) {
      setUltimoErroStt(e?.message ?? "Erro ao acessar microfone.");
      setOuvindo(false);
    }
  }, [ouvindo]);

  const pararEscuta = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const alternarEscuta = useCallback(() => {
    if (ouvindo) pararEscuta();
    else iniciarEscuta();
  }, [ouvindo, iniciarEscuta, pararEscuta]);

  const falar = useCallback(async (texto: string) => {
    if (mudo || !texto?.trim()) return;
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.pause();
      audioRef.current.src = "";
      setFalando(true);
      const res = await fetch("/api/urbi/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!res.ok) { setFalando(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioRef.current.src = url;
      audioRef.current.onended = () => { setFalando(false); URL.revokeObjectURL(url); };
      audioRef.current.onerror = () => { setFalando(false); };
      await audioRef.current.play();
    } catch {
      setFalando(false);
    }
  }, [mudo]);

  const pararFala = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setFalando(false);
  }, []);

  const alternarMudo = useCallback(() => {
    setMudo(prev => {
      if (!prev) pararFala();
      return !prev;
    });
  }, [pararFala]);

  useEffect(() => {
    return () => {
      pararFala();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      }
    };
  }, []);

  const estado: WebSpeechState = { ouvindo, falando, mudo, suportaSTT, suportaTTS, ultimoErroStt };

  return { estado, iniciarEscuta, pararEscuta, alternarEscuta, falar, pararFala, alternarMudo, setMudo };
}
