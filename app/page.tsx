"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isPerfilIrrestrito } from "@/lib/perfis";

type TipoProcesso = "ACEITE" | "REGULARIZACAO" | "APROVACAO";

export default function Home() {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoProcesso>("REGULARIZACAO");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState("");
  // Perfis do usuario logado — gate para "Gestão de usuários" (item 4).
  const [perfis, setPerfis] = useState<string[]>([]);
  const [usuario, setUsuario] = useState({ nome: "", perfil: "", id: "" });
  const podeGerirUsuarios = perfis.includes("Administrador") || isPerfilIrrestrito(perfis);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.ok) {
          const arr: string[] = Array.isArray(json.data?.perfis) && json.data.perfis.length > 0
            ? json.data.perfis
            : (json.data?.perfil ? [json.data.perfil] : []);
          setPerfis(arr);
          setUsuario({ nome: json.data?.nome ?? "", perfil: json.data?.perfil ?? "", id: json.data?.id ?? "" });
        }
      } catch { /* mantem [] -> oculta gestao por padrao */ }
    })();
  }, []);

  function identificarTipoNumero(valor: string) {
    const v = valor.trim().toUpperCase();
    if (/^OS\s\d{1,3}(\.\d{3})+$/.test(v)) return "OS";
    if (/^\d{2}\.\d{1,2}\.\d{8,10}-\d$/.test(v)) return "SEI";
    if (/^\d{5}$/.test(v)) return "PROJETO";
    if (/^\d{7,9}$/.test(v)) return "FISICO";
    return "INVALIDO";
  }

  async function validar() {
    const tipoNumero = identificarTipoNumero(numero);
    if (tipoNumero === "INVALIDO") {
      setErro("O número informado não corresponde a um formato válido do URBIS.");
      return;
    }
    if (tipo === "APROVACAO" && tipoNumero === "SEI") {
      setErro("Número SEI não é compatível com aprovação de projeto.");
      return;
    }
    if ((tipo === "ACEITE" || tipo === "REGULARIZACAO") && (tipoNumero === "OS" || tipoNumero === "PROJETO")) {
      setErro("Número de projeto ou ordem de serviço não pode ser usado neste fluxo.");
      return;
    }
    setErro("");
    await fetch('/api/processo/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: numero.trim(), tipo })
    });
    router.push(`/processo/${encodeURIComponent(numero.trim())}?tipo=${encodeURIComponent(tipo)}`);
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
    <>
    <div className="flex h-screen bg-gray-100">

      {/* SIDEBAR ESQUERDA — Tipos de processo */}
      <aside className="w-56 bg-slate-950 text-white flex flex-col p-4">
        <h1 className="text-sm font-semibold mb-6 text-gray-400 uppercase tracking-wider">
          PROJETO:
        </h1>
        <button
          className={`p-3 text-left rounded mb-2 transition ${tipo === "ACEITE" ? "bg-slate-700" : "hover:bg-slate-800"}`}
          onClick={() => { setTipo("ACEITE"); setErro(""); }}>
          Aceite
        </button>
        <button
          className={`p-3 text-left rounded mb-2 transition ${tipo === "REGULARIZACAO" ? "bg-slate-700" : "hover:bg-slate-800"}`}
          onClick={() => { setTipo("REGULARIZACAO"); setErro(""); }}>
          Regularização
        </button>
        <button
          className={`p-3 text-left rounded transition ${tipo === "APROVACAO" ? "bg-slate-700" : "hover:bg-slate-800"}`}
          onClick={() => { setTipo("APROVACAO"); setErro(""); }}>
          Aprovação de projeto
        </button>
      </aside>

      {/* CENTRO */}
      <main className="flex-1 flex items-center justify-center" style={{ paddingBottom: "0" }}>
        <div className="bg-white p-10 rounded shadow w-full max-w-md text-center">
          <img src="/logo_urbis.png" alt="URBIS" className="mx-auto mb-6 w-44 h-auto" />
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
          <button onClick={validar}
            className="w-full bg-blue-600 text-white p-3 rounded font-semibold hover:bg-blue-700 transition">
            ENTRAR
          </button>
          <div className="mt-6 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">by Fábio Parente</p>
            <p className="text-xs text-gray-500 font-medium">Sistema de Análise de Projetos</p>
            <p className="text-xs text-gray-400">Prefeitura de Goiânia</p>
          </div>
        </div>
      </main>

      {/* SIDEBAR DIREITA — Admin + Sair */}
      <aside className="w-56 bg-slate-950 text-white flex flex-col p-4">
        <h1 className="text-sm font-semibold mb-6 text-gray-400 uppercase tracking-wider">
          ADMIN:
        </h1>
        <button onClick={() => router.push("/processos")}
          className="w-full p-3 text-left rounded mb-2 transition hover:bg-slate-800 text-slate-300 hover:text-white text-sm">
          📋 Pilha de Processos
        </button>
        {podeGerirUsuarios && (
          <button onClick={() => router.push("/admin/usuarios")}
            className="w-full p-3 text-left rounded mb-2 transition hover:bg-slate-800 text-slate-300 hover:text-white text-sm">
            👥 Gestão de usuários
          </button>
        )}
        <button onClick={() => router.push("/admin/checklists")}
          className="w-full p-3 text-left rounded mb-2 transition hover:bg-slate-800 text-slate-300 hover:text-white text-sm">
          ✅ Gerenciar Checklists
        </button>
        <button onClick={() => router.push("/admin/lip")}
          className="w-full p-3 text-left rounded mb-2 transition hover:bg-slate-800 text-slate-300 hover:text-white text-sm">
          🏗️ Gerenciar LIP
        </button>
        <button onClick={() => router.push("/admin/prompts")}
          className="w-full p-3 text-left rounded mb-2 transition hover:bg-slate-800 text-slate-300 hover:text-white text-sm">
          📝 Gerenciar Prompts
        </button>
        <button onClick={() => router.push("/admin/bdi")}
          className="w-full p-3 text-left rounded mb-2 transition hover:bg-slate-800 text-slate-300 hover:text-white text-sm">
          🧠 BDI — Banco de Dados e Inteligência
        </button>

        <div className="mt-auto pt-4 border-t border-slate-800">
          {usuario.nome && (
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
            className="w-full p-3 text-left rounded transition hover:bg-red-900 text-red-400 hover:text-white text-sm font-medium">
            🚪 Sair
          </button>
        </div>
      </aside>

    </div>
    </>
  );
}
