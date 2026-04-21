#!/bin/bash

BASE="/Users/fabiomartinssantos/lip-interface"

echo "🚀 Instalando MRH no URBIS..."

# Cria pastas
mkdir -p "$BASE/app/login"
mkdir -p "$BASE/app/admin/usuarios"
mkdir -p "$BASE/app/api/auth/login"
mkdir -p "$BASE/app/api/auth/logout"
mkdir -p "$BASE/app/api/admin/usuarios/reset-senha"

echo "✅ Pastas criadas"

# ─── middleware.ts ───────────────────────────────────────────
cat > "$BASE/middleware.ts" << 'EOF'
import { NextRequest, NextResponse } from "next/server";

const ROTAS_PUBLICAS = ["/login"];
const ROTAS_ADMIN = ["/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("urbis_token")?.value;
  const perfil = req.cookies.get("urbis_perfil")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (ROTAS_ADMIN.some((r) => pathname.startsWith(r))) {
    if (perfil !== "Administrador") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
EOF

echo "✅ middleware.ts"

# ─── app/login/page.tsx ──────────────────────────────────────
cat > "$BASE/app/login/page.tsx" << 'EOF'
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
    } catch (e: any) {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">URBIS</h1>
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
            {erro && (
              <div className="bg-red-900 border border-red-600 text-red-200 text-xs px-3 py-2 rounded-lg">❌ {erro}</div>
            )}
            <button onClick={entrar} disabled={carregando}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-2">
              {carregando ? "Entrando..." : "Entrar →"}
            </button>
          </div>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">Problemas de acesso? Fale com o administrador.</p>
      </div>
    </div>
  );
}
EOF

echo "✅ app/login/page.tsx"

# ─── app/api/auth/login/route.ts ────────────────────────────
cat > "$BASE/app/api/auth/login/route.ts" << 'EOF'
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, senha } = await req.json();
    if (!email || !senha) {
      return NextResponse.json({ ok: false, erro: "Email e senha obrigatórios" }, { status: 400 });
    }

    const { data: authData, error: authError } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.signInWithPassword({ email, password: senha });

    if (authError || !authData.session) {
      return NextResponse.json({ ok: false, erro: "Email ou senha incorretos" }, { status: 401 });
    }

    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("id, nome, perfil, status")
      .eq("email", email)
      .single();

    if (userError || !usuario) {
      return NextResponse.json({ ok: false, erro: "Usuário não encontrado no sistema" }, { status: 403 });
    }

    if (usuario.status !== "Ativo") {
      return NextResponse.json({ ok: false, erro: "Usuário inativo. Entre em contato com o administrador." }, { status: 403 });
    }

    await supabase.from("usuarios").update({ ultimo_acesso: new Date().toISOString() }).eq("id", usuario.id);

    const res = NextResponse.json({
      ok: true,
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, email },
    });

    const opcoesCookie = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 8,
      path: "/",
    };

    res.cookies.set("urbis_token", authData.session.access_token, opcoesCookie);
    res.cookies.set("urbis_perfil", usuario.perfil, { ...opcoesCookie, httpOnly: false });
    res.cookies.set("urbis_nome", usuario.nome, { ...opcoesCookie, httpOnly: false });
    res.cookies.set("urbis_id", usuario.id, { ...opcoesCookie, httpOnly: false });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
EOF

echo "✅ app/api/auth/login/route.ts"

# ─── app/api/auth/logout/route.ts ───────────────────────────
cat > "$BASE/app/api/auth/logout/route.ts" << 'EOF'
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("urbis_token");
  res.cookies.delete("urbis_perfil");
  res.cookies.delete("urbis_nome");
  res.cookies.delete("urbis_id");
  return res;
}
EOF

echo "✅ app/api/auth/logout/route.ts"

# ─── app/api/admin/usuarios/route.ts ────────────────────────
cat > "$BASE/app/api/admin/usuarios/route.ts" << 'EOF'
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from("usuarios").select("*").order("nome");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  try {
    const { nome, cpf, email, matricula, telefone, cargo, perfil, status, senha } = await req.json();
    if (!nome || !email || !senha) {
      return NextResponse.json({ ok: false, erro: "Nome, email e senha obrigatórios" }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password: senha, email_confirm: true,
    });

    if (authError) return NextResponse.json({ ok: false, erro: authError.message }, { status: 400 });

    const { error: dbError } = await supabase.from("usuarios").insert({
      nome, cpf, email, matricula, telefone, cargo,
      perfil: perfil || "Analista", status: status || "Ativo",
    });

    if (dbError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ ok: false, erro: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nome, cpf, email, matricula, telefone, cargo, perfil, status, senha } = await req.json();
    if (!id) return NextResponse.json({ ok: false, erro: "ID obrigatório" }, { status: 400 });

    const atualizacao: any = { nome, cpf, email, matricula, telefone, cargo, perfil, status };
    if (status === "Inativo") atualizacao.descadastrado_em = new Date().toISOString();
    if (status === "Ativo") atualizacao.descadastrado_em = null;

    const { error: dbError } = await supabase.from("usuarios").update(atualizacao).eq("id", id);
    if (dbError) return NextResponse.json({ ok: false, erro: dbError.message }, { status: 500 });

    if (senha) {
      const { data: userData } = await supabase.from("usuarios").select("email").eq("id", id).single();
      if (userData?.email) {
        const { data: authUser } = await supabase.auth.admin.listUsers();
        const user = authUser?.users?.find((u) => u.email === userData.email);
        if (user) await supabase.auth.admin.updateUserById(user.id, { password: senha });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
EOF

echo "✅ app/api/admin/usuarios/route.ts"

# ─── app/api/admin/usuarios/reset-senha/route.ts ────────────
cat > "$BASE/app/api/admin/usuarios/reset-senha/route.ts" << 'EOF'
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    const { data: usuario } = await supabase.from("usuarios").select("email").eq("id", id).single();
    if (!usuario?.email) return NextResponse.json({ ok: false, erro: "Usuário não encontrado" }, { status: 404 });

    const { error } = await supabase.auth.resetPasswordForEmail(usuario.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/login`,
    });

    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
EOF

echo "✅ app/api/admin/usuarios/reset-senha/route.ts"

# ─── app/admin/usuarios/page.tsx ────────────────────────────
cat > "$BASE/app/admin/usuarios/page.tsx" << 'ENDOFFILE'
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
ENDOFFILE

echo "✅ app/admin/usuarios/page.tsx"
echo ""
echo "🎉 MRH instalado com sucesso!"
echo ""
echo "Próximo passo: cadastre seu usuário admin no Supabase Authentication"
echo "Email: fabio.parente@gmail.com"
