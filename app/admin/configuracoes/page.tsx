"use client";

// ============================================================
// /admin/configuracoes — Gestao de Assuntos
//
// Lista os 15 assuntos cadastrados em `assuntos`. O slot 1
// (`regularizacao`) e fixo: nao pode ser renomeado nem desativado
// (regra reforcada tambem na API). Os demais 14 slots tem toggle
// ativo/inativo + campo de texto para renomear, com botao Salvar
// por linha.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Check, Loader2, Lock } from "lucide-react";

type Assunto = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  criado_em: string;
};

const SLUG_FIXO = "regularizacao";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Estado por linha: nome em edicao, ativo em edicao, status do salvar.
  const [edicao, setEdicao] = useState<Record<string, { nome: string; ativo: boolean }>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [sucessoId, setSucessoId] = useState<string | null>(null);

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");
      const res = await fetch("/api/admin/assuntos");
      const json = await res.json();
      if (!json.ok) {
        setErro(json.erro || "Falha ao carregar assuntos.");
        return;
      }
      const lista: Assunto[] = json.data || [];
      setAssuntos(lista);
      // Inicializa o estado de edicao com os valores atuais.
      const ed: Record<string, { nome: string; ativo: boolean }> = {};
      for (const a of lista) ed[a.id] = { nome: a.nome, ativo: a.ativo };
      setEdicao(ed);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado ao carregar.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function atualizarLinha(id: string, patch: Partial<{ nome: string; ativo: boolean }>) {
    setEdicao((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    // Limpa o feedback de sucesso da linha ao editar de novo.
    if (sucessoId === id) setSucessoId(null);
  }

  async function salvar(a: Assunto) {
    const valores = edicao[a.id];
    if (!valores) return;
    const nome = valores.nome.trim();
    if (!nome) {
      setErro(`O nome do slot ${a.ordem} nao pode ficar vazio.`);
      return;
    }
    try {
      setSalvandoId(a.id);
      setErro("");
      const res = await fetch("/api/admin/assuntos", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: a.id, nome, ativo: valores.ativo }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErro(json.erro || "Falha ao salvar.");
        return;
      }
      // Atualiza linha localmente com o que voltou da API.
      const atualizado: Assunto = json.data;
      setAssuntos((prev) => prev.map((x) => (x.id === a.id ? atualizado : x)));
      setEdicao((prev) => ({
        ...prev,
        [a.id]: { nome: atualizado.nome, ativo: atualizado.ativo },
      }));
      setSucessoId(a.id);
      // Some o "salvo" depois de alguns segundos.
      setTimeout(() => setSucessoId((cur) => (cur === a.id ? null : cur)), 2500);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado ao salvar.");
    } finally {
      setSalvandoId(null);
    }
  }

  function linhaSofreuMudanca(a: Assunto): boolean {
    const v = edicao[a.id];
    if (!v) return false;
    return v.nome.trim() !== a.nome || v.ativo !== a.ativo;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-slate-400 hover:text-white text-sm"
        >
          ← Início
        </button>
        <h1 className="text-xl font-semibold inline-flex items-center gap-2">
          <Settings2 size={20} aria-hidden="true" /> Configurações
        </h1>
      </header>

      <main className="p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Assuntos</h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure os 15 trilhos de processo do sistema. Regularização é fixa e
            sempre ativa. Os demais slots podem ser renomeados e ativados conforme
            novos assuntos forem implantados.
          </p>
        </div>

        {erro && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="text-slate-400 text-sm inline-flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Carregando assuntos…
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="grid grid-cols-[60px_1fr_140px_140px] gap-3 px-4 py-3 text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
              <div>Ordem</div>
              <div>Nome</div>
              <div className="text-center">Ativo</div>
              <div className="text-right pr-2">Ação</div>
            </div>

            {assuntos.map((a) => {
              const fixo = a.slug === SLUG_FIXO;
              const v = edicao[a.id] ?? { nome: a.nome, ativo: a.ativo };
              const podeSalvar = !fixo && linhaSofreuMudanca(a) && !salvandoId;
              return (
                <div
                  key={a.id}
                  className="grid grid-cols-[60px_1fr_140px_140px] gap-3 px-4 py-3 items-center border-b border-slate-800 last:border-b-0"
                >
                  <div className="text-slate-500 text-sm">{a.ordem}</div>

                  <div className="min-w-0">
                    {fixo ? (
                      <div className="inline-flex items-center gap-2 text-white font-medium">
                        <Lock size={14} className="text-slate-500" aria-hidden="true" />
                        {a.nome}
                        <span className="text-xs text-slate-500 font-normal">(fixo)</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={v.nome}
                        onChange={(e) => atualizarLinha(a.id, { nome: e.target.value })}
                        placeholder={`Slot ${String(a.ordem).padStart(2, "0")}`}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        maxLength={80}
                      />
                    )}
                    <div className="text-xs text-slate-500 mt-1 font-mono">{a.slug}</div>
                  </div>

                  <div className="flex justify-center">
                    {fixo ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-900/40 text-emerald-300 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Ativo
                      </span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={v.ativo}
                        onClick={() => atualizarLinha(a.id, { ativo: !v.ativo })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          v.ativo ? "bg-blue-600" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            v.ativo ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  <div className="flex justify-end pr-2">
                    {fixo ? (
                      <span className="text-xs text-slate-600">—</span>
                    ) : sucessoId === a.id ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <Check size={14} /> Salvo
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => salvar(a)}
                        disabled={!podeSalvar}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          podeSalvar
                            ? "bg-blue-600 hover:bg-blue-500 text-white"
                            : "bg-slate-800 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        {salvandoId === a.id ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> Salvando
                          </>
                        ) : (
                          "Salvar"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
