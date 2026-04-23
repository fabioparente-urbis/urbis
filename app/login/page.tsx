"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    if (!email || !senha) { setErro("Email e senha obrigatórios."); return; }
    try {
      setCarregando(true); setErro("");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Erro ao fazer login."); return; }
      router.push("/");
    } catch (e: any) {
      setErro("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center">
        <img src="/logo_urbis.png" alt="URBIS" className="mx-auto mb-6 w-44 h-auto" />
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Acesso ao URBIS</h2>
        <p className="text-sm text-slate-400 mb-6">Sistema de Análise de Projetos — Prefeitura de Goiânia</p>

        <div className="flex flex-col gap-4 text-left">
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErro(""); }}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              placeholder="seu@email.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErro(""); }}
              onKeyDown={(e) => e.key === "Enter" && entrar()}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-2 rounded-lg mt-4">
            ❌ {erro}
          </div>
        )}

        <button
          onClick={entrar}
          disabled={carregando}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg text-sm transition-colors"
        >
          {carregando ? "Entrando..." : "ENTRAR"}
        </button>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">by Fábio Parente</p>
          <p className="text-xs text-gray-500 font-medium">Sistema de Análise de Projetos</p>
          <p className="text-xs text-gray-400">Prefeitura de Goiânia</p>
        </div>
      </div>
    </div>
  );
}