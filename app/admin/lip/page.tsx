"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Campo = {
  id: string;
  aba_id: string;
  chave: string;
  label: string;
  tipo: string;
  opcoes: string[] | null;
  placeholder: string;
  valor_padrao: string;
  ordem: number;
  ativo: boolean;
};

type Aba = {
  id: string;
  nome: string;
  dica: string;
  ordem: number;
  ativo: boolean;
  assunto_id: string | null;
  lip_campos: Campo[];
};

type Assunto = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  ordem: number;
};

const SLUG_REGULARIZACAO = "regularizacao";

export default function AdminLipPage() {
  const router = useRouter();
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [assuntoId, setAssuntoId] = useState<string>("");
  const [abas, setAbas] = useState<Aba[]>([]);
  const [abaSelecionada, setAbaSelecionada] = useState<Aba | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [clonando, setClonando] = useState(false);
  const [toast, setToast] = useState("");

  const [modalCampo, setModalCampo] = useState(false);
  const [editandoCampo, setEditandoCampo] = useState<Campo | null>(null);
  const [formCampo, setFormCampo] = useState({ chave: "", label: "", tipo: "texto", opcoes: "", placeholder: "", valor_padrao: "" });

  const [modalAba, setModalAba] = useState(false);
  const [editandoAba, setEditandoAba] = useState<Aba | null>(null);
  const [formAba, setFormAba] = useState({ nome: "", dica: "" });

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function carregar(idAssunto?: string) {
    // Sessão 4: o GET agora filtra por assunto_id. Se nenhum assunto está
    // selecionado ainda (carga inicial antes de resolver o dropdown),
    // mantém abas vazias para evitar mostrar a lista global.
    const alvo = idAssunto ?? assuntoId;
    if (!alvo) {
      setAbas([]);
      setAbaSelecionada(null);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const res = await fetch(`/api/admin/lip?assunto_id=${encodeURIComponent(alvo)}`);
    const json = await res.json();
    if (json.ok) {
      setAbas(json.data);
      if (json.data.length > 0) {
        setAbaSelecionada((prev) => {
          const atualizada = json.data.find((a: Aba) => a.id === prev?.id);
          return atualizada ?? json.data[0];
        });
      } else {
        setAbaSelecionada(null);
      }
    }
    setCarregando(false);
  }

  // Carga inicial: busca assuntos ativos e seleciona Regularização por padrão.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/assuntos");
        const json = await res.json();
        if (!json.ok || !Array.isArray(json.data)) {
          setCarregando(false);
          return;
        }
        const ativos: Assunto[] = json.data.filter((a: any) => a?.ativo === true);
        setAssuntos(ativos);
        const reg = ativos.find((a) => a.slug === SLUG_REGULARIZACAO);
        const escolhido = reg ?? ativos[0];
        if (escolhido) {
          setAssuntoId(escolhido.id);
          await carregar(escolhido.id);
        } else {
          setCarregando(false);
        }
      } catch {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function trocarAssunto(novoId: string) {
    setAssuntoId(novoId);
    setAbaSelecionada(null);
    await carregar(novoId);
  }

  async function clonarDeRegularizacao() {
    const reg = assuntos.find((a) => a.slug === SLUG_REGULARIZACAO);
    if (!reg) {
      mostrarToast("Assunto Regularização não encontrado.");
      return;
    }
    if (reg.id === assuntoId) return;
    if (!confirm(`Clonar todas as abas e campos de "Regularização" para "${assuntos.find((a) => a.id === assuntoId)?.nome}"?`)) return;
    setClonando(true);
    try {
      const res = await fetch("/api/admin/lip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "clonar", origem_assunto_id: reg.id, destino_assunto_id: assuntoId }),
      });
      const json = await res.json();
      if (!json.ok) {
        mostrarToast(`Erro ao clonar: ${json.erro}`);
        return;
      }
      mostrarToast(`✅ Clonado: ${json.data.abasClonadas} abas, ${json.data.camposClonados} campos.`);
      await carregar();
    } finally {
      setClonando(false);
    }
  }

  function abrirNovaAba() {
    setEditandoAba(null);
    setFormAba({ nome: "", dica: "" });
    setModalAba(true);
  }

  function abrirEditarAba(aba: Aba) {
    setEditandoAba(aba);
    setFormAba({ nome: aba.nome, dica: aba.dica });
    setModalAba(true);
  }

  async function salvarAba() {
    if (!formAba.nome.trim()) return;
    if (editandoAba) {
      await fetch("/api/admin/lip", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "aba", id: editandoAba.id, ...formAba }),
      });
      mostrarToast("Aba atualizada!");
    } else {
      if (!assuntoId) { mostrarToast("Selecione um assunto antes de criar uma aba."); return; }
      await fetch("/api/admin/lip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "aba", assunto_id: assuntoId, ...formAba }),
      });
      mostrarToast("Aba criada!");
    }
    setModalAba(false);
    await carregar();
  }

  async function excluirAba(aba: Aba) {
    if (!confirm(`Excluir a aba "${aba.nome}" e todos os seus campos?`)) return;
    await fetch("/api/admin/lip", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "aba", id: aba.id }),
    });
    mostrarToast("Aba excluída!");
    await carregar();
  }

  async function moverAba(aba: Aba, direcao: "cima" | "baixo") {
    const idx = abas.findIndex((a) => a.id === aba.id);
    const outro = direcao === "cima" ? abas[idx - 1] : abas[idx + 1];
    if (!outro) return;
    await fetch("/api/admin/lip", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "ordem_aba", id: aba.id, ordem: outro.ordem }),
    });
    await fetch("/api/admin/lip", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "ordem_aba", id: outro.id, ordem: aba.ordem }),
    });
    await carregar();
  }

  function abrirNovoCampo() {
    setEditandoCampo(null);
    setFormCampo({ chave: "", label: "", tipo: "texto", opcoes: "", placeholder: "", valor_padrao: "" });
    setModalCampo(true);
  }

  function abrirEditarCampo(campo: Campo) {
    setEditandoCampo(campo);
    setFormCampo({
      chave: campo.chave,
      label: campo.label,
      tipo: campo.tipo,
      opcoes: campo.opcoes ? campo.opcoes.join(", ") : "",
      placeholder: campo.placeholder || "",
      valor_padrao: campo.valor_padrao || "",
    });
    setModalCampo(true);
  }

  async function salvarCampo() {
    if (!formCampo.label.trim()) return;
    const opcoes = formCampo.opcoes.trim()
      ? formCampo.opcoes.split(",").map((o) => o.trim()).filter(Boolean)
      : null;

    if (editandoCampo) {
      await fetch("/api/admin/lip", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "campo", id: editandoCampo.id, label: formCampo.label, tipo_campo: formCampo.tipo, opcoes, placeholder: formCampo.placeholder, valor_padrao: formCampo.valor_padrao }),
      });
      mostrarToast("Campo atualizado!");
    } else {
      const chave = formCampo.chave.trim() || formCampo.label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      await fetch("/api/admin/lip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "campo", aba_id: abaSelecionada!.id, chave, label: formCampo.label, tipo_campo: formCampo.tipo, opcoes, placeholder: formCampo.placeholder, valor_padrao: formCampo.valor_padrao }),
      });
      mostrarToast("Campo criado!");
    }
    setModalCampo(false);
    await carregar();
  }

  async function excluirCampo(campo: Campo) {
    if (!confirm(`Excluir o campo "${campo.label}"?`)) return;
    await fetch("/api/admin/lip", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "campo", id: campo.id }),
    });
    mostrarToast("Campo excluído!");
    await carregar();
  }

  async function moverCampo(campo: Campo, direcao: "cima" | "baixo") {
    const campos = abaSelecionada!.lip_campos.sort((a, b) => a.ordem - b.ordem);
    const idx = campos.findIndex((c) => c.id === campo.id);
    const outro = direcao === "cima" ? campos[idx - 1] : campos[idx + 1];
    if (!outro) return;
    await fetch("/api/admin/lip", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "ordem_campo", id: campo.id, ordem: outro.ordem }),
    });
    await fetch("/api/admin/lip", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "ordem_campo", id: outro.id, ordem: campo.ordem }),
    });
    await carregar();
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] px-5 py-3 rounded-xl shadow-2xl text-sm">
          {toast}
        </div>
      )}

      {/* MODAL ABA */}
      {modalAba && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">{editandoAba ? "✏️ Editar Aba" : "➕ Nova Aba"}</h2>
              <button onClick={() => setModalAba(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Nome da aba</label>
                <input value={formAba.nome} onChange={(e) => setFormAba((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: 1. Identificação"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Dica para o analista (opcional)</label>
                <input value={formAba.dica} onChange={(e) => setFormAba((p) => ({ ...p, dica: e.target.value }))}
                  placeholder="Ex: Ver no carimbo do projeto"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={salvarAba} disabled={!formAba.nome.trim()}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {editandoAba ? "Salvar alterações" : "Criar aba"}
              </button>
              <button onClick={() => setModalAba(false)}
                className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMPO */}
      {modalCampo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">{editandoCampo ? "✏️ Editar Campo" : "➕ Novo Campo"}</h2>
              <button onClick={() => setModalCampo(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              {!editandoCampo && (
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">
                    Identificador interno <span className="text-[var(--text-muted)] font-normal normal-case">(deixe vazio para gerar automaticamente)</span>
                  </label>
                  <input value={formCampo.chave} onChange={(e) => setFormCampo((p) => ({ ...p, chave: e.target.value }))}
                    placeholder="Ex: nomeProprietario"
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                </div>
              )}
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Descrição do campo</label>
                <input value={formCampo.label} onChange={(e) => setFormCampo((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Ex: Nome do Proprietário"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Tipo de campo</label>
                <select value={formCampo.tipo} onChange={(e) => setFormCampo((p) => ({ ...p, tipo: e.target.value }))}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="texto">Texto livre</option>
                  <option value="select">Lista de opções</option>
                </select>
              </div>
              {formCampo.tipo === "select" && (
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">
                    Opções <span className="text-[var(--text-muted)] font-normal normal-case">(separe por vírgula — ex: Sim, Não)</span>
                  </label>
                  <input value={formCampo.opcoes} onChange={(e) => setFormCampo((p) => ({ ...p, opcoes: e.target.value }))}
                    placeholder="Ex: Sim, Não, NP"
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                </div>
              )}
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Como preencher</label>
                <input value={formCampo.placeholder} onChange={(e) => setFormCampo((p) => ({ ...p, placeholder: e.target.value }))}
                  placeholder="Ex: Ver no carimbo do projeto"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Valor padrão</label>
                <input value={formCampo.valor_padrao} onChange={(e) => setFormCampo((p) => ({ ...p, valor_padrao: e.target.value }))}
                  placeholder="Ex: NP ou Não"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={salvarCampo} disabled={!formCampo.label.trim()}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {editandoCampo ? "Salvar alterações" : "Criar campo"}
              </button>
              <button onClick={() => setModalCampo(false)}
                className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← Home
            </button>
            <div>
              <h1 className="text-xl font-bold">🏗️ Gerenciar Campos do LIP</h1>
              <p className="text-[var(--text-muted)] text-sm">Abas e campos do LIP - Leitura Inteligente de Processo</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide">Assunto</label>
              <select
                value={assuntoId}
                onChange={(e) => trocarAssunto(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] min-w-[200px]">
                {assuntos.length === 0 ? (
                  <option value="">Carregando...</option>
                ) : (
                  assuntos.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))
                )}
              </select>
            </div>
            {assuntoId &&
             assuntos.find((a) => a.id === assuntoId)?.slug !== SLUG_REGULARIZACAO &&
             abas.length === 0 && !carregando && (
              <button onClick={clonarDeRegularizacao} disabled={clonando}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                {clonando ? "⏳ Clonando..." : "📋 Clonar de Regularização"}
              </button>
            )}
            <button onClick={abrirNovaAba} disabled={!assuntoId}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
              + Nova Aba
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-64 bg-[var(--surface)] border-r border-[var(--border)] p-4 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-2">Abas do LIP</p>
          {abas.map((aba, idx) => (
            <div key={aba.id}
              className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                abaSelecionada?.id === aba.id ? "bg-[var(--accent)] border-[var(--accent-hover)]" : "bg-[var(--bg-secondary)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
              }`}
              onClick={() => setAbaSelecionada(aba)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{aba.nome}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{aba.lip_campos.length} campos</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); moverAba(aba, "cima"); }} disabled={idx === 0}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 text-xs leading-none">▲</button>
                  <button onClick={(e) => { e.stopPropagation(); moverAba(aba, "baixo"); }} disabled={idx === abas.length - 1}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={(e) => { e.stopPropagation(); abrirEditarAba(aba); }}
                  className="text-[var(--text-muted)] hover:text-blue-400 text-xs transition-colors">✏️ Editar</button>
                <button onClick={(e) => { e.stopPropagation(); excluirAba(aba); }}
                  className="text-[var(--text-muted)] hover:text-red-400 text-xs transition-colors">🗑 Excluir</button>
              </div>
            </div>
          ))}
        </div>

        {/* CONTEÚDO */}
        <div className="flex-1 overflow-y-auto p-6">
          {abaSelecionada ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold">{abaSelecionada.nome}</h2>
                  {abaSelecionada.dica && (
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">💡 {abaSelecionada.dica}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1">{abaSelecionada.lip_campos.length} campos</p>
                </div>
                <button onClick={abrirNovoCampo}
                  className="bg-[var(--success)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                  + Novo Campo
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {abaSelecionada.lip_campos.sort((a, b) => a.ordem - b.ordem).map((campo, idx) => (
                  <div key={campo.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3">
                    <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                      <button onClick={() => moverCampo(campo, "cima")} disabled={idx === 0}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 text-xs leading-none">▲</button>
                      <button onClick={() => moverCampo(campo, "baixo")} disabled={idx === abaSelecionada.lip_campos.length - 1}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 text-xs leading-none">▼</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{campo.label}</p>
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${campo.tipo === "select" ? "bg-[var(--ia-bg)] text-[var(--accent-fg)]" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                          {campo.tipo === "select" ? "Lista de opções" : "Texto livre"}
                        </span>
                        {campo.valor_padrao && (
                          <span className="text-xs text-orange-400">padrão: {campo.valor_padrao}</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">identificador: <span className="font-mono text-[var(--text-muted)]">{campo.chave}</span></p>
                      {campo.opcoes && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">opções: {campo.opcoes.join(", ")}</p>
                      )}
                      {campo.placeholder && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">ajuda: {campo.placeholder}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => abrirEditarCampo(campo)}
                        className="text-[var(--text-muted)] hover:text-blue-400 text-xs transition-colors">✏️</button>
                      <button onClick={() => excluirCampo(campo)}
                        className="text-[var(--text-muted)] hover:text-red-400 text-xs transition-colors">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[var(--text-muted)]">
                {abas.length === 0
                  ? assuntos.find((a) => a.id === assuntoId)?.slug === SLUG_REGULARIZACAO
                    ? "Crie uma nova aba para começar."
                    : "Este assunto ainda não tem abas. Clone de Regularização ou crie uma nova."
                  : "Selecione uma aba para gerenciar os campos"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}