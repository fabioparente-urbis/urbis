"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Search, Loader2, Download, Trash2 } from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";

/**
 * /admin/mhd — primeira tela própria do MHD (Histórico e Documentos).
 *
 * Até 06/09/2026 o MHD só era visível DENTRO de um processo aberto (botão
 * "🗂 HISTÓRICO DOCUMENTAL" em app/processo/ProcessoClient.tsx) — sem entrada na Home, o Fábio
 * não encontrava. Esta tela busca o mesmo `/api/mhd?processo=<codigo>` que a tela do processo já
 * usa; a renderização do resultado foi reproduzida por leitura daquele modal (não compartilhada
 * — é tela nova, evita acoplar a este arquivo com o ProcessoClient, que já é enorme).
 *
 * Mesmo padrão visual e mesmo gate de visibilidade de /admin/urbi e /admin/bdi/leis (BIP):
 * só perfil irrestrito, redireciona pra Home se não autorizado.
 *
 * Basicamente só leitura — a única escrita é excluir (limpeza administrativa, exceção deliberada
 * ao "nunca apaga" do MHD): 1 evento (app/api/admin/mhd/evento) ou o histórico inteiro de 1
 * processo (app/api/admin/mhd/processo, documentos+versões+eventos). Exclusão em lote existe só
 * na pilha (marcar vários processos e apagar de uma vez) — pedido explícito do Fábio
 * (06/09/2026), sempre com confirmação e sempre marcado à mão, nunca "apagar tudo" de um clique.
 * Exportar é geração de CSV no cliente, não toca no servidor.
 */

const INPUT = "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]";

type MhdResposta = {
  ok: boolean;
  ativo: boolean;
  aviso?: string;
  documentos: any[];
  eventos: any[];
  totais?: { documentos: number; versoes: number; paginasIA: number };
};

type ProcessoRecente = {
  processo_codigo: string; tipo: string; titulo: string; criado_em: string;
  assunto: string | null; proprietario: string | null;
};

export default function MhdAdminPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [processo, setProcesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<MhdResposta | null>(null);
  const [recentes, setRecentes] = useState<ProcessoRecente[] | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [excluindoProcesso, setExcluindoProcesso] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [excluindoLote, setExcluindoLote] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json().catch(() => null);
        const perfis = json?.data?.perfis?.length ? json.data.perfis : json?.data?.perfil;
        if (!json?.ok || !isPerfilIrrestrito(perfis)) { router.push("/"); return; }
        setAutorizado(true);
      } catch { router.push("/"); }
    })();
  }, [router]);

  /**
   * Pilha de processos com atividade recente no MHD, visível assim que a tela abre — pedido do
   * Fábio (06/09/2026): "tem que aparecer sem buscar uma pilha de processos". Busca só depois de
   * autorizado (a rota já reexige irrestrito no servidor, isto é só pra não disparar antes de
   * saber que a sessão é válida).
   */
  useEffect(() => {
    if (autorizado !== true) return;
    fetch("/api/admin/mhd/recentes")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setRecentes(j.processos); })
      .catch(() => setRecentes([]));
  }, [autorizado]);

  async function buscar(codigoForcado?: string) {
    const codigo = (codigoForcado ?? processo).trim();
    if (!codigo) return;
    setProcesso(codigo);
    setCarregando(true);
    setErro(null);
    setDados(null);
    try {
      const r = await fetch(`/api/mhd?processo=${encodeURIComponent(codigo)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao consultar o MHD");
      setDados(j);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }

  /** CSV gerado no navegador — não toca no servidor, e por isso não precisa de rota nova. */
  function exportarCsv() {
    if (!dados) return;
    const linhas: string[] = ["tipo;data;titulo"];
    const escapar = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    for (const e of dados.eventos ?? []) {
      linhas.push([escapar("evento"), escapar(new Date(e.criado_em).toLocaleString("pt-BR")), escapar(e.titulo)].join(";"));
    }
    for (const d of dados.documentos ?? []) {
      for (const v of d.versoes ?? []) {
        linhas.push([
          escapar("documento"),
          escapar(new Date(v.lido_em).toLocaleString("pt-BR")),
          escapar(`${d.rotulo} v${v.versao}${v.vigente ? " (vigente)" : ""} — ${v.nome_arquivo}`),
        ].join(";"));
      }
    }
    const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mhd_${processo.replace(/[^\w.-]/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * EXCEÇÃO DELIBERADA ao "nunca apaga" do MHD — limpeza administrativa, pedido explícito do
   * Fábio (06/09/2026). Confirmação obrigatória, um registro de cada vez.
   */
  async function excluirEvento(id: string) {
    if (!confirm("Apagar este evento do histórico? Isso não pode ser desfeito.")) return;
    setExcluindo(id);
    try {
      const r = await fetch(`/api/admin/mhd/evento?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao excluir");
      await buscar(processo);
      recarregarPilha();
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setExcluindo(null);
    }
  }

  function recarregarPilha() {
    setRecentes(null);
    fetch("/api/admin/mhd/recentes").then((r) => r.json()).then((j) => { if (j.ok) setRecentes(j.processos); });
  }

  /**
   * Apaga TODO o histórico do processo (não só 1 evento) — pedido do Fábio (06/09/2026): "nao
   * tem como excluir processos do MHD.. olha ai tem ate teste seu" (a entrada de teste na pilha
   * não tinha como sair de lá). Mesma exceção deliberada ao "nunca apaga".
   */
  async function excluirProcesso(codigo: string) {
    if (!confirm(`Apagar TODO o histórico do MHD do processo ${codigo}? Isso não pode ser desfeito.`)) return;
    setExcluindoProcesso(codigo);
    try {
      const r = await fetch(`/api/admin/mhd/processo?codigo=${encodeURIComponent(codigo)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao excluir");
      setMarcados((prev) => { const novo = new Set(prev); novo.delete(codigo); return novo; });
      recarregarPilha();
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setExcluindoProcesso(null);
    }
  }

  /**
   * Excluir em lote — pedido do Fábio logo em seguida: "seria legal poder marcar e excluir de
   * lote". É a única exclusão em lote do módulo, de propósito: aqui o analista marca cada
   * processo À MÃO antes (nunca um "excluir tudo" de um clique só), e a confirmação mostra
   * quantos serão apagados.
   */
  async function excluirLote() {
    const codigos = [...marcados];
    if (!codigos.length) return;
    if (!confirm(`Apagar TODO o histórico do MHD de ${codigos.length} processo(s)? Isso não pode ser desfeito.`)) return;
    setExcluindoLote(true);
    try {
      for (const codigo of codigos) {
        const r = await fetch(`/api/admin/mhd/processo?codigo=${encodeURIComponent(codigo)}`, { method: "DELETE" });
        const j = await r.json();
        if (!j.ok) throw new Error(`${codigo}: ${j.erro || "falha ao excluir"}`);
      }
      setMarcados(new Set());
      recarregarPilha();
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setExcluindoLote(false);
    }
  }

  if (autorizado === null) return <div className="p-8 text-sm text-[var(--text-muted)]">Carregando…</div>;
  if (!autorizado) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] font-bold px-3 py-1.5 rounded text-sm transition-colors border border-[var(--error)]">
              🚪 Sair
            </button>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
              <HardDrive size={22} /> MHD — Histórico e Documentos
            </h1>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Módulo satélite: a memória de que documento já entrou em qual processo, por versão
            e por hash. Só leitura — quem grava é a leitura de pasta/arquivo, dentro do processo.
          </p>
        </div>

        <div className="mb-5 flex gap-2">
          <input
            value={processo}
            onChange={(e) => setProcesso(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Número do processo — ex.: 25.5.000012012-9"
            className={`${INPUT} flex-1`}
          />
          <button
            onClick={() => buscar()}
            disabled={carregando || !processo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {carregando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>

        {erro && (
          <p className="text-sm text-[var(--error)] bg-[var(--error-bg)] rounded-lg p-3 mb-4">⚠ {erro}</p>
        )}

        {!dados && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                Pilha de processos com atividade recente
              </p>
              {marcados.size > 0 && (
                <button
                  onClick={excluirLote}
                  disabled={excluindoLote}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-[var(--error)] bg-[var(--error-bg)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white disabled:opacity-50"
                >
                  {excluindoLote ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Excluir {marcados.size} selecionado(s)
                </button>
              )}
            </div>
            {recentes === null && (
              <p className="text-xs text-[var(--text-muted)]">Carregando…</p>
            )}
            {recentes !== null && !recentes.length && (
              <p className="text-xs text-[var(--text-muted)]">Nenhuma atividade registrada ainda.</p>
            )}
            {!!recentes?.length && (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border)]">
                  <span className="w-4 shrink-0" />
                  <span className="w-36 shrink-0">Processo</span>
                  <span className="w-32 shrink-0">Assunto</span>
                  <span className="flex-1">Proprietário</span>
                  <span className="w-36 shrink-0 text-right">Atividade</span>
                </div>
                {recentes.map((p) => (
                  <div
                    key={p.processo_codigo}
                    className="w-full text-left px-3 py-2 text-sm border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)] flex items-center gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={marcados.has(p.processo_codigo)}
                      onChange={(e) => setMarcados((prev) => {
                        const novo = new Set(prev);
                        if (e.target.checked) novo.add(p.processo_codigo); else novo.delete(p.processo_codigo);
                        return novo;
                      })}
                      className="shrink-0"
                    />
                    <button onClick={() => buscar(p.processo_codigo)} className="flex-1 flex items-center gap-3 text-left">
                      <span className="w-36 shrink-0 font-medium text-[var(--text-primary)]">{p.processo_codigo}</span>
                      <span className="w-32 shrink-0 text-xs text-[var(--text-secondary)] truncate">{p.assunto ?? "—"}</span>
                      <span className="flex-1 text-xs text-[var(--text-secondary)] truncate">{p.proprietario ?? "—"}</span>
                      <span className="w-36 shrink-0 text-right text-xs text-[var(--text-muted)]">
                        {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                      </span>
                    </button>
                    <button
                      onClick={() => excluirProcesso(p.processo_codigo)}
                      disabled={excluindoProcesso === p.processo_codigo}
                      title="Apagar TODO o histórico do MHD deste processo (limpeza administrativa — não pode ser desfeito)"
                      className="shrink-0 p-1 rounded hover:bg-[var(--error-bg)] hover:text-[var(--error)] text-[var(--text-muted)] disabled:opacity-40"
                    >
                      {excluindoProcesso === p.processo_codigo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dados && (
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => { setDados(null); setProcesso(""); setErro(null); }}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)]"
            >
              ← Voltar pra pilha de processos
            </button>
            {dados.ativo && (dados.eventos?.length > 0 || dados.documentos?.length > 0) && (
              <button
                onClick={exportarCsv}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-[var(--border-strong)] bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)]"
              >
                <Download size={12} /> Exportar CSV
              </button>
            )}
          </div>
        )}

        {dados && !dados.ativo && (
          <p className="text-sm text-[var(--warning)] bg-[var(--warning-bg)] rounded-lg p-3">{dados.aviso}</p>
        )}

        {dados && dados.ativo && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              {dados.totais?.documentos ?? 0} documento(s) · {dados.totais?.versoes ?? 0} versão(ões) ·{" "}
              {dados.totais?.paginasIA ?? 0} página(s) enviadas à IA no total
            </p>

            {!dados.documentos.length && !dados.eventos?.length && (
              <p className="text-sm text-[var(--text-muted)]">
                Nada encontrado ainda para este processo — nem documento versionado, nem evento na
                linha do tempo (ex.: uma organização de PDF do SEI).
              </p>
            )}
            {!dados.documentos.length && !!dados.eventos?.length && (
              <p className="text-sm text-[var(--text-muted)]">
                Nenhum documento VERSIONADO (ART, laudo etc.) neste processo ainda — mas há linha
                do tempo abaixo.
              </p>
            )}

            {dados.documentos.map((d: any) => (
              <div key={d.id} className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-card)]">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {d.rotulo} <span className="text-[var(--text-muted)] font-normal">· {d.versoes.length} versão(ões)</span>
                </p>
                <div className="mt-1 space-y-1">
                  {d.versoes.map((v: any) => (
                    <div key={v.id} className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-x-2">
                      <span className={v.vigente ? "text-[#16A34A] font-semibold" : "text-[var(--text-muted)]"}>
                        v{v.versao}{v.vigente ? " (vigente)" : ""}
                      </span>
                      <span>{v.nome_arquivo}</span>
                      <span className="text-[var(--text-muted)]">
                        rodada {v.rodada}
                        {v.revisao ? ` · ${v.revisao}` : ""}
                        {v.data_documento ? ` · emitido ${v.data_documento}` : ""}
                        {v.paginas ? ` · ${v.paginas}p` : ""}
                        {` · ${v.origem}`}
                        {v.custo_paginas_ia ? ` · ${v.custo_paginas_ia}p de IA` : " · sem IA"}
                      </span>
                      <span className="text-[var(--text-muted)]">
                        lido em {new Date(v.lido_em).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!!dados.eventos?.length && (
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Linha do tempo</p>
                <div className="space-y-1">
                  {dados.eventos.map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                      <p>
                        <span className="text-[var(--text-muted)]">
                          {new Date(e.criado_em).toLocaleString("pt-BR")}
                        </span>{" "}
                        <span className="text-[var(--text-muted)]">[{e.tipo}]</span> {e.titulo}
                      </p>
                      <button
                        onClick={() => excluirEvento(e.id)}
                        disabled={excluindo === e.id}
                        title="Apagar este evento (limpeza administrativa — não pode ser desfeito)"
                        className="shrink-0 p-1 rounded hover:bg-[var(--error-bg)] hover:text-[var(--error)] text-[var(--text-muted)] disabled:opacity-40"
                      >
                        {excluindo === e.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
