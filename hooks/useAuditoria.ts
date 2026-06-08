"use client";
import { useRef, useEffect, useCallback } from "react";
import { RegistrarParams } from "@/lib/auditoria-tipos";

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

let _sessaoId: string | null = null;
let _analistaNome: string | null = null;
let _analistaId: string | null = null;

function gerarUUID(): string {
  return crypto.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function disparar(params: RegistrarParams & { sessao_id?: string; analista_nome?: string }) {
  try {
    await fetch("/api/auditoria/registrar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sessao_id: _sessaoId, analista_nome: _analistaNome }),
    });
  } catch {
    // fire-and-forget — nunca bloqueia UI
  }
}

export function useAuditoria() {
  const ultimoEventoRef = useRef<number>(Date.now());
  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const iniciadaRef     = useRef(false);

  const registrar = useCallback((params: RegistrarParams) => {
    ultimoEventoRef.current = Date.now();
    // debounce em LIP_CAMPO_ALTERADO já implementado no chamador
    disparar(params);
  }, []);

  useEffect(() => {
    if (iniciadaRef.current) return;
    iniciadaRef.current = true;

    // Carrega nome do analista
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          _analistaNome = j.data?.nome || j.data?.email || "";
          _analistaId   = j.data?.id || "";
        }
      });

    // Inicia sessão
    if (!_sessaoId) {
      _sessaoId = gerarUUID();
      // Cria registro de sessão no banco
      fetch("/api/auditoria/sessao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessao_id: _sessaoId, acao: "INICIAR" }),
      }).catch(() => {});

      disparar({ modulo: "SISTEMA", acao: "SESSAO_INICIADA", origem: "SISTEMA",
        detalhe: { sessao_id: _sessaoId } });
    }

    // Detecta idle a cada 60s
    heartbeatRef.current = setInterval(() => {
      const idle = Date.now() - ultimoEventoRef.current;
      if (idle >= IDLE_THRESHOLD_MS) {
        disparar({ modulo: "SISTEMA", acao: "SESSAO_IDLE", origem: "SISTEMA",
          detalhe: { duracao_idle_s: Math.round(idle / 1000) } });
        ultimoEventoRef.current = Date.now(); // reset para não spammar
      }
      // Atualiza sessão a cada batida
      fetch("/api/auditoria/sessao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessao_id: _sessaoId, acao: "HEARTBEAT" }),
      }).catch(() => {});
    }, 60_000);

    // Encerra sessão ao fechar aba
    const encerrar = () => {
      disparar({ modulo: "SISTEMA", acao: "SESSAO_ENCERRADA", origem: "SISTEMA" });
      navigator.sendBeacon?.("/api/auditoria/sessao",
        JSON.stringify({ sessao_id: _sessaoId, acao: "ENCERRAR" }));
    };
    window.addEventListener("beforeunload", encerrar);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", encerrar);
    };
  }, []);

  return { registrar, sessaoId: _sessaoId };
}
