"use client";

// ============================================================
// /admin/configuracoes — placeholder
// Página em construção. Vai centralizar a gestão de LIP, MAC e
// Assuntos numa próxima sessão.
// ============================================================
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";

export default function ConfiguracoesPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-950 text-white px-8 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")}
          className="text-slate-300 hover:text-white text-sm">← Início</button>
        <h1 className="text-xl font-semibold inline-flex items-center gap-2">
          <Settings2 size={20} aria-hidden="true" /> Configurações
        </h1>
      </header>

      <main className="p-8 flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 max-w-md text-center">
          <div className="w-14 h-14 rounded-lg bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Settings2 className="text-blue-600" size={28} aria-hidden="true" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">Em construção</h2>
          <p className="text-sm text-gray-500 mt-2">
            Esta página vai concentrar a gestão de LIP, MAC e Assuntos.
            Por enquanto, use os menus específicos disponíveis pela Home.
          </p>
        </div>
      </main>
    </div>
  );
}
