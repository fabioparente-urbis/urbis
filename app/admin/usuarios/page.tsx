"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Usuario = {
  id: string; nome: string; cpf: string; email: string;
  matricula: string; telefone: string; cargo: string;
  perfil: string; status: string; criado_em: string;
  ultimo_acesso: string | null; descadastrado_em: string | null;
};

const PERFIS = ["Analista", "Gerente", "Diretor", "Administrador"];
const vazio = () => ({ nome: "", cpf: "", email: "", matricula: "", telefone: "", cargo: "", perfil: "Analista", status: "Ativo" });

export default function UsuariosPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState(vazio());
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  async function carregar() {
    try {
      setCarregando(true);
      const res = await fetch("/api/admin/usuarios");
      const json = await res.json();
      if (json.ok) setUsuarios(json.data);
    } finally { setCarregando(false); }
  }

  useEffect(() => { carregar(); }, []);

  function abrirNovo() { setEditando(null); setForm(vazio()); setSenha(""); setErro(""); setModal(true); }
  function abrirEditar(u: Usuario) {
    setEditando(u);
    setForm({ nome: u.nome, cpf: u.cpf, email: u.email, matricula: u.matricula, telefone: u.telefone, cargo: u.cargo, perfil: u.perfil, status: u.status });
    setSenha(""); setErro(""); setModal(true);
  }

  async function salvar() {
    if (!form.nome || !form.email) { setErro("Nome e email obrigatórios."); return; }
    if (!editando && !senha) { setErro("Senha obrigatória para novo usuário."); return; }
    try {
      setSalvando(true); setErro("");
      const res = await fetch("/api/admin/usuarios", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, senha: senha || undefined, id: editando?.id }),
      });
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Erro ao salvar."); return; }
      setModal(false); await carregar();
    } finally { setSalvando(false); }
  }

  async function resetarSenha(id: string, email: string) {
    if (!confirm(`Enviar email de reset de senha para ${email}?`)) return;
    const res = await fetch("/api/admin/usuarios/reset-senha", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    alert(json.ok ? "✅ Email enviado!" : "❌ Erro: " + json.erro);
  }

  function f(campo: string, valor: string) { setForm((prev) => ({ ...prev, [campo]: valor })); }

  function formatar(dataStr: string | null) {
    if (!dataStr) return "—";
    return new Date(dataStr).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const filtrados = usuarios.filter((u) =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()) ||
    (u.matricula || "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 text-white">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded text-sm font-medium transition-colors">🏠 Home</button>
          <div>
            <h1 className="text-2xl font-bold">👥 Gestão de Usuários</h1>
            <p className="text-slate-400 text-sm">Cadastro e controle de acesso ao URBIS</p>
          </div>
        </div>
        <button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">+ Novo Usuário</button>
      </div>

      <div className="mb-4">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, email ou matrícula..."
          className="w-full max-w-md bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {carregando ? <p className="text-slate-400 text-sm">Carregando...</p> : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 text-slate-300 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Matrícula</th>
                <th className="text-left px-4 py-3">Perfil</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Último acesso</th>
                <th className="text-left px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>
              ) : filtrados.map((u) => (
                <tr key={u.id} className="border-t border-slate-700">
                  <td className="px-4 py-3 font-medium">{u.nome}</td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3 text-slate-400">{u.matricula || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.perfil === "Administrador" ? "bg-purple-900 text-purple-300" : u.perfil === "Diretor" ? "bg-red-900 text-red-300" : u.perfil === "Gerente" ? "bg-yellow-900 text-yellow-300" : "bg-blue-900 text-blue-300"}`}>{u.perfil}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.status === "Ativo" ? "bg-green-900 text-green-300" : "bg-slate-700 text-slate-400"}`}>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{formatar(u.ultimo_acesso)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => abrirEditar(u)} className="bg-slate-600 hover:bg-slate-500 text-white text-xs px-2 py-1 rounded transition-colors">✏️ Editar</button>
                      <button onClick={() => resetarSenha(u.id, u.email)} className="bg-slate-600 hover:bg-slate-500 text-white text-xs px-2 py-1 rounded transition-colors">🔑 Senha</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white font-bold text-lg">{editando ? "Editar Usuário" : "Novo Usuário"}</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {([ ["nome","Nome completo","text"], ["cpf","CPF","text"], ["email","Email","email"], ["matricula","Matrícula","text"], ["telefone","Telefone","text"], ["cargo","Cargo","text"] ] as [string,string,string][]).map(([campo, label, tipo]) => (
                <div key={campo} className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</label>
                  <input type={tipo} value={(form as any)[campo]} onChange={(e) => f(campo, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Perfil</label>
                <select value={form.perfil} onChange={(e) => f("perfil", e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Status</label>
                <select value={form.status} onChange={(e) => f("status", e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{editando ? "Nova senha (deixe vazio para manter)" : "Senha"}</label>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                  placeholder={editando ? "••••••••" : "Mínimo 6 caracteres"}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            {erro && <div className="bg-red-900 border border-red-600 text-red-200 text-xs px-3 py-2 rounded-lg mt-4">❌ {erro}</div>}
            <div className="flex gap-3 mt-6">
              <button onClick={salvar} disabled={salvando}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {salvando ? "Salvando..." : editando ? "💾 Salvar alterações" : "✅ Cadastrar"}
              </button>
              <button onClick={() => setModal(false)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
