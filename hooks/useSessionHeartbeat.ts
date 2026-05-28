"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const INTERVAL = 90_000;

export function useSessionHeartbeat() {
  const sessaoId = useRef<string | null>(null);
  const running = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    async function ping() {
      if (running.current) return;
      running.current = true;
      try {
        const res = await fetch("/api/sessao/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao_id: sessaoId.current, pagina: pathname }),
          signal: AbortSignal.timeout(8000),
          keepalive: true,
        });
        const json = await res.json().catch(() => ({}));

        if (json.ativa === false) {
          // Sessão encerrada pelo cron — abre nova
          sessaoId.current = null;
          const res2 = await fetch("/api/sessao/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pagina: pathname }),
            signal: AbortSignal.timeout(8000),
          });
          const json2 = await res2.json().catch(() => ({}));
          if (json2.sessao_id) sessaoId.current = json2.sessao_id;
        } else if (json.sessao_id) {
          sessaoId.current = json.sessao_id;
        }
      } catch {
        // silencioso — rede instável não quebra o analista
      } finally {
        running.current = false;
      }
    }

    ping();
    const timer = setInterval(ping, INTERVAL);
    return () => clearInterval(timer);
  }, [pathname]);
}
