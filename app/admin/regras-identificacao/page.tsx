"use client";

/**
 * Gerenciador das regras de identificação de peça/documento do fatiador de PDF do SEI
 * (Fase 4 do plano docs/UPGRADE_NA_LEITURA_DE_PDF_SLOT_1_E_2.md).
 *
 * Duas famílias de regra, na mesma tabela (`documentos_sei_regras_identificacao`), separadas por
 * aba: "peça" (ASSINATURAS_PECA — classifica cada página dentro de um contêiner do SEI, ex.:
 * "Documentação") e "conteúdo" (ASSINATURAS_CONTEUDO — só entra quando o título do SEI não diz o
 * que o documento é). A primeira regra ATIVA que casar, na ordem, decide o papel — igual ao array
 * fixo que existia no código antes desta fase.
 *
 * Criar/editar uma regra aqui muda o comportamento do fatiador na hora (a API invalida o cache),
 * sem deploy. Isolado do Slot 5: só lê e grava esta tabela, exclusiva da leitura de PDF do SEI
 * (Slots 1/2).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tabela = "peca" | "conteudo";
type Regra = {
  id?: string; tabela: Tabela; papel: string; regex: string;
  descricao: string | null; ordem: number; ativo: boolean;
};

const ROTULO_TABELA: Record<Tabela, string> = {
  peca: "Peça (dentro de contêiner)",
  conteudo: "Conteúdo (título não diz o que é)",
};
const EXPLICACAO_TABELA: Record<Tabela, string> = {
  peca: "Testada contra o texto de CADA PÁGINA de um evento-contêiner do SEI (ex.: \"Documentação\"), já sem acento e em minúsculo — escreva a regex também sem acento.",
  conteudo: "Testada contra o texto CRU da página, sem sensibilidade a maiúsculas/minúsculas — pode usar acento normalmente. Só entra em jogo quando o título do evento não identifica o documento sozinho.",
};

const vazia = (tabela: Tabela): Regra => ({ tabela, papel: "", regex: "", descricao: "", ordem: 100, ativo: true });

export default function GerenciadorRegrasIdentificacao() {
  const router = useRouter();
  const [aba, setAba] = useState<Tabela>("peca");
  const [regras, setRegras] = useState<Regra[]>([]);
  const [papeisPorTabela, setPapeisPorTabela] = useState<Record<Tabela, string[]>>({ peca: [], conteudo: [] });
  const [rotulosPapel, setRotulosPapel] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [edicao, setEdicao] = useState<Regra | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/documentos-sei/regras-identificacao", { credentials: "include" });
      const d = await r.json();
      if (!d.ok) { setErro(d.erro ?? "falha ao carregar"); return; }
      setRegras(d.regras ?? []);
      setPapeisPorTabela(d.papeisPorTabela ?? { peca: [], conteudo: [] });
      setRotulosPapel(d.rotulosPapelPeca ?? {});
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

  function rotuloPapel(p: string) {
    return rotulosPapel[p] ?? p;
  }

  async function salvar() {
    if (!edicao) return;
    if (!edicao.papel) { notificar("Escolha o papel que a regra identifica."); return; }
    if (!edicao.regex.trim()) { notificar("Dê o texto da regex."); return; }
    setSalvando(true);
    try {
      const metodo = edicao.id ? "PUT" : "POST";
      const r = await fetch("/api/documentos-sei/regras-identificacao", {
        method: metodo, credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edicao),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro ?? "falha ao salvar");
      notificar(edicao.id ? "Regra atualizada — já vale na próxima leitura." : "Regra criada — já vale na próxima leitura.");
      setEdicao(null);
      await carregar();
    } catch (e: any) {
      notificar(`Erro: ${e?.message ?? e}`);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(reg: Regra) {
    if (!reg.id) return;
    if (!confirm(`Excluir a regra de "${rotuloPapel(reg.papel)}"? As páginas que ela achava caem em "classificação pendente".`)) return;
    const r = await fetch(`/api/documentos-sei/regras-identificacao?id=${encodeURIComponent(reg.id)}`, {
      method: "DELETE", credentials: "include",
    });
    const d = await r.json();
    if (!d.ok) { notificar(`Erro: ${d.erro}`); return; }
    notificar("Regra excluída.");
    await carregar();
  }

  const regrasDaAba = useMemo(
    () => regras.filter((r) => r.tabela === aba).sort((a, b) => a.ordem - b.ordem),
    [regras, aba],
  );
  const papeisDaAba = papeisPorTabela[aba] ?? [];

  if (carregando) return <p className="p-6 text-sm text-[var(--text-muted)]">carregando…</p>;

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <button onClick={() => router.push("/")}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">← HOME</button>
        <h1 className="text-xl font-bold">🧩 Regras de identificação — Fatiador de PDF do SEI</h1>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        A primeira regra ATIVA que casar, na ordem abaixo, decide o papel da página/documento.
        Criar ou editar aqui muda o fatiador na hora, sem depender de deploy.
      </p>

      {erro && (
        <div className="border border-[var(--error)] rounded-lg p-3 mb-4">
          <p className="text-sm text-[var(--error)]">{erro}</p>
        </div>
      )}
      {toast && <p className="text-xs text-[var(--accent)] mb-3">{toast}</p>}

      <div className="flex gap-2 mb-4">
        {(Object.keys(ROTULO_TABELA) as Tabela[]).map((t) => (
          <button key={t} onClick={() => { setAba(t); setEdicao(null); }}
            className={`px-3 py-1.5 rounded text-xs font-bold border ${
              aba === t ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                : "border-[var(--border-strong)] text-[var(--text-muted)]"}`}>
            {ROTULO_TABELA[t]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-4">{EXPLICACAO_TABELA[aba]}</p>

      {!edicao && (
        <>
          <button
            onClick={() => setEdicao({ ...vazia(aba), ordem: (regrasDaAba.at(-1)?.ordem ?? 90) + 10 })}
            className="mb-4 px-3 py-1.5 rounded text-sm font-bold bg-[var(--accent)] text-[var(--accent-fg)]">
            + Nova regra
          </button>

          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[140px_1fr_70px_70px_110px] gap-2 px-3 py-2 bg-[var(--bg-secondary)] text-[10px] font-bold uppercase text-[var(--text-muted)]">
              <span>Papel</span><span>Regex</span><span>Ordem</span><span>Ativa</span><span></span>
            </div>
            {regrasDaAba.map((r) => (
              <div key={r.id} className="grid grid-cols-[140px_1fr_70px_70px_110px] gap-2 px-3 py-2 border-t border-[var(--border)] text-xs items-center">
                <div>
                  <p className="font-semibold">{rotuloPapel(r.papel)}</p>
                  {r.descricao && <p className="text-[10px] text-[var(--text-muted)]">{r.descricao}</p>}
                </div>
                <code className="text-[10px] text-[var(--text-secondary)] break-all">{r.regex}</code>
                <span className="text-[var(--text-secondary)]">{r.ordem}</span>
                <span style={{ color: r.ativo ? "#16A34A" : "#94A3B8" }}>{r.ativo ? "sim" : "não"}</span>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEdicao({ ...r, descricao: r.descricao ?? "" })}
                    className="underline text-[var(--text-muted)] hover:text-[var(--accent)]">editar</button>
                  <button onClick={() => excluir(r)} className="underline text-[var(--error)]">excluir</button>
                </div>
              </div>
            ))}
            {!regrasDaAba.length && (
              <p className="px-3 py-4 text-xs text-[var(--text-muted)]">Nenhuma regra cadastrada nesta aba.</p>
            )}
          </div>
        </>
      )}

      {edicao && (
        <div className="border border-[var(--accent)] rounded-lg p-4">
          <h2 className="text-sm font-bold mb-3">{edicao.id ? "Editar regra" : "Nova regra"} — {ROTULO_TABELA[aba]}</h2>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Papel identificado</span>
              <select value={edicao.papel} onChange={(e) => setEdicao({ ...edicao, papel: e.target.value })}
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm">
                <option value="">— escolha —</option>
                {papeisDaAba.map((p) => (
                  <option key={p} value={p}>{rotuloPapel(p)}</option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--text-muted)]">
                Só os papéis que o código já sabe tratar aparecem aqui — um papel novo exige código antes.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Descrição (para você mesmo)</span>
              <input value={edicao.descricao ?? ""} onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })}
                placeholder="o que essa frase costuma indicar"
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm" />
            </label>
          </div>

          <label className="flex flex-col gap-1 mb-3">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Regex</span>
            <input value={edicao.regex} onChange={(e) => setEdicao({ ...edicao, regex: e.target.value })}
              placeholder={aba === "peca" ? "ex.: \\bmemorial\\s+descritivo\\b" : "ex.: registro\\s+fotogr[áa]fico"}
              className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm font-mono" />
            <span className="text-[10px] text-[var(--text-muted)]">{EXPLICACAO_TABELA[aba]}</span>
          </label>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Ordem</span>
              <input type="number" value={edicao.ordem}
                onChange={(e) => setEdicao({ ...edicao, ordem: Number(e.target.value) })}
                className="bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-sm" />
              <span className="text-[10px] text-[var(--text-muted)]">Menor ordem é testada primeiro.</span>
            </label>
            <label className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={edicao.ativo}
                onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
              <span className="text-xs">Ativa</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando}
              className="px-3 py-1.5 rounded text-sm font-bold bg-[var(--accent)] text-[var(--accent-fg)] disabled:opacity-50">
              {salvando ? "salvando…" : "💾 Salvar regra"}
            </button>
            <button onClick={() => setEdicao(null)}
              className="px-3 py-1.5 rounded text-sm text-[var(--text-muted)] underline">cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
