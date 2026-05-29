"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL = 90_000;   // 90 s entre pings
const INATIVIDADE_LIMITE  = 5 * 60 * 1000; // 5 min em ms

export function useSessionHeartbeat() {
  const sessaoId        = useRef<string | null>(null);
  const running         = useRef(false);
  const pausadoEm       = useRef<number | null>(null);   // timestamp ms do início da pausa
  const pausado         = useRef(false);
  const pathname        = usePathname();
  const pathnameRef     = useRef(pathname);
  pathnameRef.current   = pathname;

  useEffect(() => {
    // ─── Abre nova sessão, já descontando dead-time se houver ──────────────
    async function abrirSessao(deadTimeSegundos = 0) {
      const res = await fetch("/api/sessao/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagina: pathnameRef.current,
          tempo_pausado_inicial: deadTimeSegundos,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json().catch(() => ({}));
      if (json.sessao_id) sessaoId.current = json.sessao_id;
    }

    // ─── Ping principal ────────────────────────────────────────────────────
    async function ping() {
      if (running.current || pausado.current) return;
      running.current = true;
      try {
        if (!sessaoId.current) {
          await abrirSessao();
          return;
        }

        const res = await fetch("/api/sessao/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao_id: sessaoId.current, pagina: pathnameRef.current }),
          signal: AbortSignal.timeout(8000),
          keepalive: true,
        });
        const json = await res.json().catch(() => ({}));

        if (json.status === "encerrada" || json.ativa === false) {
          // pg_cron encerrou a sessão — calcula dead time e reabre
          const agora = Date.now();
          let deadTimeSeg = 0;
          if (json.encerrada_em) {
            const encerradaMs = new Date(json.encerrada_em).getTime();
            if (!isNaN(encerradaMs) && agora > encerradaMs) {
              deadTimeSeg = Math.round((agora - encerradaMs) / 1000);
            }
          }
          sessaoId.current = null;
          await abrirSessao(deadTimeSeg);
        }
        // status "ok" — nada a fazer
      } catch {
        // rede instável — tenta de novo no próximo intervalo
      } finally {
        running.current = false;
      }
    }

    // ─── Detecta retorno de inatividade ───────────────────────────────────
    async function aoRetornar() {
      if (!pausado.current || pausadoEm.current === null) return;

      const segundosPausados = Math.round((Date.now() - pausadoEm.current) / 1000);
      pausado.current  = false;
      pausadoEm.current = null;

      // Subtrai o tempo de inatividade da sessão corrente
      if (sessaoId.current && segundosPausados > 0) {
        fetch("/api/sessao/pausar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao_id: sessaoId.current, segundos_pausados: segundosPausados }),
          keepalive: true,
        }).catch(() => {});
      }

      // Retoma heartbeat imediatamente
      ping();
    }

    // ─── Timer de inatividade ─────────────────────────────────────────────
    let inatividade: ReturnType<typeof setTimeout> | null = null;

    function resetarInatividade() {
      if (pausado.current) {
        // Analista voltou — registra pausa e retoma
        aoRetornar();
      }

      if (inatividade) clearTimeout(inatividade);
      inatividade = setTimeout(() => {
        // 5 min sem atividade — pausa heartbeat
        pausado.current  = true;
        pausadoEm.current = Date.now();
      }, INATIVIDADE_LIMITE);
    }

    const eventos = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    eventos.forEach((e) => window.addEventListener(e, resetarInatividade, { passive: true }));

    // ─── Inicia ───────────────────────────────────────────────────────────
    resetarInatividade();
    ping();
    const timer = setInterval(ping, HEARTBEAT_INTERVAL);

    return () => {
      clearInterval(timer);
      if (inatividade) clearTimeout(inatividade);
      eventos.forEach((e) => window.removeEventListener(e, resetarInatividade));
    };
  }, []);  // sem deps — pathnameRef é atualizado via ref

  // Atualiza pagina no próximo ping via ref (sem recriar o interval a cada navegação)
}
