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
  const idioma = opcoes?.idioma ?? "pt-BR";
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [ultimoErroStt, setUltimoErroStt] = useState<string | null>(null);
  const [suportaSTT, setSuportaSTT] = useState(false);
  const suportaTTS = true;
  const recRef = useRef<any>(null);
  const aoTranscreverRef = useRef(opcoes?.aoTranscrever);

  useEffect(() => { aoTranscreverRef.current = opcoes?.aoTranscrever; }, [opcoes?.aoTranscrever]);

  useEffect(() => {
    const w = window as any;
    setSuportaSTT(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  const pararEscuta = useCallback(() => {
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} recRef.current = null; }
    setOuvindo(false);
  }, []);

  const iniciarEscuta = useCallback(() => {
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

  const alternarEscuta = useCallback(() => {
    if (ouvindo) pararEscuta(); else iniciarEscuta();
  }, [ouvindo, iniciarEscuta, pararEscuta]);

  const falar = useCallback((texto: string) => {
    if (mudo || !texto?.trim()) return;
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
  }, [mudo]);

  const pararFala = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    setFalando(false);
  }, []);

  const alternarMudo = useCallback(() => {
    setMudo(prev => { if (!prev) pararFala(); return !prev; });
  }, [pararFala]);

  useEffect(() => {
    return () => { pararEscuta(); pararFala(); };
  }, []);

  const estado: WebSpeechState = { ouvindo, falando, mudo, suportaSTT, suportaTTS, ultimoErroStt };
  return { estado, iniciarEscuta, pararEscuta, alternarEscuta, falar, pararFala, alternarMudo, setMudo };
}
