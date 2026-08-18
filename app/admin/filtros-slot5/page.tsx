"use client";

/**
 * Gerenciador de filtros do MAC — Slot 5.
 *
 * Cada filtro liga uma CONDIÇÃO (lida do LIP ou do texto dos documentos da pasta) aos ITENS que
 * saem da análise. Criar um filtro novo aqui muda o comportamento do MAC na hora, sem deploy.
 *
 * Isolado do Slot 1: só lê e grava `mac_slot5_filtros`, tabela exclusiva do Slot 5.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tipo = "CAMPO_LIP_AUSENTE" | "CAMPO_LIP_IGUAL" | "PALAVRA_AUSENTE" | "MANUAL";
type Filtro = {
  id?: string; nome: string; descricao: string | null; ordem: number; ativo: boolean;
  tipo_condicao: Tipo; campos_lip: string[]; valor_esperado: string | null;
  termos: string[]; papeis_documento: string[]; grupos: string[]; itens_ids: string[];
  termos_item: string[];
  status_alvo: "conforme" | "nao_conforme" | "nao_aplica";
};

const EXPLICACAO: Record<Tipo, string> = {
  CAMPO_LIP_AUSENTE: "Aciona quando TODOS os campos do LIP abaixo valem NP ou NÃO (o tema não existe no processo).",
  CAMPO_LIP_IGUAL: "Aciona quando ALGUM campo do LIP abaixo contém o valor esperado.",
  PALAVRA_AUSENTE: "Aciona quando NENHUM dos termos aparece nos documentos escolhidos. Palavra inteira, sem acento.",
  MANUAL: "Não aciona sozinho — fica disponível como botão para o analista.",
};
const ROTULO_TIPO: Record<Tipo, string> = {
  CAMPO_LIP_AUSENTE: "Campo do LIP ausente (NP/NÃO)",
  CAMPO_LIP_IGUAL: "Campo do LIP igual a…",
  PALAVRA_AUSENTE: "Palavra ausente no documento",
  MANUAL: "Manual (só botão)",
};

const VAZIO: Filtro = {
  nome: "", descricao: "", ordem: 100, ativo: true, tipo_condicao: "CAMPO_LIP_AUSENTE",
  campos_lip: [], valor_esperado: null, termos: [], papeis_documento: [],
  grupos: [], itens_ids: [], termos_item: [], status_alvo: "nao_aplica",
};

const listaDeTexto = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function GerenciadorFiltrosSlot5() {
  const router = useRouter();
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [grupos, setGrupos] = useState<{ nome: string; qtd: number }[]>([]);
  const [papeis, setPapeis] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState<Filtro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");
  const [buscaGrupo, setBuscaGrupo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/mac/slot-05/filtros", { credentials: "include" });
      const d = await r.json();
      if (!d.ok) { setErro(d.erro ?? "falha ao carregar"); return; }
      setFiltros(d.filtros ?? []);
      setGrupos(d.grupos ?? []);
      setPapeis(d.papeis ?? []);
    } catch (e: any) {
      setErro(String(e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function notificar(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
  }

  async function salvar() {
    if (!edicao?.nome.trim()) { notificar("Dê um nome ao filtro."); return; }
    setSalvando(true);
    try {
      const metodo = edicao.id ? "PUT" : "POST";
      const r = await fetch("/api/mac/slot-05/filtros", {
        method: metodo, credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edicao),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
      notificar(edicao.id ? "Filtro atualizado." : "Filtro criado.");
      setEdicao(null);
      await carregar();
    } catch (e: any) {
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(f: Filtro) {
    if (!f.id) return;
    if (!confirm(`Excluir o filtro "${f.nome}"? Os itens que ele derrubava voltam para a análise.`)) return;
    const r = await fetch(`/api/mac/slot-05/filtros?id=${encodeURIComponent(f.id)}`, {
      method: "DELETE", credentials: "include",
    });
    const d = await r.json();
    if (!d.ok) { notificar(`Erro: ${d.erro}`); return; }
    notificar("Filtro excluído.");
    await carregar();
  }

  const itensAlcancados = useCallback((f: Filtro) => {
    const porGrupo = f.grupos.reduce((acc, g) => acc + (grupos.find((x) => x.nome === g)?.qtd ?? 0), 0);
    return porGrupo + f.itens_ids.length;
  }, [grupos]);

  const gruposFiltrados = useMemo(() => {
    const q = buscaGrupo.trim().toLowerCase();
    return q ? grupos.filter((g) => g.nome.toLowerCase().includes(q)) : grupos;
  }, [grupos, buscaGrupo]);

  if (carregando) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <button onClick={() => router.push("/")}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">← HOME</button>
        <h1 className="text-xl font-bold">🎛️ Filtros do MAC — Slot 5</h1>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Cada filtro liga uma condição — lida do LIP ou do texto dos documentos da pasta — aos itens
        que saem da análise. O MAC roda estes filtros sozinho ao abrir um processo.
      </p>

      {erro && (
        <div className="border border-[var(--error)] rounded-lg p-3 mb-4">
          <p className="text-sm text-[var(--error)]">{erro}</p>
        </div>
      )}
      {toast && <p className="text-xs text-[var(--accent)] mb-3">{toast}</p>}

      {!edicao && (
        <>
          <button onClick={() => setEdicao({ ...VAZIO, ordem: (filtros.at(-1)?.ordem ?? 100) + 10 })}
            className="mb-4 px-3 py-1.5 rounded text-sm font-bold bg-[var(--accent)] text-[var(--accent-fg)]">
            + Novo filtro
          </button>

          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_180px_120px_90px_120px] gap-2 px-3 py-2 bg-[var(--bg-secondary)] text-[10px] font-bold uppercase text-[var(--text-muted)]">
              <span>Filtro</span><span>Condição</span><span>Alcance</span><span>Ativo</span><span></span>
            </div>
            {filtros.map((f) => {
              const alcance = itensAlcancados(f);
              return (
                <div key={f.id} className="grid grid-cols-[1fr_180px_120px_90px_120px] gap-2 px-3 py-2 border-t border-[var(--border)] text-xs items-center">
                  <div>
                    <p className="font-semibold">{f.nome}</p>
                    {f.descricao && <p className="text-[10px] text-[var(--text-muted)]">{f.descricao}</p>}
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{ROTULO_TIPO[f.tipo_condicao]}</span>
                  <span className={alcance === 0 ? "text-[#EA580C]" : "text-[var(--text-secondary)]"}>
                    {alcance === 0 ? "⚠ nada ligado" : `${alcance} itens`}
                  </span>
                  <span style={{ color: f.ativo ? "#16A34A" : "#94A3B8" }}>{f.ativo ? "sim" : "não"}</span>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEdicao({ ...f, descricao: f.descricao ?? "" })}
                      className="underline text-[var(--text-muted)] hover:text-[var(--accent)]">editar</button>
                    <button onClick={() => excluir(f)}
                      className="underline text-[var(--error)]">excluir</button>
                  </div>
                </div>
              );
            })}
            {!filtros.length && (
              <p className="px-3 py-4 text-xs text-[var(--text-muted)]">Nenhum filtro cadastrado.</p>
            )}
          </div>
        </>
      )}

      {edicao && (
        <div className="border border-[var(--accent)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-3">{edicao.id ? "Editar filtro" : "Novo filtro"}</h2>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Nome do botão</span>
              <input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                placeholder="ex.: NÃO É POSTO"
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Descrição</span>
              <input value={edicao.descricao ?? ""} onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })}
                placeholder="o que este filtro significa"
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm" />
            </label>
          </div>

          <label className="flex flex-col gap-1 mb-2">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Como decide sozinho</span>
            <select value={edicao.tipo_condicao}
              onChange={(e) => setEdicao({ ...edicao, tipo_condicao: e.target.value as Tipo })}
              className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm">
              {(Object.keys(ROTULO_TIPO) as Tipo[]).map((t) => (
                <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
              ))}
            </select>
            <span className="text-[10px] text-[var(--text-muted)]">{EXPLICACAO[edicao.tipo_condicao]}</span>
          </label>

          {(edicao.tipo_condicao === "CAMPO_LIP_AUSENTE" || edicao.tipo_condicao === "CAMPO_LIP_IGUAL") && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                  Campos do LIP (separados por vírgula)
                </span>
                <input value={edicao.campos_lip.join(", ")}
                  onChange={(e) => setEdicao({ ...edicao, campos_lip: listaDeTexto(e.target.value) })}
                  placeholder="ex.: habitacional, habSeriada, habColetiva"
                  className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm font-mono" />
              </label>
              {edicao.tipo_condicao === "CAMPO_LIP_IGUAL" && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Valor esperado</span>
                  <input value={edicao.valor_esperado ?? ""}
                    onChange={(e) => setEdicao({ ...edicao, valor_esperado: e.target.value })}
                    placeholder="ex.: APROVAÇÃO DE PROJETO"
                    className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm" />
                </label>
              )}
            </div>
          )}

          {edicao.tipo_condicao === "PALAVRA_AUSENTE" && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                  Termos que NÃO podem aparecer
                </span>
                <input value={edicao.termos.join(", ")}
                  onChange={(e) => setEdicao({ ...edicao, termos: listaDeTexto(e.target.value) })}
                  placeholder="ex.: POSTO, COMBUSTIVEL, ABASTECIMENTO"
                  className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm font-mono" />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Procurar em quais documentos</span>
                <div className="flex flex-wrap gap-1">
                  {papeis.map((p) => {
                    const on = edicao.papeis_documento.includes(p);
                    return (
                      <button key={p} type="button"
                        onClick={() => setEdicao({
                          ...edicao,
                          papeis_documento: on
                            ? edicao.papeis_documento.filter((x) => x !== p)
                            : [...edicao.papeis_documento, p],
                        })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          on ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                            : "border-[var(--border-strong)] text-[var(--text-muted)]"}`}>
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Alvo por texto do item — pega item em QUALQUER grupo */}
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
              Também retirar todo item cujo TEXTO cite (separado por vírgula)
            </span>
            <input value={edicao.termos_item.join(", ")}
              onChange={(e) => setEdicao({ ...edicao, termos_item: listaDeTexto(e.target.value) })}
              placeholder="ex.: MODIFICACAO, ACRESCIMO, REFORMA"
              className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm font-mono" />
            <span className="text-[10px] text-[var(--text-muted)]">
              Alcança itens espalhados em outros grupos. Palavra inteira, sem acento —
              &quot;POSTO&quot; não casa dentro de &quot;COMPOSTO&quot;. Some com os grupos abaixo.
            </span>
          </label>

          {/* Alvo: grupos que saem da análise */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                Grupos que saem da análise ({edicao.grupos.length} selecionados ·{" "}
                {itensAlcancados(edicao)} itens)
              </span>
              <input value={buscaGrupo} onChange={(e) => setBuscaGrupo(e.target.value)}
                placeholder="buscar grupo…"
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-0.5 text-[11px] flex-1 min-w-[160px]" />
            </div>
            <div className="border border-[var(--border)] rounded max-h-64 overflow-y-auto">
              {gruposFiltrados.map((g) => {
                const on = edicao.grupos.includes(g.nome);
                return (
                  <button key={g.nome} type="button"
                    onClick={() => setEdicao({
                      ...edicao,
                      grupos: on ? edicao.grupos.filter((x) => x !== g.nome) : [...edicao.grupos, g.nome],
                    })}
                    className={`w-full text-left px-3 py-1.5 text-xs border-t border-[var(--border)] first:border-t-0 flex items-center gap-2 ${
                      on ? "bg-[var(--bg-secondary)]" : "hover:bg-[var(--bg-secondary)]"}`}>
                    <span style={{ color: on ? "#16A34A" : "var(--text-muted)" }}>{on ? "☑" : "☐"}</span>
                    <span className="flex-1">{g.nome}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{g.qtd} itens</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Status aplicado</span>
              <select value={edicao.status_alvo}
                onChange={(e) => setEdicao({ ...edicao, status_alvo: e.target.value as Filtro["status_alvo"] })}
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm">
                <option value="nao_aplica">Não se Aplica</option>
                <option value="conforme">Conforme</option>
                <option value="nao_conforme">Não Conforme</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Ordem</span>
              <input type="number" value={edicao.ordem}
                onChange={(e) => setEdicao({ ...edicao, ordem: Number(e.target.value) })}
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm" />
            </label>
            <label className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={edicao.ativo}
                onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
              <span className="text-xs">Ativo</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando}
              className="px-3 py-1.5 rounded text-sm font-bold bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-50">
              {salvando ? "salvando…" : "💾 Salvar filtro"}
            </button>
            <button onClick={() => setEdicao(null)}
              className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] underline">cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
