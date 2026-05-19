"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Cliente browser dedicado a este fluxo: precisa do anon key porque o
// Supabase Auth captura o access_token do fragmento (#) da URL e o usa
// para autorizar updateUser(). Mantemos o tema do login.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, detectSessionInUrl: true } },
);

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [sessaoOk, setSessaoOk] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    // O Supabase já fez detectSessionInUrl ao instanciar; apenas confirmamos.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          setSessaoOk(true);
        } else {
          // Fallback: alguns clientes deixam o token no hash; força leitura.
          const hash = typeof window !== "undefined" ? window.location.hash : "";
          if (hash.includes("access_token=")) {
            // Aguarda 1 tick caso o detector ainda esteja resolvendo
            await new Promise((r) => setTimeout(r, 300));
            const { data: d2 } = await supabase.auth.getSession();
            setSessaoOk(!!d2?.session);
          }
        }
      } finally {
        setCarregandoSessao(false);
      }
    })();
  }, []);

  async function salvar() {
    setErro("");
    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setErro("As senhas não conferem.");
      return;
    }
    try {
      setSalvando(true);
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) {
        setErro(error.message || "Não foi possível atualizar a senha.");
        return;
      }
      setSucesso(true);
      // Desloga a sessão temporária do reset antes de mandar pro login.
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => router.push("/"), 1500);
    } catch (e: any) {
      setErro(e?.message || "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center">
        <img src="/logo_urbis.png" alt="URBIS" className="mx-auto mb-6 w-44 h-auto" />
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Redefinir senha</h2>
        <p className="text-sm text-slate-400 mb-6">
          Escolha uma nova senha para acessar o URBIS.
        </p>

        {carregandoSessao ? (
          <p className="text-sm text-slate-500">Validando link...</p>
        ) : !sessaoOk ? (
          <div className="bg-red-50 border border-red-300 text-red-600 text-sm px-3 py-3 rounded-lg text-left">
            Link inválido ou expirado. Volte ao login e solicite um novo
            link em <span className="font-semibold">&ldquo;Esqueci minha senha&rdquo;</span>.
            <div className="mt-3 text-center">
              <button
                onClick={() => router.push("/login")}
                className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded"
              >
                Voltar ao login
              </button>
            </div>
          </div>
        ) : sucesso ? (
          <div className="bg-green-50 border border-green-300 text-green-700 text-sm px-3 py-3 rounded-lg">
            ✅ Senha atualizada com sucesso. Redirecionando...
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 text-left">
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">
                  Nova senha
                </label>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => { setNovaSenha(e.target.value); setErro(""); }}
                  onKeyDown={(e) => e.key === "Enter" && salvar()}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide block mb-1">
                  Confirmar nova senha
                </label>
                <input
                  type="password"
                  value={confirmar}
                  onChange={(e) => { setConfirmar(e.target.value); setErro(""); }}
                  onKeyDown={(e) => e.key === "Enter" && salvar()}
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
              onClick={salvar}
              disabled={salvando}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg text-sm transition-colors"
            >
              {salvando ? "Salvando..." : "SALVAR NOVA SENHA"}
            </button>
          </>
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
