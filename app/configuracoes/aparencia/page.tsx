"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { TEMAS, Tema } from "@/lib/themes";
import { ArrowLeft, Palette, Hash, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";

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
  criado_em?: string;
};

type StatusSalvar = "idle" | "salvando" | "ok" | "erro";

function formatarDataHora(dataStr?: string) {
  if (!dataStr) return "—";
  return new Date(dataStr).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function FaixaEditor({ tipo, label }: { tipo: "despacho" | "parecer"; label: string }) {
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [inicial, setInicial] = useState("");
  const [final, setFinal] = useState("");
  const [status, setStatus] = useState<StatusSalvar>("idle");
  const [erro, setErro] = useState("");

  function carregar() {
    fetch("/api/numeracao/faixa", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) {
          setFaixas(j.data.filter((d: Faixa) => d.tipo === tipo));
        }
      })
      .catch(() => {});
  }

  useEffect(() => { carregar(); }, [tipo]);

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
      carregar();
      setInicial(""); setFinal("");
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e: any) {
      setErro(e.message);
      setStatus("erro");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  // A faixa "ativa" é a primeira (por ordem de criação) que ainda tem
  // números livres — o mesmo critério usado pelo backend em /api/numeracao/proximo.
  const faixaAtiva = faixas.find((f) => f.proximo <= f.numero_final) ?? null;
  const disponiveis = faixaAtiva ? Math.max(0, faixaAtiva.numero_final - faixaAtiva.proximo + 1) : null;
  const total = faixaAtiva ? faixaAtiva.numero_final - faixaAtiva.numero_inicial + 1 : null;
  const esgotado = faixas.length > 0 && !faixaAtiva;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide mb-1">{label}</h3>

      {faixas.length > 0 && (
        <div className={`mb-4 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${
          esgotado
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)]"
        }`}>
          {esgotado
            ? <><AlertTriangle size={13} /> Todas as faixas esgotadas — cadastre uma nova</>
            : <><CheckCircle2 size={13} className="text-green-600" /> Disponíveis: <strong>{disponiveis}</strong> de {total} (faixa {faixaAtiva!.numero_inicial}–{faixaAtiva!.numero_final}) &nbsp;|&nbsp; Próximo: <strong>{faixaAtiva!.proximo}</strong></>
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
      {faixas.length === 0 && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">Nenhuma faixa cadastrada. Informe o intervalo disponibilizado pela chefia.</p>
      )}

      {faixas.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2">Auditoria — faixas cadastradas</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="py-1.5 pr-3 font-semibold">Intervalo</th>
                  <th className="py-1.5 pr-3 font-semibold">Cadastrada em</th>
                  <th className="py-1.5 pr-3 font-semibold">Usados</th>
                  <th className="py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...faixas]
                  .sort((a, b) => (a.criado_em ?? "").localeCompare(b.criado_em ?? ""))
                  .map((f) => {
                    const usados = Math.max(0, Math.min(f.proximo, f.numero_final + 1) - f.numero_inicial);
                    const totalF = f.numero_final - f.numero_inicial + 1;
                    const esgotadaF = f.proximo > f.numero_final;
                    const ativaF = faixaAtiva?.id === f.id;
                    return (
                      <tr key={f.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-1.5 pr-3 font-mono text-[var(--text-primary)]">{f.numero_inicial}–{f.numero_final}</td>
                        <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{formatarDataHora(f.criado_em)}</td>
                        <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{usados} de {totalF}</td>
                        <td className="py-1.5">
                          {esgotadaF
                            ? <span className="text-red-600 font-semibold">Esgotada</span>
                            : ativaF
                              ? <span className="text-green-600 font-semibold">Ativa</span>
                              : <span className="text-[var(--text-muted)]">Aguardando</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SenhaEditor() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [status, setStatus] = useState<StatusSalvar>("idle");
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (novaSenha.length < 8) { setErro("A nova senha deve ter pelo menos 8 caracteres."); return; }
    if (novaSenha !== confirmar) { setErro("As senhas não conferem."); return; }
    setStatus("salvando");
    try {
      const res = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.erro ?? "Erro");
      setSenhaAtual(""); setNovaSenha(""); setConfirmar("");
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e: any) {
      setErro(e.message);
      setStatus("erro");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide mb-4">Trocar senha</h3>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Senha atual</label>
          <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Nova senha</label>
          <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Confirmar nova senha</label>
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <button onClick={salvar} disabled={status === "salvando" || !senhaAtual || !novaSenha || !confirmar}
          className="self-start bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60">
          {status === "salvando" ? "Salvando…" : status === "ok" ? "✓ Senha alterada" : "Salvar nova senha"}
        </button>
        {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { tema, setTema } = useTheme();
  const [aba, setAba] = useState<"aparencia" | "numeracao" | "senha">("aparencia");

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
              { id: "senha", label: "Senha", Icone: KeyRound },
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

          {/* Senha */}
          {aba === "senha" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Senha</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">Troque sua senha de acesso ao URBIS a qualquer momento.</p>
              </div>
              <SenhaEditor />
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
