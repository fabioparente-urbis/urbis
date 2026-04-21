"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TipoProcesso = "ACEITE" | "REGULARIZACAO" | "APROVACAO";

export default function Home() {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoProcesso>("REGULARIZACAO");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState("");

  function identificarTipoNumero(valor: string) {
    const v = valor.trim().toUpperCase();
    if (/^OS\s\d{1,3}(\.\d{3})+$/.test(v)) return "OS";
    if (/^\d{2}\.\d{1,2}\.\d{8,10}-\d$/.test(v)) return "SEI";
    if (/^\d{5}$/.test(v)) return "PROJETO";
    if (/^\d{7,9}$/.test(v)) return "FISICO";
    return "INVALIDO";
  }

  function validar() {
    const tipoNumero = identificarTipoNumero(numero);

    if (tipoNumero === "INVALIDO") {
      setErro("O número informado não corresponde a um formato válido do URBIS.");
      return;
    }

    if (tipo === "APROVACAO" && tipoNumero === "SEI") {
      setErro("Número SEI não é compatível com aprovação de projeto.");
      return;
    }

    if (
      (tipo === "ACEITE" || tipo === "REGULARIZACAO") &&
      (tipoNumero === "OS" || tipoNumero === "PROJETO")
    ) {
      setErro("Número de projeto ou ordem de serviço não pode ser usado neste fluxo.");
      return;
    }

    setErro("");

    // Navega para o processo
    const id = encodeURIComponent(numero.trim());
    router.push(`/processo/${id}`);
  }

  function getPlaceholder() {
    if (tipo === "APROVACAO") return "Ex.: 12345 | OS 343.512 | 91944504";
    return "Ex.: 25.5.000082553-3 ou 91944504";
  }

  function getAjuda() {
    if (tipo === "APROVACAO") return "Use número de projeto, OS ou processo físico.";
    return "Use número SEI ou processo físico.";
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-56 bg-slate-950 text-white flex flex-col p-4">
        <h1 className="text-sm font-semibold mb-6 text-gray-400 uppercase tracking-wider">
          PROJETO:
        </h1>

        <button
          className={`p-3 text-left rounded mb-2 transition ${
            tipo === "ACEITE" ? "bg-slate-700" : "hover:bg-slate-800"
          }`}
          onClick={() => { setTipo("ACEITE"); setErro(""); }}
        >
          Aceite
        </button>

        <button
          className={`p-3 text-left rounded mb-2 transition ${
            tipo === "REGULARIZACAO" ? "bg-slate-700" : "hover:bg-slate-800"
          }`}
          onClick={() => { setTipo("REGULARIZACAO"); setErro(""); }}
        >
          Regularização
        </button>

        <button
          className={`p-3 text-left rounded transition ${
            tipo === "APROVACAO" ? "bg-slate-700" : "hover:bg-slate-800"
          }`}
          onClick={() => { setTipo("APROVACAO"); setErro(""); }}
        >
          Aprovação de projeto
        </button>

        <div className="mt-auto pt-4 border-t border-slate-800">
          <button onClick={() => router.push("/processos")}
            className="w-full p-3 text-left rounded transition hover:bg-slate-800 text-slate-400 hover:text-white text-sm">
            📋 Ver todos os processos
          </button>
          <button onClick={() => router.push("/admin/usuarios")}
            className="w-full p-3 text-left rounded transition hover:bg-slate-800 text-slate-400 hover:text-white text-sm">
            👥 Gestão de usuários
          </button>
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center relative">
  <div className="absolute top-4 right-4">
    <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
      className="bg-red-800 hover:bg-red-700 text-red-200 hover:text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
      🚪 Sair
    </button>
  </div>
        <div className="bg-white p-10 rounded shadow w-full max-w-md text-center">
          <img
            src="/logo_urbis.png"
            alt="URBIS"
            className="mx-auto mb-6 w-44 h-auto"
          />

          <h2 className="text-3xl font-semibold text-gray-700 mb-4">
            Digite o número do processo
          </h2>

          <input
            type="text"
            value={numero}
            onChange={(e) => { setNumero(e.target.value); setErro(""); }}
            onKeyDown={(e) => e.key === "Enter" && validar()}
            placeholder={getPlaceholder()}
            className="w-full border border-gray-300 p-3 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
          />

          <p className="text-sm text-gray-500 mb-4">{getAjuda()}</p>

          {erro && <p className="text-red-600 text-sm mb-4">{erro}</p>}

          <button
            onClick={validar}
            className="w-full bg-blue-600 text-white p-3 rounded font-semibold hover:bg-blue-700 transition"
          >
            ENTRAR
          </button>

          <div className="mt-6 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">by Fábio Parente</p>
            <p className="text-xs text-gray-500 font-medium">Sistema de Análise de Projetos</p>
            <p className="text-xs text-gray-400">Prefeitura de Goiânia</p>
          </div>
        </div>
      </main>
    </div>
  );
}