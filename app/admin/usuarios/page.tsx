"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Usuario = {
  id: string; nome: string; cpf: string; email: string;
  matricula: string; telefone: string; cargo: string; cau_crea?: string;
  perfil: string;
  perfis?: string[];
  gerencia?: string | null;
  status: string; reducao_meta?: number; urbi_ativo?: boolean;
  urbi_modo_audio?: "nenhum" | "navegador";
  criado_em: string;
  ultimo_acesso: string | null; descadastrado_em: string | null;
};

// Modo de voz do URBI — decidido só pelo admin (ver /api/urbi/preferencias,
// que deliberadamente não aceita mais essa permissão vinda do próprio usuário).
// ElevenLabs foi descartado em 02/09/2026 (custo por caractere imprevisível
// em texto longo) — só existe voz do navegador (custo zero) e os MP3
// pré-gravados estáticos, fora deste seletor.
const MODOS_AUDIO: { valor: "nenhum" | "navegador"; rotulo: string }[] = [
  { valor: "nenhum", rotulo: "Sem áudio" },
  { valor: "navegador", rotulo: "Áudio do navegador" },
];

// Catalogo de perfis exibidos no checkbox. "Administrador" e filtrado em runtime
// para nao aparecer a usuarios que nao sao admins (ITEM 2).
const PERFIS = [
  "Administrador",
  "Diretora",
  "Gerência GERECCO",
  "Gerência GERAED",
  "Gerência GERAGP",
  "Analista",
];
const PERFIS_GERENCIA = ["Gerência GERECCO", "Gerência GERAED", "Gerência GERAGP"];
const ADMIN_FIXO = "Fábio Parente Martins Santos";

const vazio = () => ({
  nome: "",
  email: "",
  matricula: "",
  telefone: "",
  cargo: "",
  cau_crea: "",
  perfis: ["Analista"] as string[],
  gerencia: "" as string, // "" | "GERECCO" | "GERAED" | "GERAGP" | "DIRAAP"
  status: "Ativo",
  reducao_meta: 0,
  urbi_ativo: false,
  urbi_modo_audio: "nenhum" as "nenhum" | "navegador",
});

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
  // Perfil do usuario logado — necessario para ocultar opcao "Administrador"
  // do checkbox e a mensagem do admin fixo aos nao-admins (ITEM 2).
  const [meuPerfis, setMeuPerfis] = useState<string[]>([]);
  const souAdmin = meuPerfis.includes("Administrador");

  async function carregar() {
    try {
      setCarregando(true);
      const res = await fetch("/api/admin/usuarios");
      const json = await res.json();
      if (json.ok) setUsuarios(json.data);
    } finally { setCarregando(false); }
  }

  async function carregarMeuPerfil() {
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (json.ok) {
        const perfis: string[] = Array.isArray(json.data?.perfis) && json.data.perfis.length > 0
          ? json.data.perfis
          : (json.data?.perfil ? [json.data.perfil] : []);
        setMeuPerfis(perfis);
      }
    } catch { /* mantem [] -> trata como nao-admin */ }
  }

  useEffect(() => { carregar(); carregarMeuPerfil(); }, []);

  function abrirNovo() { setEditando(null); setForm(vazio()); setSenha(""); setErro(""); setModal(true); }
  function abrirEditar(u: Usuario) {
    setEditando(u);
    const perfisIniciais = Array.isArray(u.perfis) && u.perfis.length > 0
      ? u.perfis
      : (u.perfil ? [u.perfil] : ["Analista"]);
    // gerencia: '' = analista DIRAAP direto (gerencia=null); 'GERECCO'/'GERAED'/'GERAGP' = analista de gerencia
    const gerenciaForm = u.gerencia ?? "";
    setForm({
      nome: u.nome,
      email: u.email,
      matricula: u.matricula,
      telefone: u.telefone,
      cargo: u.cargo,
      cau_crea: u.cau_crea ?? "",
      perfis: perfisIniciais,
      gerencia: gerenciaForm,
      status: u.status,
      reducao_meta: u.reducao_meta ?? 0,
      urbi_ativo: u.urbi_ativo ?? false,
      urbi_modo_audio: u.urbi_modo_audio ?? "nenhum",
    });
    setSenha(""); setErro(""); setModal(true);
  }

  function togglePerfil(p: string) {
    setForm((prev) => {
      const set = new Set(prev.perfis);
      if (set.has(p)) set.delete(p); else set.add(p);
      // Fábio fixo: nunca permite remover "Administrador".
      if (form.nome.trim() === ADMIN_FIXO) set.add("Administrador");
      return { ...prev, perfis: Array.from(set) };
    });
  }

  async function salvar() {
    if (!form.nome || !form.email) { setErro("Nome e email obrigatórios."); return; }
    if (!editando && !senha) { setErro("Senha obrigatória para novo usuário."); return; }
    try {
      setSalvando(true); setErro("");
      // Para analistas: gerencia "" = DIRAAP direto -> null no banco.
      // Para nao-analistas (sem 'Analista' no perfis): gerencia sempre null.
      const ehAnalista = form.perfis.includes("Analista");
      const gerenciaPayload = ehAnalista
        ? (form.gerencia && form.gerencia !== "DIRAAP" ? form.gerencia : null)
        : null;
      const res = await fetch("/api/admin/usuarios", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          gerencia: gerenciaPayload,
          senha: senha || undefined,
          id: editando?.id,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        // Mensagem amigavel para a constraint unica de gerencia (item 1).
        const erroStr = String(json.erro || "");
        const ehUnique23505 =
          json.code === "23505" ||
          /23505/.test(erroStr) ||
          /duplicate key|unique constraint/i.test(erroStr);
        const mencionaGerencia =
          /gerenc/i.test(erroStr) ||
          form.perfis.some((p) => PERFIS_GERENCIA.includes(p));
        if (ehUnique23505 && mencionaGerencia) {
          setErro("Já existe um gerente cadastrado para essa gerência.");
        } else {
          setErro(json.erro || "Erro ao salvar.");
        }
        return;
      }
      setModal(false); await carregar();
      window.dispatchEvent(new Event('urbi:refresh'));
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

  async function excluir(u: Usuario) {
    if (!confirm(`Excluir permanentemente "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch("/api/admin/usuarios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    const json = await res.json();
    if (json.ok) await carregar();
    else alert("❌ Erro: " + json.erro);
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

  const isAdminFixo = (u: Usuario) => u.perfil === "Administrador" && u.nome === ADMIN_FIXO;

  const corPerfil = (p: string) => {
    if (p === "Administrador") return "border border-purple-300 bg-purple-50 text-purple-700";
    if (p === "Diretora" || p === "Diretor") return "border border-red-300 bg-red-50 text-red-700";
    if (PERFIS_GERENCIA.includes(p)) return "border border-amber-300 bg-amber-50 text-amber-700";
    return "border border-blue-300 bg-blue-50 text-blue-700";
  };

  // Lista de perfis exibida no checkbox: oculta "Administrador" para nao-admins.
  const perfisVisiveis = PERFIS.filter((p) => p !== "Administrador" || souAdmin);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4 md:p-6 text-[var(--text-primary)]">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/configuracoes")} className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">⚙️ Configurações</button>
          <button onClick={() => router.push("/")} className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">🏠 Home</button>
          <div>
            <h1 className="text-2xl font-bold">👥 Gestão de Usuários</h1>
            <p className="text-[var(--text-muted)] text-sm">{filtrados.length} usuário{filtrados.length !== 1 ? "s" : ""} · Cadastro e controle de acesso ao URBIS</p>
          </div>
        </div>
        <button onClick={abrirNovo} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] px-4 py-2 rounded-lg text-sm font-bold transition-colors">+ Novo Usuário</button>
      </div>

      <div className="mb-4">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, email ou matrícula..."
          className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
      </div>

      {carregando ? <p className="text-[var(--text-muted)] text-sm">Carregando...</p> : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-xs uppercase tracking-wide">
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
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">Nenhum usuário encontrado.</td></tr>
              ) : filtrados.map((u) => (
                <tr key={u.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center text-xs font-bold uppercase">{(u.nome || "?").replace(/[^A-Za-zÀ-ú]/g, "").charAt(0)}</span>
                      <span>{u.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{u.matricula || "—"}</td>
                  <td className="px-4 py-3">
                    {(u.perfis && u.perfis.length > 0 ? u.perfis : [u.perfil]).map((p, i) => (<span key={i} className={`px-2 py-0.5 rounded text-xs font-bold mr-1 ${corPerfil(p)}`}>{p}</span>))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${u.status === "Ativo" ? "border-green-300 bg-green-50 text-green-700" : "border-gray-300 bg-gray-50 text-gray-500"}`}><span className={`w-1.5 h-1.5 rounded-full ${u.status === "Ativo" ? "bg-green-500" : "bg-gray-400"}`}></span>{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{formatar(u.ultimo_acesso)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => abrirEditar(u)} className="border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors">✏️ Editar</button>
                      <button onClick={() => resetarSenha(u.id, u.email)} className="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors">🔑 Senha</button>
                      {!isAdminFixo(u) && (
                        <button onClick={() => excluir(u)} className="border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors">🗑️ Excluir</button>
                      )}
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
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">{editando ? "Editar Usuário" : "Novo Usuário"}</h2>
              <button onClick={() => setModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {([ ["nome","Nome completo","text"],["email","Email","email"], ["matricula","Matrícula","text"], ["telefone","Telefone","text"], ["cargo","Cargo","text"], ["cau_crea","CAU / CREA","text"] ] as [string,string,string][]).map(([campo, label, tipo]) => (
                <div key={campo} className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">{label}</label>
                  <input type={tipo} value={(form as any)[campo]} onChange={(e) => f(campo, e.target.value)}
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Perfis</label>
                <div className="flex flex-wrap gap-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2">
                  {perfisVisiveis.map((p) => {
                    const marcado = form.perfis.includes(p);
                    const ehAdminFixoBloqueado = p === "Administrador" && form.nome.trim() === ADMIN_FIXO;
                    return (
                      <label key={p} className="flex items-center gap-1.5 text-sm text-[var(--text-primary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={ehAdminFixoBloqueado}
                          onChange={() => togglePerfil(p)}
                          className="accent-blue-500"
                        />
                        <span>{p}</span>
                      </label>
                    );
                  })}
                </div>
                {souAdmin && form.nome.trim() === ADMIN_FIXO && (
                  <p className="text-xs text-[var(--text-muted)] italic">O perfil <b>Administrador</b> é fixo para {ADMIN_FIXO}.</p>
                )}
              </div>
              {/* Select de Gerencia — exibido somente para analistas. */}
              {form.perfis.includes("Analista") && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Gerência</label>
                  <select
                    value={form.gerencia || "DIRAAP"}
                    onChange={(e) => f("gerencia", e.target.value === "DIRAAP" ? "" : e.target.value)}
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    <option value="GERECCO">GERECCO</option>
                    <option value="GERAED">GERAED</option>
                    <option value="GERAGP">GERAGP</option>
                    <option value="DIRAAP">DIRAAP (direto)</option>
                  </select>
                </div>
              )}
              {form.perfis.includes("Analista") && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Redução de meta (%)</label>
                  <input type="number" min="0" max="100" step="5"
                    value={(form as any).reducao_meta ?? 0}
                    onChange={(e) => f("reducao_meta", e.target.value as any)}
                    placeholder="0 = sem redução, 50 = meta pela metade"
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-muted)]">Meta efetiva: {Math.round(100 * (1 - ((form as any).reducao_meta ?? 0) / 100))} pts/mês</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Status</label>
                <select value={form.status} onChange={(e) => f("status", e.target.value)}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>
              <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-[var(--text-primary)] font-semibold">🤖 URBI — Assistente IA</p>
                  <p className="text-xs text-[var(--text-muted)]">Habilita o robozinho URBI para este usuário</p>
                </div>
                <button
                  type="button"
                  onClick={() => f("urbi_ativo", !(form as any).urbi_ativo as any)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${(form as any).urbi_ativo ? "bg-[var(--accent)]" : "bg-slate-500"}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${(form as any).urbi_ativo ? "left-7" : "left-1"}`} />
                </button>
              </div>
              {form.urbi_ativo && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Modo de áudio do URBI</label>
                  <select value={form.urbi_modo_audio} onChange={(e) => f("urbi_modo_audio", e.target.value as any)}
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                    {MODOS_AUDIO.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                  </select>
                  <span className="text-xs text-[var(--text-muted)]">
                    Decisão do administrador — inclusive para o próprio Administrador. O usuário não vê essa opção nem sabe que existe áudio quando está em "Sem áudio".
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">{editando ? "Nova senha (deixe vazio para manter)" : "Senha"}</label>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                  placeholder={editando ? "••••••••" : "Mínimo 6 caracteres"}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
            </div>
            {erro && <div className="bg-red-900 border border-red-600 text-red-200 text-xs px-3 py-2 rounded-lg mt-4">❌ {erro}</div>}
            <div className="flex gap-3 mt-6">
              <button onClick={salvar} disabled={salvando}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {salvando ? "Salvando..." : editando ? "💾 Salvar alterações" : "✅ Cadastrar"}
              </button>
              <button onClick={() => setModal(false)} className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
