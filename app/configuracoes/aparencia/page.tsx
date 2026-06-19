"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { TEMAS, Tema } from "@/lib/themes";
import { ArrowLeft, Palette } from "lucide-react";

const LABELS: Record<Tema, string> = {
  institucional: "🏛 Institucional",
  moderno: "🌙 Moderno",
  minimalista: "◻ Minimalista",
};

export default function AparenciaPage() {
  const router = useRouter();
  const { tema, setTema } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      <header className="bg-[var(--surface)] border-b border-[var(--border)] px-6 md:px-10 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowLeft size={16} />
          Voltar
        </button>
      </header>

      <main className="flex-1 px-6 md:px-10 py-10">
        <div className="w-full max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Palette size={22} className="text-[var(--accent)]" />
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Aparência</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Tema visual do sistema. Preferência salva por navegador.
          </p>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 shadow-sm">
            <div className="flex flex-wrap gap-3">
              {TEMAS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTema(t)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    tema === t
                      ? "border-[var(--accent-hover)] bg-[var(--accent)] text-[var(--text-primary)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                  }`}>
                  {LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 md:px-10 py-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">by Fábio Parente — Prefeitura de Goiânia</p>
      </footer>
    </div>
  );
}
