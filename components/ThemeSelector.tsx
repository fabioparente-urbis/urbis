"use client";
import { useTheme } from "./ThemeProvider";
import { TEMAS, Tema } from "@/lib/themes";

const labels: Record<Tema, string> = {
  institucional: "🏛 Institucional",
  moderno: "🌙 Moderno",
  minimalista: "◻ Minimalista",
};

export function ThemeSelector() {
  const { tema, setTema } = useTheme();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {TEMAS.map(t => (
        <button
          key={t}
          onClick={() => setTema(t)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            border: `1px solid var(--border)`,
            background: tema === t ? "var(--accent)" : "var(--bg-card)",
            color: tema === t ? "var(--accent-fg)" : "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {labels[t]}
        </button>
      ))}
    </div>
  );
}
