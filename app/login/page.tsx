"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  // Estado do fluxo "Esqueci minha senha"
  const [modoReset, setModoReset] = useState(false);
  const [emailReset, setEmailReset] = useState("");
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [msgReset, setMsgReset] = useState<string>("");

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

  async function enviarLinkReset() {
    const alvo = (emailReset || email).trim();
    if (!alvo) {
      setMsgReset("Informe o e-mail para receber o link de redefinição.");
      return;
    }
    try {
      setEnviandoReset(true); setMsgReset("");
      await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: alvo }),
      });
      setMsgReset(
        "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
      );
    } catch {
      // Mantemos resposta neutra para não vazar existência de e-mails.
      setMsgReset(
        "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
      );
    } finally {
      setEnviandoReset(false);
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

        {/* Esqueci minha senha — abre formulário inline */}
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={() => { setModoReset((v) => !v); setMsgReset(""); }}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            {modoReset ? "Cancelar" : "Esqueci minha senha"}
          </button>
        </div>

        {modoReset && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-left">
            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">
              E-mail para recuperação
            </label>
            <input
              type="email"
              value={emailReset}
              onChange={(e) => { setEmailReset(e.target.value); setMsgReset(""); }}
              onKeyDown={(e) => e.key === "Enter" && enviarLinkReset()}
              placeholder={email || "seu@email.com"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={enviarLinkReset}
              disabled={enviandoReset}
              className="w-full mt-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
            >
              {enviandoReset ? "Enviando..." : "Enviar link"}
            </button>
            {msgReset && (
              <p className="text-xs text-slate-600 mt-2">{msgReset}</p>
            )}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">by Fábio Parente</p>
          <p className="text-xs text-gray-500 font-medium">Sistema de Análise de Projetos</p>
          <p className="text-xs text-gray-400">Prefeitura de Goiânia</p>
        </div>
      </div>
    </div>
  );
}