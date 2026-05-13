"use client";

import { useEffect, useState } from "react";

/**
 * Exibe o nome do usuario logado (canto superior direito do layout global).
 * Faz fetch em /api/auth/me; se nao houver sessao, renderiza null.
 *
 * Texto pequeno e cor slate-400, conforme spec (item 5).
 */
export default function NomeUsuario() {
  const [nome, setNome] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (ativo && json.ok && json.data?.nome) setNome(json.data.nome);
      } catch {
        // silencia: sem nome, componente nao renderiza
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  if (!nome) return null;
  return <span className="text-xs text-slate-400">{nome}</span>;
}
