"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
const INTERVAL = 90_000;
export function useSessionHeartbeat() {
  const sessaoId = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    async function ping() {
      try {
        const res = await fetch("/api/sessao/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessao_id: sessaoId.current, pagina: pathname }),
        });
        const json = await res.json();
        if (json.sessao_id) sessaoId.current = json.sessao_id;
      } catch { /* silencioso */ }
    }
    ping();
    timer = setInterval(ping, INTERVAL);
    return () => clearInterval(timer);
  }, [pathname]);
}
