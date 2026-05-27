"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Check, Loader2, Lock, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

type Assunto = { id: string; slug: string; nome: string; ativo: boolean; ordem: number; criado_em: string; };
type LogRow = { id?: string; bairro: string; nome_logradouro: string; hierarquia_viaria?: string; largura_via?: string; larg_calcada?: string; largura_pista?: string; largura_ilha?: string; area?: string; };
const LOG_VAZIO: LogRow = { bairro: "", nome_logradouro: "", hierarquia_viaria: "", largura_via: "", larg_calcada: "", largura_pista: "", largura_ilha: "", area: "" };
const SLUG_FIXO = "regularizacao";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState<Record<string, { nome: string; ativo: boolean }>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [sucessoId, setSucessoId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [abaAtual, setAbaAtual] = useState<"geral" | "logradouros">("geral");
  const [logFiltro, setLogFiltro] = useState("");
  const [logData, setLogData] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logCarregando, setLogCarregando] = useState(false);
  const [logForm, setLogForm] = useState<LogRow>(LOG_VAZIO);
  const [logModal, setLogModal] = useState(false);
  const [logSalvando, setLogSalvando] = useState(false);
  const [logErro, setLogErro] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(j => {
      if (j.ok && Array.isArray(j.data?.perfis)) setIsAdmin(j.data.perfis.includes("Administrador"));
    });
  }, []);

  async function carregar() {
    try { setCarregando(true); setErro("");
      const res = await fetch("/api/admin/assuntos"); const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Falha ao carregar assuntos."); return; }
      const lista: Assunto[] = json.data || [];
      setAssuntos(lista);
      const ed: Record<string, { nome: string; ativo: boolean }> = {};
      for (const a of lista) ed[a.id] = { nome: a.nome, ativo: a.ativo };
      setEdicao(ed);
    } catch (e: any) { setErro(e?.message || "Erro inesperado."); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  function atualizarLinha(id: string, patch: Partial<{ nome: string; ativo: boolean }>) {
    setEdicao((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    if (sucessoId === id) setSucessoId(null);
  }
  async function salvar(a: Assunto) {
    const valores = edicao[a.id]; if (!valores) return;
    const nome = valores.nome.trim();
    if (!nome) { setErro(`Nome do slot ${a.ordem} vazio.`); return; }
    try { setSalvandoId(a.id); setErro("");
      const res = await fetch("/api/admin/assuntos", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, nome, ativo: valores.ativo }) });
      const json = await res.json();
      if (!json.ok) { setErro(json.erro || "Falha ao salvar."); return; }
      const atualizado: Assunto = json.data;
      setAssuntos((prev) => prev.map((x) => (x.id === a.id ? atualizado : x)));
      setEdicao((prev) => ({ ...prev, [a.id]: { nome: atualizado.nome, ativo: atualizado.ativo } }));
      setSucessoId(a.id); setTimeout(() => setSucessoId((cur) => (cur === a.id ? null : cur)), 2500);
    } catch (e: any) { setErro(e?.message || "Erro inesperado."); } finally { setSalvandoId(null); }
  }
  function linhaSofreuMudanca(a: Assunto): boolean {
    const v = edicao[a.id]; if (!v) return false;
    return v.nome.trim() !== a.nome || v.ativo !== a.ativo;
  }

  async function carregarLog(filtro = logFiltro, page = 0) {
    setLogCarregando(true);
    const r = await fetch(`/api/logradouros?filtro=${encodeURIComponent(filtro)}&page=${page}`);
    const j = await r.json();
    setLogData(j.data || []); setLogTotal(j.total ?? 0); setLogPage(page);
    setLogCarregando(false);
  }
  async function salvarLog() {
    if (!logForm.bairro.trim() || !logForm.nome_logradouro.trim()) { setLogErro("Bairro e logradouro obrigatórios."); return; }
    setLogSalvando(true); setLogErro("");
    const r = await fetch("/api/logradouros", { method: logForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logForm) });
    const j = await r.json(); setLogSalvando(false);
    if (!j.ok) { setLogErro(j.erro || "Erro ao salvar"); return; }
    setLogModal(false); setLogForm(LOG_VAZIO); carregarLog(logFiltro, logPage);
  }
  async function deletarLog(id: string) {
    if (!confirm("Remover este logradouro?")) return;
    await fetch(`/api/logradouros?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    carregarLog(logFiltro, logPage);
  }
  function abrirNovo() { setLogForm(LOG_VAZIO); setLogErro(""); setLogModal(true); }
  function abrirEditar(row: LogRow) { setLogForm({ ...row }); setLogErro(""); setLogModal(true); }
  useEffect(() => { if (abaAtual === "logradouros") carregarLog("", 0); }, [abaAtual]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")} className="text-slate-400 hover:text-white text-sm">← Início</button>
        <h1 className="text-xl font-semibold inline-flex items-center gap-2"><Settings2 size={20} /> Configurações</h1>
        <div className="flex gap-1 ml-6">
          <button onClick={() => setAbaAtual("geral")} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${abaAtual === "geral" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>⚙️ Geral</button>
          {isAdmin && <button onClick={() => setAbaAtual("logradouros")} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${abaAtual === "logradouros" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>📍 Logradouros</button>}
          {isAdmin && <button onClick={() => router.push("/admin/usuarios")} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-white hover:bg-slate-800">👤 Usuários</button>}
        </div>
      </header>

      <main className="p-8 max-w-5xl mx-auto">

        {abaAtual === "geral" && (<>
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white">Aparência</h2>
            <p className="text-sm text-slate-400 mt-1 mb-4">Tema visual do sistema. Preferência salva por navegador.</p>
            <div className="flex gap-3">
              <button onClick={() => setTheme("light")} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${theme === "light" ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"}`}><Sun size={16} /> Claro</button>
              <button onClick={() => setTheme("dark")} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${theme === "dark" ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"}`}><Moon size={16} /> Escuro</button>
            </div>
          </div>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Assuntos</h2>
            <p className="text-sm text-slate-400 mt-1">Configure os 15 trilhos de processo do sistema. Regularização é fixa e sempre ativa.</p>
          </div>
          {erro && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{erro}</div>}
          {carregando ? (<div className="text-slate-400 text-sm inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando assuntos…</div>) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <div className="grid grid-cols-[60px_1fr_140px_140px] gap-3 px-4 py-3 text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
                <div>Ordem</div><div>Nome</div><div className="text-center">Ativo</div><div className="text-right pr-2">Ação</div>
              </div>
              {assuntos.map((a) => {
                const fixo = a.slug === SLUG_FIXO;
                const v = edicao[a.id] ?? { nome: a.nome, ativo: a.ativo };
                const podeSalvar = !fixo && linhaSofreuMudanca(a) && !salvandoId;
                return (
                  <div key={a.id} className="grid grid-cols-[60px_1fr_140px_140px] gap-3 px-4 py-3 items-center border-b border-slate-800 last:border-b-0">
                    <div className="text-slate-500 text-sm">{a.ordem}</div>
                    <div className="min-w-0">
                      {fixo ? (<div className="inline-flex items-center gap-2 text-white font-medium"><Lock size={14} className="text-slate-500" />{a.nome}<span className="text-xs text-slate-500 font-normal">(fixo)</span></div>
                      ) : (<input type="text" value={v.nome} onChange={(e) => atualizarLinha(a.id, { nome: e.target.value })} placeholder={`Slot ${String(a.ordem).padStart(2, "0")}`} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" maxLength={80} />)}
                      <div className="text-xs text-slate-500 mt-1 font-mono">{a.slug}</div>
                    </div>
                    <div className="flex justify-center">
                      {fixo ? (<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-900/40 text-emerald-300 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ativo</span>
                      ) : (<button type="button" role="switch" aria-checked={v.ativo} onClick={() => atualizarLinha(a.id, { ativo: !v.ativo })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${v.ativo ? "bg-blue-600" : "bg-slate-700"}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${v.ativo ? "translate-x-6" : "translate-x-1"}`} /></button>)}
                    </div>
                    <div className="flex justify-end pr-2">
                      {fixo ? (<span className="text-xs text-slate-600">—</span>
                      ) : sucessoId === a.id ? (<span className="inline-flex items-center gap-1 text-xs text-emerald-400"><Check size={14} /> Salvo</span>
                      ) : (<button type="button" onClick={() => salvar(a)} disabled={!podeSalvar} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${podeSalvar ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 text-slate-500 cursor-not-allowed"}`}>{salvandoId === a.id ? <><Loader2 size={12} className="animate-spin" /> Salvando</> : "Salvar"}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {abaAtual === "logradouros" && (<>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Logradouros</h2>
              <p className="text-sm text-slate-400 mt-1">Cadastro de vias utilizado nos processos. {logTotal > 0 && <span className="text-slate-500">{logTotal} registros.</span>}</p>
            </div>
            <button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-sm">+ Novo</button>
          </div>
          <div className="flex gap-3 mb-4">
            <input value={logFiltro} onChange={e => setLogFiltro(e.target.value)} onKeyDown={e => e.key === "Enter" && carregarLog(logFiltro, 0)} placeholder="Filtrar por bairro ou logradouro..." className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => carregarLog(logFiltro, 0)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm">Buscar</button>
          </div>
          {logCarregando ? (<div className="text-slate-400 text-sm inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando…</div>) : (<>
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3 text-left">Bairro</th><th className="px-3 py-3 text-left">Logradouro</th>
                  <th className="px-3 py-3 text-center">Hierarquia</th><th className="px-3 py-3 text-center">L.Via</th>
                  <th className="px-3 py-3 text-center">L.Calç</th><th className="px-3 py-3 text-center">L.Pista</th>
                  <th className="px-3 py-3 text-center">Área</th><th className="px-3 py-3 text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {logData.length === 0 ? (<tr><td colSpan={8} className="text-center text-slate-500 py-8">Nenhum registro. Clique em Buscar ou + Novo.</td></tr>
                  ) : logData.map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-300">{row.bairro}</td>
                      <td className="px-3 py-2 text-white font-medium">{row.nome_logradouro}</td>
                      <td className="px-3 py-2 text-center text-slate-400">{row.hierarquia_viaria || "—"}</td>
                      <td className="px-3 py-2 text-center text-slate-400">{row.largura_via ? `${row.largura_via}m` : "—"}</td>
                      <td className="px-3 py-2 text-center text-slate-400">{row.larg_calcada ? `${row.larg_calcada}m` : "—"}</td>
                      <td className="px-3 py-2 text-center text-slate-400">{row.largura_pista ? `${row.largura_pista}m` : "—"}</td>
                      <td className="px-3 py-2 text-center text-slate-400">{row.area ? `${row.area}m²` : "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => abrirEditar(row)} className="text-blue-400 hover:text-blue-300 text-xs mr-3">✏️ Editar</button>
                        <button onClick={() => row.id && deletarLog(row.id)} className="text-red-400 hover:text-red-300 text-xs">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logTotal > 30 && (
              <div className="flex items-center gap-3 mt-4 text-sm">
                <button disabled={logPage === 0} onClick={() => carregarLog(logFiltro, logPage - 1)} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">← Anterior</button>
                <span className="text-slate-400">Página {logPage + 1} de {Math.ceil(logTotal / 30)}</span>
                <button disabled={(logPage + 1) * 30 >= logTotal} onClick={() => carregarLog(logFiltro, logPage + 1)} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">Próxima →</button>
              </div>
            )}
          </>)}
          {logModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-white font-bold text-lg">{logForm.id ? "✏️ Editar" : "➕ Novo Logradouro"}</h2>
                  <button onClick={() => setLogModal(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
                </div>
                {logErro && <div className="mb-3 text-sm text-red-300 bg-red-900/40 border border-red-800 rounded p-2">{logErro}</div>}
                <div className="grid grid-cols-2 gap-3">
                  {([["Bairro *","bairro","text"],["Logradouro *","nome_logradouro","text"],["Hierarquia","hierarquia_viaria","text"],["Largura da Via (m)","largura_via","number"],["Larg. Calçada (m)","larg_calcada","number"],["Largura Pista (m)","largura_pista","number"],["Largura Ilha (m)","largura_ilha","number"],["Área (m²)","area","number"]] as [string, keyof LogRow, string][]).map(([label, key, type]) => (
                    <div key={key} className={key === "bairro" || key === "nome_logradouro" ? "col-span-2" : ""}>
                      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                      <input type={type} value={(logForm[key] as string) || ""} onChange={e => setLogForm(f => ({ ...f, [key]: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={salvarLog} disabled={logSalvando} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm">{logSalvando ? "Salvando..." : "💾 Salvar"}</button>
                  <button onClick={() => setLogModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2.5 rounded-lg text-sm">Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </>)}

      </main>
    </div>
  );
}
