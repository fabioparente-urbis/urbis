"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuditoria } from "@/hooks/useAuditoria";

type Padrao = {
  id: string;
  assunto_id: string;
  modulo: "LIP" | "MAC";
  tipo_despacho: "interno" | "externo";
  titulo: string;
  corpo: string;
  destinatario_padrao: string | null;
  criado_em: string;
};

type AssuntoOpcao = { id: string; slug: string; nome: string };

const DESTINOS_FIXOS = ["GERECCO", "GERAED", "GERAGP", "DIRAAP"];

// Só os slots que hoje têm tela de Despacho Interno/Externo — os outros 12
// "trilhos" configuráveis em Assuntos não têm modal nenhum pra consumir um
// padrão, então não fazem sentido aqui. Nomes: rótulo curto do seletor, o
// nome de exibição de verdade vem de `assuntos.nome` (admin pode renomear).
const SLOTS_COM_DESPACHO = [
  { slug: "regularizacao", rotulo: "Slot 1 — Regularização SEI" },
  { slug: "aceite_sei", rotulo: "Slot 2 — Aceite SEI" },
  { slug: "slot_05", rotulo: "Slot 5 — Aprovação de Projeto" },
];

export default function DespachoPadroesPage() {
  const router = useRouter();
  const { registrar } = useAuditoria();

  const [assuntos, setAssuntos] = useState<AssuntoOpcao[]>([]);
  const [assuntoId, setAssuntoId] = useState("");
  const [modulo, setModulo] = useState<"LIP" | "MAC" | "">("");
  const [tipoDespacho, setTipoDespacho] = useState<"interno" | "externo" | "">("");

  const [padroes, setPadroes] = useState<Padrao[]>([]);
  const [padraoAtual, setPadraoAtual] = useState<Padrao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [toast, setToast] = useState("");

  const [modalPadrao, setModalPadrao] = useState(false);
  const [editandoPadrao, setEditandoPadrao] = useState<Padrao | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoCorpo, setNovoCorpo] = useState("");
  const [novoDestino, setNovoDestino] = useState("");
  const [novoDestinoCustom, setNovoDestinoCustom] = useState("");

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    fetch("/api/admin/assuntos").then(r => r.json()).then(json => {
      if (!json.ok) return;
      const porSlug = new Map<string, any>(json.data.map((a: any) => [a.slug, a]));
      setAssuntos(
        SLOTS_COM_DESPACHO
          .map(s => { const a = porSlug.get(s.slug); return a ? { id: a.id, slug: s.slug, nome: a.nome || s.rotulo } : null; })
          .filter((a): a is AssuntoOpcao => a !== null),
      );
    }).catch(() => {});
  }, []);

  async function carregarPadroes() {
    if (!assuntoId || !modulo || !tipoDespacho) return;
    setCarregando(true);
    setPadraoAtual(null);
    const res = await fetch(`/api/despacho-padroes?assunto_id=${assuntoId}&modulo=${modulo}&tipo_despacho=${tipoDespacho}`);
    const json = await res.json();
    if (json.ok) setPadroes(json.data);
    setCarregando(false);
  }

  useEffect(() => { carregarPadroes(); }, [assuntoId, modulo, tipoDespacho]);

  function trocarBucket() {
    setAssuntoId(""); setModulo(""); setTipoDespacho("");
    setPadroes([]); setPadraoAtual(null);
  }

  function abrirNovoPadrao() {
    setEditandoPadrao(null);
    setNovoTitulo("");
    setNovoCorpo("");
    setNovoDestino("");
    setNovoDestinoCustom("");
    setModalPadrao(true);
  }

  function abrirEditarPadrao(p: Padrao) {
    setEditandoPadrao(p);
    setNovoTitulo(p.titulo);
    setNovoCorpo(p.corpo);
    const fixo = p.destinatario_padrao && DESTINOS_FIXOS.includes(p.destinatario_padrao);
    setNovoDestino(fixo ? p.destinatario_padrao! : (p.destinatario_padrao ? "outro" : ""));
    setNovoDestinoCustom(fixo ? "" : (p.destinatario_padrao || ""));
    setModalPadrao(true);
  }

  function fecharModalPadrao() {
    setModalPadrao(false);
    setEditandoPadrao(null);
  }

  async function salvarPadrao() {
    if (!novoTitulo.trim() || !novoCorpo.trim()) return;
    const destinatario_padrao = tipoDespacho === "interno"
      ? (novoDestino === "outro" ? novoDestinoCustom.trim() || null : novoDestino || null)
      : null;

    if (editandoPadrao) {
      const res = await fetch("/api/despacho-padroes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoPadrao.id, titulo: novoTitulo, corpo: novoCorpo, destinatario_padrao }),
      });
      const json = await res.json();
      if (json.ok) {
        mostrarToast("Padrão atualizado!");
        registrar({ modulo: "DESPACHO", acao: "PADRAO_DESPACHO_EDITADO", assunto_id: assuntoId, detalhe: { padrao_id: editandoPadrao.id, titulo: novoTitulo, modulo, tipo_despacho: tipoDespacho } });
        await carregarPadroes();
        fecharModalPadrao();
      } else {
        // Mantém o modal aberto com o texto digitado — um erro (sessão
        // expirada, validação) não pode fazer o analista perder o que escreveu.
        mostrarToast(`Erro: ${json.erro || "não foi possível salvar"}`);
      }
    } else {
      const res = await fetch("/api/despacho-padroes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assunto_id: assuntoId, modulo, tipo_despacho: tipoDespacho,
          titulo: novoTitulo, corpo: novoCorpo, destinatario_padrao,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        mostrarToast("Padrão criado!");
        registrar({ modulo: "DESPACHO", acao: "PADRAO_DESPACHO_CRIADO", assunto_id: assuntoId, detalhe: { padrao_id: json.data?.id, titulo: novoTitulo, modulo, tipo_despacho: tipoDespacho } });
        await carregarPadroes();
        fecharModalPadrao();
      } else {
        mostrarToast(`Erro: ${json.erro || "não foi possível criar"}`);
      }
    }
  }

  async function excluirPadrao(id: string, titulo: string) {
    if (!confirm("Excluir este padrão?")) return;
    const res = await fetch("/api/despacho-padroes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.ok) {
      mostrarToast("Padrão excluído!");
      registrar({ modulo: "DESPACHO", acao: "PADRAO_DESPACHO_EXCLUIDO", assunto_id: assuntoId, detalhe: { padrao_id: id, titulo, modulo, tipo_despacho: tipoDespacho } });
      if (padraoAtual?.id === id) setPadraoAtual(null);
      await carregarPadroes();
    } else {
      mostrarToast(`Erro: ${json.erro || "não foi possível excluir"}`);
    }
  }

  const nomeAssunto = assuntos.find(a => a.id === assuntoId)?.nome ?? "";
  const rotuloTipo = tipoDespacho === "interno" ? "Despacho Interno" : "Despacho/Parecer Externo";
  const bucketCompleto = !!assuntoId && !!modulo && !!tipoDespacho;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] px-5 py-3 rounded-xl shadow-2xl text-sm">
          {toast}
        </div>
      )}

      {/* MODAL CRIAR/EDITAR PADRÃO */}
      {modalPadrao && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">{editandoPadrao ? "✏️ Editar Padrão" : "➕ Novo Padrão"}</h2>
              <button onClick={fecharModalPadrao} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Título</label>
                <input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Indeferimento 180 dias"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
              {tipoDespacho === "interno" && (
                <div>
                  <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Destinatário sugerido (opcional)</label>
                  <select value={novoDestino} onChange={(e) => setNovoDestino(e.target.value)}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                    <option value="">Nenhum</option>
                    {DESTINOS_FIXOS.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="outro">Outro...</option>
                  </select>
                  {novoDestino === "outro" && (
                    <input value={novoDestinoCustom} onChange={(e) => setNovoDestinoCustom(e.target.value)}
                      placeholder="Ex: CHEADV, Chefia..."
                      className="mt-2 w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  )}
                </div>
              )}
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Conteúdo</label>
                <textarea value={novoCorpo} onChange={(e) => setNovoCorpo(e.target.value)} rows={10}
                  placeholder="Texto padronizado do despacho..."
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={salvarPadrao} disabled={!novoTitulo.trim() || !novoCorpo.trim()}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {editandoPadrao ? "Salvar alterações" : "Criar padrão"}
              </button>
              <button onClick={fecharModalPadrao}
                className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin/configuracoes")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← Configurações
            </button>
            {bucketCompleto && (
              <button onClick={trocarBucket}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
                🔀 Trocar bucket
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold">📋 Padrões de Despacho</h1>
              <p className="text-[var(--text-muted)] text-sm">
                {bucketCompleto ? `${nomeAssunto} · ${modulo} · ${rotuloTipo}` : "Selecione o slot, o módulo e o tipo de despacho"}
              </p>
            </div>
          </div>
          {bucketCompleto && (
            <button onClick={abrirNovoPadrao}
              className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
              + Novo Padrão
            </button>
          )}
        </div>
      </div>

      {!bucketCompleto ? (
        // SELETOR DE BUCKET — entrada padrão a partir do ADMIN, sem precisar
        // vir de um modal de despacho aberto. Escolhas em cascata: slot →
        // módulo → tipo (externo só existe em MAC, o LIP nunca teve essa tela).
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md flex flex-col gap-5 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
            <div>
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Slot</label>
              <select value={assuntoId} onChange={(e) => { setAssuntoId(e.target.value); setModulo(""); setTipoDespacho(""); }}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <option value="">Selecione...</option>
                {assuntos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Módulo</label>
              <select value={modulo} disabled={!assuntoId} onChange={(e) => { setModulo(e.target.value as "LIP" | "MAC"); setTipoDespacho(""); }}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50">
                <option value="">Selecione...</option>
                <option value="LIP">LIP</option>
                <option value="MAC">MAC</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Tipo de despacho</label>
              <select value={tipoDespacho} disabled={!modulo} onChange={(e) => setTipoDespacho(e.target.value as "interno" | "externo")}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50">
                <option value="">Selecione...</option>
                <option value="interno">Despacho Interno</option>
                {modulo === "MAC" && <option value="externo">Despacho/Parecer Externo</option>}
              </select>
              {modulo === "LIP" && <p className="text-[10px] text-[var(--text-muted)] mt-1">O LIP não tem Despacho/Parecer Externo — esse fluxo só existe no MAC.</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* SIDEBAR */}
          <div className="w-64 bg-[var(--surface)] border-r border-[var(--border)] p-4 flex flex-col gap-2 overflow-y-auto">
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-2">Padrões salvos</p>
            {carregando ? (
              <p className="text-[var(--text-muted)] text-sm">Carregando...</p>
            ) : padroes.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm">Nenhum padrão neste bucket ainda.</p>
            ) : padroes.map((p) => (
              <div key={p.id}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                  padraoAtual?.id === p.id ? "bg-[var(--accent)] border-[var(--accent-hover)]" : "bg-[var(--bg-secondary)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
                }`}
                onClick={() => setPadraoAtual(p)}>
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{p.titulo}</p>
                {p.destinatario_padrao && <p className="text-xs text-[var(--text-muted)] mt-0.5">→ {p.destinatario_padrao}</p>}
              </div>
            ))}
          </div>

          {/* CONTEÚDO */}
          <div className="flex-1 overflow-y-auto p-6">
            {padraoAtual ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">{padraoAtual.titulo}</h2>
                  <div className="flex gap-2">
                    <button onClick={() => abrirEditarPadrao(padraoAtual)}
                      className="bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 text-xs px-3 py-1.5 rounded transition-colors">✏️ Editar</button>
                    <button onClick={() => excluirPadrao(padraoAtual.id, padraoAtual.titulo)}
                      className="bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 text-xs px-3 py-1.5 rounded transition-colors">🗑 Excluir</button>
                  </div>
                </div>
                {padraoAtual.destinatario_padrao && (
                  <p className="text-sm text-[var(--text-muted)] mb-3">Destinatário sugerido: <strong className="text-[var(--text-primary)]">{padraoAtual.destinatario_padrao}</strong></p>
                )}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 whitespace-pre-wrap text-sm text-[var(--text-primary)] leading-relaxed">
                  {padraoAtual.corpo}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-[var(--text-muted)]">Selecione um padrão para ver o conteúdo</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
