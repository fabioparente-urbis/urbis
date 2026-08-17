"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 30 min sem clicar/digitar/rolar a tela → desloga e manda pra /login.
//
// Usa localStorage em vez de só contar eventos locais: assim, ficar ativo
// numa aba conta como atividade pras outras abas da mesma sessão. Sem
// isso, uma aba parada em segundo plano (ex.: um despacho aberto em nova
// aba) deslogaria sozinha mesmo com o analista mexendo em outra — e como
// o logout apaga o cookie (compartilhado entre abas), derrubaria a sessão
// inteira.
const LIMITE_MS = 30 * 60 * 1000;
const CHAVE_LS = "urbis_ultima_atividade";
const INTERVALO_CHECAGEM_MS = 15_000;

export function useAutoLogout() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Telas públicas não têm sessão pra derrubar.
    if (pathname?.startsWith("/login") || pathname?.startsWith("/redefinir-senha")) return;

    function registrarAtividade() {
      try { localStorage.setItem(CHAVE_LS, String(Date.now())); } catch { /* storage indisponível — segue sem o multi-aba */ }
    }

    async function deslogar() {
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* cookie expira sozinho de qualquer forma */ }
      router.replace("/login");
    }

    function checar() {
      const ultima = Number(localStorage.getItem(CHAVE_LS) ?? Date.now());
      if (Date.now() - ultima >= LIMITE_MS) deslogar();
    }

    registrarAtividade();
    const eventos = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    eventos.forEach((e) => window.addEventListener(e, registrarAtividade, { passive: true }));
    const intervalo = setInterval(checar, INTERVALO_CHECAGEM_MS);

    return () => {
      clearInterval(intervalo);
      eventos.forEach((e) => window.removeEventListener(e, registrarAtividade));
    };
  }, [pathname, router]);
}
