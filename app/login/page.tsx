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
    if (!email || !senha) { setErro("Preencha email e senha."); return; }
    try {
      setCarregando(true); setErro("");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Erro ao entrar."); return; }
      router.push("/");
      router.refresh();
    } catch (e) {
      setErro("Erro de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
  <img
  src="/logo_urbis.png"
  alt="URBIS"
  className="h-100 w-auto mx-auto mb-3 bg-white rounded-xl p-3"
/>
<p className="text-xs text-gray-400 mt-1 mb-0">by Fábio Parente</p>
  <p className="text-slate-400 text-sm mt-2">Sistema de Análise de Projetos</p>
  <p className="text-slate-500 text-xs mt-1">Prefeitura de Goiânia</p>
</div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-6">Entrar</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && entrar()} placeholder="seu@email.com"
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Senha</label>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && entrar()} placeholder="••••••••"
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {erro && <div className="bg-red-900 border border-red-600 text-red-200 text-xs px-3 py-2 rounded-lg">{erro}</div>}
            <button onClick={entrar} disabled={carregando}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-2">
              {carregando ? "Entrando..." : "Entrar →"}
            </button>
          </div>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">Problemas de acesso? Fale com o administrador.</p>
      </div>
    </div>
  );
}