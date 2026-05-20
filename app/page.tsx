"use client";

// ============================================================
// Home — header grande com logo + barra de entrada de processo
// (compacta) + grid de cards de módulos.
//
// Visibilidade dos cards controlada pelos perfis do usuário,
// idêntica às gates anteriores (BIP só irrestrito, BACKUPS só
// Administrador).
// ============================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScanSearch,
  ClipboardCheck,
  TrendingUp,
  BrainCircuit,
  BookOpen,
  HardDrive,
  Wand2,
  Settings2,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";

type TipoProcesso = "ACEITE" | "REGULARIZACAO" | "APROVACAO";

type Card = {
  chave: string;
  nome: string;
  descricao: string;
  Icone: LucideIcon;
  rota: string;
  visivel: boolean;
};

export default function Home() {
  const router = useRouter();
  const [perfis, setPerfis] = useState<string[]>([]);
  const [carregandoAuth, setCarregandoAuth] = useState(true);

  // ── Entrada de processo (barra compacta) ──────────────────
  const [tipo, setTipo] = useState<TipoProcesso>("REGULARIZACAO");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.ok) {
          // Combina ambos os campos (perfis[] + perfil string legado) para que
          // o gate funcione mesmo se só um deles estiver populado no banco.
          const perfisArr: string[] = Array.isArray(json.data?.perfis) ? json.data.perfis : [];
          const perfilLegado: string[] = json.data?.perfil ? [json.data.perfil] : [];
          const arr = Array.from(new Set([...perfisArr, ...perfilLegado].filter(Boolean)));
          setPerfis(arr);
        }
      } catch {
        // mantém [] -> só vê módulos sem gate
      } finally {
        setCarregandoAuth(false);
      }
    })();
  }, []);

  // ── Validação do número (mesma lógica da Home antiga) ─────
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
    await fetch("/api/processo/salvar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: numero.trim(), tipo }),
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

  // ── Gates de visibilidade ─────────────────────────────────
  const irrestrito = isPerfilIrrestrito(perfis);
  const souAdmin = perfis.includes("Administrador");

  const cards: Card[] = [
    { chave: "lip", nome: "LIP", descricao: "Leitura Inteligente de Projetos", Icone: ScanSearch, rota: "/processos", visivel: true },
    { chave: "mac", nome: "MAC", descricao: "Análise e Conformidades", Icone: ClipboardCheck, rota: "/processos", visivel: true },
    { chave: "mrp", nome: "MRP", descricao: "Minha Produtividade", Icone: TrendingUp, rota: "/mrp", visivel: true },
    { chave: "bdi", nome: "BDI", descricao: "Banco de Dados e Inteligência", Icone: BrainCircuit, rota: "/admin/bdi", visivel: true },
    { chave: "bip", nome: "BIP", descricao: "Biblioteca de Leis", Icone: BookOpen, rota: "/admin/bdi/leis", visivel: irrestrito },
    { chave: "backups", nome: "BACKUPS", descricao: "Backup & Restauração", Icone: HardDrive, rota: "/admin/backup", visivel: souAdmin },
    { chave: "prompts", nome: "PROMPTS", descricao: "Gerenciar Prompts", Icone: Wand2, rota: "/admin/prompts", visivel: true },
    { chave: "configuracoes", nome: "CONFIGURAÇÕES", descricao: "Gerenciar LIP, MAC e Assuntos", Icone: Settings2, rota: "/admin/configuracoes", visivel: true },
  ];

  const visiveis = cards.filter((c) => c.visivel);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* HEADER — logo grande centralizado + Sair no canto direito */}
      <header className="relative bg-white border-b border-gray-200 px-6 md:px-10 py-8">
        <div className="flex flex-col items-center gap-2">
          <img src="/logo_urbis.png" alt="URBIS" className="h-40 w-auto" />
          <p className="text-sm font-medium text-gray-600">
            Sistema de Análise de Projetos — Prefeitura de Goiânia
          </p>
        </div>
        <button
          onClick={sair}
          className="absolute top-4 right-4 md:top-6 md:right-6 inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          <LogOut size={16} />
          Sair
        </button>
      </header>

      {/* CONTEÚDO — barra de entrada + grid de cards */}
      <main className="flex-1 px-6 md:px-10 py-8">
        <div className="w-full max-w-6xl mx-auto space-y-6">

          {/* Barra compacta — assunto + número + ENTRAR */}
          <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold md:mr-1">
                Abrir processo
              </label>
              <select
                value={tipo}
                onChange={(e) => { setTipo(e.target.value as TipoProcesso); setErro(""); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]">
                <option value="ACEITE">Aceite</option>
                <option value="REGULARIZACAO">Regularização</option>
                <option value="APROVACAO">Aprovação de projeto</option>
              </select>
              <input
                type="text"
                value={numero}
                onChange={(e) => { setNumero(e.target.value); setErro(""); }}
                onKeyDown={(e) => e.key === "Enter" && validar()}
                placeholder={getPlaceholder()}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={validar}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors whitespace-nowrap">
                ENTRAR
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-gray-500">{getAjuda()}</p>
              {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
            </div>
          </section>

          {/* Grid de cards de módulos */}
          {carregandoAuth ? (
            <p className="text-center text-gray-500 text-sm">Carregando…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {visiveis.map(({ chave, nome, descricao, Icone, rota }) => (
                <button
                  key={chave}
                  onClick={() => router.push(rota)}
                  className="group bg-white rounded-xl border border-gray-200 p-6 text-left shadow-sm hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mb-4 transition-colors">
                    <Icone className="text-blue-600" size={24} aria-hidden="true" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800 tracking-wide">{nome}</h2>
                  <p className="text-sm text-gray-500 mt-1 leading-snug">{descricao}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* RODAPÉ */}
      <footer className="px-6 md:px-10 py-4 text-center">
        <p className="text-xs text-gray-400">by Fábio Parente — Prefeitura de Goiânia</p>
      </footer>
    </div>
  );
}
