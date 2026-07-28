"use client";

/**
 * Tela da MATRIZ DE RASTREABILIDADE.
 *
 * Lê do código, via `/api/admin/rastreabilidade` — nunca de cópia no banco. Por isso não tem como
 * mostrar algo diferente do que o sistema faz: mudou a regra no código, mudou aqui.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Linha = any;

const CORES: Record<string, string> = {
  AUTOMATICO: "#16A34A", CALCULADO: "#2563EB", NAO_APLICAVEL: "#64748B",
  AGUARDANDO_FATO: "#EA580C", DOCUMENTO_AUSENTE: "#EA580C", MANUAL: "#7C3AED",
  PENDENTE_VISAO: "#DC2626", BLOQUEADO: "#DC2626",
};
const rotuloStatus: Record<string, string> = {
  AUTOMATICO: "Automático", CALCULADO: "Calculado", NAO_APLICAVEL: "Não aplicável",
  AGUARDANDO_FATO: "Aguardando fato", DOCUMENTO_AUSENTE: "Documento ausente",
  MANUAL: "Manual", PENDENTE_VISAO: "Pendente de visão", BLOQUEADO: "Bloqueado",
};

export default function Rastreabilidade() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [modulo, setModulo] = useState<"LIP" | "MAC">("LIP");
  const [busca, setBusca] = useState("");
  const [fSecao, setFSecao] = useState("");
  const [fMetodo, setFMetodo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fFonte, setFFonte] = useState("");
  const [fIA, setFIA] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    setDados(null); setErro("");
    fetch(`/api/admin/rastreabilidade?modulo=${modulo}&slot=slot_05`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => (d.ok ? setDados(d) : setErro(d.erro)))
      .catch((e) => setErro(String(e)));
  }, [modulo]);

  const linhas: Linha[] = dados?.linhas ?? [];
  const opcoes = useMemo(() => ({
    secoes: [...new Set(linhas.map((l) => l.secao))],
    metodos: [...new Set(linhas.flatMap((l) => l.metodos))].sort(),
    status: [...new Set(linhas.map((l) => l.status))].sort(),
    fontes: [...new Set(linhas.map((l) => l.fontePrincipal))].sort(),
  }), [linhas]);

  const filtradas = linhas.filter((l) => {
    const q = busca.trim().toLowerCase();
    if (q && !`${l.id} ${l.nome} ${l.secao} ${l.responsavel} ${l.aplicabilidade ?? ""}`.toLowerCase().includes(q)) return false;
    if (fSecao && l.secao !== fSecao) return false;
    if (fMetodo && !l.metodos.includes(fMetodo)) return false;
    if (fStatus && l.status !== fStatus) return false;
    if (fFonte && l.fontePrincipal !== fFonte) return false;
    if (fIA === "sim" && !l.usaIA) return false;
    if (fIA === "nao" && l.usaIA) return false;
    return true;
  });

  const sel = "bg-[var(--bg-secondary)] border border-[var(--border-strong)] rounded px-2 py-1 text-xs text-[var(--text-primary)]";

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <Link href="/admin" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">← Admin</Link>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">🔍 Rastreabilidade — Slot 5</h1>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Especificação oficial de como o URBIS decide cada campo. Lida direto do código — não é cópia,
        não pode divergir do que o sistema faz.
      </p>

      {erro && <p className="text-sm text-[#DC2626]">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-[var(--text-muted)]">carregando…</p>}

      {dados && (
        <>
          <div className="flex gap-2 mb-3">
            {dados.matrizes.map((m: any) => (
              <button key={m.modulo} onClick={() => setModulo(m.modulo)}
                className={`px-3 py-1.5 rounded text-sm font-semibold ${modulo === m.modulo
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
                {m.modulo} · {m.total} {m.total === 1 ? "registro" : "registros"}
              </button>
            ))}
          </div>

          {modulo === "MAC" && !linhas.length && (
            <div className="border border-[var(--border-strong)] rounded-lg p-4 mb-4">
              <p className="text-sm font-bold text-[var(--text-primary)]">Estrutura pronta, conteúdo vazio</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Os 561 itens não foram cadastrados de propósito. Tipos, testes, filtros e esta tela já
                existem e são os mesmos do LIP — quando o MAC entrar, é alimentar a estrutura, não
                projetá-la. Ver <code>lib/rastreabilidade/macSlot5.ts</code>.
              </p>
            </div>
          )}

          {!!linhas.length && (
            <>
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar campo, nome, arquivo…"
                  className={`${sel} min-w-[240px] flex-1`} />
                <select value={fSecao} onChange={(e) => setFSecao(e.target.value)} className={sel}>
                  <option value="">todas as seções</option>
                  {opcoes.secoes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel}>
                  <option value="">todos os status</option>
                  {opcoes.status.map((s) => <option key={s} value={s}>{rotuloStatus[s] ?? s}</option>)}
                </select>
                <select value={fMetodo} onChange={(e) => setFMetodo(e.target.value)} className={sel}>
                  <option value="">todos os métodos</option>
                  {opcoes.metodos.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fFonte} onChange={(e) => setFFonte(e.target.value)} className={sel}>
                  <option value="">todas as fontes</option>
                  {opcoes.fontes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={fIA} onChange={(e) => setFIA(e.target.value)} className={sel}>
                  <option value="">IA: tanto faz</option>
                  <option value="sim">usa IA</option>
                  <option value="nao">sem IA</option>
                </select>
                {(busca || fSecao || fStatus || fMetodo || fFonte || fIA) && (
                  <button onClick={() => { setBusca(""); setFSecao(""); setFStatus(""); setFMetodo(""); setFFonte(""); setFIA(""); }}
                    className="text-xs text-[var(--text-muted)] underline">limpar</button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                <span className="text-[var(--text-muted)]">
                  {filtradas.length} de {dados.totais.campos} · {dados.totais.implementados} implementados ·
                  {" "}{dados.totais.usamIA} usam IA
                </span>
                {Object.entries(dados.totais.porStatus).map(([s, n]: any) => (
                  <button key={s} onClick={() => setFStatus(fStatus === s ? "" : s)}
                    className="px-2 py-0.5 rounded-full border"
                    style={{ borderColor: CORES[s], color: CORES[s] }}>
                    {rotuloStatus[s] ?? s}: {n}
                  </button>
                ))}
              </div>

              {!!dados.semRastro?.length && (
                <p className="text-xs text-[#DC2626] mb-2">
                  ⚠ {dados.semRastro.length} campo(s) do LIP sem rastreabilidade: {dados.semRastro.join(", ")}
                </p>
              )}

              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_130px_180px_150px_50px_60px_90px] gap-2 px-3 py-2 bg-[var(--bg-secondary)] text-[10px] font-bold uppercase text-[var(--text-muted)]">
                  <span>Campo</span><span>Status</span><span>Método</span><span>Fonte</span>
                  <span>IA?</span><span>Versão</span><span>Alterado</span>
                </div>
                {filtradas.map((l) => (
                  <div key={l.id} className="border-t border-[var(--border)]">
                    <button onClick={() => setAberto(aberto === l.id ? null : l.id)}
                      className="w-full grid grid-cols-[1fr_130px_180px_150px_50px_60px_90px] gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-secondary)]">
                      <span className="text-[var(--text-primary)] truncate" title={l.nome}>
                        {l.nome} <span className="text-[var(--text-muted)]">· {l.id}</span>
                      </span>
                      <span style={{ color: CORES[l.status] }}>{rotuloStatus[l.status] ?? l.status}</span>
                      <span className="text-[var(--text-secondary)] truncate" title={l.metodos.join(" → ")}>
                        {l.metodos.join(" → ")}
                      </span>
                      <span className="text-[var(--text-secondary)] truncate">{l.fontePrincipal}</span>
                      <span className={l.usaIA ? "text-[#DC2626]" : "text-[var(--text-muted)]"}>{l.usaIA ? "sim" : "—"}</span>
                      <span className="text-[var(--text-secondary)]">v{l.versao}</span>
                      <span className="text-[var(--text-muted)]">{l.alteradoEm}</span>
                    </button>

                    {aberto === l.id && (
                      <div className="px-4 py-3 bg-[var(--bg-secondary)] text-xs space-y-2">
                        <Campo t="Seção">{l.secao}</Campo>
                        <Campo t="Implementado">{l.implementado ? "sim" : "não"} · preenchido por <b>{l.preenchidoPor}</b></Campo>
                        {l.valoresPossiveis?.length && <Campo t="Valores possíveis">{l.valoresPossiveis.join(" · ")}</Campo>}
                        <Campo t="Métodos (ordem de execução)">{l.metodos.join("  →  ")}</Campo>
                        <Campo t="Fonte principal">{l.fontePrincipal}</Campo>
                        {l.fontesComparadas?.length && <Campo t="Fontes comparadas">{l.fontesComparadas.join(" · ")}</Campo>}
                        {l.depende?.length && <Campo t="Depende de">{l.depende.join(" · ")}</Campo>}
                        <div>
                          <p className="text-[10px] uppercase text-[var(--text-muted)] font-bold">Regras</p>
                          {l.regras.length
                            ? l.regras.map((r: any, i: number) => (
                              <p key={i} className="text-[var(--text-secondary)]">
                                <b>{r.regra}</b> — {r.descricao}
                                {r.parametros && Object.keys(r.parametros).length
                                  ? ` (${Object.entries(r.parametros).map(([k, v]) => `${k}=${v}`).join(", ")})` : ""}
                              </p>))
                            : <p className="text-[var(--text-muted)]">nenhuma</p>}
                        </div>
                        {l.formula && <Campo t="Fórmula / comparação"><code>{l.formula}</code></Campo>}
                        {l.aplicabilidade && <Campo t="Aplicabilidade">{l.aplicabilidade}</Campo>}
                        {l.regraNP && <Campo t="Regra de NP">{l.regraNP}</Campo>}
                        {l.regraSemDado && <Campo t="Regra de sem dado">{l.regraSemDado}</Campo>}
                        {l.fatoNecessario && <Campo t="Fato necessário">{l.fatoNecessario}</Campo>}
                        <Campo t="Executado por"><code>{l.responsavel}</code></Campo>
                        <Campo t="Testes">{l.testes.join(" · ")}</Campo>
                        <Campo t="Versão / hash da regra">v{l.versao} · <code>{l.hash}</code></Campo>
                        {l.observacao && <Campo t="Observação">{l.observacao}</Campo>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Campo({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-[var(--text-muted)] font-bold">{t}</p>
      <p className="text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}
