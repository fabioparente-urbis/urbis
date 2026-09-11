"use client";

/**
 * app/fatiador-sei/page.tsx — Fase 6 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md.
 *
 * Casca da tela: só o gate de acesso (mesmo padrão de /admin/mhd — irrestrito, redireciona pra
 * Home se não autorizado) e o layout de página. Todo o núcleo mora em
 * `components/fatiadorSei/TelaFatiamento.tsx`.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { isPerfilIrrestrito } from "@/lib/perfis";

// react-pdf usa APIs de navegador (worker, DOMMatrix) — carregado sob demanda, nunca no servidor,
// mesmo padrão de app/processo/ProcessoClient.tsx pros dois Organizadores.
const TelaFatiamento = dynamic(() => import("@/components/fatiadorSei/TelaFatiamento"), { ssr: false });

export default function PaginaFatiadorSei() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json().catch(() => null);
        const perfis = json?.data?.perfis?.length ? json.data.perfis : json?.data?.perfil;
        if (!json?.ok || !isPerfilIrrestrito(perfis)) { router.push("/"); return; }
        setAutorizado(true);
      } catch { router.push("/"); }
    })();
  }, [router]);

  if (!autorizado) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Mesmo padrão de cabeçalho das outras telas fora do processo (ex.: app/mrp/page.tsx) —
          a tela nasceu sem isso, ficava sem saída. */}
      <header className="bg-[var(--bg-primary)] text-[var(--primary-text)] px-8 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")}
          className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">🏠 Home</button>
        <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
          className="bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] font-bold px-3 py-1.5 rounded text-sm transition-colors border border-[var(--error)]">🚪 Sair</button>
      </header>
      <TelaFatiamento />
    </div>
  );
}
