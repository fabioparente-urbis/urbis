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

  // Modal novo modelo — etapas
  const [modalModelo, setModalModelo] = useState(false);
  const [etapaModelo, setEtapaModelo] = useState<1 | 2>(1);
  const [nomeModelo, setNomeModelo] = useState("");
  const [tipoProcesso, setTipoProcesso] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  const [itensFonte, setItensFonte] = useState<Item[]>([]);
  const [itensSelecionados, setItensSelecionados] = useState<Set<string>>(new Set());
  const [carregandoFonte, setCarregandoFonte] = useState(false);

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

  useEffect(() => { carregarUsuario(); }, []);
  useEffect(() => { if (usuarioId) carregarModelos(usuarioId); }, [usuarioId]);

  const isPadrao = modeloAtual?.dono_id === null;
  // Pode editar modelos padrão: Administrador, Diretora/Diretor ou qualquer gerente de gerencia (PP/MP/GP).
  const podeEditar = !isPadrao
    || perfil === "Administrador"
    || perfil === "Diretora"
    || perfil === "Diretor"
    || perfil === "Gerência PP"
    || perfil === "Gerência MP"
    || perfil === "Gerência GP";
  const grupos = [...new Set(itens.map((i) => i.grupo))];

  // Carrega itens da fonte quando copiarDe muda
  async function carregarItensFonte(modeloId: string) {
    if (!modeloId) { setItensFonte([]); setItensSelecionados(new Set()); return; }
    setCarregandoFonte(true);
    const res = await fetch(`/api/mac/checklists/itens?modelo_id=${modeloId}`);
    const json = await res.json();
    if (json.ok) {
      setItensFonte(json.data);
      // Seleciona todos por padrão
      setItensSelecionados(new Set(json.data.map((i: Item) => i.id)));
    }
    setCarregandoFonte(false);
  }

  function abrirModalModelo() {
    setEtapaModelo(1);
    setNomeModelo("");
    setTipoProcesso("");
    setCopiarDe("");
    setItensFonte([]);
    setItensSelecionados(new Set());
    setModalModelo(true);
  }

  async function avancarEtapa2() {
    if (!nomeModelo.trim()) return;
    if (!copiarDe) {
      // Sem fonte — cria direto
      await criarModelo([]);
      return;
    }
    await carregarItensFonte(copiarDe);
    setEtapaModelo(2);
  }

  function toggleItem(id: string) {
    setItensSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleGrupo(grupo: string) {
    const itensGrupo = itensFonte.filter((i) => i.grupo === grupo).map((i) => i.id);
    const todosSelecionados = itensGrupo.every((id) => itensSelecionados.has(id));
    setItensSelecionados((prev) => {
      const novo = new Set(prev);
      itensGrupo.forEach((id) => todosSelecionados ? novo.delete(id) : novo.add(id));
      return novo;
    });
  }

  function selecionarTodos() {
    setItensSelecionados(new Set(itensFonte.map((i) => i.id)));
  }

  function deselecionarTodos() {
    setItensSelecionados(new Set());
  }

  async function criarModelo(idsSelecionados: string[]) {
    if (!nomeModelo.trim()) return;

    // Cria modelo vazio
    const res = await fetch("/api/mac/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nomeModelo,
        tipo_processo: tipoProcesso || null,
        dono_id: usuarioId,
        copiar_de: null, // vamos inserir manualmente os itens selecionados
      }),
    });
    const json = await res.json();
    if (!json.ok) { mostrarToast("Erro ao criar modelo."); return; }

    const novoModeloId = json.data.id;

    // Insere apenas os itens selecionados
    if (idsSelecionados.length > 0) {
      const itensPara = itensFonte
        .filter((i) => idsSelecionados.includes(i.id))
        .map((i) => ({
          modelo_id: novoModeloId,
          grupo: i.grupo,
          texto: i.texto,
          ref: i.ref || null,
          ordem: i.ordem,
          ativo: true,
        }));

      await fetch("/api/mac/checklists/itens/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: itensPara }),
      });
    }

    mostrarToast("Modelo criado!");
    setModalModelo(false);
    await carregarModelos(usuarioId!);
  }

  async function confirmarCriacaoComSelecao() {
    await criarModelo(Array.from(itensSelecionados));
  }

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

  const gruposFonte = [...new Set(itensFonte.map((i) => i.grupo))];

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
                <select value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[...new Set([...GRUPOS_PADRAO, ...grupos])].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  <option value="__custom__">+ Novo grupo...</option>
                </select>
                {novoGrupo === "__custom__" && (
                  <input value={novoGrupoCustom} onChange={(e) => setNovoGrupoCustom(e.target.value)}
                    placeholder="Nome do novo grupo"
                    className="mt-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Texto do item</label>
                <textarea value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} rows={3}
                  placeholder="Descreva o item do checklist..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Referência legal (opcional)</label>
                <input value={novoRef} onChange={(e) => setNovoRef(e.target.value)}
                  placeholder="Ex: Art. 2º LC 314/2018"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

      {/* MODAL NOVO MODELO — ETAPA 1 */}
      {modalModelo && etapaModelo === 1 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">📋 Novo Modelo — Etapa 1/2</h2>
              <button onClick={() => setModalModelo(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Nome do modelo</label>
                <input value={nomeModelo} onChange={(e) => setNomeModelo(e.target.value)}
                  placeholder="Ex: Meu Checklist, Variante A..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Tipo de processo (opcional)</label>
                <select value={tipoProcesso} onChange={(e) => setTipoProcesso(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos os tipos</option>
                  <option value="REGULARIZACAO">Regularização</option>
                  <option value="APROVACAO">Aprovação</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide block mb-1">Copiar itens de</label>
                <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Começar do zero</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={avancarEtapa2} disabled={!nomeModelo.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                {copiarDe ? "Selecionar itens →" : "Criar modelo vazio"}
              </button>
              <button onClick={() => setModalModelo(false)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO MODELO — ETAPA 2: SELEÇÃO DE ITENS */}
      {modalModelo && etapaModelo === 2 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-white font-bold text-lg">📋 Selecionar Itens — Etapa 2/2</h2>
              <button onClick={() => setModalModelo(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-slate-400 text-xs mb-4">
              Escolha quais itens de <span className="text-white font-semibold">{modelos.find(m => m.id === copiarDe)?.nome}</span> deseja incluir no novo modelo.
            </p>

            {/* Controles rápidos */}
            <div className="flex gap-2 mb-4">
              <button onClick={selecionarTodos}
                className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors">
                ✅ Selecionar todos
              </button>
              <button onClick={deselecionarTodos}
                className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors">
                ☐ Desmarcar todos
              </button>
              <span className="ml-auto text-xs text-slate-400 self-center">
                {itensSelecionados.size} de {itensFonte.length} selecionados
              </span>
            </div>

            {/* Lista de itens por grupo */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
              {carregandoFonte ? (
                <p className="text-slate-400 text-sm text-center py-8">Carregando itens...</p>
              ) : (
                gruposFonte.map((grupo) => {
                  const itensGrupo = itensFonte.filter((i) => i.grupo === grupo).sort((a, b) => a.ordem - b.ordem);
                  const todosSelecionados = itensGrupo.every((i) => itensSelecionados.has(i.id));
                  const algunsSelecionados = itensGrupo.some((i) => itensSelecionados.has(i.id));
                  return (
                    <div key={grupo}>
                      {/* Cabeçalho do grupo com toggle */}
                      <button onClick={() => toggleGrupo(grupo)}
                        className="w-full flex items-center gap-2 mb-2 text-left">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          todosSelecionados ? "bg-blue-600 border-blue-600" :
                          algunsSelecionados ? "bg-blue-900 border-blue-500" :
                          "border-slate-500"
                        }`}>
                          {todosSelecionados && <span className="text-white text-xs leading-none">✓</span>}
                          {!todosSelecionados && algunsSelecionados && <span className="text-blue-400 text-xs leading-none">—</span>}
                        </div>
                        <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">{grupo}</span>
                        <span className="text-slate-500 font-normal normal-case text-xs">{itensGrupo.length} itens</span>
                      </button>

                      {/* Itens do grupo */}
                      <div className="flex flex-col gap-1.5 ml-2">
                        {itensGrupo.map((item) => (
                          <button key={item.id} onClick={() => toggleItem(item.id)}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                              itensSelecionados.has(item.id)
                                ? "bg-blue-900/40 border-blue-600"
                                : "bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                            }`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                              itensSelecionados.has(item.id) ? "bg-blue-600 border-blue-600" : "border-slate-500"
                            }`}>
                              {itensSelecionados.has(item.id) && <span className="text-white text-xs leading-none">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white leading-relaxed">{item.texto}</p>
                              {item.ref && <p className="text-xs text-slate-500 mt-0.5">{item.ref}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-slate-700">
              <button onClick={() => setEtapaModelo(1)}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                ← Voltar
              </button>
              <button onClick={confirmarCriacaoComSelecao} disabled={itensSelecionados.size === 0 && itensFonte.length > 0}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-lg text-sm transition-colors">
                ✅ Criar modelo com {itensSelecionados.size} iten{itensSelecionados.size !== 1 ? "s" : ""}
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
          <button onClick={abrirModalModelo}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
            + Novo Modelo
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-64 bg-slate-800 border-r border-slate-700 p-4 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Modelos disponíveis</p>
          {modelos.map((m) => (
            <div key={m.id}
              className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                modeloAtual?.id === m.id ? "bg-blue-900 border-blue-500" : "bg-slate-700 border-slate-600 hover:bg-slate-600"
              }`}
              onClick={() => selecionarModelo(m)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.nome}</p>
                  {m.dono_id === null && <span className="text-xs text-yellow-400">⭐ Padrão global</span>}
                  {m.tipo_processo && <p className="text-xs text-slate-400 mt-0.5">{m.tipo_processo}</p>}
                </div>
                {m.dono_id !== null && (
                  <button onClick={(e) => { e.stopPropagation(); deletarModelo(m.id); }}
                    className="text-slate-500 hover:text-red-400 text-xs transition-colors shrink-0">🗑</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CONTEÚDO */}
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
                const itensGrupo = itens.filter((i) => i.grupo === grupo).sort((a, b) => a.ordem - b.ordem);
                return (
                  <div key={grupo} className="mb-6">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="bg-slate-700 px-2 py-0.5 rounded">{grupo}</span>
                      <span className="text-slate-500 font-normal normal-case">{itensGrupo.length} itens</span>
                    </h3>
                    <div className="flex flex-col gap-2">
                      {itensGrupo.map((item, idx) => (
                        <div key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
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