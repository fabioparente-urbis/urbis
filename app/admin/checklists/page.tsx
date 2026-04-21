"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  grupo: string;
  texto: string;
  ref?: string;
  ordem: number;
  ativo: boolean;
};

type Modelo = {
  id: string;
  nome: string;
  tipo_processo: string | null;
  dono_id: string | null;
  criado_em: string;
  mac_checklist_itens?: Item[];
};

const GRUPOS_PADRAO = [
  "Documentação", "Carimbo", "Projeto — Carimbo",
  "Projeto — Desenho", "Calçada", "Corredor Viário"
];

export default function ChecklistsPage() {
  const router = useRouter();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloAtual, setModeloAtual] = useState<Modelo | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState("");
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<string | null>(null);

  // Modal novo item
  const [modalItem, setModalItem] = useState(false);
  const [editandoItem, setEditandoItem] = useState<Item | null>(null);
  const [novoGrupo, setNovoGrupo] = useState(GRUPOS_PADRAO[0]);
  const [novoGrupoCustom, setNovoGrupoCustom] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [novoRef, setNovoRef] = useState("");

  // Modal novo modelo
  const [modalModelo, setModalModelo] = useState(false);
  const [nomeModelo, setNomeModelo] = useState("");
  const [tipoProcesso, setTipoProcesso] = useState("");
  const [copiarDe, setCopiarDe] = useState("00000000-0000-0000-0000-000000000001");

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function carregarUsuario() {
    const res = await fetch("/api/auth/me");
    const json = await res.json();
    if (json.ok) {
      setUsuarioId(json.data.id);
      setPerfil(json.data.perfil);
    }
  }

  async function carregarModelos(uid: string) {
    const res = await fetch(`/api/mac/checklists?analista_id=${uid}`);
    const json = await res.json();
    if (json.ok) {
      setModelos(json.data);
      if (json.data.length > 0 && !modeloAtual) {
        selecionarModelo(json.data[0]);
      }
    }
    setCarregando(false);
  }

  async function selecionarModelo(m: Modelo) {
    setModeloAtual(m);
    const res = await fetch(`/api/mac/checklists/itens?modelo_id=${m.id}`);
    const json = await res.json();
    if (json.ok) setItens(json.data);
  }

  useEffect(() => {
    carregarUsuario().then(() => {});
  }, []);

  useEffect(() => {
    if (usuarioId) carregarModelos(usuarioId);
  }, [usuarioId]);

  const isPadrao = modeloAtual?.dono_id === null;
  const podeEditar = !isPadrao || perfil === "Administrador" || perfil === "Gerente" || perfil === "Diretor";

  const grupos = [...new Set(itens.map((i) => i.grupo))];

  async function salvarItem() {
    const grupoFinal = novoGrupo === "__custom__" ? novoGrupoCustom : novoGrupo;
    if (!novoTexto.trim() || !grupoFinal.trim()) return;

    if (editandoItem) {
      const res = await fetch("/api/mac/checklists/itens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoItem.id, grupo: grupoFinal, texto: novoTexto, ref: novoRef }),
      });
      const json = await res.json();
      if (json.ok) {
        setItens((prev) => prev.map((i) => i.id === editandoItem.id ? json.data : i));
        mostrarToast("Item atualizado!");
      }
    } else {
      const maxOrdem = itens.filter((i) => i.grupo === grupoFinal).length;
      const res = await fetch("/api/mac/checklists/itens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo_id: modeloAtual!.id, grupo: grupoFinal, texto: novoTexto, ref: novoRef, ordem: maxOrdem + 1 }),
      });
      const json = await res.json();
      if (json.ok) {
        setItens((prev) => [...prev, json.data]);
        mostrarToast("Item adicionado!");
      }
    }
    fecharModalItem();
  }

  async function removerItem(id: string) {
    await fetch("/api/mac/checklists/itens", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItens((prev) => prev.filter((i) => i.id !== id));
    mostrarToast("Item removido!");
  }

  async function moverItem(id: string, direcao: "cima" | "baixo") {
    const item = itens.find((i) => i.id === id)!;
    const grupo = itens.filter((i) => i.grupo === item.grupo).sort((a, b) => a.ordem - b.ordem);
    const idx = grupo.findIndex((i) => i.id === id);
    const outro = direcao === "cima" ? grupo[idx - 1] : grupo[idx + 1];
    if (!outro) return;

    await fetch("/api/mac/checklists/itens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, ordem: outro.ordem }),
    });
    await fetch("/api/mac/checklists/itens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: outro.id, ordem: item.ordem }),
    });

    setItens((prev) => prev.map((i) => {
      if (i.id === item.id) return { ...i, ordem: outro.ordem };
      if (i.id === outro.id) return { ...i, ordem: item.ordem };
      return i;
    }));
  }

  async function criarModelo() {
    if (!nomeModelo.trim()) return;
    const res = await fetch("/api/mac/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nomeModelo,
        tipo_processo: tipoProcesso || null,
        dono_id: usuarioId,
        copiar_de: copiarDe || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      mostrarToast("Modelo criado!");
      setModalModelo(false);
      setNomeModelo("");
      await carregarModelos(usuarioId!);
    }
  }

  async function deletarModelo(id: string) {
    if (!confirm("Apagar este modelo?")) return;
    await fetch("/api/mac/checklists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    mostrarToast("Modelo apagado!");
    await carregarModelos(usuarioId!);
  }

  function abrirNovoItem() {
    setEditandoItem(null);
    setNovoGrupo(grupos[0] || GRUPOS_PADRAO[0]);
    setNovoGrupoCustom("");
    setNovoTexto("");
    setNovoRef("");
    setModalItem(true);
  }

  function abrirEditarItem(item: Item) {
    setEditandoItem(item);
    const grupoExiste = GRUPOS_PADRAO.includes(item.grupo);
    setNovoGrupo(grupoExiste ? item.grupo : "__custom__");
    setNovoGrupoCustom(grupoExiste ? "" : item.grupo);
    setNovoTexto(item.texto);
    setNovoRef(item.ref || "");
    setModalItem(true);
  }

  function fecharModalItem() {
    setModalItem(false);
    setEditandoItem(null);
    setNovoTexto("");
    setNovoRef("");
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-600 text-white px-5 py-3 rounded-xl shadow-2xl text-sm">
          {toast}
        </div>
      )}

      {/* MODAL ITEM */}
      {modalItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">{editandoItem ? "✏️ Editar Item" : "➕ Novo Item"}</h2>
              <button onClick={fecharModalItem} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Grupo</label>
                <select
                  value={novoGrupo}
                  onChange={(e) => setNovoGrupo(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[...new Set([...GRUPOS_PADRAO, ...grupos])].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  <option value="__custom__">+ Novo grupo...</option>
                </select>
                {novoGrupo === "__custom__" && (
                  <input
                    value={novoGrupoCustom}
                    onChange={(e) => setNovoGrupoCustom(e.target.value)}
                    placeholder="Nome do novo grupo"
                    className="mt-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Texto do item</label>
                <textarea
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                  rows={3}
                  placeholder="Descreva o item do checklist..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Referência legal (opcional)</label>
                <input
                  value={novoRef}
                  onChange={(e) => setNovoRef(e.target.value)}
                  placeholder="Ex: Art. 2º LC 314/2018"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={salvarItem}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {editandoItem ? "Salvar alterações" : "Adicionar item"}
              </button>
              <button onClick={fecharModalItem}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO MODELO */}
      {modalModelo && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">📋 Novo Modelo de Checklist</h2>
              <button onClick={() => setModalModelo(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Nome do modelo</label>
                <input
                  value={nomeModelo}
                  onChange={(e) => setNomeModelo(e.target.value)}
                  placeholder="Ex: Meu Checklist, Variante A..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Tipo de processo (opcional)</label>
                <select
                  value={tipoProcesso}
                  onChange={(e) => setTipoProcesso(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos os tipos</option>
                  <option value="REGULARIZACAO">Regularização</option>
                  <option value="APROVACAO">Aprovação</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Copiar itens de</label>
                <select
                  value={copiarDe}
                  onChange={(e) => setCopiarDe(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Começar do zero</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={criarModelo}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                Criar modelo
              </button>
              <button onClick={() => setModalModelo(false)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/")}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← Home
            </button>
            <div>
              <h1 className="text-xl font-bold">📋 Modelos de Checklist</h1>
              <p className="text-slate-400 text-sm">MAC — Módulo de Análise e Conformidades</p>
            </div>
          </div>
          <button onClick={() => setModalModelo(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
            + Novo Modelo
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR — MODELOS */}
        <div className="w-64 bg-slate-800 border-r border-slate-700 p-4 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Modelos disponíveis</p>
          {modelos.map((m) => (
            <div key={m.id}
              className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                modeloAtual?.id === m.id
                  ? "bg-blue-900 border-blue-500"
                  : "bg-slate-700 border-slate-600 hover:bg-slate-600"
              }`}
              onClick={() => selecionarModelo(m)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.nome}</p>
                  {m.dono_id === null && (
                    <span className="text-xs text-yellow-400">⭐ Padrão global</span>
                  )}
                  {m.tipo_processo && (
                    <p className="text-xs text-slate-400 mt-0.5">{m.tipo_processo}</p>
                  )}
                </div>
                {m.dono_id !== null && (
                  <button onClick={(e) => { e.stopPropagation(); deletarModelo(m.id); }}
                    className="text-slate-500 hover:text-red-400 text-xs transition-colors shrink-0">
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CONTEÚDO — ITENS */}
        <div className="flex-1 overflow-y-auto p-6">
          {modeloAtual ? (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold">CHECKLIST {modeloAtual.nome}</h2>
                  <p className="text-sm text-slate-400">
                    {itens.length} itens em {grupos.length} grupos
                    {!podeEditar && <span className="ml-2 text-yellow-400">⚠️ Somente leitura</span>}
                  </p>
                </div>
                {podeEditar && (
                  <button onClick={abrirNovoItem}
                    className="bg-green-700 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                    + Adicionar Item
                  </button>
                )}
              </div>

              {grupos.map((grupo) => {
                const itensGrupo = itens
                  .filter((i) => i.grupo === grupo)
                  .sort((a, b) => a.ordem - b.ordem);
                return (
                  <div key={grupo} className="mb-6">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="bg-slate-700 px-2 py-0.5 rounded">{grupo}</span>
                      <span className="text-slate-500 font-normal normal-case">{itensGrupo.length} itens</span>
                    </h3>
                    <div className="flex flex-col gap-2">
                      {itensGrupo.map((item, idx) => (
                        <div key={item.id}
                          className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
                          {podeEditar && (
                            <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                              <button onClick={() => moverItem(item.id, "cima")} disabled={idx === 0}
                                className="text-slate-500 hover:text-white disabled:opacity-20 text-xs leading-none">▲</button>
                              <button onClick={() => moverItem(item.id, "baixo")} disabled={idx === itensGrupo.length - 1}
                                className="text-slate-500 hover:text-white disabled:opacity-20 text-xs leading-none">▼</button>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white leading-relaxed">{item.texto}</p>
                            {item.ref && <p className="text-xs text-slate-500 mt-1">{item.ref}</p>}
                          </div>
                          {podeEditar && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => abrirEditarItem(item)}
                                className="text-slate-400 hover:text-blue-400 text-xs transition-colors">✏️</button>
                              <button onClick={() => removerItem(item.id)}
                                className="text-slate-400 hover:text-red-400 text-xs transition-colors">🗑</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500">Selecione um modelo para editar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}