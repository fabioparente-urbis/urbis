"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PERFIS_IRRESTRITOS, PERFIS_GERENCIA } from "@/lib/perfis";

type Item = {
  gera_indeferimento?: boolean;
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

/** Parâmetro da URL lido na hora — a tela é compartilhada pelos slots e quem chama diz de onde
 * veio (`voltar`/`rotulo`) e qual modelo abrir (`tipo`). Sem parâmetro nenhum, nada muda: continua
 * caindo no primeiro modelo da lista e só no "← Home". */
function paramDaUrl(nome: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(nome) ?? "";
}

export default function ChecklistsPage() {
  const router = useRouter();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloAtual, setModeloAtual] = useState<Modelo | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState("");
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<string | null>(null);
  // Lidos no cliente (e não no render) para não divergir do HTML que veio do servidor.
  const [voltarPara, setVoltarPara] = useState("");
  const [rotuloVoltar, setRotuloVoltar] = useState("Voltar ao MAC");

  // Modal novo item
  const [modalItem, setModalItem] = useState(false);
  const [editandoItem, setEditandoItem] = useState<Item | null>(null);
  const [novoGrupo, setNovoGrupo] = useState(GRUPOS_PADRAO[0]);
  const [novoGrupoCustom, setNovoGrupoCustom] = useState("");
  const [modalRenomear, setModalRenomear] = useState(false);
  const [grupoRenomear, setGrupoRenomear] = useState("");
  const [novoNomeGrupo, setNovoNomeGrupo] = useState("");
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
        // Veio de uma tela de MAC (?tipo=slot_05): abre direto o checklist daquele tipo de
        // processo, em vez do primeiro da lista.
        const tipo = paramDaUrl("tipo");
        const alvo = tipo ? json.data.find((m: Modelo) => m.tipo_processo === tipo) : null;
        selecionarModelo(alvo ?? json.data[0]);
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
    setVoltarPara(paramDaUrl("voltar"));
    setRotuloVoltar(paramDaUrl("rotulo") || "Voltar ao MAC");
  }, []);
  useEffect(() => { carregarUsuario(); }, []);
  useEffect(() => { if (usuarioId) carregarModelos(usuarioId); }, [usuarioId]);

  const isPadrao = modeloAtual?.dono_id === null;
  // Pode editar modelos padrão: Administrador, Diretora ou qualquer gerente das 3 gerências reais.
  const podeEditar = !isPadrao
    || (!!perfil && (PERFIS_IRRESTRITOS as readonly string[]).includes(perfil))
    || (!!perfil && (PERFIS_GERENCIA as readonly string[]).includes(perfil));
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

  async function renomearGrupo() {
    const itensDoGrupo = itens.filter(i => i.grupo === grupoRenomear);
    for (const item of itensDoGrupo) {
      await fetch("/api/mac/checklists/itens", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, grupo: novoNomeGrupo.trim(), texto: item.texto, ref: item.ref || "" })
      });
    }
    setItens(prev => prev.map(i => i.grupo === grupoRenomear ? { ...i, grupo: novoNomeGrupo.trim() } : i));
    mostrarToast(`Grupo renomeado: ${itensDoGrupo.length} item(ns) atualizados`);
    setModalRenomear(false);
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

  /**
   * Marca/desmarca o item como "gera indeferimento". Serve para o
   * analista ver o peso do item na tela de análise, para a IA priorizar
   * o que decide o destino do processo, e para a estatística de
   * "qual item mais indefere".
   */
  async function toggleIndeferimento(item: Item) {
    const novo = !item.gera_indeferimento;
    const res = await fetch("/api/mac/checklists/itens", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, gera_indeferimento: novo }),
    });
    const json = await res.json();
    if (!json.ok && json.error) { mostrarToast("Erro ao marcar item"); return; }
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, gera_indeferimento: novo } : i)));
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
      <div className="min-h-screen text-gray-900 bg-[var(--bg-primary)] flex items-center justify-center">
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

      {/* MODAL ITEM */}
      {modalItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">{editandoItem ? "✏️ Editar Item" : "➕ Novo Item"}</h2>
              <button onClick={fecharModalItem} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Grupo</label>
                <select value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  {[...new Set([...GRUPOS_PADRAO, ...grupos])].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                  <option value="__custom__">+ Novo grupo...</option>
                </select>
                {novoGrupo === "__custom__" && (
                  <input value={novoGrupoCustom} onChange={(e) => setNovoGrupoCustom(e.target.value)}
                    placeholder="Nome do novo grupo"
                    className="mt-2 w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                )}
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Texto do item</label>
                <textarea value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} rows={3}
                  placeholder="Descreva o item do checklist..."
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Referência legal (opcional)</label>
                <input value={novoRef} onChange={(e) => setNovoRef(e.target.value)}
                  placeholder="Ex: Art. 2º LC 314/2018"
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={salvarItem}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {editandoItem ? "Salvar alterações" : "Adicionar item"}
              </button>
              <button onClick={fecharModalItem}
                className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO MODELO — ETAPA 1 */}
      {modalModelo && etapaModelo === 1 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">📋 Novo Modelo — Etapa 1/2</h2>
              <button onClick={() => setModalModelo(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Nome do modelo</label>
                <input value={nomeModelo} onChange={(e) => setNomeModelo(e.target.value)}
                  placeholder="Ex: Meu Checklist, Variante A..."
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Tipo de processo (opcional)</label>
                <select value={tipoProcesso} onChange={(e) => setTipoProcesso(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="">Todos os tipos</option>
                  <option value="regularizacao">Regularização</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide block mb-1">Copiar itens de</label>
                <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="">Começar do zero</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={avancarEtapa2} disabled={!nomeModelo.trim()}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                {copiarDe ? "Selecionar itens →" : "Criar modelo vazio"}
              </button>
              <button onClick={() => setModalModelo(false)}
                className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO MODELO — ETAPA 2: SELEÇÃO DE ITENS */}
      {modalModelo && etapaModelo === 2 && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[var(--text-primary)] font-bold text-lg">📋 Selecionar Itens — Etapa 2/2</h2>
              <button onClick={() => setModalModelo(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl">✕</button>
            </div>
            <p className="text-[var(--text-muted)] text-xs mb-4">
              Escolha quais itens de <span className="text-[var(--text-primary)] font-semibold">{modelos.find(m => m.id === copiarDe)?.nome}</span> deseja incluir no novo modelo.
            </p>

            {/* Controles rápidos */}
            <div className="flex gap-2 mb-4">
              <button onClick={selecionarTodos}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] text-xs font-bold px-3 py-1.5 rounded transition-colors">
                ✅ Selecionar todos
              </button>
              <button onClick={deselecionarTodos}
                className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] text-xs font-bold px-3 py-1.5 rounded transition-colors">
                ☐ Desmarcar todos
              </button>
              <span className="ml-auto text-xs text-[var(--text-muted)] self-center">
                {itensSelecionados.size} de {itensFonte.length} selecionados
              </span>
            </div>

            {/* Lista de itens por grupo */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
              {carregandoFonte ? (
                <p className="text-[var(--text-muted)] text-sm text-center py-8">Carregando itens...</p>
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
                          todosSelecionados ? "bg-[var(--accent)] border-[var(--accent-hover)]" :
                          algunsSelecionados ? "bg-[var(--accent)] border-[var(--accent-hover)]" :
                          "border-slate-500"
                        }`}>
                          {todosSelecionados && <span className="text-[var(--text-primary)] text-xs leading-none">✓</span>}
                          {!todosSelecionados && algunsSelecionados && <span className="text-blue-400 text-xs leading-none">—</span>}
                        </div>
                        <span className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">{grupo}</span>
                        <span className="text-[var(--text-muted)] font-normal normal-case text-xs">{itensGrupo.length} itens</span>
                      </button>

                      {/* Itens do grupo */}
                      <div className="flex flex-col gap-1.5 ml-2">
                        {itensGrupo.map((item) => (
                          <button key={item.id} onClick={() => toggleItem(item.id)}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                              itensSelecionados.has(item.id)
                                ? "bg-[var(--accent)]/40 border-[var(--accent-hover)]"
                                : "bg-[var(--bg-secondary)]/50 border-[var(--border)] hover:bg-[var(--bg-secondary)]"
                            }`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                              itensSelecionados.has(item.id) ? "bg-[var(--accent)] border-[var(--accent-hover)]" : "border-slate-500"
                            }`}>
                              {itensSelecionados.has(item.id) && <span className="text-[var(--text-primary)] text-xs leading-none">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{item.texto}</p>
                              {item.ref && <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.ref}</p>}
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
            <div className="flex gap-3 mt-6 pt-4 border-t border-[var(--border)]">
              <button onClick={() => setEtapaModelo(1)}
                className="bg-slate-600 hover:bg-slate-500 text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                ← Voltar
              </button>
              <button onClick={confirmarCriacaoComSelecao} disabled={itensSelecionados.size === 0 && itensFonte.length > 0}
                className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-bold py-2.5 rounded-lg text-sm transition-colors">
                ✅ Criar modelo com {itensSelecionados.size} iten{itensSelecionados.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {voltarPara && (
              <button onClick={() => router.push(voltarPara)}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 rounded text-sm font-bold transition-colors">
                ← {rotuloVoltar}
              </button>
            )}
            <button onClick={() => router.push("/")}
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] px-3 py-1.5 rounded text-sm font-medium transition-colors">
              ← Home
            </button>
            <div>
              <h1 className="text-xl font-bold">📋 Modelos de Checklist</h1>
              <p className="text-[var(--text-muted)] text-sm">MAC — Módulo de Análise e Conformidades</p>
            </div>
          </div>
          <button onClick={abrirModalModelo}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
            + Novo Modelo
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-64 bg-[var(--surface)] border-r border-[var(--border)] p-4 flex flex-col gap-2 overflow-y-auto">
          <p className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wide mb-2">Modelos disponíveis</p>
          {modelos.map((m) => (
            <div key={m.id}
              className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                modeloAtual?.id === m.id ? "bg-[var(--accent)] border-[var(--accent-hover)]" : "bg-[var(--bg-secondary)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
              }`}
              onClick={() => selecionarModelo(m)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{m.nome}</p>
                  {m.dono_id === null && <span className="text-xs text-yellow-400">⭐ Padrão global</span>}
                  {m.tipo_processo && <p className="text-xs text-[var(--text-muted)] mt-0.5">{m.tipo_processo}</p>}
                </div>
                {m.dono_id !== null && (
                  <button onClick={(e) => { e.stopPropagation(); deletarModelo(m.id); }}
                    className="text-[var(--text-muted)] hover:text-red-400 text-xs transition-colors shrink-0">🗑</button>
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
                  <p className="text-sm text-[var(--text-muted)]">
                    {itens.length} itens em {grupos.length} grupos
                    {!podeEditar && <span className="ml-2 text-yellow-400">⚠️ Somente leitura</span>}
                  </p>
                </div>
                {podeEditar && (
                  <button onClick={abrirNovoItem}
                    className="bg-[var(--success)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                    + Adicionar Item
                  </button>
                )}
              </div>

              {modalRenomear && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl text-gray-900">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-bold text-lg text-gray-900">✏️ Renomear Grupo</h2>
                      <button onClick={() => setModalRenomear(false)} className="text-gray-400 hover:text-gray-900 text-xl">✕</button>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">Renomeia <strong className="text-gray-800">{grupoRenomear}</strong> em todos os {itens.filter(i => i.grupo === grupoRenomear).length} itens do modelo.</p>
                    <input value={novoNomeGrupo} onChange={e => setNovoNomeGrupo(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
                    <div className="flex gap-3">
                      <button onClick={renomearGrupo} disabled={!novoNomeGrupo.trim() || novoNomeGrupo.trim() === grupoRenomear}
                        className="flex-1 border-2 border-gray-800 bg-white hover:bg-gray-100 disabled:opacity-40 text-gray-900 font-bold py-2.5 rounded-lg text-sm transition-colors">
                        Renomear
                      </button>
                      <button onClick={() => setModalRenomear(false)}
                        className="border-2 border-gray-400 bg-white hover:bg-gray-50 text-gray-600 font-bold py-2.5 px-4 rounded-lg text-sm transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {grupos.map((grupo) => {
                const itensGrupo = itens.filter((i) => i.grupo === grupo).sort((a, b) => a.ordem - b.ordem);
                return (
                  <div key={grupo} className="mb-6">
                    <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="bg-[var(--bg-secondary)] px-2 py-0.5 rounded">{grupo}</span>
                      <span className="text-[var(--text-muted)] font-normal normal-case">{itensGrupo.length} itens</span>
                      <button onClick={() => { setGrupoRenomear(grupo); setNovoNomeGrupo(grupo); setModalRenomear(true); }}
                        className="ml-2 text-[var(--text-muted)] hover:text-blue-400 text-xs transition-colors" title="Renomear grupo">✏️</button>
                    </h3>
                    <div className="flex flex-col gap-2">
                      {itensGrupo.map((item, idx) => (
                        <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3">
                          {podeEditar && (
                            <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                              <button onClick={() => moverItem(item.id, "cima")} disabled={idx === 0}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 text-xs leading-none">▲</button>
                              <button onClick={() => moverItem(item.id, "baixo")} disabled={idx === itensGrupo.length - 1}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-20 text-xs leading-none">▼</button>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {item.gera_indeferimento && (
                              <span className="inline-block mb-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-300">⚠ Indefere</span>
                            )}
                            <p className="text-sm text-[var(--text-primary)] leading-relaxed">{item.texto}</p>
                            {item.ref && <p className="text-xs text-[var(--text-muted)] mt-1">{item.ref}</p>}
                          </div>
                          {podeEditar && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => toggleIndeferimento(item)}
                                title={item.gera_indeferimento ? "Deixar de tratar como indeferimento" : "Marcar: não conformidade aqui indefere o processo"}
                                className={`text-xs px-2 py-0.5 rounded border transition-colors ${item.gera_indeferimento ? "bg-red-100 border-red-400 text-red-700" : "bg-slate-50 hover:bg-red-50 border-slate-300 text-slate-500"}`}>⚠</button>
                              <button onClick={() => abrirEditarItem(item)}
                                className="bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 text-xs px-2 py-0.5 rounded transition-colors">✏️</button>
                              <button onClick={() => removerItem(item.id)}
                                className="bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 text-xs px-2 py-0.5 rounded transition-colors">🗑</button>
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
              <p className="text-[var(--text-muted)]">Selecione um modelo para editar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}