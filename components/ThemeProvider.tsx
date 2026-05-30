"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { temaConfig, Tema, TEMAS } from "@/lib/themes";

const ThemeContext = createContext<{ tema: Tema; setTema: (t: Tema) => void }>({
  tema: "moderno",
  setTema: () => {},
});

export function useTheme() { return useContext(ThemeContext); }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTemaState] = useState<Tema>("institucional");

  useEffect(() => {
    // Carrega tema do servidor
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const t = data?.data?.tema;
        if (t && TEMAS.includes(t)) setTemaState(t as Tema);
        else setTemaState("institucional");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const vars = temaConfig[tema];
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute("data-tema", tema);
  }, [tema]);

  function setTema(t: Tema) {
    setTemaState(t);
    // Salva no banco
    fetch("/api/usuario/tema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tema: t }),
    }).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ tema, setTema }}>
      {children}
    </ThemeContext.Provider>
  );
}
