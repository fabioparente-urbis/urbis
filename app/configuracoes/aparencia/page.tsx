"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { TEMAS, Tema } from "@/lib/themes";
import { ArrowLeft, Palette, Hash, CheckCircle2, AlertTriangle } from "lucide-react";

const LABELS: Record<Tema, string> = {
  institucional: "🏛 Institucional",
  moderno: "🌙 Moderno",
  minimalista: "◻ Minimalista",
};

type Faixa = {
  id: string;
  tipo: "despacho" | "parecer";
  numero_inicial: number;
  numero_final: number;
  proximo: number;
};

type StatusSalvar = "idle" | "salvando" | "ok" | "erro";

function FaixaEditor({ tipo, label }: { tipo: "despacho" | "parecer"; label: string }) {
  const [faixa, setFaixa] = useState<Faixa | null>(null);
  const [inicial, setInicial] = useState("");
  const [final, setFinal] = useState("");
  const [status, setStatus] = useState<StatusSalvar>("idle");
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/numeracao/faixa", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) {
          const f = j.data.find((d: Faixa) => d.tipo === tipo) ?? null;
          setFaixa(f);
          if (f) {
            setInicial(String(f.numero_inicial));
            setFinal(String(f.numero_final));
          }
        }
      })
      .catch(() => {});
  }, [tipo]);

  async function salvar() {
    setErro("");
    const ni = parseInt(inicial, 10);
    const nf = parseInt(final, 10);
    if (!Number.isInteger(ni) || !Number.isInteger(nf) || ni > nf) {
      setErro("Faixa inválida. O número inicial deve ser menor ou igual ao final.");
      return;
    }
    setStatus("salvando");
    try {
      const res = await fetch("/api/numeracao/faixa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, numero_inicial: ni, numero_final: nf }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro ?? "Erro");
      setFaixa(json.data);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e: any) {
      setErro(e.message);
      setStatus("erro");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const disponiveis = faixa ? Math.max(0, faixa.numero_final - faixa.proximo + 1) : null;
  const total = faixa ? faixa.numero_final - faixa.numero_inicial + 1 : null;
  const esgotado = faixa && faixa.proximo > faixa.numero_final;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide mb-1">{label}</h3>

      {faixa && (
        <div className={`mb-4 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${
          esgotado
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)]"
        }`}>
          {esgotado
            ? <><AlertTriangle size={13} /> Faixa esgotada — cadastre uma nova faixa</>
            : <><CheckCircle2 size={13} className="text-green-600" /> Disponíveis: <strong>{disponiveis}</strong> de {total} &nbsp;|&nbsp; Próximo: <strong>{faixa.proximo}</strong></>
          }
        </div>
      )}

      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Nº Inicial</label>
          <input
            type="number"
            value={inicial}
            onChange={(e) => setInicial(e.target.value)}
            placeholder="Ex: 1"
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Nº Final</label>
          <input
            type="number"
            value={final}
            onChange={(e) => setFinal(e.target.value)}
            placeholder="Ex: 50"
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <button
          onClick={salvar}
          disabled={status === "salvando"}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 whitespace-nowrap">
          {status === "salvando" ? "Salvando…" : status === "ok" ? "✓ Salvo" : "Salvar"}
        </button>
      </div>
      {erro && <p className="mt-2 text-xs text-red-600 font-medium">{erro}</p>}
      {!faixa && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">Nenhuma faixa cadastrada. Informe o intervalo disponibilizado pela chefia.</p>
      )}
    </div>
  );
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { tema, setTema } = useTheme();
  const [aba, setAba] = useState<"aparencia" | "numeracao">("aparencia");

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

      <main className="flex-1 px-6 md:px-10 py-8">
        <div className="w-full max-w-lg mx-auto space-y-6">

          {/* Abas */}
          <div className="flex gap-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-1">
            {([
              { id: "aparencia", label: "Aparência", Icone: Palette },
              { id: "numeracao", label: "Numeração", Icone: Hash },
            ] as const).map(({ id, label, Icone }) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  aba === id
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}>
                <Icone size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Aparência */}
          {aba === "aparencia" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Aparência</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">Tema visual do sistema. Preferência salva por navegador.</p>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-sm">
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
          )}

          {/* Numeração */}
          {aba === "numeracao" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Numeração</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">Informe a faixa de números disponibilizada para você. O sistema usará automaticamente ao emitir.</p>
              </div>
              <FaixaEditor tipo="despacho" label="Despacho" />
              <FaixaEditor tipo="parecer" label="Parecer de Indeferimento" />
            </div>
          )}

        </div>
      </main>

      <footer className="px-6 md:px-10 py-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">by Fábio Parente — Prefeitura de Goiânia</p>
      </footer>
    </div>
  );
}
